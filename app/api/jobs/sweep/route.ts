import { callJsonFn, query } from "@/lib/db";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { refreshWeatherIfDue } from "@/features/weather/refresh";
import { deliverPending } from "@/features/notifications/deliver";

// Periodic worker (call every minute from a scheduler, e.g. Vercel Cron / external cron):
//   1) mark ABSENT for students who have not checked in 30 min after class start (+ guardian notices)
//   2) fetch weather when 15 minutes have passed (Level 6) and re-derive notices
//   3) retry failed phone alerts
//   4) delete queued private objects from storage, with retry bookkeeping
// Authenticated by CRON_SECRET. Not a user-facing route.
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const absent = await callJsonFn<number>("select public.sweep_absent() as r", []);
  const weather = await refreshWeatherIfDue().catch(() => ({ fetched: 0, failed: 1, skipped: 0 }));
  const phone = await deliverPending().catch(() => ({ sent: 0, failed: 0 })); // retry failed alerts

  const pending = await query<{ id: string; bucket: string; object_key: string }>(
    "select id, bucket, object_key from public.storage_deletion_queue where deleted_at is null and attempts < 10 order by queued_at limit 50",
  );
  const svc = createSupabaseServiceClient();
  let deleted = 0;
  for (const row of pending) {
    const { error } = await svc.storage.from(row.bucket).remove([row.object_key]);
    if (error) {
      await query("update public.storage_deletion_queue set attempts = attempts + 1, last_error = $2 where id = $1", [row.id, error.message]);
    } else {
      await query("update public.storage_deletion_queue set deleted_at = now() where id = $1", [row.id]);
      deleted++;
    }
  }
  return Response.json({ absent_marked: absent, weather, phone, storage_deleted: deleted, storage_pending: pending.length - deleted });
}
