import { cookies } from "next/headers";
import { CalendarCheck } from "lucide-react";
import { labelsFor, resolveLocale } from "@/i18n/dictionaries";
import { pageRole } from "@/server/auth/guard";
import { attendanceFor } from "@/features/students/queries";
import { Table } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { AttendanceBadge } from "@/components/shared/AttendanceBadge";
import { formatDhakaDateTime } from "@/lib/time";

export default async function GuardianAttendance() {
  await pageRole(["GUARDIAN"]);
  const locale = resolveLocale((await cookies()).get("locale")?.value);
  const L = labelsFor(locale, "att");
  const R = labelsFor(locale, "room");
  const rows = await attendanceFor(); // RLS: linked children only
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">{L.title}</h1>
      {rows.length === 0 ? <EmptyState icon={CalendarCheck} title={L.noAttendance} /> : (
        <Table rows={rows} rowKey={(r) => r.id} columns={[
          { key: "t", header: L.time, mono: true, render: (r) => formatDhakaDateTime(r.check_in_at ?? r.class?.starts_at, locale) },
          { key: "c", header: L.classes, render: (r) => r.class?.title ?? "—" },
          { key: "s", header: L.status, render: (r) => <AttendanceBadge status={r.attendance_status} labels={{ present: R.present, late: R.late, absent: R.absent, notMarked: L.notMarked }} /> },
        ]} />
      )}
    </div>
  );
}
