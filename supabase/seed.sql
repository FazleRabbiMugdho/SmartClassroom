-- DEV/TEST SEED ONLY. Runs on `supabase db reset` locally. Never in production.
-- No real passwords: judge accounts are created here as identities; Prompt 03's
-- secure setup script sets their passwords. Fixed UUIDs make tests deterministic.

-- Judge auth identities (placeholder, non-loginable until Prompt 03 sets a password).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@judge.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'teacher@judge.test'),
  ('00000000-0000-0000-0000-0000000000a3', 's1@judge.test'),
  ('00000000-0000-0000-0000-0000000000a4', 's2@judge.test'),
  ('00000000-0000-0000-0000-0000000000a5', 'guardian@judge.test')
on conflict (id) do nothing;

insert into public.schools (id, name) values
  ('00000000-0000-0000-0000-0000000000b1', 'BUBT Demo School')
on conflict (id) do nothing;

-- Approximate BUBT (Mirpur, Dhaka) location for the weather fetch. Set the real one in the Admin UI.
update public.schools set latitude = 23.82230, longitude = 90.36540 where id = '00000000-0000-0000-0000-0000000000b1';

insert into public.rooms (id, school_id, room_code, display_name, capacity) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 'ROOM-101', 'Room 101', 30)
on conflict (id) do nothing;

insert into public.user_profiles (id, school_id, full_name, preferred_locale) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'Judge Admin',   'en'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000b1', 'Judge Teacher', 'en'),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000b1', 'Student S1',    'en'),
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000b1', 'Student S2',    'en'),
  ('00000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-0000000000b1', 'Guardian of S1','en')
on conflict (id) do nothing;

insert into public.user_roles (user_id, school_id, role) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'ADMIN'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000b1', 'TEACHER'),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000b1', 'STUDENT'),
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000b1', 'STUDENT'),
  ('00000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-0000000000b1', 'GUARDIAN')
on conflict do nothing;

insert into public.room_memberships (room_id, user_id, membership_role) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a2', 'TEACHER')
on conflict do nothing;

insert into public.students (id, school_id, profile_id, student_code, full_name) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a3', 'S1', 'Student S1'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a4', 'S2', 'Student S2')
on conflict (id) do nothing;

-- Guardian linked ONLY to S1 (judges test that the guardian cannot see S2).
insert into public.guardian_student_links (guardian_profile_id, student_id) values
  ('00000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-0000000000d1')
on conflict do nothing;

insert into public.devices (id, school_id, device_code, team_code, room_id, firmware_version) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', 'T07-D1', 'T07',
   '00000000-0000-0000-0000-0000000000c1', '1.0.0')
on conflict (id) do nothing;

insert into public.device_configurations (device_id) values
  ('00000000-0000-0000-0000-0000000000e1')
on conflict (device_id) do nothing;

-- Dev credential for the mock simulator: sha256('dev-device-token-T07-D1').
-- Matches DEV_DEVICE_TOKEN in .env.example. Dev/test only.
insert into public.device_credentials (device_id, token_hash) values
  ('00000000-0000-0000-0000-0000000000e1', '4349740b675f9625b972430a58c2fdd759d76e21135d8bbb6d1c3f85f78a4af5')
on conflict (token_hash) do nothing;
