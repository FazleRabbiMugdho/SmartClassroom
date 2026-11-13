-- 0010 auth + onboarding (Prompt 03). SECURITY DEFINER, fixed search_path.
-- Called by the server layer (service_role). Token hashing stays in TS: these take
-- the sha256 hash, never a raw token.

-- Record one login attempt (history + lockout input). Level 4.
create or replace function public.record_login_attempt(
  p_identifier text, p_user uuid, p_success boolean, p_reason text, p_ip_hash public.sha256_hex)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.login_attempts (identifier, user_profile_id, success, failure_reason, client_ip_hash)
  values (p_identifier, p_user, p_success, p_reason, p_ip_hash);
$$;
comment on function public.record_login_attempt is 'Append a login attempt for history and lockout.';

-- Level 4 lockout: 5 failures in a row => reject for 30 seconds, even a correct password.
-- Measured from the newest failure, so locked rejections are NOT recorded (would never end).
create or replace function public.is_locked_out(p_identifier text, p_now timestamptz default now())
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_last_success_rn integer;
  v_consec integer;
  v_latest timestamptz;
begin
  with a as (
    select success, occurred_at, row_number() over (order by occurred_at desc) rn
    from public.login_attempts where identifier = p_identifier
  )
  select (select min(rn) from a where success),
         (select occurred_at from a where rn = 1)
    into v_last_success_rn, v_latest;

  if v_latest is null then
    return false;  -- no attempts
  end if;
  v_consec := coalesce(v_last_success_rn - 1, (select count(*)::int from public.login_attempts where identifier = p_identifier));
  if v_consec < 5 then
    return false;
  end if;
  return p_now < v_latest + interval '30 seconds';
end;
$$;
comment on function public.is_locked_out is 'True while 5+ consecutive failures and <30s since the newest.';

-- Grant a role with an audit trail (idempotent).
create or replace function public.grant_role(p_user uuid, p_school uuid, p_role text, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_inserted boolean;
begin
  insert into public.user_roles (user_id, school_id, role, granted_by)
  values (p_user, p_school, p_role, p_actor)
  on conflict (user_id, school_id, role) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted then
    insert into public.audit_logs (school_id, actor_profile_id, action, target_type, target_id, new_values)
    values (p_school, p_actor, 'ROLE_GRANTED', 'user_role', p_user::text, jsonb_build_object('role', p_role));
  end if;
end;
$$;
comment on function public.grant_role is 'Idempotent role grant + audit.';

-- Provision a device: device row + one ACTIVE credential (hash only) + default config + audit.
create or replace function public.provision_device(
  p_school uuid, p_device_code text, p_team_code text, p_room uuid,
  p_token_hash public.sha256_hex, p_actor uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_device uuid;
begin
  insert into public.devices (school_id, device_code, team_code, room_id)
  values (p_school, p_device_code, p_team_code, p_room)
  returning id into v_device;

  insert into public.device_credentials (device_id, token_hash, created_by)
  values (v_device, p_token_hash, p_actor);

  insert into public.device_configurations (device_id) values (v_device);

  insert into public.audit_logs (school_id, actor_profile_id, action, target_type, target_id, new_values)
  values (p_school, p_actor, 'DEVICE_PROVISIONED', 'device', v_device::text,
          jsonb_build_object('device_code', p_device_code, 'team_code', p_team_code));
  return v_device;
end;
$$;
comment on function public.provision_device is 'Create device + hashed token + config + audit. Raw token revealed once by the caller.';

-- Rotate the active token: old -> ROTATED, new ACTIVE, audit.
create or replace function public.rotate_device_token(p_device uuid, p_new_hash public.sha256_hex, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_school uuid;
begin
  select school_id into v_school from public.devices where id = p_device;
  if v_school is null then
    raise exception 'unknown device %', p_device using errcode = 'no_data_found';
  end if;
  update public.device_credentials
    set status = 'ROTATED', revoked_at = now(), revoked_by = p_actor, revoke_reason = 'rotated'
    where device_id = p_device and status = 'ACTIVE';
  insert into public.device_credentials (device_id, token_hash, created_by)
  values (p_device, p_new_hash, p_actor);
  insert into public.audit_logs (school_id, actor_profile_id, action, target_type, target_id)
  values (v_school, p_actor, 'DEVICE_TOKEN_ROTATED', 'device', p_device::text);
end;
$$;
comment on function public.rotate_device_token is 'Rotate device token: prior ACTIVE revoked, new ACTIVE issued.';

create or replace function public.revoke_device_token(p_device uuid, p_actor uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_school uuid;
begin
  select school_id into v_school from public.devices where id = p_device;
  if v_school is null then
    raise exception 'unknown device %', p_device using errcode = 'no_data_found';
  end if;
  update public.device_credentials
    set status = 'REVOKED', revoked_at = now(), revoked_by = p_actor, revoke_reason = coalesce(p_reason, 'revoked')
    where device_id = p_device and status = 'ACTIVE';
  insert into public.audit_logs (school_id, actor_profile_id, action, target_type, target_id)
  values (v_school, p_actor, 'DEVICE_TOKEN_REVOKED', 'device', p_device::text);
end;
$$;
comment on function public.revoke_device_token is 'Revoke the active device token + audit.';

-- Verify a presented token hash -> device_id, or null. Active credentials only.
create or replace function public.verify_device_token(p_token_hash public.sha256_hex)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select device_id from public.device_credentials
  where token_hash = p_token_hash and status = 'ACTIVE'
  limit 1;
$$;
comment on function public.verify_device_token is 'Resolve an ACTIVE token hash to its device.';
