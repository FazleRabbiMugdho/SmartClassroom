-- 0005 vision (F), ML/CSI (G), weather (H), competition evidence (I)

-- G. ML / CSI ----------------------------------------------------------------

create table public.model_runs (
  id              uuid primary key default gen_random_uuid(),
  model_kind      text not null check (model_kind in ('HAND_RAISE', 'WIFI_CSI_PRESENCE', 'WIFI_CSI_LOCALIZATION')),
  version         text not null,
  features        text not null,                   -- description of inputs
  training_code_ref public.git_commit_sha,         -- commit containing the training code (Level 10/11)
  trained_at      timestamptz,
  created_at      timestamptz not null default now(),
  unique (model_kind, version)
);
comment on table public.model_runs is 'A trained model version. Metrics are only recorded from real evaluations.';

-- Hand-raise images: a dataset is READY only with >=100 per class and >=20% held out.
create table public.handraise_dataset_versions (
  id                    uuid primary key default gen_random_uuid(),
  version               text not null unique,
  status                text not null default 'COLLECTING' check (status in ('COLLECTING', 'READY')),
  raised_count          integer not null default 0 check (raised_count >= 0),
  not_raised_count      integer not null default 0 check (not_raised_count >= 0),
  held_out_raised       integer not null default 0 check (held_out_raised >= 0),
  held_out_not_raised   integer not null default 0 check (held_out_not_raised >= 0),
  created_at            timestamptz not null default now(),
  check (held_out_raised <= raised_count and held_out_not_raised <= not_raised_count),
  check (status = 'COLLECTING' or (
    raised_count >= 100 and not_raised_count >= 100
    and (held_out_raised + held_out_not_raised) * 5 >= (raised_count + not_raised_count)
  ))
);
comment on table public.handraise_dataset_versions is 'Image counts per class. READY enforces Level 10 minimums in the DB.';

-- Wi-Fi CSI labelled samples. Camera must be covered during collection (Level 11).
create table public.csi_dataset_versions (
  id          uuid primary key default gen_random_uuid(),
  version     text not null unique,
  status      text not null default 'COLLECTING' check (status in ('COLLECTING', 'READY')),
  created_at  timestamptz not null default now()
);
comment on table public.csi_dataset_versions is 'Versioned CSI sample collection.';

create table public.csi_labelled_samples (
  id                  bigint generated always as identity primary key,
  dataset_version_id  uuid not null references public.csi_dataset_versions (id) on delete cascade,
  device_id           uuid references public.devices (id) on delete set null,
  room_id             uuid references public.rooms (id) on delete set null,
  label               text not null check (label in ('EMPTY', 'ZONE_1', 'ZONE_2', 'ZONE_3', 'ZONE_4')),
  split               text not null check (split in ('TRAIN', 'HELD_OUT')),
  features            jsonb not null,               -- derived features only; no camera data
  subcarrier_count    integer check (subcarrier_count is null or subcarrier_count > 0),
  wifi_channel        integer check (wifi_channel is null or wifi_channel between 1 and 165),
  packets_per_s       numeric(7, 2) check (packets_per_s is null or packets_per_s >= 0),
  camera_covered      boolean not null check (camera_covered),   -- recorded test condition
  captured_at        timestamptz not null
);
comment on table public.csi_labelled_samples is 'Labelled CSI samples. Retention per retention_policies CSI_RAW.';
create index csi_samples_dataset_label_idx on public.csi_labelled_samples (dataset_version_id, label, split);

-- Per-window CSI rate/quality counters (Level 11 >= 20 packets/s evidence).
create table public.csi_packet_stats (
  id              bigint generated always as identity primary key,
  device_id       uuid not null references public.devices (id) on delete cascade,
  room_id         uuid not null references public.rooms (id) on delete cascade,
  window_start    timestamptz not null,
  window_end      timestamptz not null,
  packets_per_s   numeric(7, 2) not null check (packets_per_s >= 0),
  packets_lost    integer not null default 0 check (packets_lost >= 0),
  subcarriers     integer not null check (subcarriers > 0),
  wifi_channel    integer not null check (wifi_channel between 1 and 165),
  received_at     timestamptz not null default now(),
  check (window_end > window_start)
);
comment on table public.csi_packet_stats is 'CSI packet rate and loss per window (csi command evidence).';
create index csi_stats_device_time_idx on public.csi_packet_stats (device_id, window_start desc);

-- Metrics. Held-out must be >= 20% of the evaluated samples, or the row is rejected.
create table public.model_metrics (
  id                uuid primary key default gen_random_uuid(),
  model_run_id      uuid not null references public.model_runs (id) on delete cascade,
  metric_name       text not null check (metric_name in (
    'HELD_OUT_ACCURACY', 'AVG_PREDICTION_MS', 'PRESENCE_DELAY_MS')),
  metric_value      numeric(12, 4) not null,
  sample_count      integer not null check (sample_count > 0),
  held_out_count    integer not null check (held_out_count > 0),
  confusion_matrix  jsonb,                           -- null for non-classification metrics
  evaluated_at      timestamptz not null default now(),
  check (held_out_count * 5 >= sample_count),        -- >= 20% held out (Level 10/11)
  unique (model_run_id, metric_name)
);
comment on table public.model_metrics is 'Real evaluation results only. Shown as not evaluated when absent.';

-- F. Vision ------------------------------------------------------------------

create table public.camera_positions (
  id                    uuid primary key default gen_random_uuid(),
  room_id               uuid not null references public.rooms (id) on delete cascade,
  position              text not null check (position in ('DOOR', 'ROOM')),
  reference_bucket      text not null default 'private-snapshots',
  reference_object_key  text not null,
  reference_width       integer not null check (reference_width > 0),
  reference_height      integer not null check (reference_height > 0),
  saved_by              uuid references public.user_profiles (id) on delete set null,
  saved_at              timestamptz not null default now(),
  unique (room_id, position),
  unique (reference_bucket, reference_object_key)
);
comment on table public.camera_positions is 'DOOR and ROOM reference snapshots (Level 9).';

-- Selected (Teacher) vs confirmed (device report) camera position.
create table public.room_camera_state (
  room_id              uuid primary key references public.rooms (id) on delete cascade,
  selected_position    text check (selected_position in ('DOOR', 'ROOM')),
  selected_at          timestamptz,
  selected_by          uuid references public.user_profiles (id) on delete set null,
  confirmed_position   text check (confirmed_position in ('DOOR', 'ROOM')),
  confirmed_at         timestamptz,
  updated_at           timestamptz not null default now()
);
comment on table public.room_camera_state is 'Camera position selected by Teacher and confirmed by the device.';

create table public.seat_zones (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references public.rooms (id) on delete cascade,
  seat_no       integer not null check (seat_no > 0),
  label         text,
  polygon       jsonb not null check (jsonb_typeof(polygon) = 'array'),  -- normalized 0..1 points (app-validated)
  image_width   integer not null check (image_width > 0),
  image_height  integer not null check (image_height > 0),
  version       integer not null default 1 check (version >= 1),
  edited_by     uuid references public.user_profiles (id) on delete set null,
  updated_at    timestamptz not null default now(),
  unique (room_id, seat_no)
);
comment on table public.seat_zones is 'Seat zones on the ROOM reference image (normalized coordinates).';

create table public.occupancy_events (
  id                  bigint generated always as identity primary key,
  room_id             uuid not null references public.rooms (id) on delete cascade,
  device_id           uuid references public.devices (id) on delete set null,
  event_type          text not null check (event_type in ('COUNT_STABLE', 'CAPACITY_EXCEEDED', 'CAPACITY_RESTORED')),
  person_count        integer not null check (person_count >= 0),
  capacity_at_time    integer check (capacity_at_time is null or capacity_at_time > 0),
  occupied_zone_count integer check (occupied_zone_count is null or occupied_zone_count >= 0),
  occurred_at         timestamptz not null,
  received_at         timestamptz not null default now(),
  model_run_id        uuid references public.model_runs (id) on delete set null
);
comment on table public.occupancy_events is 'State changes only (counts). Frames are never stored here.';
create index occupancy_room_time_idx on public.occupancy_events (room_id, occurred_at desc);

create table public.camera_health_events (
  id              bigint generated always as identity primary key,
  room_id         uuid not null references public.rooms (id) on delete cascade,
  device_id       uuid references public.devices (id) on delete set null,
  state           text not null check (state in ('OK', 'COVERED', 'MOVED')),
  cover_score     numeric(6, 4),
  move_score      numeric(6, 4),
  cover_threshold numeric(6, 4),
  move_threshold  numeric(6, 4),
  snapshot_id     uuid references public.private_snapshots (id) on delete set null,
  occurred_at     timestamptz not null,
  received_at     timestamptz not null default now()
);
comment on table public.camera_health_events is 'Live COVERED/MOVED/OK scores with thresholds (Level 9).';
create index camera_health_room_time_idx on public.camera_health_events (room_id, occurred_at desc);

create table public.handraise_events (
  id              uuid primary key default gen_random_uuid(),
  room_id         uuid not null references public.rooms (id) on delete cascade,
  device_id       uuid references public.devices (id) on delete set null,
  seat_no         integer not null check (seat_no > 0),
  started_at      timestamptz not null,           -- start of the held raise
  occurred_at     timestamptz not null,           -- when the 2 s hold was confirmed
  confidence      numeric(5, 4) check (confidence is null or confidence between 0 and 1),
  model_run_id    uuid references public.model_runs (id) on delete set null,
  received_at     timestamptz not null default now(),
  unique (room_id, seat_no, started_at)           -- once per raise
);
comment on table public.handraise_events is 'One row per hand raise (Level 10).';
create index handraise_room_seat_time_idx on public.handraise_events (room_id, seat_no, occurred_at desc);

create table public.presence_events (
  id              bigint generated always as identity primary key,
  room_id         uuid not null references public.rooms (id) on delete cascade,
  device_id       uuid references public.devices (id) on delete set null,
  state           text not null check (state in ('EMPTY', 'OCCUPIED')),
  previous_state  text check (previous_state is null or previous_state in ('EMPTY', 'OCCUPIED')),
  occurred_at     timestamptz not null,
  received_at     timestamptz not null default now()
);
comment on table public.presence_events is 'Stable presence changes only (held 3 s before event; Level 11).';
create index presence_room_time_idx on public.presence_events (room_id, occurred_at desc);

create table public.csi_predictions (
  id               bigint generated always as identity primary key,
  room_id          uuid not null references public.rooms (id) on delete cascade,
  device_id        uuid references public.devices (id) on delete set null,
  model_run_id     uuid references public.model_runs (id) on delete set null,
  presence         text not null check (presence in ('EMPTY', 'OCCUPIED')),
  predicted_zone   text not null check (predicted_zone in ('EMPTY', 'ZONE_1', 'ZONE_2', 'ZONE_3', 'ZONE_4')),
  confidence       numeric(5, 4) check (confidence is null or confidence between 0 and 1),
  predicted_at     timestamptz not null,
  received_at      timestamptz not null default now()
);
comment on table public.csi_predictions is 'Live zone predictions for the 2x2 map. CSI inputs only.';
create index csi_predictions_room_time_idx on public.csi_predictions (room_id, predicted_at desc);

-- H. Weather -----------------------------------------------------------------

create table public.weather_cache (
  id              bigint generated always as identity primary key,
  provider        text not null,
  location_key    text not null,
  data_kind       text not null check (data_kind in ('CURRENT', 'FORECAST_24H')),
  fetched_at      timestamptz not null,           -- staleness is computed from this
  valid_from      timestamptz,
  valid_to        timestamptz,
  payload         jsonb not null,                 -- normalized provider response; key never stored
  source_meta     jsonb not null default '{}'::jsonb,
  check (valid_to is null or valid_from is null or valid_to >= valid_from)
);
comment on table public.weather_cache is 'Server-fetched weather every 15 min (Level 6). Service key stays server-side.';
create index weather_cache_location_idx on public.weather_cache (location_key, data_kind, fetched_at desc);

create table public.weather_notices (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references public.schools (id) on delete cascade,
  category        text not null check (category in ('STORM', 'CYCLONE', 'HEAVY_RAIN_FLOOD', 'HEATWAVE')),
  severity        text not null check (severity in ('ADVISORY', 'WARNING', 'DANGER')),
  source_kind     text not null check (source_kind in ('OFFICIAL', 'FORECAST_DERIVED', 'TEST')),
  source_name     text not null,
  window_start    timestamptz not null,
  window_end      timestamptz not null,
  notice_text     text not null,
  created_by      uuid references public.user_profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  withdrawn_at    timestamptz,
  check (window_end > window_start)
);
comment on table public.weather_notices is 'Notice board entries. FORECAST_DERIVED must be labelled as derived.';
create index weather_notices_school_window_idx on public.weather_notices (school_id, window_end desc);

-- I. Competition evidence ----------------------------------------------------

create table public.competition_levels (
  level_no    integer primary key check (level_no between 1 and 12),
  name        text not null,
  group_no    integer not null check (group_no between 1 and 6),
  group_name  text not null,
  marks       integer not null check (marks between 1 and 50)
);
comment on table public.competition_levels is 'Paper levels 1-12 (marks sum to 500).';

insert into public.competition_levels (level_no, name, group_no, group_name, marks) values
  (1,  'Dual-Core Tasks, Health and Watchdog',          1, 'Device Foundation',             35),
  (2,  'Wi-Fi Setup and Secure Telemetry',              1, 'Device Foundation',             45),
  (3,  'Heat, Fire, Panic and Fail-Safe Door',          2, 'Classroom Safety',              50),
  (4,  'Secure Platform, Roles and Alerts',             3, 'Platform and Control',          40),
  (5,  'Remote Settings, OTA and Rollback',             3, 'Platform and Control',          30),
  (6,  'Weather, History and AI Assistant',             3, 'Platform and Control',          40),
  (7,  'Card and Face Check-In',                        4, 'Card and Face Access',          50),
  (8,  'Spoofing, Lockout and Data Deletion',           4, 'Card and Face Access',          30),
  (9,  'Occupancy, Live View, Night Watch and Tamper',  5, 'Classroom Vision and Wi-Fi Sensing', 50),
  (10, 'Own-Trained Hand-Raise Detector',               5, 'Classroom Vision and Wi-Fi Sensing', 40),
  (11, 'Wi-Fi CSI Presence and Localization',           5, 'Classroom Vision and Wi-Fi Sensing', 40),
  (12, 'Offline, Bluetooth and Power-Cut Recovery',     6, 'Resilience',                    50);

create table public.level_test_runs (
  id            uuid primary key default gen_random_uuid(),
  level_no      integer not null references public.competition_levels (level_no) on delete restrict,
  attempt_no    integer not null check (attempt_no in (1, 2)),
  call_no       integer check (call_no between 1 and 4),          -- judging call (paper §2.1)
  outcome       text not null default 'PENDING' check (outcome in ('PENDING', 'PASS', 'FAIL')),
  award_pct     smallint not null default 0 check (award_pct in (0, 70, 100)),  -- 100 first pass, 70 second
  judged_at     timestamptz,
  judge_name    text,
  unique (level_no, attempt_no),
  check (outcome <> 'PASS' or judged_at is not null),
  check ((outcome = 'PASS' and award_pct > 0) or (outcome <> 'PASS' and award_pct = 0)),
  check (not (outcome = 'PASS' and attempt_no = 1 and award_pct <> 100)),
  check (not (outcome = 'PASS' and attempt_no = 2 and award_pct <> 70))
);
comment on table public.level_test_runs is 'Live judged attempt. Max two per level (paper §2.1).';

create table public.evidence_artifacts (
  id           uuid primary key default gen_random_uuid(),
  level_no     integer not null references public.competition_levels (level_no) on delete restrict,
  kind         text not null check (kind in ('VIDEO', 'WRITEUP', 'SCREENSHOT')),
  file_name    text not null,
  bucket       text not null default 'evidence-artifacts',
  object_key   text not null unique,
  sha256       public.sha256_hex,
  byte_size    bigint check (byte_size is null or byte_size > 0),
  uploaded_by  uuid references public.user_profiles (id) on delete set null,
  uploaded_at  timestamptz not null default now(),
  unique (level_no, kind, file_name),
  check (kind not in ('VIDEO', 'WRITEUP') or file_name ~ '^[A-Za-z0-9]+_L[0-9]{2}_(video\.mp4|writeup\.pdf)$')
);
comment on table public.evidence_artifacts is 'Submission files. Video/write-up names follow <TeamID>_L<NN>_video.mp4 / _writeup.pdf.';

create table public.level_code_references (
  id            uuid primary key default gen_random_uuid(),
  level_no      integer not null references public.competition_levels (level_no) on delete restrict,
  git_tag       text not null check (git_tag ~ '^[Ll](evel)?-[0-9]{2}$'),  -- paper uses both L-NN and Level-NN
  commit_sha    public.git_commit_sha not null,
  recorded_at   timestamptz not null default now(),
  unique (level_no, git_tag)
);
comment on table public.level_code_references is 'Git tag and commit hash used for the level test.';

create table public.level_test_results (
  id                    uuid primary key default gen_random_uuid(),
  test_run_id           uuid not null references public.level_test_runs (id) on delete cascade,
  requirement_code      text not null,               -- e.g. L2-TELEMETRY-INTERVAL
  description           text not null,
  hardware_required     boolean not null,
  measured_value        numeric(12, 4),
  unit                  text,
  limit_value           numeric(12, 4),
  outcome               text not null default 'PENDING' check (outcome in ('PENDING', 'PASS', 'FAIL', 'NOT_APPLICABLE')),
  evidence_source       text not null check (evidence_source in (
    'SOFTWARE_TEST', 'MOCK_DEVICE', 'REAL_DEVICE_JUDGE_OBSERVED', 'REAL_DEVICE_SELF_TEST')),
  evidence_artifact_id  uuid references public.evidence_artifacts (id) on delete set null,
  measured_at           timestamptz,
  tester_profile_id     uuid references public.user_profiles (id) on delete set null,
  notes                 text,
  -- Simulator or mock results can never mark a hardware requirement PASS.
  check (not (hardware_required and outcome = 'PASS' and evidence_source in ('SOFTWARE_TEST', 'MOCK_DEVICE')))
);
comment on table public.level_test_results is 'Per-requirement results with measured value and limit (paper §7).';
create index level_test_results_run_idx on public.level_test_results (test_run_id);
