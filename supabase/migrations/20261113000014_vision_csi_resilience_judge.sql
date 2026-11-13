-- 0014 vision/occupancy/camera health/hand-raise (P10), CSI presence (P11), offline/link status and judge gating (P12)

-- ---------- Live state tables (latest values only; no frames, no per-sample history) ----------

create table public.room_vision_live (
  room_id          uuid primary key references public.rooms (id) on delete cascade,
  device_id        uuid references public.devices (id) on delete set null,
  position         text check (position in ('DOOR', 'ROOM')),
  person_count     integer not null default 0 check (person_count >= 0),
  occupied_seats   integer[] not null default '{}',
  stable_count     integer not null default 0,
  stable_seats     integer[] not null default '{}',
  boxes            jsonb not null default '[]'::jsonb,       -- normalized person boxes for the overlay
  fps              numeric(5, 2),
  model_version    text,
  synthetic        boolean not null default false,           -- true => dev/mock provider, labelled in the UI
  cover_score      numeric(6, 4), move_score numeric(6, 4),
  cover_threshold  numeric(6, 4), move_threshold numeric(6, 4),
  tamper_state     text not null default 'OK' check (tamper_state in ('OK', 'COVERED', 'MOVED')),
  over_capacity    boolean not null default false,
  intruder_active  boolean not null default false,
  pending          jsonb not null default '{}'::jsonb,       -- hold timers (internal)
  updated_at       timestamptz not null default now()
);
comment on table public.room_vision_live is 'Latest vision state per room (counts, boxes, scores). Frames are never stored.';

create table public.room_csi_live (
  room_id          uuid primary key references public.rooms (id) on delete cascade,
  device_id        uuid references public.devices (id) on delete set null,
  packets_per_s    numeric(7, 2),
  packets_lost     integer,
  subcarriers      integer,
  wifi_channel     integer,
  presence         text not null default 'EMPTY' check (presence in ('EMPTY', 'OCCUPIED')),
  predicted_zone   text check (predicted_zone in ('EMPTY', 'ZONE_1', 'ZONE_2', 'ZONE_3', 'ZONE_4')),
  confidence       numeric(5, 4),
  model_version    text,
  synthetic        boolean not null default false,
  pending          jsonb not null default '{}'::jsonb,
  updated_at       timestamptz not null default now()
);
comment on table public.room_csi_live is 'Latest CSI presence/zone state per room. CSI inputs only.';

-- Device link / resilience status reported by the device (Level 12).
create table public.device_link_status (
  device_id          uuid primary key references public.devices (id) on delete cascade,
  sync_state         text not null default 'LIVE' check (sync_state in ('LIVE', 'OFFLINE', 'SYNCING')),
  ap_active          boolean not null default false,
  pending_records    integer not null default 0 check (pending_records >= 0),
  oldest_pending_ts  timestamptz,
  ble_name           text,
  local_ip           text,
  mdns_name          text,
  last_sync_at       timestamptz,
  last_error         text,
  updated_at         timestamptz not null default now()
);
create table public.device_link_history (
  id               bigint generated always as identity primary key,
  device_id        uuid not null references public.devices (id) on delete cascade,
  changed_at       timestamptz not null default now(),
  sync_state       text not null,
  ap_active        boolean not null,
  ble_name         text,
  pending_records  integer not null
);
create index device_link_history_idx on public.device_link_history (device_id, changed_at desc);

create table public.sync_batches (
  id                bigint generated always as identity primary key,
  device_id         uuid not null references public.devices (id) on delete cascade,
  received_at       timestamptz not null default now(),
  total             integer not null check (total >= 0),
  accepted          integer not null check (accepted >= 0),
  duplicates        integer not null check (duplicates >= 0),
  rejected          integer not null check (rejected >= 0),
  oldest_device_ts  timestamptz,
  newest_device_ts  timestamptz
);
create index sync_batches_idx on public.sync_batches (device_id, received_at desc);

-- RLS: room-scoped reads for Teacher/Admin, server writes only.
do $$
declare t text;
begin
  foreach t in array array['room_vision_live', 'room_csi_live', 'device_link_status', 'device_link_history', 'sync_batches'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end;
$$;
create policy room_vision_live_read on public.room_vision_live for select to authenticated using (can_read_room(room_id));
create policy room_csi_live_read on public.room_csi_live for select to authenticated using (can_read_room(room_id));
create policy device_link_status_read on public.device_link_status for select to authenticated
  using (exists (select 1 from public.devices d where d.id = device_id and can_read_room(d.room_id)));
create policy device_link_history_read on public.device_link_history for select to authenticated
  using (exists (select 1 from public.devices d where d.id = device_id and can_read_room(d.room_id)));
create policy sync_batches_read on public.sync_batches for select to authenticated
  using (exists (select 1 from public.devices d where d.id = device_id and can_read_room(d.room_id)));

alter publication supabase_realtime add table public.room_vision_live, public.room_csi_live, public.device_link_status;

-- ---------- Hold helper: a state must persist for N seconds before it counts ----------
-- Returns {pend, confirmed}. `p_same` = the candidate already equals the confirmed state.
create or replace function public._hold(p_pend jsonb, p_key text, p_cand jsonb, p_same boolean, p_now timestamptz, p_secs numeric)
returns jsonb
language plpgsql immutable as $$
declare cur jsonb := p_pend -> p_key; now_s double precision := extract(epoch from p_now);
begin
  if p_same then
    return jsonb_build_object('pend', p_pend - p_key, 'confirmed', false);
  end if;
  if cur is null or (cur -> 'v') is distinct from p_cand then
    return jsonb_build_object('pend', p_pend || jsonb_build_object(p_key, jsonb_build_object('v', p_cand, 'since', now_s)), 'confirmed', false);
  end if;
  if now_s - (cur ->> 'since')::double precision >= p_secs then
    return jsonb_build_object('pend', p_pend - p_key, 'confirmed', true);
  end if;
  return jsonb_build_object('pend', p_pend, 'confirmed', false);
end;
$$;

-- ---------- Level 9/10: apply one analysis sample ----------
create or replace function public.apply_vision_sample(p_device uuid, p jsonb, p_now timestamptz default now())
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room uuid; v_cap int; v_night boolean;
  s public.room_vision_live%rowtype;
  pend jsonb; h jsonb;
  v_count int := coalesce((p ->> 'person_count')::int, 0);
  v_seats int[] := coalesce(array(select jsonb_array_elements_text(coalesce(p -> 'occupied_seats', '[]'::jsonb))::int order by 1), '{}');
  v_pos text := p ->> 'position';
  v_emitted text[] := '{}';
  v_snap jsonb := null;
  v_cover numeric := nullif(p #>> '{tamper,cover_score}', '')::numeric;
  v_move numeric := nullif(p #>> '{tamper,move_score}', '')::numeric;
  v_cover_t numeric := nullif(p #>> '{tamper,cover_threshold}', '')::numeric;
  v_move_t numeric := nullif(p #>> '{tamper,move_threshold}', '')::numeric;
  v_state text; v_cand_tamper text;
  v_inc uuid; v_hev bigint; v_over boolean; seat jsonb; v_seat int;
  v_hands jsonb; v_fired jsonb; v_since double precision; now_s double precision := extract(epoch from p_now);
  v_new_hands jsonb := '{}'::jsonb; v_new_fired jsonb := '[]'::jsonb;
begin
  select d.room_id, r.capacity, r.night_mode into v_room, v_cap, v_night
  from public.devices d join public.rooms r on r.id = d.room_id where d.id = p_device;
  if v_room is null then raise exception 'unknown device' using errcode = 'no_data_found'; end if;

  insert into public.room_vision_live (room_id, device_id) values (v_room, p_device) on conflict (room_id) do nothing;
  select * into s from public.room_vision_live where room_id = v_room for update;
  pend := s.pending;

  -- Occupancy: count + occupied seats must hold 3 s (appears on the dashboard within ~6 s at a 2 s cadence).
  h := public._hold(pend, 'occ', jsonb_build_object('c', v_count, 's', to_jsonb(v_seats)),
                    v_count = s.stable_count and v_seats = s.stable_seats, p_now, 3);
  pend := h -> 'pend';
  if (h ->> 'confirmed')::boolean then
    s.stable_count := v_count; s.stable_seats := v_seats;
    insert into public.occupancy_events (room_id, device_id, event_type, person_count, capacity_at_time, occupied_zone_count, occurred_at)
    values (v_room, p_device, 'COUNT_STABLE', v_count, v_cap, coalesce(array_length(v_seats, 1), 0), p_now);
    insert into public.device_events (source, device_id, room_id, event_type, detail)
    values ('SERVER', p_device, v_room, 'OCCUPANCY', jsonb_build_object('count', v_count, 'seats', to_jsonb(v_seats)));
    v_emitted := array_append(v_emitted, 'OCCUPANCY');
  end if;

  -- Over capacity: above capacity for 3 s.
  v_over := v_cap is not null and v_count > v_cap;
  h := public._hold(pend, 'cap', to_jsonb(v_over), v_over = s.over_capacity, p_now, 3);
  pend := h -> 'pend';
  if (h ->> 'confirmed')::boolean then
    s.over_capacity := v_over;
    insert into public.occupancy_events (room_id, device_id, event_type, person_count, capacity_at_time, occurred_at)
    values (v_room, p_device, case when v_over then 'CAPACITY_EXCEEDED' else 'CAPACITY_RESTORED' end, v_count, v_cap, p_now);
    if v_over then
      insert into public.device_events (source, device_id, room_id, event_type, detail)
      values ('SERVER', p_device, v_room, 'OVER_CAPACITY', jsonb_build_object('count', v_count, 'capacity', v_cap));
      if not exists (select 1 from public.security_incidents where room_id = v_room and incident_type = 'OVER_CAPACITY' and state <> 'CLOSED') then
        insert into public.security_incidents (room_id, device_id, incident_type, severity, occurred_at, detail)
        values (v_room, p_device, 'OVER_CAPACITY', 'WARNING', p_now, jsonb_build_object('count', v_count, 'capacity', v_cap));
      end if;
      v_emitted := array_append(v_emitted, 'OVER_CAPACITY');
    else
      update public.security_incidents set state = 'CLOSED' where room_id = v_room and incident_type = 'OVER_CAPACITY' and state <> 'CLOSED';
    end if;
  end if;

  -- Night watch: a person present for 3 s while Night mode is on => INTRUDER (one per episode).
  h := public._hold(pend, 'intr', to_jsonb(v_night and v_count > 0), (v_night and v_count > 0) = s.intruder_active, p_now, 3);
  pend := h -> 'pend';
  if (h ->> 'confirmed')::boolean then
    s.intruder_active := v_night and v_count > 0;
    if s.intruder_active then
      insert into public.security_incidents (room_id, device_id, incident_type, severity, occurred_at, detail)
      values (v_room, p_device, 'INTRUDER', 'DANGER', p_now, jsonb_build_object('count', v_count)) returning id into v_inc;
      insert into public.device_events (source, device_id, room_id, event_type, detail)
      values ('SERVER', p_device, v_room, 'INTRUDER', jsonb_build_object('incident_id', v_inc));
      v_snap := jsonb_build_object('kind', 'INTRUDER', 'incident_id', v_inc);
      v_emitted := array_append(v_emitted, 'INTRUDER');
    end if;
  end if;

  -- Camera tamper from the provider's measured scores vs its thresholds; a state must hold 3 s,
  -- so people walking through the view do not raise a fault.
  if v_cover is not null or v_move is not null then
    v_cand_tamper := case when v_cover is not null and v_cover_t is not null and v_cover >= v_cover_t then 'COVERED'
                          when v_move  is not null and v_move_t  is not null and v_move  >= v_move_t  then 'MOVED'
                          else 'OK' end;
    h := public._hold(pend, 'tamper', to_jsonb(v_cand_tamper), v_cand_tamper = s.tamper_state, p_now, 3);
    pend := h -> 'pend';
    if (h ->> 'confirmed')::boolean then
      s.tamper_state := v_cand_tamper;
      insert into public.camera_health_events (room_id, device_id, state, cover_score, move_score, cover_threshold, move_threshold, occurred_at)
      values (v_room, p_device, v_cand_tamper, v_cover, v_move, v_cover_t, v_move_t, p_now) returning id into v_hev;
      if v_cand_tamper <> 'OK' then
        if not exists (select 1 from public.security_incidents where room_id = v_room and incident_type = 'CAMERA_FAULT' and state <> 'CLOSED') then
          insert into public.security_incidents (room_id, device_id, incident_type, severity, occurred_at, detail)
          values (v_room, p_device, 'CAMERA_FAULT', 'DANGER', p_now, jsonb_build_object('state', v_cand_tamper)) returning id into v_inc;
          v_snap := jsonb_build_object('kind', 'CAMERA_FAULT', 'incident_id', v_inc, 'health_event_id', v_hev);
        end if;
        insert into public.device_events (source, device_id, room_id, event_type, detail)
        values ('SERVER', p_device, v_room, 'CAMERA_FAULT', jsonb_build_object('state', v_cand_tamper));
        v_emitted := array_append(v_emitted, 'CAMERA_FAULT');
      else
        update public.security_incidents set state = 'CLOSED' where room_id = v_room and incident_type = 'CAMERA_FAULT' and state <> 'CLOSED';
        insert into public.device_events (source, device_id, room_id, event_type, detail)
        values ('SERVER', p_device, v_room, 'CAMERA_OK', '{}'::jsonb);
        v_emitted := array_append(v_emitted, 'CAMERA_OK');
      end if;
    end if;
  end if;

  -- Hand raise (Level 10): only at ROOM; held >= 2 s per seat; fires once per raise.
  v_hands := coalesce(pend -> 'hands', '{}'::jsonb);
  v_fired := coalesce(pend -> 'fired', '[]'::jsonb);
  if v_pos = 'ROOM' then
    for seat in select * from jsonb_array_elements(coalesce(p -> 'hands', '[]'::jsonb)) loop
      if coalesce((seat ->> 'raised')::boolean, false) then
        v_seat := (seat ->> 'seat_no')::int;
        v_since := coalesce((v_hands ->> v_seat::text)::double precision, now_s);
        v_new_hands := v_new_hands || jsonb_build_object(v_seat::text, v_since);
        if v_fired @> to_jsonb(v_seat) then
          v_new_fired := v_new_fired || to_jsonb(v_seat);
        elsif now_s - v_since >= 2 then
          insert into public.handraise_events (room_id, device_id, seat_no, started_at, occurred_at, confidence)
          values (v_room, p_device, v_seat, to_timestamp(v_since), p_now, nullif(seat ->> 'confidence', '')::numeric)
          on conflict (room_id, seat_no, started_at) do nothing;
          insert into public.device_events (source, device_id, room_id, event_type, detail)
          values ('SERVER', p_device, v_room, 'HAND_RAISED', jsonb_build_object('seat', v_seat));
          v_new_fired := v_new_fired || to_jsonb(v_seat);
          v_emitted := array_append(v_emitted, 'HAND_RAISED');
        end if;
      end if;
    end loop;
  end if;
  pend := (pend - 'hands' - 'fired') || jsonb_build_object('hands', v_new_hands, 'fired', v_new_fired);

  update public.room_vision_live set
    device_id = p_device, position = coalesce(v_pos, position), person_count = v_count, occupied_seats = v_seats,
    stable_count = s.stable_count, stable_seats = s.stable_seats, boxes = coalesce(p -> 'boxes', '[]'::jsonb),
    fps = nullif(p ->> 'fps', '')::numeric, model_version = p ->> 'model_version',
    synthetic = coalesce((p ->> 'synthetic')::boolean, false),
    cover_score = v_cover, move_score = v_move, cover_threshold = v_cover_t, move_threshold = v_move_t,
    tamper_state = s.tamper_state, over_capacity = s.over_capacity, intruder_active = s.intruder_active,
    pending = pend, updated_at = p_now
  where room_id = v_room;

  if v_pos is not null then
    insert into public.room_camera_state (room_id, confirmed_position, confirmed_at) values (v_room, v_pos, p_now)
    on conflict (room_id) do update set confirmed_position = excluded.confirmed_position, confirmed_at = excluded.confirmed_at, updated_at = p_now
      where public.room_camera_state.confirmed_position is distinct from excluded.confirmed_position;
  end if;

  return jsonb_build_object('status', 'accepted', 'emitted', to_jsonb(v_emitted), 'needs_snapshot', v_snap);
end;
$$;

-- Link the single permitted snapshot to its incident (and camera-fault event).
create or replace function public.attach_snapshot(p_incident uuid, p_snapshot uuid, p_health_event bigint default null)
returns void
language sql security definer set search_path = public as $$
  update public.security_incidents set snapshot_id = p_snapshot where id = p_incident;
  update public.camera_health_events set snapshot_id = p_snapshot where id = p_health_event;
$$;

create or replace function public.select_camera_position(p_room uuid, p_position text, p_actor uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_school uuid;
begin
  select school_id into v_school from public.rooms where id = p_room;
  if not (exists (select 1 from public.user_roles where user_id = p_actor and role = 'ADMIN' and school_id = v_school)
       or exists (select 1 from public.room_memberships where user_id = p_actor and room_id = p_room and membership_role = 'TEACHER')) then
    raise exception 'teacher or admin only' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.camera_positions where room_id = p_room and position = p_position) then
    raise exception 'no reference snapshot saved for %', p_position using errcode = 'check_violation';
  end if;
  insert into public.room_camera_state (room_id, selected_position, selected_at, selected_by)
  values (p_room, p_position, now(), p_actor)
  on conflict (room_id) do update set selected_position = excluded.selected_position, selected_at = now(), selected_by = p_actor, updated_at = now();
end;
$$;

create or replace function public.set_night_mode(p_room uuid, p_on boolean, p_actor uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_school uuid;
begin
  select school_id into v_school from public.rooms where id = p_room;
  if not (exists (select 1 from public.user_roles where user_id = p_actor and role = 'ADMIN' and school_id = v_school)
       or exists (select 1 from public.room_memberships where user_id = p_actor and room_id = p_room and membership_role = 'TEACHER')) then
    raise exception 'teacher or admin only' using errcode = 'insufficient_privilege';
  end if;
  update public.rooms set night_mode = p_on, updated_at = now() where id = p_room;
  insert into public.audit_logs (school_id, actor_profile_id, action, target_type, target_id, new_values)
  values (v_school, p_actor, case when p_on then 'NIGHT_MODE_ON' else 'NIGHT_MODE_OFF' end, 'room', p_room::text, jsonb_build_object('night_mode', p_on));
end;
$$;

-- ---------- Level 11: CSI batch ----------
create or replace function public.ingest_csi_batch(p_hash public.sha256_hex, p jsonb, p_now timestamptz default now())
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_device uuid; v_room uuid; v_ds uuid; smp jsonb; v_n int := 0; v_held int := 0; v_split text;
  live public.room_csi_live%rowtype; pred jsonb := p -> 'prediction'; h jsonb; v_pres text;
  v_emitted text[] := '{}'; v_prev text; v_zone text;
begin
  select device_id, room_id into v_device, v_room from public.device_from_token(p_hash);
  if v_device is null then return jsonb_build_object('status', 'unauthorized'); end if;
  if pred is not null and (pred ? 'camera' or pred ? 'vision' or pred ? 'image') then
    return jsonb_build_object('status', 'rejected', 'reason', 'camera_data_not_allowed_in_csi_predictions');
  end if;

  insert into public.csi_packet_stats (device_id, room_id, window_start, window_end, packets_per_s, packets_lost, subcarriers, wifi_channel)
  values (v_device, v_room, p_now - interval '1 second', p_now, (p ->> 'packets_per_s')::numeric,
          coalesce((p ->> 'packets_lost')::int, 0), coalesce((p ->> 'subcarriers')::int, 1), coalesce((p ->> 'wifi_channel')::int, 1));

  -- Labelled collection: dataset must be COLLECTING; the lens must be declared covered.
  if p ? 'dataset_version' then
    select id into v_ds from public.csi_dataset_versions where version = p ->> 'dataset_version' and status = 'COLLECTING';
    if v_ds is null then return jsonb_build_object('status', 'rejected', 'reason', 'dataset_not_collecting'); end if;
    if coalesce((p ->> 'camera_covered')::boolean, false) is not true then
      return jsonb_build_object('status', 'rejected', 'reason', 'camera_must_be_covered');
    end if;
    for smp in select * from jsonb_array_elements(coalesce(p -> 'samples', '[]'::jsonb)) loop
      continue when smp ->> 'label' is null;
      -- Deterministic split: a sample's side never changes, so held-out data can never leak into training.
      v_split := case when abs(hashtextextended(v_ds::text || ':' || coalesce(smp ->> 'seq', smp ->> 'ts'), 0)) % 4 = 0 then 'HELD_OUT' else 'TRAIN' end;
      insert into public.csi_labelled_samples (dataset_version_id, device_id, room_id, label, split, features, subcarrier_count, wifi_channel, packets_per_s, camera_covered, captured_at)
      values (v_ds, v_device, v_room, smp ->> 'label', v_split, smp -> 'features', nullif(p ->> 'subcarriers', '')::int,
              nullif(p ->> 'wifi_channel', '')::int, nullif(p ->> 'packets_per_s', '')::numeric, true, to_timestamp((smp ->> 'ts')::double precision));
      v_n := v_n + 1; if v_split = 'HELD_OUT' then v_held := v_held + 1; end if;
    end loop;
  end if;

  insert into public.room_csi_live (room_id, device_id) values (v_room, v_device) on conflict (room_id) do nothing;
  select * into live from public.room_csi_live where room_id = v_room for update;

  if pred is not null then
    v_zone := pred ->> 'zone';
    v_pres := case when v_zone = 'EMPTY' then 'EMPTY' else 'OCCUPIED' end;   -- from CSI alone
    insert into public.csi_predictions (room_id, device_id, model_run_id, presence, predicted_zone, confidence, predicted_at)
    values (v_room, v_device,
            (select id from public.model_runs where model_kind = 'WIFI_CSI_LOCALIZATION' and version = pred ->> 'model_version'),
            v_pres, v_zone, nullif(pred ->> 'confidence', '')::numeric, p_now);
    h := public._hold(live.pending, 'presence', to_jsonb(v_pres), v_pres = live.presence, p_now, 3);
    live.pending := h -> 'pend';
    if (h ->> 'confirmed')::boolean then
      v_prev := live.presence; live.presence := v_pres;
      insert into public.presence_events (room_id, device_id, state, previous_state, occurred_at) values (v_room, v_device, v_pres, v_prev, p_now);
      insert into public.device_events (source, device_id, room_id, event_type, detail)
      values ('SERVER', v_device, v_room, 'PRESENCE', jsonb_build_object('state', v_pres));
      v_emitted := array_append(v_emitted, 'PRESENCE');
    end if;
  end if;

  update public.room_csi_live set
    device_id = v_device, packets_per_s = (p ->> 'packets_per_s')::numeric, packets_lost = coalesce((p ->> 'packets_lost')::int, 0),
    subcarriers = nullif(p ->> 'subcarriers', '')::int, wifi_channel = nullif(p ->> 'wifi_channel', '')::int,
    presence = live.presence, pending = live.pending,
    predicted_zone = coalesce(v_zone, predicted_zone), confidence = coalesce(nullif(pred ->> 'confidence', '')::numeric, confidence),
    model_version = coalesce(pred ->> 'model_version', model_version),
    synthetic = coalesce((p ->> 'synthetic')::boolean, false), updated_at = p_now
  where room_id = v_room;

  return jsonb_build_object('status', 'accepted', 'labelled', v_n, 'held_out', v_held, 'emitted', to_jsonb(v_emitted));
end;
$$;

-- Model evaluation record (called by the training/eval script via the model-ingest API).
-- The DB constraints refuse fabricated splits: READY needs >=100/class and >=20% held out;
-- metrics need held_out >= 20% of the evaluated samples.
create or replace function public.record_model_evaluation(p jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_run uuid; m jsonb := p -> 'metrics'; d jsonb := p -> 'dataset'; v_kind text := p ->> 'model_kind';
begin
  if v_kind = 'HAND_RAISE' and d is not null then
    insert into public.handraise_dataset_versions (version, status, raised_count, not_raised_count, held_out_raised, held_out_not_raised)
    values (d ->> 'version', 'READY', (d ->> 'raised_count')::int, (d ->> 'not_raised_count')::int,
            (d ->> 'held_out_raised')::int, (d ->> 'held_out_not_raised')::int)
    on conflict (version) do update set status = 'READY', raised_count = excluded.raised_count, not_raised_count = excluded.not_raised_count,
      held_out_raised = excluded.held_out_raised, held_out_not_raised = excluded.held_out_not_raised;
  end if;

  insert into public.model_runs (model_kind, version, features, training_code_ref, trained_at)
  values (v_kind, p ->> 'version', p ->> 'features', nullif(p ->> 'training_code_ref', ''), nullif(p ->> 'trained_at', '')::timestamptz)
  on conflict (model_kind, version) do update set features = excluded.features, training_code_ref = excluded.training_code_ref, trained_at = excluded.trained_at
  returning id into v_run;

  insert into public.model_metrics (model_run_id, metric_name, metric_value, sample_count, held_out_count, confusion_matrix)
  values (v_run, 'HELD_OUT_ACCURACY', (m ->> 'held_out_accuracy')::numeric, (m ->> 'sample_count')::int, (m ->> 'held_out_count')::int,
          jsonb_build_object('labels', m -> 'labels', 'matrix', m -> 'confusion_matrix'))
  on conflict (model_run_id, metric_name) do update set metric_value = excluded.metric_value, sample_count = excluded.sample_count,
    held_out_count = excluded.held_out_count, confusion_matrix = excluded.confusion_matrix, evaluated_at = now();
  if m ? 'avg_prediction_ms' then
    insert into public.model_metrics (model_run_id, metric_name, metric_value, sample_count, held_out_count)
    values (v_run, 'AVG_PREDICTION_MS', (m ->> 'avg_prediction_ms')::numeric, (m ->> 'sample_count')::int, (m ->> 'held_out_count')::int)
    on conflict (model_run_id, metric_name) do update set metric_value = excluded.metric_value, evaluated_at = now();
  end if;
  if m ? 'presence_delay_ms' then
    insert into public.model_metrics (model_run_id, metric_name, metric_value, sample_count, held_out_count)
    values (v_run, 'PRESENCE_DELAY_MS', (m ->> 'presence_delay_ms')::numeric, (m ->> 'sample_count')::int, (m ->> 'held_out_count')::int)
    on conflict (model_run_id, metric_name) do update set metric_value = excluded.metric_value, evaluated_at = now();
  end if;
  return v_run;
end;
$$;

-- ---------- Level 12: link status, sync batches, offline entries ----------
create or replace function public.ingest_link_status(p_hash public.sha256_hex, p jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_device uuid; prev public.device_link_status%rowtype;
  n_state text := coalesce(p ->> 'sync_state', 'LIVE'); n_ap boolean := coalesce((p ->> 'ap_active')::boolean, false);
  n_pend int := coalesce((p ->> 'pending_records')::int, 0);
begin
  select device_id into v_device from public.device_from_token(p_hash);
  if v_device is null then return jsonb_build_object('status', 'unauthorized'); end if;
  select * into prev from public.device_link_status where device_id = v_device;

  insert into public.device_link_status (device_id, sync_state, ap_active, pending_records, oldest_pending_ts, ble_name, local_ip, mdns_name, last_error)
  values (v_device, n_state, n_ap, n_pend, nullif(p ->> 'oldest_pending_ts', '')::timestamptz, p ->> 'ble_name', p ->> 'local_ip', p ->> 'mdns_name', p ->> 'last_error')
  on conflict (device_id) do update set sync_state = excluded.sync_state, ap_active = excluded.ap_active, pending_records = excluded.pending_records,
    oldest_pending_ts = excluded.oldest_pending_ts, ble_name = excluded.ble_name, local_ip = excluded.local_ip, mdns_name = excluded.mdns_name,
    last_error = excluded.last_error, updated_at = now();

  if prev.device_id is null or prev.sync_state <> n_state or prev.ap_active <> n_ap or prev.ble_name is distinct from (p ->> 'ble_name') then
    insert into public.device_link_history (device_id, sync_state, ap_active, ble_name, pending_records)
    values (v_device, n_state, n_ap, p ->> 'ble_name', n_pend);
  end if;
  return jsonb_build_object('status', 'accepted');
end;
$$;

create or replace function public.record_sync_batch(p_hash public.sha256_hex, p_results jsonb, p_oldest timestamptz, p_newest timestamptz)
returns void
language plpgsql security definer set search_path = public as $$
declare v_device uuid;
begin
  select device_id into v_device from public.device_from_token(p_hash);
  if v_device is null then return; end if;
  insert into public.sync_batches (device_id, total, accepted, duplicates, rejected, oldest_device_ts, newest_device_ts)
  select v_device, count(*), count(*) filter (where r ->> 'status' = 'accepted'), count(*) filter (where r ->> 'status' = 'duplicate'),
         count(*) filter (where r ->> 'status' not in ('accepted', 'duplicate')), p_oldest, p_newest
  from jsonb_array_elements(p_results) r;
  update public.device_link_status set last_sync_at = now(), updated_at = now() where device_id = v_device;
end;
$$;

-- OFFLINE_ENTRY (card-only, face NOT verified) becomes an attendance record at the tap's own time.
create or replace function public.attendance_from_offline_entry()
returns trigger
language plpgsql security definer set search_path = public as $$
declare v_uid text := upper(new.detail ->> 'uid'); v_student uuid; v_class record; v_att uuid;
begin
  select student_id into v_student from public.student_cards where upper(card_uid) = v_uid and status = 'ACTIVE';
  if v_student is null then return new; end if;
  select * into v_class from public.class_sessions
    where room_id = new.room_id and new.device_ts >= starts_at and new.device_ts < ends_at limit 1;
  if not found then return new; end if;
  if not exists (select 1 from public.class_enrollments where class_session_id = v_class.id and student_id = v_student) then return new; end if;

  v_att := public.record_attendance(new.room_id, v_class.id, v_student,
    case when new.device_ts <= v_class.starts_at + interval '10 minutes' then 'PRESENT' else 'LATE' end,
    new.device_ts, 'CARD_OFFLINE', false);
  insert into public.card_checkins (device_id, room_id, device_event_id, card_uid, student_id, class_session_id, attendance_record_id, decision, reason, occurred_at, is_offline_sync)
  values (new.device_id, new.room_id, new.id, v_uid, v_student, v_class.id, v_att, 'GRANTED', 'OK', new.device_ts, true)
  on conflict (device_event_id) do nothing;
  return new;
end;
$$;
create trigger device_events_offline_entry
  after insert on public.device_events
  for each row when (new.source = 'DEVICE' and new.event_type = 'OFFLINE_ENTRY')
  execute function public.attendance_from_offline_entry();

-- ---------- Judge: strict order, 2 attempts, award %, completeness ----------
create or replace function public.level_status(p_level int)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_pass record; v_fails int; v_attempts int; v_prev boolean; v_video boolean; v_write boolean; v_code boolean;
begin
  select * into v_pass from public.level_test_runs where level_no = p_level and outcome = 'PASS' limit 1;
  select count(*) filter (where outcome = 'FAIL'), count(*) into v_fails, v_attempts from public.level_test_runs where level_no = p_level;
  v_prev := p_level = 1 or exists (select 1 from public.level_test_runs where level_no = p_level - 1 and outcome = 'PASS');
  select exists (select 1 from public.evidence_artifacts where level_no = p_level and kind = 'VIDEO'),
         exists (select 1 from public.evidence_artifacts where level_no = p_level and kind = 'WRITEUP'),
         exists (select 1 from public.level_code_references where level_no = p_level)
    into v_video, v_write, v_code;
  return jsonb_build_object(
    'level_no', p_level, 'attempts', v_attempts, 'passed', v_pass.id is not null, 'award_pct', coalesce(v_pass.award_pct, 0),
    'closed', v_fails >= 2 and v_pass.id is null, 'previous_passed', v_prev,
    'can_attempt', v_prev and v_pass.id is null and v_attempts < 2 and not (v_fails >= 2),
    'evidence', jsonb_build_object('video', v_video, 'writeup', v_write, 'code', v_code),
    'complete', v_pass.id is not null and v_video and v_write and v_code);
end;
$$;

create or replace function public.start_level_attempt(p_level int, p_actor uuid, p_call int default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare st jsonb; v_id uuid; v_no int;
begin
  if not exists (select 1 from public.user_roles where user_id = p_actor and role = 'ADMIN') then
    raise exception 'admin only' using errcode = 'insufficient_privilege';
  end if;
  st := public.level_status(p_level);
  if not (st ->> 'previous_passed')::boolean then raise exception 'level % can only be attempted after level % is passed', p_level, p_level - 1 using errcode = 'check_violation'; end if;
  if (st ->> 'passed')::boolean then raise exception 'level already passed' using errcode = 'check_violation'; end if;
  if (st ->> 'closed')::boolean then raise exception 'level closed after two failed attempts' using errcode = 'check_violation'; end if;
  select coalesce(max(attempt_no), 0) + 1 into v_no from public.level_test_runs where level_no = p_level;
  if v_no > 2 then raise exception 'no attempts left' using errcode = 'check_violation'; end if;
  insert into public.level_test_runs (level_no, attempt_no, call_no) values (p_level, v_no, p_call) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.record_attempt_outcome(p_run uuid, p_outcome text, p_judge text, p_actor uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare r public.level_test_runs%rowtype; v_open int; v_total int;
begin
  if not exists (select 1 from public.user_roles where user_id = p_actor and role = 'ADMIN') then
    raise exception 'admin only' using errcode = 'insufficient_privilege';
  end if;
  select * into r from public.level_test_runs where id = p_run for update;
  if not found then raise exception 'unknown run' using errcode = 'no_data_found'; end if;
  if r.outcome <> 'PENDING' then raise exception 'attempt already decided' using errcode = 'check_violation'; end if;
  if p_outcome not in ('PASS', 'FAIL') then raise exception 'outcome must be PASS or FAIL' using errcode = 'invalid_parameter_value'; end if;

  if p_outcome = 'PASS' then
    select count(*), count(*) filter (where outcome in ('PENDING', 'FAIL')) into v_total, v_open from public.level_test_results where test_run_id = p_run;
    if v_total = 0 then raise exception 'no requirement results recorded for this attempt' using errcode = 'check_violation'; end if;
    if v_open > 0 then raise exception '% requirement(s) are still pending or failed', v_open using errcode = 'check_violation'; end if;
  end if;

  update public.level_test_runs set outcome = p_outcome, judge_name = p_judge, judged_at = now(),
    award_pct = case when p_outcome = 'PASS' then (case when r.attempt_no = 1 then 100 else 70 end) else 0 end
  where id = p_run;
  insert into public.audit_logs (action, target_type, target_id, new_values, actor_profile_id)
  values ('LEVEL_ATTEMPT_' || p_outcome, 'level', r.level_no::text, jsonb_build_object('attempt', r.attempt_no), p_actor);
end;
$$;

-- Read-only measurements derived from stored data, offered to the judge as suggested values.
create or replace function public.judge_measurements()
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(m), '[]'::jsonb) from (
    (select jsonb_build_object('key', 'telemetry_interval_avg_s', 'level', 2, 'unit', 's', 'device', d.device_code,
             'value', round(avg(g.gap)::numeric, 2), 'max', round(max(g.gap)::numeric, 2), 'samples', count(*)) m
     from public.devices d
     join lateral (select extract(epoch from t.received_at - lag(t.received_at) over (order by t.device_ts))::numeric as gap
                   from (select received_at, device_ts from public.telemetry_readings where device_id = d.id order by device_ts desc limit 21) t) g on true
     where g.gap is not null group by d.device_code)
    union all
    (select jsonb_build_object('key', 'fire_event_latency_s', 'level', 3, 'unit', 's', 'device', d.device_code,
             'value', round(extract(epoch from e.received_at - e.device_ts)::numeric, 2))
     from public.device_events e join public.devices d on d.id = e.device_id
     where e.event_type = 'FIRE' and e.source = 'DEVICE'
     order by e.received_at desc limit 1)
    union all
    (select jsonb_build_object('key', 'phone_alert_latency_s', 'level', 4, 'unit', 's', 'device', '',
             'value', round(extract(epoch from nd.completed_at - i.received_at)::numeric, 2))
     from public.notification_deliveries nd join public.notifications n on n.id = nd.notification_id
     join public.security_incidents i on i.id = n.related_incident_id
     where nd.status in ('SENT', 'DELIVERED') and nd.completed_at is not null
     order by nd.completed_at desc limit 1)
    union all
    (select jsonb_build_object('key', 'settings_propagation_s', 'level', 5, 'unit', 's', 'device', d.device_code,
             'value', round(extract(epoch from a.received_at - c.created_at)::numeric, 2))
     from public.device_commands c join public.command_acknowledgements a on a.command_id = c.id and a.reported_state = 'APPLIED'
     join public.devices d on d.id = c.device_id where c.command_type = 'SET_THRESHOLDS'
     order by a.received_at desc limit 1)
    union all
    (select jsonb_build_object('key', 'ota_duration_s', 'level', 5, 'unit', 's', 'device', d.device_code,
             'value', round(extract(epoch from j.finished_at - j.created_at)::numeric, 2), 'state', j.state)
     from public.ota_jobs j join public.devices d on d.id = j.device_id where j.finished_at is not null
     order by j.finished_at desc limit 1)
  ) x;
$$;

grant execute on function public.level_status(int) to authenticated;

-- Seat zones are replaced atomically and versioned (Level 9). Admin only. Polygons are validated
-- (>= 3 points, normalized 0..1) by the caller; the DB re-checks shape and the unique seat numbers.
create or replace function public.replace_seat_zones(p_room uuid, p_zones jsonb, p_width int, p_height int, p_actor uuid)
returns int   -- new version
language plpgsql security definer set search_path = public as $$
declare v_school uuid; v_ver int; z jsonb; v_seats int[];
begin
  select school_id into v_school from public.rooms where id = p_room;
  if v_school is null then raise exception 'unknown room' using errcode = 'no_data_found'; end if;
  if not exists (select 1 from public.user_roles where user_id = p_actor and role = 'ADMIN' and school_id = v_school) then
    raise exception 'admin only' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_zones) <> 'array' then raise exception 'zones must be an array' using errcode = 'invalid_parameter_value'; end if;

  select coalesce(max(version), 0) + 1 into v_ver from public.seat_zones where room_id = p_room;
  v_seats := array(select (value ->> 'seat_no')::int from jsonb_array_elements(p_zones));
  delete from public.seat_zones where room_id = p_room and not (seat_no = any (v_seats));

  for z in select * from jsonb_array_elements(p_zones) loop
    insert into public.seat_zones (room_id, seat_no, label, polygon, image_width, image_height, version, edited_by)
    values (p_room, (z ->> 'seat_no')::int, z ->> 'label', z -> 'polygon', p_width, p_height, v_ver, p_actor)
    on conflict (room_id, seat_no) do update set label = excluded.label, polygon = excluded.polygon,
      image_width = excluded.image_width, image_height = excluded.image_height, version = excluded.version,
      edited_by = excluded.edited_by, updated_at = now();
  end loop;

  insert into public.audit_logs (school_id, actor_profile_id, action, target_type, target_id, new_values)
  values (v_school, p_actor, 'SEAT_ZONES_SAVED', 'room', p_room::text, jsonb_build_object('version', v_ver, 'zones', jsonb_array_length(p_zones)));
  return v_ver;
end;
$$;
