-- 0003 device (C): devices, credentials, config, inbox, telemetry, events, health

create table public.devices (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools (id) on delete cascade,
  device_code       text not null unique check (device_code ~ '^[A-Za-z0-9-]+$'),  -- wire device_id, e.g. T07-D1
  team_code         text not null check (team_code ~ '^T[0-9]{2}$'),                 -- e.g. T07
  room_id           uuid not null references public.rooms (id) on delete restrict,
  firmware_version  text,
  last_seen_at      timestamptz,                                                   -- server receipt time
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table public.devices is 'ESP32-S3-CAM device. Credentials live in device_credentials.';
create index devices_room_idx on public.devices (room_id);

-- Per-device token verifiers. Raw token shown once at provisioning, never stored.
create table public.device_credentials (
  id           uuid primary key default gen_random_uuid(),
  device_id    uuid not null references public.devices (id) on delete cascade,
  token_hash   public.sha256_hex not null unique,
  status       text not null default 'ACTIVE' check (status in ('ACTIVE', 'REVOKED', 'ROTATED')),
  created_by   uuid references public.user_profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  revoked_at   timestamptz,
  revoked_by   uuid references public.user_profiles (id) on delete set null,
  revoke_reason text,
  check ((status = 'ACTIVE') = (revoked_at is null))
);
comment on table public.device_credentials is 'Hashed per-device token verifiers. Server-only.';
create unique index device_credentials_one_active
  on public.device_credentials (device_id) where status = 'ACTIVE';

-- Desired config (Level 5). Applied revision is reported by the device.
create table public.device_configurations (
  device_id                  uuid primary key references public.devices (id) on delete cascade,
  config_revision            bigint not null default 1 check (config_revision >= 1),
  desired_warning_temp_c     numeric(4, 1) not null default 32 check (desired_warning_temp_c between 0 and 50),
  desired_danger_temp_c      numeric(4, 1) not null default 40 check (desired_danger_temp_c between 0 and 50),
  telemetry_interval_s       integer not null default 5 check (telemetry_interval_s between 1 and 60),
  applied_revision           bigint not null default 0 check (applied_revision >= 0),
  applied_reported_at        timestamptz,
  updated_by                 uuid references public.user_profiles (id) on delete set null,
  updated_at                 timestamptz not null default now(),
  check (desired_warning_temp_c < desired_danger_temp_c),   -- Level 5: Warning must be below Danger
  check (applied_revision <= config_revision)
);
comment on table public.device_configurations is 'Desired device config. Dashboard shows applied_revision separately.';

-- Monotonic revision: never decreases.
create or replace function public.enforce_config_revision_monotonic()
returns trigger
language plpgsql
as $$
begin
  if new.config_revision < old.config_revision then
    raise exception 'config_revision must not decrease (% -> %)', old.config_revision, new.config_revision
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger device_configurations_revision_monotonic
  before update of config_revision on public.device_configurations
  for each row execute function public.enforce_config_revision_monotonic();

-- Level 5 change log: who changed what, old/new, when. Append-only.
create table public.device_config_history (
  id                        bigint generated always as identity primary key,
  device_id                 uuid not null references public.devices (id) on delete cascade,
  config_revision           bigint not null,
  previous_warning_temp_c   numeric(4, 1),
  new_warning_temp_c        numeric(4, 1) not null,
  previous_danger_temp_c    numeric(4, 1),
  new_danger_temp_c         numeric(4, 1) not null,
  changed_by                uuid references public.user_profiles (id) on delete set null,
  changed_at                timestamptz not null default now(),
  reason                    text,
  unique (device_id, config_revision)
);
comment on table public.device_config_history is 'Append-only settings change log (Level 5).';
create trigger device_config_history_append_only
  before update or delete on public.device_config_history
  for each row execute function public.reject_mutation();

-- Raw device messages that carry a device seq (telemetry + events). Idempotency key: (device_id, seq).
create table public.device_message_inbox (
  id               uuid primary key default gen_random_uuid(),
  device_id        uuid not null references public.devices (id) on delete cascade,
  seq              bigint not null check (seq >= 0),
  message_kind     text not null check (message_kind in ('TELEMETRY', 'EVENT')),
  device_ts        timestamptz not null,           -- device reading/event time (from ts)
  received_at      timestamptz not null default now(),  -- server receipt time (separate)
  is_offline_sync  boolean not null default false,
  payload          jsonb not null,                 -- raw wire payload kept for audit
  unique (device_id, seq)
);
comment on table public.device_message_inbox is 'Raw device messages. (device_id, seq) is unique: replays are rejected.';
create index device_inbox_received_idx on public.device_message_inbox (received_at desc);

create table public.telemetry_readings (
  id              bigint generated always as identity primary key,
  inbox_id        uuid not null unique references public.device_message_inbox (id) on delete restrict,
  device_id       uuid not null references public.devices (id) on delete cascade,
  room_id         uuid not null references public.rooms (id) on delete cascade,
  seq             bigint not null,
  device_ts       timestamptz not null,
  received_at     timestamptz not null default now(),
  uptime_s        integer not null check (uptime_s >= 0),
  temp_c          numeric(5, 2) not null,         -- stored as received; quality flags bad readings
  rh              numeric(5, 2) not null,
  heat_index_c    numeric(5, 2) not null,
  flame           boolean not null,
  door            text not null check (door in ('LOCKED', 'UNLOCKED')),
  status          text not null check (status in ('SAFE', 'WARNING', 'DANGER', 'FIRE')),  -- paper §6
  heat_trend      text not null check (heat_trend in ('RISING', 'STABLE', 'FALLING')),
  rssi            integer not null,
  heap_kb         integer not null check (heap_kb >= 0),
  chip_temp_c     numeric(5, 2) not null,
  fw              text not null,
  quality         text not null check (quality in ('good', 'bad')),
  is_offline_sync boolean not null default false,
  unique (device_id, seq)
);
comment on table public.telemetry_readings is 'Level 2 telemetry (paper §6 fields). Normalized from the inbox.';
create index telemetry_room_time_idx on public.telemetry_readings (room_id, device_ts desc);
create index telemetry_device_time_idx on public.telemetry_readings (device_id, device_ts desc);

-- Device and server events. Device events carry seq; server events carry a server ID instead.
create table public.device_events (
  id               uuid primary key default gen_random_uuid(),
  source           text not null check (source in ('DEVICE', 'SERVER')),
  device_id        uuid references public.devices (id) on delete restrict,
  room_id          uuid references public.rooms (id) on delete set null,
  seq              bigint,
  device_ts        timestamptz,
  event_type       text not null check (event_type in (
    'BOOT', 'STATUS', 'FIRE', 'FIRE_CLEARED', 'SILENCED', 'PANIC', 'CARD_TAP',
    'ENTRY_GRANTED', 'ENTRY_DENIED', 'NO_FACE', 'OFFLINE_ENTRY', 'SENSOR_ERROR',
    'SETTINGS_APPLIED', 'OTA_DONE', 'OTA_REJECTED', 'OTA_ROLLBACK',
    'UNKNOWN_CARD', 'FACE_MISMATCH', 'SPOOF', 'CARD_BLOCKED', 'STUDENT_DELETED',
    'WEATHER_ALERT', 'OCCUPANCY', 'OVER_CAPACITY', 'INTRUDER', 'CAMERA_FAULT',
    'CAMERA_OK', 'HAND_RAISED', 'PRESENCE', 'ACK')),
  detail           jsonb not null default '{}'::jsonb,
  inbox_id         uuid unique references public.device_message_inbox (id) on delete restrict,
  is_offline_sync  boolean not null default false,
  actor_profile_id uuid references public.user_profiles (id) on delete set null,
  received_at      timestamptz not null default now(),
  check (
    (source = 'DEVICE' and device_id is not null and seq is not null and device_ts is not null)
    or (source = 'SERVER' and seq is null)
  ),
  -- Server-only types may not arrive from a device (paper §6 split).
  check (source = 'SERVER' or event_type in (
    'BOOT', 'STATUS', 'FIRE', 'FIRE_CLEARED', 'SILENCED', 'PANIC', 'CARD_TAP',
    'ENTRY_GRANTED', 'ENTRY_DENIED', 'NO_FACE', 'OFFLINE_ENTRY', 'SENSOR_ERROR',
    'SETTINGS_APPLIED', 'OTA_DONE', 'OTA_REJECTED', 'OTA_ROLLBACK'))
);
comment on table public.device_events is 'Events. DEVICE rows keep device seq/ts; SERVER rows have no seq.';
create unique index device_events_device_seq_unique
  on public.device_events (device_id, seq) where source = 'DEVICE';
create index device_events_room_time_idx on public.device_events (room_id, received_at desc);
create index device_events_device_time_idx on public.device_events (device_id, device_ts desc);

create table public.device_health_snapshots (
  id               bigint generated always as identity primary key,
  device_id        uuid not null references public.devices (id) on delete cascade,
  device_ts        timestamptz not null,
  received_at      timestamptz not null default now(),
  chip_temp_c      numeric(5, 2) not null,
  free_heap_kb     integer not null check (free_heap_kb >= 0),
  free_psram_kb    integer not null check (free_psram_kb >= 0),
  flash_size_kb    integer not null check (flash_size_kb > 0),
  cpu_freq_mhz     integer not null check (cpu_freq_mhz > 0),
  rssi             integer not null,
  uptime_s         integer not null check (uptime_s >= 0),
  reset_reason     text not null check (reset_reason in ('POWER_ON', 'SOFTWARE', 'WATCHDOG', 'CRASH', 'BROWNOUT')),
  fw               text not null,
  tasks            jsonb not null default '[]'::jsonb  -- variable task list (name, core, free_stack)
);
comment on table public.device_health_snapshots is 'Level 1/4 health report (health + tasks commands).';
create index device_health_device_time_idx on public.device_health_snapshots (device_id, received_at desc);
