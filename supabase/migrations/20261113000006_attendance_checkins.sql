-- 0006 attendance (Level 7) and card check-in log

-- One attendance row per student per class. Written only by record_attendance()/mark_absent_for_class().
create table public.attendance_records (
  id                uuid primary key default gen_random_uuid(),
  room_id           uuid not null references public.rooms (id) on delete cascade,
  class_session_id  uuid not null references public.class_sessions (id) on delete cascade,
  student_id        uuid not null references public.students (id) on delete cascade,
  attendance_status text not null check (attendance_status in ('PRESENT', 'LATE', 'ABSENT')),
  check_in_at       timestamptz,                       -- time of the tap (kept for offline entries too)
  entry_method      text not null check (entry_method in ('CARD_FACE', 'CARD_OFFLINE', 'NONE')),
  face_verified     boolean not null default false,
  marked_at         timestamptz not null default now(),
  unique (class_session_id, student_id),               -- one record per student per class
  check ((attendance_status = 'ABSENT') = (check_in_at is null)),
  check (entry_method <> 'CARD_OFFLINE' or face_verified = false)   -- offline entry is "face not verified"
);
comment on table public.attendance_records is 'Attendance per student per class. Biometric data is never stored here.';
create index attendance_room_marked_idx on public.attendance_records (room_id, marked_at desc);
create index attendance_student_idx on public.attendance_records (student_id);

-- Every card tap decision. Face crops are NOT stored; only their pixel size (Level 7 log).
create table public.card_checkins (
  id                  uuid primary key default gen_random_uuid(),
  device_id           uuid references public.devices (id) on delete set null,
  room_id             uuid not null references public.rooms (id) on delete cascade,
  device_event_id     uuid unique references public.device_events (id) on delete set null,  -- one row per tap event
  card_uid            text not null,
  student_id          uuid references public.students (id) on delete set null,
  class_session_id    uuid references public.class_sessions (id) on delete set null,
  attendance_record_id uuid references public.attendance_records (id) on delete set null,
  decision            text not null check (decision in ('GRANTED', 'DENIED')),
  reason              text not null check (reason in (
    'OK', 'NO_FACE', 'FACE_MISMATCH', 'NOT_IN_THIS_CLASS', 'NO_CLASS_NOW', 'UNKNOWN_CARD',
    'CAMERA_NOT_AT_DOOR', 'CAMERA_FAULT', 'CARD_BLOCKED', 'SPOOF')),
  face_crop_w         integer check (face_crop_w is null or face_crop_w > 0),
  face_crop_h         integer check (face_crop_h is null or face_crop_h > 0),
  occurred_at         timestamptz not null,           -- device tap time
  received_at         timestamptz not null default now(),
  is_offline_sync     boolean not null default false,
  check ((decision = 'GRANTED') = (reason = 'OK'))
);
comment on table public.card_checkins is 'Card tap decisions with reason. No face image is stored.';
create index card_checkins_room_time_idx on public.card_checkins (room_id, occurred_at desc);
create index card_checkins_card_time_idx on public.card_checkins (card_uid, occurred_at desc);
create index card_checkins_student_idx on public.card_checkins (student_id);
