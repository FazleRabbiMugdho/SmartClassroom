import { cookies } from "next/headers";
import Link from "next/link";
import { CalendarCheck } from "lucide-react";
import { labelsFor, resolveLocale } from "@/i18n/dictionaries";
import { pageRole, STAFF } from "@/server/auth/guard";
import { classesInWindow, attendanceFor } from "@/features/students/queries";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDhakaDateTime } from "@/lib/time";

export default async function AttendancePage() {
  await pageRole(STAFF);
  const locale = resolveLocale((await cookies()).get("locale")?.value);
  const L = labelsFor(locale, "att");
  const R = labelsFor(locale, "room");

  const [classes, records] = await Promise.all([classesInWindow(), attendanceFor()]);
  const count = (classId: string, status: string) => records.filter((r) => r.class_session_id === classId && r.attendance_status === status).length;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">{L.title}</h1>
      {classes.length === 0 ? (
        <EmptyState icon={CalendarCheck} title={L.noClasses} />
      ) : (
        <ul className="space-y-3">
          {classes.map((c) => (
            <li key={c.id}>
              <Link href={`/rooms/${c.room_id}/attendance?class=${c.id}`}>
                <Card className="flex flex-wrap items-center gap-4 transition-colors hover:border-indigo/40">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{c.title}</p>
                    <p className="tabular text-sm text-muted">{c.room?.display_name} · {formatDhakaDateTime(c.starts_at, locale)}</p>
                  </div>
                  <p className="tabular text-sm text-muted">
                    {count(c.id, "PRESENT")} {R.present} · {count(c.id, "LATE")} {R.late} · {count(c.id, "ABSENT")} {R.absent}
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
