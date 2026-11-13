-- 0007 security-critical transactional functions (Prompt 02 mandate 11)
-- All are SECURITY DEFINER with a fixed search_path; callers go through the server layer.

-- Atomic incident acknowledge: exactly one succeeds (Level 8).
create or replace function public.ack_incident(p_incident_id uuid, p_actor uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted boolean;
begin
  insert into public.incident_acknowledgements (incident_id, acknowledged_by)
  values (p_incident_id, p_actor)
  on conflict (incident_id) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted then
    update public.security_incidents
      set state = 'ACKNOWLEDGED'
      where id = p_incident_id and state = 'OPEN';
  end if;
  return v_inserted;   -- false => already acknowledged
end;
$$;
comment on function public.ack_incident is 'Atomic Ack. Returns false if already acknowledged.';

-- Attendance dedup: one row per (class_session, student). Returns the row id.
create or replace function public.record_attendance(
  p_room_id uuid, p_class_session_id uuid, p_student_id uuid,
  p_status text, p_check_in_at timestamptz, p_entry_method text, p_face_verified boolean)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.attendance_records
    (room_id, class_session_id, student_id, attendance_status, check_in_at, entry_method, face_verified)
  values
    (p_room_id, p_class_session_id, p_student_id, p_status, p_check_in_at, p_entry_method, p_face_verified)
  on conflict (class_session_id, student_id) do nothing
  returning id into v_id;

  if v_id is null then
    -- Repeat check-in: keep the first record (may still open the door at the caller).
    select id into v_id from public.attendance_records
      where class_session_id = p_class_session_id and student_id = p_student_id;
  end if;
  return v_id;
end;
$$;
comment on function public.record_attendance is 'Insert-once attendance. Repeat tap returns the existing row id.';

-- Mark ABSENT for enrolled students not checked in (Level 7, 30-minute rule applied by caller).
create or replace function public.mark_absent_for_class(p_class_session_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room uuid;
  v_count integer;
begin
  select room_id into v_room from public.class_sessions where id = p_class_session_id;
  if v_room is null then
    raise exception 'unknown class_session %', p_class_session_id using errcode = 'no_data_found';
  end if;

  insert into public.attendance_records
    (room_id, class_session_id, student_id, attendance_status, check_in_at, entry_method, face_verified)
  select v_room, p_class_session_id, e.student_id, 'ABSENT', null, 'NONE', false
  from public.class_enrollments e
  where e.class_session_id = p_class_session_id
  on conflict (class_session_id, student_id) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
comment on function public.mark_absent_for_class is 'Insert ABSENT for enrolled students with no record yet.';

-- Register a FACE_MISMATCH and block the card after 3 within 2 minutes (Level 8).
create or replace function public.register_face_mismatch(
  p_school_id uuid, p_room_id uuid, p_card_uid text, p_device_id uuid,
  p_snapshot_id uuid, p_occurred_at timestamptz)
returns boolean   -- true if this mismatch triggered a block
language plpgsql
security definer
set search_path = public
as $$
declare
  v_incident_id uuid;
  v_recent integer;
  v_blocked boolean := false;
begin
  insert into public.security_incidents
    (room_id, device_id, incident_type, severity, occurred_at, card_uid, snapshot_id)
  values (p_room_id, p_device_id, 'FACE_MISMATCH', 'WARNING', p_occurred_at, p_card_uid, p_snapshot_id)
  returning id into v_incident_id;

  select count(*) into v_recent
  from public.security_incidents
  where card_uid = p_card_uid
    and incident_type = 'FACE_MISMATCH'
    and occurred_at > p_occurred_at - interval '2 minutes'
    and occurred_at <= p_occurred_at;

  if v_recent >= 3 then
    insert into public.blocked_cards
      (school_id, card_uid, reason, blocked_at, blocked_until, trigger_incident_id)
    values (p_school_id, p_card_uid, '3 face mismatches within 2 minutes',
            p_occurred_at, p_occurred_at + interval '5 minutes', v_incident_id)
    on conflict (school_id, card_uid) where status = 'ACTIVE' do nothing;
    get diagnostics v_blocked = row_count;

    if v_blocked then
      insert into public.security_incidents
        (room_id, device_id, incident_type, severity, occurred_at, card_uid)
      values (p_room_id, p_device_id, 'CARD_BLOCKED', 'WARNING', p_occurred_at, p_card_uid);
    end if;
  end if;
  return v_blocked;
end;
$$;
comment on function public.register_face_mismatch is 'Records a mismatch; blocks the card for 5 min on the 3rd within 2 min.';

-- Is a card currently blocked? (expiry respected without a sweeper)
create or replace function public.is_card_blocked(p_school_id uuid, p_card_uid text, p_at timestamptz default now())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.blocked_cards
    where school_id = p_school_id and card_uid = p_card_uid
      and status = 'ACTIVE' and blocked_until > p_at
  );
$$;
comment on function public.is_card_blocked is 'True while an active block has not expired.';

-- Level 5 threshold change: bump revision, append history, in one transaction.
create or replace function public.apply_threshold_change(
  p_device_id uuid, p_warning numeric, p_danger numeric, p_actor uuid, p_reason text)
returns bigint   -- new config_revision
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_w numeric; v_old_d numeric; v_new_rev bigint;
begin
  if p_warning < 0 or p_warning > 50 or p_danger < 0 or p_danger > 50 then
    raise exception 'temperature out of range 0-50' using errcode = 'check_violation';
  end if;
  if p_warning >= p_danger then
    raise exception 'warning must be below danger' using errcode = 'check_violation';
  end if;

  select desired_warning_temp_c, desired_danger_temp_c
    into v_old_w, v_old_d
  from public.device_configurations where device_id = p_device_id for update;
  if not found then
    raise exception 'no config for device %', p_device_id using errcode = 'no_data_found';
  end if;

  update public.device_configurations
    set desired_warning_temp_c = p_warning,
        desired_danger_temp_c = p_danger,
        config_revision = config_revision + 1,
        updated_by = p_actor,
        updated_at = now()
    where device_id = p_device_id
    returning config_revision into v_new_rev;

  insert into public.device_config_history
    (device_id, config_revision, previous_warning_temp_c, new_warning_temp_c,
     previous_danger_temp_c, new_danger_temp_c, changed_by, reason)
  values (p_device_id, v_new_rev, v_old_w, p_warning, v_old_d, p_danger, p_actor, p_reason);

  return v_new_rev;
end;
$$;
comment on function public.apply_threshold_change is 'Atomic Level 5 threshold change with monotonic revision + history.';

-- Delete a student: queue private objects, write audit + STUDENT_DELETED, then cascade-delete.
create or replace function public.delete_student(p_student_id uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school uuid; v_name text;
begin
  select school_id, full_name into v_school, v_name
  from public.students where id = p_student_id for update;
  if not found then
    raise exception 'unknown student %', p_student_id using errcode = 'no_data_found';
  end if;

  -- Queue object-storage deletions for the student's private snapshots (retry/reconcile by worker).
  insert into public.storage_deletion_queue (bucket, object_key, reason)
  select bucket, object_key, 'STUDENT_DELETED'
  from public.private_snapshots
  where student_id = p_student_id and deleted_at is null
  on conflict (bucket, object_key) do nothing;

  -- Audit before the row vanishes. No biometric values are written here.
  insert into public.audit_logs
    (school_id, actor_profile_id, action, target_type, target_id, metadata)
  values (v_school, p_actor, 'STUDENT_DELETED', 'student', p_student_id::text,
          jsonb_build_object('full_name', v_name));

  insert into public.device_events (source, event_type, actor_profile_id, detail)
  values ('SERVER', 'STUDENT_DELETED', p_actor,
          jsonb_build_object('student_id', p_student_id));

  -- Cascade removes embeddings, cards, consent, enrollments, attendance, guardian links, snapshots.
  delete from public.students where id = p_student_id;
end;
$$;
comment on function public.delete_student is 'Removes all student biometric/card/snapshot data; keeps an audit row.';
