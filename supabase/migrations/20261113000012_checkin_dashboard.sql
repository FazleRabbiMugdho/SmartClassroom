-- 0012 card check-in, card registration, fire reset, absent sweep, notifications,
-- and EXECUTE lockdown (Prompts 06/07).

-- Future functions in public are not callable by clients unless granted explicitly.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- ---- Card registration (Admin "Register card": wait for a device CARD_TAP) ----

create table public.card_registrations (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools (id) on delete cascade,
  room_id       uuid not null references public.rooms (id) on delete cascade,  -- reader that will see the tap
  student_id    uuid not null references public.students (id) on delete cascade,
  status        text not null default 'PENDING' check (status in ('PENDING', 'COMPLETED', 'CANCELLED', 'EXPIRED')),
  requested_by  uuid references public.user_profiles (id) on delete set null,
  requested_at  timestamptz not null default now(),
  expires_at    timestamptz not null,
  completed_at  timestamptz,
  card_uid      text,
  check (expires_at > requested_at),
  check ((status = 'COMPLETED') = (completed_at is not null))
);
comment on table public.card_registrations is 'Pending Register-card operation, completed by a device CARD_TAP.';
create unique index card_registrations_one_pending_per_room
  on public.card_registrations (room_id) where status = 'PENDING';
alter table public.card_registrations enable row level security;
grant select on public.card_registrations to authenticated;
create policy card_registrations_read on public.card_registrations for select to authenticated
  using (is_admin_of_school(school_id));

create or replace function public.start_card_registration(
  p_student uuid, p_room uuid, p_actor uuid, p_ttl_seconds int default 120)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_school uuid; v_id uuid;
begin
  select school_id into v_school from public.students where id = p_student;
  if v_school is null then raise exception 'unknown student' using errcode = 'no_data_found'; end if;
  if not exists (select 1 from public.user_roles where user_id = p_actor and role = 'ADMIN' and school_id = v_school) then
    raise exception 'admin only' using errcode = 'insufficient_privilege';
  end if;
  update public.card_registrations set status = 'CANCELLED' where room_id = p_room and status = 'PENDING';
  insert into public.card_registrations (school_id, room_id, student_id, requested_by, expires_at)
  values (v_school, p_room, p_student, p_actor, now() + make_interval(secs => p_ttl_seconds))
  returning id into v_id;
  return v_id;
end;
$$;

-- Called after a CARD_TAP event is ingested. Links the UID if a registration is pending for that reader.
create or replace function public.complete_card_registration(p_device uuid, p_uid text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_room uuid; v_reg record; v_uid text := upper(p_uid);
begin
  select room_id into v_room from public.devices where id = p_device;
  select * into v_reg from public.card_registrations
    where room_id = v_room and status = 'PENDING' for update;
  if not found then return jsonb_build_object('status', 'no_pending'); end if;

  if v_reg.expires_at <= now() then
    update public.card_registrations set status = 'EXPIRED' where id = v_reg.id;
    return jsonb_build_object('status', 'expired');
  end if;
  if exists (select 1 from public.student_cards where upper(card_uid) = v_uid and status = 'ACTIVE') then
    update public.card_registrations set status = 'CANCELLED', card_uid = v_uid where id = v_reg.id;
    return jsonb_build_object('status', 'card_in_use');
  end if;

  update public.student_cards set status = 'REMOVED', removed_at = now()
    where student_id = v_reg.student_id and status = 'ACTIVE';
  insert into public.student_cards (student_id, card_uid, registered_by)
  values (v_reg.student_id, v_uid, v_reg.requested_by);
  update public.card_registrations set status = 'COMPLETED', completed_at = now(), card_uid = v_uid where id = v_reg.id;
  insert into public.audit_logs (school_id, actor_profile_id, action, target_type, target_id)
  values (v_reg.school_id, v_reg.requested_by, 'CARD_REGISTERED', 'student', v_reg.student_id::text);
  return jsonb_build_object('status', 'linked', 'student_id', v_reg.student_id);
end;
$$;

create or replace function public.remove_student_card(p_student uuid, p_actor uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_school uuid;
begin
  select school_id into v_school from public.students where id = p_student;
  if not exists (select 1 from public.user_roles where user_id = p_actor and role = 'ADMIN' and school_id = v_school) then
    raise exception 'admin only' using errcode = 'insufficient_privilege';
  end if;
  update public.student_cards set status = 'REMOVED', removed_at = now()
    where student_id = p_student and status = 'ACTIVE';
  insert into public.audit_logs (school_id, actor_profile_id, action, target_type, target_id)
  values (v_school, p_actor, 'CARD_REMOVED', 'student', p_student::text);
end;
$$;

-- ---- Guardian notification on Late/Absent (Level 7, <60 s: synchronous in the same txn) ----

create or replace function public.notify_guardians_on_attendance()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (school_id, recipient_profile_id, kind, title, body, dedupe_key)
  select s.school_id, gl.guardian_profile_id,
         case new.attendance_status when 'LATE' then 'GUARDIAN_LATE' else 'GUARDIAN_ABSENT' end,
         case new.attendance_status when 'LATE' then 'Late arrival' else 'Marked absent' end,
         s.full_name || ' was marked ' || lower(new.attendance_status) || '.',
         'ATT:' || new.id || ':' || gl.guardian_profile_id
  from public.students s
  join public.guardian_student_links gl on gl.student_id = s.id
  where s.id = new.student_id
  on conflict (dedupe_key) do nothing;
  return new;
end;
$$;
create trigger attendance_notify_guardians
  after insert on public.attendance_records
  for each row when (new.attendance_status in ('LATE', 'ABSENT'))
  execute function public.notify_guardians_on_attendance();

-- ---- Card check-in decision (Levels 7/8/9 gates) ----
-- Two-phase: with p_face null returns NEED_FACE (+ student_id) once every non-face gate passes;
-- the server runs face matching, then calls again with MATCH|MISMATCH|NO_FACE|SPOOF.
create or replace function public.process_card_checkin(
  p_hash public.sha256_hex, p_card_uid text, p_tap_at timestamptz,
  p_face text, p_crop_w int, p_crop_h int, p_snapshot uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_device uuid; v_room uuid; v_school uuid; v_card text := upper(p_card_uid);
  v_student uuid; v_class record; v_class_id uuid; v_att uuid; v_att_status text;
  v_reason text; v_pos text; v_cam text; v_checkin uuid;
begin
  select device_id, room_id into v_device, v_room from public.device_from_token(p_hash);
  if v_device is null then return jsonb_build_object('status', 'unauthorized'); end if;
  select school_id into v_school from public.rooms where id = v_room;

  select student_id into v_student from public.student_cards
    where upper(card_uid) = v_card and status = 'ACTIVE';

  if public.is_card_blocked(v_school, v_card, p_tap_at) then
    v_reason := 'CARD_BLOCKED';
  elsif v_student is null then
    v_reason := 'UNKNOWN_CARD';
  else
    select * into v_class from public.class_sessions
      where room_id = v_room and p_tap_at >= starts_at and p_tap_at < ends_at
      order by starts_at desc limit 1;
    if found then v_class_id := v_class.id; end if;
    if not found then
      v_reason := 'NO_CLASS_NOW';
    elsif not exists (select 1 from public.class_enrollments
                      where class_session_id = v_class.id and student_id = v_student) then
      v_reason := 'NOT_IN_THIS_CLASS';
    else
      select selected_position into v_pos from public.room_camera_state where room_id = v_room;
      select state into v_cam from public.camera_health_events
        where room_id = v_room order by occurred_at desc limit 1;
      if v_pos = 'ROOM' then
        v_reason := 'CAMERA_NOT_AT_DOOR';
      elsif v_cam in ('COVERED', 'MOVED') then
        v_reason := 'CAMERA_FAULT';
      elsif p_face is null then
        return jsonb_build_object('status', 'NEED_FACE', 'student_id', v_student, 'class_session_id', v_class.id, 'device_id', v_device);
      elsif p_face = 'NO_FACE' then
        v_reason := 'NO_FACE';
      elsif p_face = 'SPOOF' then
        v_reason := 'SPOOF';
      elsif p_face = 'MISMATCH' then
        perform public.register_face_mismatch(v_school, v_room, v_card, v_device, p_snapshot, p_tap_at);
        v_reason := 'FACE_MISMATCH';
      elsif p_face = 'MATCH' then
        v_reason := 'OK';
      else
        raise exception 'bad face result %', p_face using errcode = 'invalid_parameter_value';
      end if;
    end if;
  end if;

  if v_reason = 'OK' then
    v_att := public.record_attendance(
      v_room, v_class.id, v_student,
      case when p_tap_at <= v_class.starts_at + interval '10 minutes' then 'PRESENT' else 'LATE' end,
      p_tap_at, 'CARD_FACE', true);
    select attendance_status into v_att_status from public.attendance_records where id = v_att;
  end if;

  insert into public.card_checkins
    (device_id, room_id, card_uid, student_id, class_session_id, attendance_record_id,
     decision, reason, face_crop_w, face_crop_h, occurred_at)
  values (v_device, v_room, v_card, v_student, v_class_id, v_att,
          case when v_reason = 'OK' then 'GRANTED' else 'DENIED' end, v_reason,
          p_crop_w, p_crop_h, p_tap_at)
  returning id into v_checkin;

  return jsonb_build_object(
    'status', 'DECIDED',
    'decision', case when v_reason = 'OK' then 'GRANTED' else 'DENIED' end,
    'reason', v_reason,
    'door', case when v_reason = 'OK' then 'UNLOCKED' else 'LOCKED' end,
    'attendance_status', v_att_status);
end;
$$;
comment on function public.process_card_checkin is 'Two-phase card/face check-in decision with all denial gates.';

-- Absent sweep: classes started >=30 min ago (within 24h) get ABSENT rows for no-shows.
create or replace function public.sweep_absent(p_now timestamptz default now())
returns integer
language plpgsql security definer set search_path = public as $$
declare c record; v_total integer := 0; v_n integer;
begin
  for c in select id from public.class_sessions
           where starts_at <= p_now - interval '30 minutes' and starts_at > p_now - interval '1 day'
  loop
    v_n := public.mark_absent_for_class(c.id);
    v_total := v_total + v_n;
  end loop;
  return v_total;
end;
$$;

-- ---- Reset fire (Teacher/Admin; only once the flame is gone and a fire incident is open) ----
create or replace function public.queue_fire_reset(p_device uuid, p_actor uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_room uuid; v_school uuid; v_flame boolean;
begin
  select d.room_id, d.school_id into v_room, v_school from public.devices d where d.id = p_device;
  if v_room is null then raise exception 'unknown device' using errcode = 'no_data_found'; end if;

  if not (
    exists (select 1 from public.user_roles where user_id = p_actor and role = 'ADMIN' and school_id = v_school)
    or exists (select 1 from public.room_memberships where user_id = p_actor and room_id = v_room and membership_role = 'TEACHER')
  ) then
    raise exception 'teacher or admin only' using errcode = 'insufficient_privilege';
  end if;

  select flame into v_flame from public.telemetry_readings
    where device_id = p_device order by device_ts desc, seq desc limit 1;
  if v_flame is null then
    raise exception 'CANNOT RESET: no telemetry to confirm flame is gone' using errcode = 'check_violation';
  end if;
  if v_flame then
    raise exception 'CANNOT RESET: FLAME PRESENT' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.security_incidents where room_id = v_room and incident_type = 'FIRE' and state <> 'CLOSED') then
    raise exception 'no active fire incident' using errcode = 'check_violation';
  end if;

  insert into public.audit_logs (school_id, actor_profile_id, action, target_type, target_id)
  values (v_school, p_actor, 'FIRE_RESET_REQUESTED', 'device', p_device::text);
  return public.enqueue_command(p_device, 'FIRE_RESET', '{}'::jsonb, p_actor, 120);
end;
$$;

-- ---- Admin unblock ----
create or replace function public.unblock_card(p_block uuid, p_actor uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_school uuid;
begin
  select school_id into v_school from public.blocked_cards where id = p_block and status = 'ACTIVE';
  if v_school is null then raise exception 'no active block' using errcode = 'no_data_found'; end if;
  if not exists (select 1 from public.user_roles where user_id = p_actor and role = 'ADMIN' and school_id = v_school) then
    raise exception 'admin only' using errcode = 'insufficient_privilege';
  end if;
  update public.blocked_cards set status = 'UNBLOCKED', unblocked_at = now(), unblocked_by = p_actor where id = p_block;
  insert into public.audit_logs (school_id, actor_profile_id, action, target_type, target_id)
  values (v_school, p_actor, 'CARD_UNBLOCKED', 'blocked_card', p_block::text);
end;
$$;

-- ---- EXECUTE lockdown ----
-- Mutation/ingest functions are SECURITY DEFINER; they must be reachable only by the server
-- (service_role). Only the read-only RLS helper predicates stay callable by signed-in users.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.is_admin_of_school(uuid), public.is_any_admin(), public.is_teacher_of_room(uuid),
  public.school_of_room(uuid), public.can_read_room(uuid), public.owns_student(uuid),
  public.is_guardian_of(uuid), public.can_read_student(uuid)
to authenticated;
grant execute on all functions in schema public to service_role;
