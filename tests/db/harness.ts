import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const MIGRATIONS_DIR = fileURLToPath(new URL("../../supabase/migrations", import.meta.url));
const SEED = fileURLToPath(new URL("../../supabase/seed.sql", import.meta.url));

// Minimal Supabase shim: auth schema, users table, roles, and auth.uid() reading
// the request.jwt.claim.sub GUC — the same contract RLS helpers use on Supabase.
const SHIM = `
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique
);
create or replace function auth.uid() returns uuid
  language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant usage on schema auth to authenticated, service_role;
grant select on auth.users to authenticated, service_role;
`;

export interface TestDb {
  db: PGlite;
  as: (uid: string) => Promise<void>;        // act as an authenticated user
  asService: () => Promise<void>;            // act as the server (bypass RLS)
  reset: () => Promise<void>;                // back to superuser
  end: () => Promise<void>;
}

export async function makeTestDb(opts: { seed?: boolean } = {}): Promise<TestDb> {
  const db = new PGlite();
  await db.exec(SHIM);

  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    await db.exec(readFileSync(`${MIGRATIONS_DIR}/${f}`, "utf8"));
  }
  // service_role needs table privileges (it bypasses RLS but still needs GRANTs).
  await db.exec(`grant all on all tables in schema public to service_role;
                 grant usage on all sequences in schema public to service_role;`);
  if (opts.seed) await db.exec(readFileSync(SEED, "utf8"));

  return {
    db,
    as: async (uid: string) => {
      await db.exec("reset role;");
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
      await db.exec("set role authenticated;");
    },
    asService: async () => {
      await db.exec("reset role; set role service_role;");
    },
    reset: async () => {
      await db.exec("reset role;");
    },
    end: async () => {
      await db.close();
    },
  };
}

// Deterministic judge UUIDs from seed.sql.
export const UID = {
  admin: "00000000-0000-0000-0000-0000000000a1",
  teacher: "00000000-0000-0000-0000-0000000000a2",
  s1: "00000000-0000-0000-0000-0000000000a3",
  s2: "00000000-0000-0000-0000-0000000000a4",
  guardian: "00000000-0000-0000-0000-0000000000a5",
} as const;
export const ID = {
  school: "00000000-0000-0000-0000-0000000000b1",
  room: "00000000-0000-0000-0000-0000000000c1",
  studentS1: "00000000-0000-0000-0000-0000000000d1",
  studentS2: "00000000-0000-0000-0000-0000000000d2",
  device: "00000000-0000-0000-0000-0000000000e1",
} as const;
