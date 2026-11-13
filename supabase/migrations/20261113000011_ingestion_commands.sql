-- 0011 device ingestion + config/command delivery (Prompt 04).
-- Logic lives in SQL so idempotency rides the DB unique constraint and the whole
-- thing is testable without a live Supabase. Routes stay thin: validate (Zod),
-- hash the bearer token, call these. Token hash in, never a raw token.

-- Resolve the device's authoritative room + device_code from a token hash.
create or replace function public.device_from_token(p_hash public.sha256_hex)
returns table (device_id uuid, room_id uuid, device_code text)
language sql stable security definer set search_path = public as $$
  select d.id, d.room_id, d.device_code
  from public.device_credentials c
  join public.devices d on d.id = c.device_id
  where c.token_hash = p_hash and c.status = 'ACTIVE'
  limit 1;
$$;

-- One telemetry sample. Returns {status, seq}. status: accepted | duplicate |
-- unauthorized | device_mismatch.
create or replace function public.ingest_telemetry(p_hash public.sha256_hex, p jsonb, p_offline boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_device uuid; v_room uuid; v_code text; v_seq bigint; v_inbox uuid;
begin
  select device_id, room_id, device_code into v_device, v_room, v_code
  from public.device_from_token(p_hash);
  if v_device is null then return jsonb_build_object('status', 'unauthorized'); end if;
  if p->>'device_id' is distinct from v_code then
    return jsonb_build_object('status', 'device_mismatch');
  end if;

  v_seq := (p->>'seq')::bigint;
  begin
    insert into public.device_message_inbox (device_id, seq, message_kind, device_ts, is_offline_sync, payload)
    values (v_device, v_seq, 'TELEMETRY', to_timestamp((p->>'ts')::double precision), p_offline, p)
    returning id into v_inbox;
  exception when unique_violation then
    return jsonb_build_object('status', 'duplicate', 'seq', v_seq);
  end;

  insert into public.telemetry_readings
    (inbox_id, device_id, room_id, seq, device_ts, uptime_s, temp_c, rh, heat_index_c,
     flame, door, status, heat_trend, rssi, heap_kb, chip_temp_c, fw, quality, is_offline_sync)
  values (v_inbox, v_device, v_room, v_seq, to_timestamp((p->>'ts')::double precision),
     (p->>'uptime_s')::int, (p->>'temp_c')::numeric, (p->>'rh')::numeric, (p->>'heat_index_c')::numeric,
     (p->>'flame')::boolean, p->>'door', p->>'status', p->>'heat_trend', (p->>'rssi')::int,
     (p->>'heap_kb')::int, (p->>'chip_temp_c')::numeric, p->>'fw', p->>'quality', p_offline);

  update public.devices set last_seen_at = now(), firmware_version = p->>'fw', updated_at = now()
    where id = v_device;
  return jsonb_build_object('status', 'accepted', 'seq', v_seq);
end;
$$;
comment on function public.ingest_telemetry is 'Idempotent telemetry ingest (device-assigned room is authoritative).';

-- One device event. Server-only event types are rejected from the device endpoint.
create or replace function public.ingest_event(p_hash public.sha256_hex, p jsonb, p_offline boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_device uuid; v_room uuid; v_code text; v_seq bigint; v_inbox uuid; v_type text; v_rev bigint;
begin
  select device_id, room_id, device_code into v_device, v_room, v_code
  from public.device_from_token(p_hash);
  if v_device is null then return jsonb_build_object('status', 'unauthorized'); end if;
  if p->>'device_id' is distinct from v_code then
    return jsonb_build_object('status', 'device_mismatch');
  end if;

  v_type := p->>'type';
  if v_type not in ('BOOT','STATUS','FIRE','FIRE_CLEARED','SILENCED','PANIC','CARD_TAP',
    'ENTRY_GRANTED','ENTRY_DENIED','NO_FACE','OFFLINE_ENTRY','SENSOR_ERROR','SETTINGS_APPLIED',
    'OTA_DONE','OTA_REJECTED','OTA_ROLLBACK') then
    return jsonb_build_object('status', 'rejected', 'reason', 'not_a_device_event');
  end if;

  v_seq := (p->>'seq')::bigint;
  begin
    insert into public.device_message_inbox (device_id, seq, message_kind, device_ts, is_offline_sync, payload)
    values (v_device, v_seq, 'EVENT', to_timestamp((p->>'ts')::double precision), p_offline, p)
    returning id into v_inbox;
  exception when unique_violation then
    return jsonb_build_object('status', 'duplicate', 'seq', v_seq);
  end;

  insert into public.device_events
    (source, device_id, room_id, seq, device_ts, event_type, detail, inbox_id, is_offline_sync)
  values ('DEVICE', v_device, v_room, v_seq, to_timestamp((p->>'ts')::double precision),
          v_type, coalesce(p->'detail', '{}'::jsonb), v_inbox, p_offline);

  -- SETTINGS_APPLIED carries the applied config revision (Level 5). UI reads applied vs desired.
  if v_type = 'SETTINGS_APPLIED' and (p->'detail' ? 'config_revision') then
    v_rev := (p->'detail'->>'config_revision')::bigint;
    update public.device_configurations
      set applied_revision = v_rev, applied_reported_at = now()
      where device_id = v_device and v_rev <= config_revision and v_rev > applied_revision;
  end if;

  update public.devices set last_seen_at = now(), updated_at = now() where id = v_device;
  return jsonb_build_object('status', 'accepted', 'seq', v_seq);
end;
$$;
comment on function public.ingest_event is 'Idempotent device-event ingest; applies SETTINGS_APPLIED revision.';

-- Offline batch: oldest-first, per-record result. Duplicates never create a 2nd row.
create or replace function public.ingest_batch(p_hash public.sha256_hex, p_records jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  rec jsonb; v_results jsonb := '[]'::jsonb; v_res jsonb;
begin
  for rec in
    select value from jsonb_array_elements(p_records) order by (value->>'seq')::bigint
  loop
    if rec->>'kind' = 'telemetry' then
      v_res := public.ingest_telemetry(p_hash, rec - 'kind', true);
    elsif rec->>'kind' = 'event' then
      v_res := public.ingest_event(p_hash, rec - 'kind', true);
    else
      v_res := jsonb_build_object('status', 'rejected', 'reason', 'unknown_kind');
    end if;
    v_results := v_results || jsonb_build_array(v_res || jsonb_build_object('seq', (rec->>'seq')::bigint));
  end loop;
  return v_results;
end;
$$;
comment on function public.ingest_batch is 'Offline sync: oldest-first, original ts preserved, per-record result.';

create or replace function public.ingest_health(p_hash public.sha256_hex, p jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_device uuid; v_code text;
begin
  select device_id, device_code into v_device, v_code from public.device_from_token(p_hash);
  if v_device is null then return jsonb_build_object('status', 'unauthorized'); end if;
  if p->>'device_id' is distinct from v_code then return jsonb_build_object('status', 'device_mismatch'); end if;

  insert into public.device_health_snapshots
    (device_id, device_ts, chip_temp_c, free_heap_kb, free_psram_kb, flash_size_kb,
     cpu_freq_mhz, rssi, uptime_s, reset_reason, fw, tasks)
  values (v_device, to_timestamp((p->>'ts')::double precision), (p->>'chip_temp_c')::numeric,
     (p->>'free_heap_kb')::int, (p->>'free_psram_kb')::int, (p->>'flash_size_kb')::int,
     (p->>'cpu_freq_mhz')::int, (p->>'rssi')::int, (p->>'uptime_s')::int, p->>'reset_reason',
     p->>'fw', coalesce(p->'tasks', '[]'::jsonb));
  update public.devices set last_seen_at = now(), firmware_version = p->>'fw' where id = v_device;
  return jsonb_build_object('status', 'accepted');
end;
$$;

-- Desired config for the device (device polls this). Returns null-ish on bad token.
create or replace function public.get_device_config(p_hash public.sha256_hex)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_device uuid; v_cfg jsonb;
begin
  select device_id into v_device from public.device_from_token(p_hash);
  if v_device is null then return jsonb_build_object('status', 'unauthorized'); end if;
  select jsonb_build_object(
      'config_revision', config_revision,
      'warning_temp_c', desired_warning_temp_c,
      'danger_temp_c', desired_danger_temp_c,
      'telemetry_interval_s', telemetry_interval_s)
    into v_cfg
  from public.device_configurations where device_id = v_device;
  return v_cfg;
end;
$$;

-- Server -> device command queue. Supersede an in-flight command of the same type.
create or replace function public.enqueue_command(
  p_device uuid, p_type text, p_payload jsonb, p_actor uuid, p_ttl_seconds int default 120)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  update public.device_commands
    set state = 'SUPERSEDED', finished_at = now()
    where device_id = p_device and command_type = p_type
      and state in ('CREATED','PENDING','DELIVERED','RECEIVED');
  insert into public.device_commands (device_id, command_type, payload, state, actor_profile_id, expires_at)
  values (p_device, p_type, coalesce(p_payload, '{}'::jsonb), 'PENDING', p_actor, now() + make_interval(secs => p_ttl_seconds))
  returning id into v_id;
  return v_id;
end;
$$;
comment on function public.enqueue_command is 'Queue an allowlisted command; supersedes a prior in-flight one of the same type.';

-- Device polls for its next command; marks it DELIVERED.
create or replace function public.claim_next_command(p_hash public.sha256_hex)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_device uuid; v_cmd record;
begin
  select device_id into v_device from public.device_from_token(p_hash);
  if v_device is null then return jsonb_build_object('status', 'unauthorized'); end if;

  select * into v_cmd from public.device_commands
    where device_id = v_device and state in ('CREATED','PENDING') and expires_at > now()
    order by created_at
    for update skip locked
    limit 1;
  if not found then return jsonb_build_object('command', null); end if;

  update public.device_commands
    set state = 'DELIVERED', delivery_attempts = delivery_attempts + 1, last_delivered_at = now()
    where id = v_cmd.id;
  return jsonb_build_object('command', jsonb_build_object(
    'id', v_cmd.id, 'type', v_cmd.command_type, 'payload', v_cmd.payload));
end;
$$;
comment on function public.claim_next_command is 'Return + mark DELIVERED the oldest pending command.';

-- Device acknowledges a command: RECEIVED | APPLIED | FAILED.
create or replace function public.ack_command(
  p_hash public.sha256_hex, p_command uuid, p_state text, p_applied_rev bigint, p_detail text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_device uuid; v_cmd record;
begin
  select device_id into v_device from public.device_from_token(p_hash);
  if v_device is null then return jsonb_build_object('status', 'unauthorized'); end if;

  select * into v_cmd from public.device_commands where id = p_command and device_id = v_device;
  if not found then return jsonb_build_object('status', 'unknown_command'); end if;

  insert into public.command_acknowledgements (command_id, device_id, reported_state, applied_config_revision, detail)
  values (p_command, v_device, p_state, p_applied_rev, p_detail)
  on conflict (command_id, reported_state) do nothing;

  update public.device_commands
    set state = case p_state when 'APPLIED' then 'ACKNOWLEDGED' else p_state end,
        finished_at = case when p_state in ('APPLIED','FAILED') then now() else finished_at end,
        result_detail = coalesce(p_detail, result_detail)
    where id = p_command;

  if p_applied_rev is not null then
    update public.device_configurations
      set applied_revision = p_applied_rev, applied_reported_at = now()
      where device_id = v_device and p_applied_rev <= config_revision and p_applied_rev > applied_revision;
  end if;
  return jsonb_build_object('status', 'ok');
end;
$$;
comment on function public.ack_command is 'Record a command ack and advance its state; APPLIED -> ACKNOWLEDGED.';

-- Connectivity: online when a heartbeat arrived within 30 s (Level 2).
create or replace function public.is_device_online(p_device uuid, p_now timestamptz default now())
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select last_seen_at from public.devices where id = p_device) > p_now - interval '30 seconds', false);
$$;
comment on function public.is_device_online is 'True when last_seen_at is within the last 30 seconds.';
