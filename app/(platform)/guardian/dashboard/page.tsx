import { cookies } from "next/headers";
import Link from "next/link";
import { Users } from "lucide-react";
import { labelsFor, resolveLocale } from "@/i18n/dictionaries";
import { pageRole } from "@/server/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { attendanceFor } from "@/features/students/queries";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { AttendanceBadge } from "@/components/shared/AttendanceBadge";
import { formatDhakaDateTime } from "@/lib/time";

// Guardian: linked children only (RLS). No camera, event history, reports or assistant.
export default async function GuardianDashboard() {
  await pageRole(["GUARDIAN"]);
  const locale = resolveLocale((await cookies()).get("locale")?.value);
  const L = labelsFor(locale, "att");
  const R = labelsFor(locale, "room");
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("students").select("id, full_name");
  const kids = (data ?? []) as { id: string; full_name: string }[];
  const records = kids.length ? await attendanceFor(kids.map((k) => k.id)) : [];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">{L.children}</h1>
      {kids.length === 0 ? <EmptyState icon={Users} title={L.noChildren} /> : (
        <ul className="space-y-3">
          {kids.map((k) => {
            const last = records.find((r) => r.student_id === k.id);
            return (
              <li key={k.id}>
                <Link href={`/guardian/children/${k.id}`}>
                  <Card className="flex items-center gap-4 transition-colors hover:border-indigo/40">
                    <div className="flex-1">
                      <p className="font-semibold">{k.full_name}</p>
                      <p className="tabular text-sm text-muted">{L.arrival}: {last ? formatDhakaDateTime(last.check_in_at ?? last.class?.starts_at, locale) : "—"}</p>
                    </div>
                    <AttendanceBadge status={last?.attendance_status} labels={{ present: R.present, late: R.late, absent: R.absent, notMarked: L.notMarked }} />
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
