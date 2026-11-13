-- 0002 institution (A) and identity (B)

-- A. Institution -------------------------------------------------------------

create table public.schools (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  timezone    text not null default 'Asia/Dhaka',
  created_at  timestamptz not null default now()
);
comment on table public.schools is 'School tenant. Admin scope = one school.';

create table public.rooms (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.schools (id) on delete restrict,
  room_code    text not null check (room_code ~ '^[A-Za-z0-9-]+$'),  -- wire room_id, e.g. ROOM-101
  display_name text not null,
  capacity     integer check (capacity is null or capacity > 0),     -- Level 9, set by Admin
  night_mode   boolean not null default false,                       -- Level 9, set by Teacher/Admin
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (school_id, room_code)
);
comment on table public.rooms is 'Physical classroom. room_code is the device wire room_id.';

-- Teacher assignment to rooms (Teacher sees only these rooms).
create table public.room_memberships (
  id               uuid primary key default gen_random_uuid(),
  room_id          uuid not null references public.rooms (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  membership_role  text not null check (membership_role in ('TEACHER')),
  created_at       timestamptz not null default now(),
  unique (room_id, user_id, membership_role)
);
comment on table public.room_memberships is 'Assigns a teacher user to a room.';
create index room_memberships_user_idx on public.room_memberships (user_id);

create table public.class_sessions (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.rooms (id) on delete cascade,
  title       text not null,
  starts_at   timestamptz not null,                       -- UTC; render Asia/Dhaka in UI
  ends_at     timestamptz not null,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  check (ends_at > starts_at)
);
comment on table public.class_sessions is 'Scheduled class in a room. Overlap in the same room is rejected.';
create index class_sessions_room_start_idx on public.class_sessions (room_id, starts_at);

-- One class at a time per room (judges set class times on the spot). Trigger instead
-- of an exclusion constraint so it runs on plain Postgres (no btree_gist dependency).
create or replace function public.reject_overlapping_class()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from public.class_sessions c
    where c.room_id = new.room_id
      and c.id <> new.id
      and tstzrange(c.starts_at, c.ends_at, '[)') && tstzrange(new.starts_at, new.ends_at, '[)')
  ) then
    raise exception 'overlapping class session in room %', new.room_id
      using errcode = 'exclusion_violation';
  end if;
  return new;
end;
$$;
create trigger class_sessions_no_overlap
  before insert or update of room_id, starts_at, ends_at on public.class_sessions
  for each row execute function public.reject_overlapping_class();

-- B. Identity ----------------------------------------------------------------

create table public.user_profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  school_id        uuid references public.schools (id) on delete set null,
  full_name        text not null,
  preferred_locale text not null default 'en' check (preferred_locale in ('en', 'bn')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table public.user_profiles is 'App profile for a Supabase Auth user. No password data here.';

-- Authoritative roles. Never trust a role claim from the browser.
create table public.user_roles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  school_id   uuid not null references public.schools (id) on delete cascade,
  role        text not null check (role in ('ADMIN', 'TEACHER', 'STUDENT', 'GUARDIAN')),
  granted_by  uuid references auth.users (id) on delete set null,
  granted_at  timestamptz not null default now(),
  unique (user_id, school_id, role)
);
comment on table public.user_roles is 'Authoritative role grants per school. Read by RLS helpers.';
create index user_roles_user_idx on public.user_roles (user_id);

create table public.students (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools (id) on delete cascade,
  profile_id        uuid unique references public.user_profiles (id) on delete set null,  -- student login, optional
  student_code      text not null check (length(trim(student_code)) > 0),
  full_name         text not null,
  class_label       text,
  -- Never 'ENROLLED' until face embeddings exist (Prompt 07 rule).
  enrollment_status text not null default 'NOT_ENROLLED'
                    check (enrollment_status in ('NOT_ENROLLED', 'PENDING', 'ENROLLED', 'FAILED')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (school_id, student_code)
);
comment on table public.students is 'Student record. Hard-deleted via delete_student() with audit.';

create table public.class_enrollments (
  id                uuid primary key default gen_random_uuid(),
  class_session_id  uuid not null references public.class_sessions (id) on delete cascade,
  student_id        uuid not null references public.students (id) on delete cascade,
  created_at        timestamptz not null default now(),
  unique (class_session_id, student_id)
);
comment on table public.class_enrollments is 'Enrolled students for a class. Absent marks are derived from these.';
create index class_enrollments_student_idx on public.class_enrollments (student_id);

create table public.guardian_student_links (
  id                  uuid primary key default gen_random_uuid(),
  guardian_profile_id uuid not null references public.user_profiles (id) on delete cascade,
  student_id          uuid not null references public.students (id) on delete cascade,
  relationship        text,
  created_at          timestamptz not null default now(),
  unique (guardian_profile_id, student_id)
);
comment on table public.guardian_student_links is 'Guardian may see only linked children.';
create index guardian_links_student_idx on public.guardian_student_links (student_id);

create table public.consent_records (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references public.students (id) on delete cascade,
  consent_version   text not null,
  notice_sha256     public.sha256_hex not null,      -- hash of the consent notice text shown
  consented_at      timestamptz not null,
  recorded_by       uuid references public.user_profiles (id) on delete set null,
  created_at        timestamptz not null default now()
);
comment on table public.consent_records is 'Biometric consent evidence (version, time, actor). Deleted with the student.';
create index consent_records_student_idx on public.consent_records (student_id);

-- Card UID to student link. Only one ACTIVE owner per card; one ACTIVE card per student.
create table public.student_cards (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.students (id) on delete cascade,
  card_uid      text not null check (card_uid ~ '^[0-9A-Fa-f]{4,20}$'),
  status        text not null default 'ACTIVE' check (status in ('ACTIVE', 'REMOVED')),
  registered_by uuid references public.user_profiles (id) on delete set null,
  registered_at timestamptz not null default now(),
  removed_at    timestamptz,
  check ((status = 'REMOVED') = (removed_at is not null))
);
comment on table public.student_cards is 'RFID UID link. Unique active mapping per school card (see school-scoped index in 0004).';
create unique index student_cards_one_active_per_student
  on public.student_cards (student_id) where status = 'ACTIVE';
create unique index student_cards_one_active_per_uid
  on public.student_cards (upper(card_uid)) where status = 'ACTIVE';

-- Face embeddings only. Never photos. Server-only: no client RLS policy (see 0008).
create table public.face_embeddings (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references public.students (id) on delete cascade,
  model_name     text not null,
  model_version  text not null,
  dimensions     integer not null check (dimensions > 0),
  embedding      bytea not null,
  source_image_count integer not null check (source_image_count >= 3),  -- Level 7: at least 3 images
  created_at     timestamptz not null default now()
);
comment on table public.face_embeddings is 'Biometric embeddings. Server-only. Deleted with the student.';
create index face_embeddings_student_idx on public.face_embeddings (student_id);
