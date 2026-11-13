-- 0008 RLS: default deny on every public table, then role-scoped read policies.
-- Writes go through the server layer (service_role, which bypasses RLS) and the
-- SECURITY DEFINER functions in 0007. Clients get SELECT only, row-scoped.

-- Enable RLS on every table in public (default deny for anon/authenticated).
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;
end;
$$;

-- ---- Role/scope helper predicates (SECURITY DEFINER: read role tables past RLS) ----

create or replace function public.is_admin_of_school(p_school uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'ADMIN' and school_id = p_school
  );
$$;

create or replace function public.is_any_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'ADMIN');
$$;

create or replace function public.is_teacher_of_room(p_room uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.room_memberships
    where user_id = auth.uid() and room_id = p_room and membership_role = 'TEACHER'
  );
$$;

create or replace function public.school_of_room(p_room uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select school_id from public.rooms where id = p_room;
$$;

-- Admin (of the room's school) or the assigned teacher may read room-scoped data.
create or replace function public.can_read_room(p_room uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin_of_school(public.school_of_room(p_room))
      or public.is_teacher_of_room(p_room);
$$;

create or replace function public.owns_student(p_student uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.students where id = p_student and profile_id = auth.uid()
  );
$$;

create or replace function public.is_guardian_of(p_student uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.guardian_student_links
    where student_id = p_student and guardian_profile_id = auth.uid()
  );
$$;

-- A teacher/admin may read a student if the student is enrolled in a class in a room they control.
create or replace function public.can_read_student(p_student uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.owns_student(p_student)
      or public.is_guardian_of(p_student)
      or exists (
        select 1 from public.students s where s.id = p_student and public.is_admin_of_school(s.school_id)
      )
      or exists (
        select 1
        from public.class_enrollments e
        join public.class_sessions c on c.id = e.class_session_id
        where e.student_id = p_student and public.is_teacher_of_room(c.room_id)
      );
$$;

-- ---- Base grants (RLS still gates rows) ----
grant usage on schema public to authenticated;
grant select on
  public.schools, public.rooms, public.class_sessions, public.class_enrollments,
  public.students, public.user_profiles, public.guardian_student_links,
  public.student_cards, public.consent_records,
  public.devices, public.device_configurations, public.device_config_history,
  public.telemetry_readings, public.device_events, public.device_health_snapshots,
  public.device_commands, public.command_acknowledgements,
  public.ota_releases, public.ota_jobs,
  public.security_incidents, public.incident_acknowledgements, public.blocked_cards,
  public.notifications, public.login_attempts, public.audit_logs,
  public.camera_positions, public.room_camera_state, public.seat_zones,
  public.occupancy_events, public.camera_health_events, public.handraise_events,
  public.presence_events, public.csi_predictions, public.csi_packet_stats,
  public.model_runs, public.model_metrics, public.handraise_dataset_versions,
  public.csi_dataset_versions,
  public.weather_cache, public.weather_notices,
  public.competition_levels, public.level_test_runs, public.level_test_results,
  public.evidence_artifacts, public.level_code_references,
  public.attendance_records, public.card_checkins, public.private_snapshots
to authenticated;

-- NOTE: no grant on face_embeddings, device_credentials, csi_labelled_samples,
-- storage_deletion_queue, notification_deliveries, retention_policies, model-only
-- tables => server-only (service_role). RLS stays enabled with no policy = deny.

-- ---- Policies ----

-- Schools: readable by any member (admin/teacher/student/guardian of that school).
create policy schools_read on public.schools for select to authenticated
  using (
    is_admin_of_school(id)
    or exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.school_id = schools.id)
  );

-- Rooms: admin of school or assigned teacher.
create policy rooms_read on public.rooms for select to authenticated
  using (can_read_room(id));

create policy class_sessions_read on public.class_sessions for select to authenticated
  using (can_read_room(room_id));

create policy class_enrollments_read on public.class_enrollments for select to authenticated
  using (
    exists (select 1 from public.class_sessions c where c.id = class_session_id and can_read_room(c.room_id))
    or owns_student(student_id) or is_guardian_of(student_id)
  );

-- Own profile always; admins read profiles in their school.
create policy user_profiles_read on public.user_profiles for select to authenticated
  using (id = auth.uid() or (school_id is not null and is_admin_of_school(school_id)));

create policy students_read on public.students for select to authenticated
  using (can_read_student(id));

create policy guardian_links_read on public.guardian_student_links for select to authenticated
  using (guardian_profile_id = auth.uid() or is_any_admin());

create policy student_cards_read on public.student_cards for select to authenticated
  using (can_read_student(student_id));

create policy consent_read on public.consent_records for select to authenticated
  using (can_read_student(student_id));

-- Devices and telemetry: room-scoped (admin/teacher).
create policy devices_read on public.devices for select to authenticated
  using (can_read_room(room_id));
create policy device_config_read on public.device_configurations for select to authenticated
  using (exists (select 1 from public.devices d where d.id = device_id and can_read_room(d.room_id)));
create policy device_config_history_read on public.device_config_history for select to authenticated
  using (exists (select 1 from public.devices d where d.id = device_id and can_read_room(d.room_id)));
create policy telemetry_read on public.telemetry_readings for select to authenticated
  using (can_read_room(room_id));
create policy device_health_read on public.device_health_snapshots for select to authenticated
  using (exists (select 1 from public.devices d where d.id = device_id and can_read_room(d.room_id)));

-- Events/incidents: room-scoped. Students/guardians excluded (no room grant).
create policy device_events_read on public.device_events for select to authenticated
  using (room_id is not null and can_read_room(room_id));
create policy security_incidents_read on public.security_incidents for select to authenticated
  using (can_read_room(room_id));
create policy incident_ack_read on public.incident_acknowledgements for select to authenticated
  using (exists (select 1 from public.security_incidents i where i.id = incident_id and can_read_room(i.room_id)));

-- Commands / OTA: admin of the device's school only (Teacher cannot read OTA/settings ops).
create policy device_commands_read on public.device_commands for select to authenticated
  using (exists (select 1 from public.devices d where d.id = device_id and is_admin_of_school(d.school_id)));
create policy command_ack_read on public.command_acknowledgements for select to authenticated
  using (exists (select 1 from public.devices d where d.id = device_id and is_admin_of_school(d.school_id)));
create policy ota_releases_read on public.ota_releases for select to authenticated
  using (is_any_admin());
create policy ota_jobs_read on public.ota_jobs for select to authenticated
  using (exists (select 1 from public.devices d where d.id = device_id and is_admin_of_school(d.school_id)));

create policy blocked_cards_read on public.blocked_cards for select to authenticated
  using (is_admin_of_school(school_id) or exists (
    select 1 from public.room_memberships rm join public.rooms r on r.id = rm.room_id
    where rm.user_id = auth.uid() and r.school_id = blocked_cards.school_id));

-- Notifications: only the recipient.
create policy notifications_read on public.notifications for select to authenticated
  using (recipient_profile_id = auth.uid());

-- Login history + audit: admins only.
create policy login_attempts_read on public.login_attempts for select to authenticated
  using (is_any_admin());
create policy audit_logs_read on public.audit_logs for select to authenticated
  using (school_id is not null and is_admin_of_school(school_id));

-- Vision/CSI/ML outputs: room-scoped (admin/teacher). Students/guardians excluded.
create policy camera_positions_read on public.camera_positions for select to authenticated using (can_read_room(room_id));
create policy room_camera_state_read on public.room_camera_state for select to authenticated using (can_read_room(room_id));
create policy seat_zones_read on public.seat_zones for select to authenticated using (can_read_room(room_id));
create policy occupancy_read on public.occupancy_events for select to authenticated using (can_read_room(room_id));
create policy camera_health_read on public.camera_health_events for select to authenticated using (can_read_room(room_id));
create policy handraise_read on public.handraise_events for select to authenticated using (can_read_room(room_id));
create policy presence_read on public.presence_events for select to authenticated using (can_read_room(room_id));
create policy csi_predictions_read on public.csi_predictions for select to authenticated using (can_read_room(room_id));
create policy csi_stats_read on public.csi_packet_stats for select to authenticated using (can_read_room(room_id));

-- Model metadata/metrics: any admin or teacher (not students/guardians).
create policy model_runs_read on public.model_runs for select to authenticated
  using (is_any_admin() or exists (select 1 from public.room_memberships where user_id = auth.uid()));
create policy model_metrics_read on public.model_metrics for select to authenticated
  using (is_any_admin() or exists (select 1 from public.room_memberships where user_id = auth.uid()));
create policy handraise_ds_read on public.handraise_dataset_versions for select to authenticated
  using (is_any_admin() or exists (select 1 from public.room_memberships where user_id = auth.uid()));
create policy csi_ds_read on public.csi_dataset_versions for select to authenticated
  using (is_any_admin() or exists (select 1 from public.room_memberships where user_id = auth.uid()));

-- Weather: any member of the school.
create policy weather_cache_read on public.weather_cache for select to authenticated using (true);
create policy weather_notices_read on public.weather_notices for select to authenticated
  using (is_admin_of_school(school_id) or exists (
    select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.school_id = weather_notices.school_id));

-- Competition tables: admin/teacher.
create policy levels_read on public.competition_levels for select to authenticated using (true);
create policy level_runs_read on public.level_test_runs for select to authenticated
  using (is_any_admin() or exists (select 1 from public.room_memberships where user_id = auth.uid()));
create policy level_results_read on public.level_test_results for select to authenticated
  using (is_any_admin() or exists (select 1 from public.room_memberships where user_id = auth.uid()));
create policy evidence_read on public.evidence_artifacts for select to authenticated
  using (is_any_admin() or exists (select 1 from public.room_memberships where user_id = auth.uid()));
create policy code_refs_read on public.level_code_references for select to authenticated
  using (is_any_admin() or exists (select 1 from public.room_memberships where user_id = auth.uid()));

-- Attendance: student own, guardian linked child, teacher/admin room.
create policy attendance_read on public.attendance_records for select to authenticated
  using (owns_student(student_id) or is_guardian_of(student_id) or can_read_room(room_id));

-- Card check-ins: room-scoped (contains card/student decisions).
create policy card_checkins_read on public.card_checkins for select to authenticated
  using (can_read_room(room_id));

-- Private snapshots: admin/teacher of the room only. Students/guardians denied.
create policy private_snapshots_read on public.private_snapshots for select to authenticated
  using (room_id is not null and can_read_room(room_id) and deleted_at is null);
