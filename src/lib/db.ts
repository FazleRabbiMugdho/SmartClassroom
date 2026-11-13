import { Pool } from "pg";

// Server-only Postgres pool for device ingestion + command delivery (Prompt 04).
// Uses DATABASE_URL (Supabase direct/pooled connection). The device path uses raw
// SQL functions (migration 0011) for idempotency via the (device_id, seq) unique
// constraint; it does not go through PostgREST. Never import from a client component.

let pool: Pool | undefined;

function getPool(): Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("Missing required environment variable: DATABASE_URL");
    pool = new Pool({ connectionString: url, max: 5 });
  }
  return pool;
}

/** Call a SQL function returning a single jsonb column named `r`. */
export async function callJsonFn<T = unknown>(sql: string, params: unknown[]): Promise<T> {
  const res = await getPool().query(sql, params);
  return res.rows[0]?.r as T;
}

export async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const res = await getPool().query(sql, params);
  return res.rows as T[];
}
