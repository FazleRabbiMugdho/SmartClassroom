-- 0001 foundation (Prompt 02)
-- Target: Supabase PostgreSQL 15+. gen_random_uuid() is core in PG13+; no pgcrypto needed.
-- Enum-like fields are text + CHECK (easier to migrate than pg enums during the event).

-- Hex digest of a device token (sha256). Raw tokens are never stored.
create domain public.sha256_hex as text
  check (value ~ '^[0-9a-f]{64}$');

-- Full 40-char git commit hash (level evidence, Part B / paper §7).
create domain public.git_commit_sha as text
  check (value ~ '^[0-9a-f]{40}$');

-- Append-only guard for audit and history tables.
create or replace function public.reject_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'table % is append-only', tg_table_name
    using errcode = 'insufficient_privilege';
end;
$$;

comment on domain public.sha256_hex is 'Lower-case sha256 hex digest (64 chars).';
comment on domain public.git_commit_sha is 'Lower-case full git commit SHA (40 chars).';
comment on function public.reject_mutation() is 'Trigger: blocks UPDATE/DELETE on append-only tables.';
