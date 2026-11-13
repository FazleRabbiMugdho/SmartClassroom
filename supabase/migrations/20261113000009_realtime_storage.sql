-- 0009 Realtime publication (scoped) and private storage buckets.
-- Guards let the whole migration set also run on a plain Postgres test harness.

-- Realtime: publish only tables whose changes must reach authorized clients.
do $$
declare
  t text;
  tables text[] := array[
    'devices', 'device_configurations', 'telemetry_readings', 'device_events',
    'device_health_snapshots', 'device_commands', 'command_acknowledgements', 'ota_jobs',
    'security_incidents', 'incident_acknowledgements', 'blocked_cards', 'notifications',
    'attendance_records', 'card_checkins', 'room_camera_state', 'occupancy_events',
    'camera_health_events', 'handraise_events', 'presence_events', 'csi_predictions',
    'weather_notices'
  ];
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array tables loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

-- Private storage buckets (only if the Supabase storage schema exists).
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public)
    values
      ('private-snapshots', 'private-snapshots', false),
      ('firmware-ota',      'firmware-ota',      false),
      ('evidence-artifacts','evidence-artifacts',false),
      ('enrollment-temp',   'enrollment-temp',   false)
    on conflict (id) do nothing;
  end if;
end;
$$;

-- storage.objects access is server-mediated (signed URLs). No public read policy is
-- created here; clients never receive a public bucket URL (Part C7 / Prompt 02).
