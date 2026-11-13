import { cookies } from "next/headers";
import { labelsFor, resolveLocale } from "@/i18n/dictionaries";
import { pageRole } from "@/server/auth/guard";
import { attendanceFor } from "@/features/students/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { AttendanceBadge } from "@/components/shared/AttendanceBadge";
import { formatDhakaDateTime } from "@/lib/time";

// Student: own attendance only. No room history, camera, reports or assistant.
export default async function StudentDashboard() {
  await pageRole(["STUDENT"]);
  const locale = resolveLocale((await cookies()).get("locale")?.value);
  const L = labelsFor(locale, "att");
  const R = labelsFor(locale, "room");
  const supabase = await createSupabaseServerClient();
  const { data: me } = await supabase.from("students").select("id, full_name").maybeSingle(); // RLS: only my own row
  const history = me ? await attendanceFor([me.id]) : [];
  const last = history[0];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">{me?.full_name ?? L.myAttendance}</h1>
      <Card tint="periwinkle" className="flex items-center gap-4">
        <div className="flex-1">
          <p className="text-[13px] text-muted">{L.arrival}</p>
          <p className="tabular text-lg font-semibold">{last ? formatDhakaDateTime(last.check_in_at ?? last.class?.starts_at, locale) : "—"}</p>
          <p className="text-sm text-muted">{last?.class?.title}</p>
        </div>
        <AttendanceBadge status={last?.attendance_status} labels={{ present: R.present, late: R.late, absent: R.absent, notMarked: L.notMarked }} />
      </Card>
    </div>
  );
}
