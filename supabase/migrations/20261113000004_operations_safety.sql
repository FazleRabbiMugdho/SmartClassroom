-- 0004 operations (D) and safety (E), plus private storage bookkeeping

-- Private object bookkeeping (Prompt 02 storage/retention rules). Objects never get public URLs.
create table public.retention_policies (
  object_class   text primary key,
  retention_hours integer check (retention_hours is null or retention_hours >= 0),  -- null = until Admin deletes
  description    text not null
);
comment on table public.retention_policies is 'Retention per private object class. Values are proposed defaults for Admin confirmation.';

insert into public.retention_policies (object_class, retention_hours, description) values
  ('ENROLLMENT_PHOTO',       1,    'Enrollment photos: delete right after embedding; 1h is a fallback TTL only.'),
  ('FACE_CROP',              0,    'Verification face crops: never stored after matching.'),
  ('MISMATCH_SNAPSHOT',      720,  'Level 8 private mismatch snapshot (Teacher/Admin only). Proposed 30 days.'),
  ('INTRUDER_SNAPSHOT',      720,  'Level 9 single INTRUDER snapshot. Proposed 30 days.'),
  ('CAMERA_FAULT_SNAPSHOT',  168,  'Level 9 fault-moment snapshot. Proposed 7 days.'),
  ('REFERENCE_SNAPSHOT',     null, 'Camera DOOR/ROOM reference image. Kept until Admin replaces it.'),
  ('CSI_RAW',                168,  'Raw CSI payloads, if retained at all. Proposed 7 days.'),
  ('FIRMWARE_BINARY',        null, 'OTA firmware release. Kept while the release is listed.'),
  ('EVIDENCE_FILE',          null, 'Competition video, write-up, screenshots. Kept for judging.');

-- Private snapshots: mismatch, intruder, camera fault. Access is server-mediated (signed URL).
create table public.private_snapshots (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools (id) on delete cascade,
  room_id       uuid references public.rooms (id) on delete set null,
  kind          text not null check (kind in ('MISMATCH', 'INTRUDER', 'CAMERA_FAULT')),
  bucket        text not null default 'private-snapshots',
  object_key    text not null,
  content_type  text not null check (content_type in ('image/jpeg', 'image/png')),
  byte_size     integer not null check (byte_size > 0),
  student_id    uuid references public.students (id) on delete cascade,  -- null for intruder/fault
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  deleted_at    timestamptz,
  unique (bucket, object_key),
  check (expires_at > created_at)
);
comment on table public.private_snapshots is 'Private snapshot metadata. Object key only, never a public URL.';
create index private_snapshots_student_idx on public.private_snapshots (student_id);
create index private_snapshots_expiry_idx on public.private_snapshots (expires_at) where deleted_at is null;

-- Object-storage deletions to perform, with retry and reconciliation state.
create table public.storage_deletion_queue (
  id          bigint generated always as identity primary key,
  bucket      text not null,
  object_key  text not null,
  reason      text not null check (reason in ('STUDENT_DELETED', 'RETENTION_EXPIRED', 'ENROLLMENT_PROCESSED')),
  queued_at   timestamptz not null default now(),
  attempts    integer not null default 0 check (attempts >= 0),
  last_error  text,
  deleted_at  timestamptz,
  unique (bucket, object_key)
);
comment on table public.storage_deletion_queue is 'Pending object deletions. Worker retries until deleted_at is set.';
create index storage_deletion_pending_idx on public.storage_deletion_queue (queued_at) where deleted_at is null;

-- D. Operations --------------------------------------------------------------

create table public.device_commands (
  id                 uuid primary key default gen_random_uuid(),
  device_id          uuid not null references public.devices (id) on delete cascade,
  command_type       text not null check (command_type in (
    'SET_THRESHOLDS', 'FIRE_RESET', 'TEACHER_TAG_OP', 'WEATHER_NOTICE', 'OTA_INSTALL', 'CONFIG_SYNC')),
  payload            jsonb not null default '{}'::jsonb,
  state              text not null default 'CREATED' check (state in (
    'CREATED', 'PENDING', 'DELIVERED', 'RECEIVED', 'APPLIED', 'ACKNOWLEDGED',
    'FAILED', 'EXPIRED', 'REJECTED', 'SUPERSEDED')),
  actor_profile_id   uuid references public.user_profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  expires_at         timestamptz not null,
  delivery_attempts  integer not null default 0 check (delivery_attempts >= 0),
  last_delivered_at  timestamptz,
  finished_at        timestamptz,
  result_detail      text,
  check (expires_at > created_at)
);
comment on table public.device_commands is 'Durable command queue. Allowlisted types only (C6).';
create index device_commands_device_state_idx on public.device_commands (device_id, state);
-- One in-flight command per device per type: a new one supersedes the old.
create unique index device_commands_one_inflight_per_type
  on public.device_commands (device_id, command_type)
  where state in ('CREATED', 'PENDING', 'DELIVERED', 'RECEIVED');

create table public.command_acknowledgements (
  id                       uuid primary key default gen_random_uuid(),
  command_id               uuid not null references public.device_commands (id) on delete cascade,
  device_id                uuid not null references public.devices (id) on delete cascade,
  reported_state           text not null check (reported_state in ('RECEIVED', 'APPLIED', 'FAILED')),
  applied_config_revision  bigint check (applied_config_revision is null or applied_config_revision >= 0),
  detail                   text,
  received_at              timestamptz not null default now(),
  unique (command_id, reported_state)   -- retries are idempotent
);
comment on table public.command_acknowledgements is 'Device acks per command. One row per reported state.';

create table public.ota_releases (
  id                  uuid primary key default gen_random_uuid(),
  version             text not null unique,
  file_size_bytes     bigint not null check (file_size_bytes > 0),
  sha256              public.sha256_hex not null,
  storage_bucket      text not null default 'firmware-ota',
  storage_object_key  text not null unique,
  device_target       text not null default 'ESP32-S3-CAM',
  uploaded_by         uuid references public.user_profiles (id) on delete set null,
  uploaded_at         timestamptz not null default now(),
  notes               text
);
comment on table public.ota_releases is 'Firmware binary metadata. Binary in private bucket firmware-ota.';

create table public.ota_jobs (
  id             uuid primary key default gen_random_uuid(),
  release_id     uuid not null references public.ota_releases (id) on delete restrict,
  device_id      uuid not null references public.devices (id) on delete cascade,
  command_id     uuid references public.device_commands (id) on delete set null,
  state          text not null default 'PENDING' check (state in (
    'PENDING', 'DELIVERED', 'DOWNLOADING', 'VERIFIED', 'INSTALLED',
    'DONE', 'REJECTED', 'ROLLED_BACK', 'FAILED')),
  progress_pct   smallint not null default 0 check (progress_pct between 0 and 100),
  result_detail  text,
  created_by     uuid references public.user_profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  finished_at    timestamptz
);
comment on table public.ota_jobs is 'OTA attempt per device. One active job per device.';
create unique index ota_jobs_one_active_per_device
  on public.ota_jobs (device_id)
  where state not in ('DONE', 'REJECTED', 'ROLLED_BACK', 'FAILED');

-- E. Safety ------------------------------------------------------------------

create table public.security_incidents (
  id               uuid primary key default gen_random_uuid(),
  room_id          uuid not null references public.rooms (id) on delete cascade,
  device_id        uuid references public.devices (id) on delete set null,
  incident_type    text not null check (incident_type in (
    'FIRE', 'PANIC', 'HEAT_DANGER', 'FACE_MISMATCH', 'SPOOF', 'CARD_BLOCKED',
    'CAMERA_FAULT', 'INTRUDER', 'OVER_CAPACITY', 'SENSOR_ERROR', 'UNKNOWN_CARD', 'WEATHER_DANGER')),
  severity         text not null check (severity in ('INFO', 'WARNING', 'DANGER', 'CRITICAL')),
  state            text not null default 'OPEN' check (state in ('OPEN', 'ACKNOWLEDGED', 'CLOSED')),
  occurred_at      timestamptz not null,          -- device time when known, else server time
  received_at      timestamptz not null default now(),
  source_event_id  uuid references public.device_events (id) on delete set null,
  student_id       uuid references public.students (id) on delete set null,
  card_uid         text,
  snapshot_id      uuid references public.private_snapshots (id) on delete set null,
  detail           jsonb not null default '{}'::jsonb
);
comment on table public.security_incidents is 'Incident record. Acknowledge is separate from clearing a fire.';
create index security_incidents_room_time_idx on public.security_incidents (room_id, occurred_at desc);
create index security_incidents_open_idx on public.security_incidents (room_id) where state = 'OPEN';
create index security_incidents_card_time_idx on public.security_incidents (card_uid, occurred_at) where card_uid is not null;

-- Exactly one acknowledgement per incident (PK). Insert ... ON CONFLICT DO NOTHING in ack_incident().
create table public.incident_acknowledgements (
  incident_id      uuid primary key references public.security_incidents (id) on delete cascade,
  acknowledged_by  uuid references public.user_profiles (id) on delete set null,
  acknowledged_at  timestamptz not null default now()
);
comment on table public.incident_acknowledgements is 'Atomic Ack: primary key guarantees one row per incident.';

create table public.blocked_cards (
  id                   uuid primary key default gen_random_uuid(),
  school_id            uuid not null references public.schools (id) on delete cascade,
  card_uid             text not null,
  status               text not null default 'ACTIVE' check (status in ('ACTIVE', 'UNBLOCKED')),
  reason               text not null,
  blocked_at           timestamptz not null,
  blocked_until        timestamptz not null,
  trigger_incident_id  uuid references public.security_incidents (id) on delete set null,
  unblocked_at         timestamptz,
  unblocked_by         uuid references public.user_profiles (id) on delete set null,
  check (blocked_until > blocked_at),
  check ((status = 'UNBLOCKED') = (unblocked_at is not null))
);
comment on table public.blocked_cards is 'Card lockout (Level 8). Expires by blocked_until; Admin may unblock.';
create unique index blocked_cards_one_active_per_card
  on public.blocked_cards (school_id, card_uid) where status = 'ACTIVE';

create table public.notifications (
  id                    uuid primary key default gen_random_uuid(),
  school_id             uuid not null references public.schools (id) on delete cascade,
  recipient_profile_id  uuid not null references public.user_profiles (id) on delete cascade,
  kind                  text not null check (kind in (
    'FIRE', 'PANIC', 'HEAT_DANGER', 'GUARDIAN_LATE', 'GUARDIAN_ABSENT',
    'WEATHER_DANGER', 'FACE_MISMATCH', 'INCIDENT_ALERT', 'SYSTEM')),
  title                 text not null,
  body                  text not null,
  related_incident_id   uuid references public.security_incidents (id) on delete set null,
  dedupe_key            text not null unique,      -- no duplicate notifications on retry
  created_at            timestamptz not null default now(),
  read_at               timestamptz
);
comment on table public.notifications is 'In-app notification. Phone delivery tracked in notification_deliveries.';
create index notifications_recipient_idx on public.notifications (recipient_profile_id, created_at desc);

create table public.notification_deliveries (
  id                   uuid primary key default gen_random_uuid(),
  notification_id      uuid not null references public.notifications (id) on delete cascade,
  channel              text not null check (channel in ('EMAIL', 'TELEGRAM', 'PUSH')),
  provider             text not null,
  attempt_no           integer not null check (attempt_no >= 1),
  status               text not null check (status in ('PENDING', 'SENT', 'DELIVERED', 'FAILED')),
  provider_message_id  text,
  error_text           text,
  attempted_at         timestamptz not null default now(),
  completed_at         timestamptz,
  unique (notification_id, channel, attempt_no)
);
comment on table public.notification_deliveries is 'Provider result and time for each delivery attempt.';

create table public.login_attempts (
  id                bigint generated always as identity primary key,
  occurred_at       timestamptz not null default now(),
  identifier        text not null,                  -- identifier as typed (e.g. email)
  user_profile_id   uuid references public.user_profiles (id) on delete set null,
  success           boolean not null,
  failure_reason    text,
  client_ip_hash    public.sha256_hex
);
comment on table public.login_attempts is 'Login history for Admin view and 5-in-a-row lockout (Level 4).';
create index login_attempts_user_time_idx on public.login_attempts (user_profile_id, occurred_at desc);
create index login_attempts_identifier_time_idx on public.login_attempts (identifier, occurred_at desc);

create table public.audit_logs (
  id               bigint generated always as identity primary key,
  occurred_at      timestamptz not null default now(),
  school_id        uuid references public.schools (id) on delete set null,
  actor_profile_id uuid references public.user_profiles (id) on delete set null,
  actor_role       text,
  action           text not null,
  target_type      text not null,
  target_id        text,
  old_values       jsonb,
  new_values       jsonb,
  metadata         jsonb not null default '{}'::jsonb
);
comment on table public.audit_logs is 'Append-only audit trail. Biometric values never written here.';
create index audit_logs_school_time_idx on public.audit_logs (school_id, occurred_at desc);
create trigger audit_logs_append_only
  before update or delete on public.audit_logs
  for each row execute function public.reject_mutation();
