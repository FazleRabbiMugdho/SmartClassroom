import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { labelsFor, resolveLocale } from "@/i18n/dictionaries";
import { pageRole } from "@/server/auth/guard";
import { getStudent, attendanceFor } from "@/features/students/queries";
import { Table } from "@/components/ui/Table";
import { AttendanceBadge } from "@/components/shared/AttendanceBadge";
import { formatDhakaDateTime } from "@/lib/time";

export default async function GuardianChild({ params }: { params: Promise<{ studentId: string }> }) {
  await pageRole(["GUARDIAN"]);
  const { studentId } = await params;
  const locale = resolveLocale((await cookies()).get("locale")?.value);
  const L = labelsFor(locale, "att");
  const R = labelsFor(locale, "room");

  // RLS returns nothing for a child that is not linked to this guardian, so a guessed id is
  // indistinguishable from a nonexistent one (no leak of whether the student exists).
  const child = await getStudent(studentId);
  if (!child) notFound();
  const rows = await attendanceFor([studentId]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">{child.full_name}</h1>
      <Table rows={rows} rowKey={(r) => r.id} columns={[
        { key: "t", header: L.time, mono: true, render: (r) => formatDhakaDateTime(r.check_in_at ?? r.class?.starts_at, locale) },
        { key: "c", header: L.classes, render: (r) => r.class?.title ?? "—" },
        { key: "s", header: L.status, render: (r) => <AttendanceBadge status={r.attendance_status} labels={{ present: R.present, late: R.late, absent: R.absent, notMarked: L.notMarked }} /> },
      ]} />
    </div>
  );
}
