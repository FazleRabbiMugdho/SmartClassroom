-- 0013 safety incidents from events, notifications + delivery, settings/OTA, weather, reports (Prompts 08/09)

-- ---------- Schema additions ----------

-- School location for the weather fetch (Level 6). Nullable until the Admin sets it.
alter table public.schools
  add column latitude  numeric(8, 5) check (latitude  between -90  and 90),
  add column longitude numeric(8, 5) check (longitude between -180 and 180);

-- Where to reach a user outside the app (one channel is enough for the competition).
create table public.notification_channels (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.user_profiles (id) on delete cascade,
  channel     text not null check (channel in ('TELEGRAM', 'EMAIL', 'PUSH')),
  address     text not null check (length(trim(address)) > 0),   -- Telegram chat id, email, push token
  created_at  timestamptz not null default now(),
  unique (user_id, channel)
);
comment on table public.notification_channels is 'Per-user phone channel address. Server-only (no client grant).';
alter table public.notification_channels enable row level security;

-- Assistant query log: metadata only, never the raw prompt (privacy).
create table public.assistant_queries (
  id          bigint generated always as identity primary key,
  user_id     uuid references public.user_profiles (id) on delete set null,
  room_id     uuid references public.rooms (id) on delete set null,
  intent      text not null,
  report_date date,
  had_data    boolean not null,
  created_at  timestamptz not null default now()
);
comment on table public.assistant_queries is 'Assistant usage metadata. No prompt text is stored.';
alter table public.assistant_queries enable row level security;
grant select on public.assistant_queries to authenticated;
create policy assistant_queries_read on public.assistant_queries for select to authenticated using (is_any_admin());

-- Derived (forecast) notices are unique per school/category/window so refetches update in place.
create unique index weather_notices_derived_unique
  on public.weather_notices (school_id, category, window_start) where source_kind = 'FORECAST_DERIVED';

-- ---------- Incidents from device events ----------

create or replace function public.incident_from_event()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.source <> 'DEVICE' or new.room_id is null then return new; end if;

  if new.event_type = 'FIRE' then
    -- One open fire incident per room at a time.
    if not exists (select 1 from public.security_incidents
                   where room_id = new.room_id and incident_type = 'FIRE' and state <> 'CLOSED') then
      insert into public.security_incidents (room_id, device_id, incident_type, severity, occurred_at, source_event_id)
      values (new.room_id, new.device_id, 'FIRE', 'CRITICAL', coalesce(new.device_ts, now()), new.id);
    end if;
  elsif new.event_type = 'PANIC' then
    insert into public.security_incidents (room_id, device_id, incident_type, severity, occurred_at, source_event_id)
    values (new.room_id, new.device_id, 'PANIC', 'CRITICAL', coalesce(new.device_ts, now()), new.id);
  elsif new.event_type = 'FIRE_CLEARED' then
    -- Only a device-reported clear closes the fire (the cloud cannot clear an active flame).
    update public.security_incidents set state = 'CLOSED'
      where room_id = new.room_id and incident_type = 'FIRE' and state <> 'CLOSED';
  end if;
  return new;
end;
$$;
create trigger device_events_to_incidents
  after insert on public.device_events
  for each row execute function public.incident_from_event();

-- Heat Danger incident on the transition into DANGER (good-quality readings only).
create or replace function public.raise_heat_danger()
returns trigger
language plpgsql security definer set search_path = public as $$
declare v_prev text;
begin
  if new.status <> 'DANGER' or new.quality <> 'good' then return new; end if;
  select status into v_prev from public.telemetry_readings
    where device_id = new.device_id and quality = 'good' and (device_ts, seq) < (new.device_ts, new.seq)
    order by device_ts desc, seq desc limit 1;
  if (v_prev is null or v_prev <> 'DANGER')
     and not exists (select 1 from public.security_incidents
                     where room_id = new.room_id and incident_type = 'HEAT_DANGER' and state = 'OPEN') then
    insert into public.security_incidents (room_id, device_id, incident_type, severity, occurred_at, detail)
    values (new.room_id, new.device_id, 'HEAT_DANGER', 'DANGER', new.device_ts,
            jsonb_build_object('temp_c', new.temp_c, 'rh', new.rh));
  end if;
  return new;
end;
$$;
create trigger telemetry_heat_danger
  after insert on public.telemetry_readings
  for each row execute function public.raise_heat_danger();

-- ---------- Notifications ----------

-- Incident -> in-app notification for the room's teachers and the school's admins (deduped).
create or replace function public.notify_on_incident()
returns trigger
language plpgsql security definer set search_path = public as $$
declare v_school uuid; v_room text; v_kind text;
begin
  if new.incident_type not in ('FIRE', 'PANIC', 'HEAT_DANGER', 'FACE_MISMATCH', 'SPOOF', 'INTRUDER', 'CAMERA_FAULT') then
    return new;
  end if;
  select school_id, display_name into v_school, v_room from public.rooms where id = new.room_id;
  v_kind := case when new.incident_type in ('FIRE', 'PANIC', 'HEAT_DANGER', 'FACE_MISMATCH')
                 then new.incident_type else 'INCIDENT_ALERT' end;

  insert into public.notifications (school_id, recipient_profile_id, kind, title, body, related_incident_id, dedupe_key)
  select v_school, r.uid, v_kind,
         replace(new.incident_type, '_', ' ') || ' — ' || v_room,
         replace(new.incident_type, '_', ' ') || ' in ' || v_room || ' at ' ||
           to_char(new.occurred_at at time zone 'Asia/Dhaka', 'HH24:MI:SS') || ' (Asia/Dhaka).',
         new.id, 'INC:' || new.id || ':' || r.uid
  from (
    select m.user_id as uid from public.room_memberships m
      where m.room_id = new.room_id and m.membership_role = 'TEACHER'
    union
    select ur.user_id from public.user_roles ur where ur.school_id = v_school and ur.role = 'ADMIN'
  ) r
  join public.user_profiles up on up.id = r.uid
  on conflict (dedupe_key) do nothing;
  return new;
end;
$$;
create trigger security_incidents_notify
  after insert on public.security_incidents
  for each row execute function public.notify_on_incident();

-- Phone-worthy notifications that still need a successful delivery (retry <5 attempts, last 24 h).
create or replace function public.pending_deliveries(p_limit int default 20)
returns table (notification_id uuid, kind text, title text, body text, channel text, address text, attempts int)
language sql stable security definer set search_path = public as $$
  select n.id, n.kind, n.title, n.body, c.channel, c.address,
         coalesce((select max(d.attempt_no) from public.notification_deliveries d where d.notification_id = n.id and d.channel = c.channel), 0)::int
  from public.notifications n
  join public.notification_channels c on c.user_id = n.recipient_profile_id
  where n.kind in ('FIRE', 'PANIC', 'HEAT_DANGER', 'FACE_MISMATCH', 'WEATHER_DANGER')
    and n.created_at > now() - interval '24 hours'
    and not exists (select 1 from public.notification_deliveries d
                    where d.notification_id = n.id and d.channel = c.channel and d.status in ('SENT', 'DELIVERED'))
    and coalesce((select max(d.attempt_no) from public.notification_deliveries d where d.notification_id = n.id and d.channel = c.channel), 0) < 5
  order by n.created_at
  limit p_limit;
$$;

-- Claim an attempt. Returns the new delivery id, or null if already delivered / being attempted.
create or replace function public.begin_delivery(p_notification uuid, p_channel text, p_provider text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_attempt int; v_id uuid;
begin
  if exists (select 1 from public.notification_deliveries
             where notification_id = p_notification and channel = p_channel and status in ('SENT', 'DELIVERED')) then
    return null;
  end if;
  if exists (select 1 from public.notification_deliveries
             where notification_id = p_notification and channel = p_channel and status = 'PENDING'
               and attempted_at > now() - interval '60 seconds') then
    return null;   -- another worker is mid-attempt
  end if;
  select coalesce(max(attempt_no), 0) + 1 into v_attempt
    from public.notification_deliveries where notification_id = p_notification and channel = p_channel;
  insert into public.notification_deliveries (notification_id, channel, provider, attempt_no, status)
  values (p_notification, p_channel, p_provider, v_attempt, 'PENDING')
  returning id into v_id;
  return v_id;
exception when unique_violation then
  return null;
end;
$$;

create or replace function public.finish_delivery(p_delivery uuid, p_status text, p_message_id text, p_error text)
returns void
language sql security definer set search_path = public as $$
  update public.notification_deliveries
    set status = p_status, provider_message_id = p_message_id, error_text = p_error, completed_at = now()
    where id = p_delivery;
$$;

-- ---------- Level 5: threshold change + command in one transaction ----------

create or replace function public.change_thresholds(
  p_device uuid, p_warning numeric, p_danger numeric, p_actor uuid, p_reason text)
returns bigint
language plpgsql security definer set search_path = public as $$
declare v_school uuid; v_rev bigint;
begin
  select school_id into v_school from public.devices where id = p_device;
  if v_school is null then raise exception 'unknown device' using errcode = 'no_data_found'; end if;
  if not exists (select 1 from public.user_roles where user_id = p_actor and role = 'ADMIN' and school_id = v_school) then
    raise exception 'admin only' using errcode = 'insufficient_privilege';
  end if;

  v_rev := public.apply_threshold_change(p_device, p_warning, p_danger, p_actor, p_reason);
  perform public.enqueue_command(
    p_device, 'SET_THRESHOLDS',
    jsonb_build_object('config_revision', v_rev, 'warning_temp_c', p_warning, 'danger_temp_c', p_danger),
    p_actor, 300);
  insert into public.audit_logs (school_id, actor_profile_id, action, target_type, target_id, new_values)
  values (v_school, p_actor, 'SETTINGS_CHANGED', 'device', p_device::text,
          jsonb_build_object('warning_temp_c', p_warning, 'danger_temp_c', p_danger, 'config_revision', v_rev));
  return v_rev;
end;
$$;

-- Teachers do not read device_configurations (RLS), but the Safety Centre needs the active
-- limits for rooms they can read. Read-only, room-scoped.
create or replace function public.room_thresholds(p_room uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.can_read_room(p_room) then return null; end if;
  select jsonb_build_object('warning_temp_c', c.desired_warning_temp_c, 'danger_temp_c', c.desired_danger_temp_c,
                            'config_revision', c.config_revision, 'applied_revision', c.applied_revision)
    into v
  from public.device_configurations c join public.devices d on d.id = c.device_id
  where d.room_id = p_room
  order by d.last_seen_at desc nulls last limit 1;   -- the active device
  return v;
end;
$$;

-- ---------- Level 5: OTA ----------

create or replace function public.start_ota_job(p_release uuid, p_device uuid, p_actor uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_school uuid; v_rel record; v_job uuid; v_cmd uuid;
begin
  select school_id into v_school from public.devices where id = p_device;
  if not exists (select 1 from public.user_roles where user_id = p_actor and role = 'ADMIN' and school_id = v_school) then
    raise exception 'admin only' using errcode = 'insufficient_privilege';
  end if;
  select * into v_rel from public.ota_releases where id = p_release;
  if not found then raise exception 'unknown release' using errcode = 'no_data_found'; end if;

  insert into public.ota_jobs (release_id, device_id, created_by) values (p_release, p_device, p_actor)
  returning id into v_job;   -- partial unique index rejects a second active job per device

  v_cmd := public.enqueue_command(p_device, 'OTA_INSTALL',
    jsonb_build_object('release_id', v_rel.id, 'version', v_rel.version, 'sha256', v_rel.sha256, 'size_bytes', v_rel.file_size_bytes),
    p_actor, 900);
  update public.ota_jobs set command_id = v_cmd where id = v_job;

  insert into public.audit_logs (school_id, actor_profile_id, action, target_type, target_id, new_values)
  values (v_school, p_actor, 'OTA_STARTED', 'device', p_device::text, jsonb_build_object('version', v_rel.version));
  return v_job;
end;
$$;

-- Device events are the only thing that can mark an OTA outcome as proven.
create or replace function public.ota_job_from_event()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.ota_jobs set
      state = case new.event_type when 'OTA_DONE' then 'DONE' when 'OTA_REJECTED' then 'REJECTED' else 'ROLLED_BACK' end,
      result_detail = coalesce(new.detail->>'reason', new.detail->>'detail', new.event_type),
      finished_at = now(), updated_at = now(), progress_pct = case when new.event_type = 'OTA_DONE' then 100 else progress_pct end
    where device_id = new.device_id and state not in ('DONE', 'REJECTED', 'ROLLED_BACK', 'FAILED');
  return new;
end;
$$;
create trigger device_events_ota_job
  after insert on public.device_events
  for each row when (new.source = 'DEVICE' and new.event_type in ('OTA_DONE', 'OTA_REJECTED', 'OTA_ROLLBACK'))
  execute function public.ota_job_from_event();

create or replace function public.ota_job_from_command()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.ota_jobs set
      state = case new.state when 'DELIVERED' then 'DELIVERED' when 'RECEIVED' then 'DOWNLOADING'
                             when 'FAILED' then 'FAILED' when 'EXPIRED' then 'FAILED' else state end,
      result_detail = case when new.state in ('FAILED', 'EXPIRED') then coalesce(new.result_detail, new.state) else result_detail end,
      finished_at = case when new.state in ('FAILED', 'EXPIRED') then now() else finished_at end,
      updated_at = now()
    where command_id = new.id and state not in ('DONE', 'REJECTED', 'ROLLED_BACK', 'FAILED');
  return new;
end;
$$;
create trigger device_commands_ota_job
  after update of state on public.device_commands
  for each row when (new.command_type = 'OTA_INSTALL' and new.state is distinct from old.state)
  execute function public.ota_job_from_command();

-- ---------- Level 6: weather danger fan-out ----------

-- A DANGER notice is queued to every device in the school and notifies staff (all within the insert txn).
create or replace function public.fan_out_weather_danger()
returns trigger
language plpgsql security definer set search_path = public as $$
declare d record;
begin
  if new.severity <> 'DANGER' or new.withdrawn_at is not null then return new; end if;

  for d in select id from public.devices where school_id = new.school_id loop
    perform public.enqueue_command(d.id, 'WEATHER_NOTICE',
      jsonb_build_object('notice_id', new.id, 'severity', new.severity, 'category', new.category,
                         'text', new.notice_text, 'window_end', new.window_end),
      new.created_by, 600);
  end loop;

  insert into public.notifications (school_id, recipient_profile_id, kind, title, body, dedupe_key)
  select new.school_id, r.uid, 'WEATHER_DANGER', 'Weather danger: ' || replace(new.category, '_', ' '), new.notice_text,
         'WX:' || new.id || ':' || r.uid
  from (
    select ur.user_id as uid from public.user_roles ur
      where ur.school_id = new.school_id and ur.role in ('ADMIN', 'TEACHER')
  ) r
  join public.user_profiles up on up.id = r.uid
  on conflict (dedupe_key) do nothing;
  return new;
end;
$$;
create trigger weather_notices_danger
  after insert on public.weather_notices
  for each row execute function public.fan_out_weather_danger();

-- ---------- Level 6: daily report (single source for the page, CSV and assistant) ----------
-- SECURITY INVOKER: runs under the caller's RLS, so a teacher only ever sees their own rooms.
create or replace function public.daily_report(p_room uuid, p_date date)
returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v_start timestamptz := (p_date::timestamp at time zone 'Asia/Dhaka');
  v_end   timestamptz := ((p_date + 1)::timestamp at time zone 'Asia/Dhaka');
  v_n integer; v_temp jsonb; v_rh jsonb; v_alarms jsonb; v_att jsonb;
begin
  select count(*)::int,
         jsonb_build_object('min', min(temp_c), 'max', max(temp_c), 'avg', round(avg(temp_c), 2)),
         jsonb_build_object('min', min(rh), 'max', max(rh), 'avg', round(avg(rh), 2))
    into v_n, v_temp, v_rh
  from public.telemetry_readings
  where room_id = p_room and quality = 'good' and device_ts >= v_start and device_ts < v_end;

  select coalesce(jsonb_object_agg(t, c), '{}'::jsonb) into v_alarms
  from (select incident_type t, count(*)::int c from public.security_incidents
        where room_id = p_room and occurred_at >= v_start and occurred_at < v_end group by 1) a;

  select jsonb_build_object(
           'present', count(*) filter (where a.attendance_status = 'PRESENT'),
           'late',    count(*) filter (where a.attendance_status = 'LATE'),
           'absent',  count(*) filter (where a.attendance_status = 'ABSENT'))
    into v_att
  from public.attendance_records a join public.class_sessions c on c.id = a.class_session_id
  where a.room_id = p_room and c.starts_at >= v_start and c.starts_at < v_end;

  return jsonb_build_object(
    'date', p_date, 'room_id', p_room, 'timezone', 'Asia/Dhaka',
    'readings', v_n, 'has_data', v_n > 0,
    'temp_c', case when v_n > 0 then v_temp else null end,
    'rh',     case when v_n > 0 then v_rh   else null end,
    'alarms', v_alarms, 'attendance', v_att);
end;
$$;
grant execute on function public.daily_report(uuid, date) to authenticated;
grant execute on function public.room_thresholds(uuid) to authenticated;
