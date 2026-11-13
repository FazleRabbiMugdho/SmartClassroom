import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { labelsFor, resolveLocale } from "@/i18n/dictionaries";
import { pageRole, STAFF } from "@/server/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { classesInWindow, listStudents } from "@/features/students/queries";
import { createClassAction, enrollInClassAction } from "@/features/students/actions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Table } from "@/components/ui/Table";
import { Input, Select, Field } from "@/components/ui/Input";
import { ActionForm } from "@/components/ui/ActionForm";
import { AttendanceBadge } from "@/components/shared/AttendanceBadge";
import { formatDhakaDateTime } from "@/lib/time";
import { cn } from "@/components/ui/cn";

export default async function RoomAttendancePage({
  params, searchParams,
}: { params: Promise<{ roomId: string }>; searchParams: Promise<{ class?: string }> }) {
  const ctx = await pageRole(STAFF);
  const { roomId } = await params;
  const sp = await searchParams;
  const locale = resolveLocale((await cookies()).get("locale")?.value);
  const L = labelsFor(locale, "att");
  const R = labelsFor(locale, "room");
  const supabase = await createSupabaseServerClient();

  const { data: room } = await supabase.from("rooms").select("id, display_name").eq("id", roomId).maybeSingle();
  if (!room) notFound();

  const classes = await classesInWindow(roomId, 72, 72);
  const selected = classes.find((c) => c.id === sp.class) ?? classes[0];

  type Row = { student_id: string; attendance_status: string; check_in_at: string | null; entry_method: string; face_verified: boolean };
  let roster: { id: string; full_name: string; student_code: string; rec?: Row }[] = [];
  if (selected) {
    const [{ data: enr }, { data: att }] = await Promise.all([
      supabase.from("class_enrollments").select("student:students(id, full_name, student_code)").eq("class_session_id", selected.id),
      supabase.from("attendance_records").select("student_id, attendance_status, check_in_at, entry_method, face_verified").eq("class_session_id", selected.id),
    ]);
    const byStudent = new Map(((att ?? []) as Row[]).map((r) => [r.student_id, r]));
    roster = ((enr ?? []) as unknown as { student: { id: string; full_name: string; student_code: string } }[])
      .map((e) => ({ ...e.student, rec: byStudent.get(e.student.id) }));
  }
  const allStudents = ctx.role === "ADMIN" ? await listStudents() : [];
  const badgeLabels = { present: R.present, late: R.late, absent: R.absent, notMarked: L.notMarked };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">{room.display_name} · {L.title}</h1>
        <Link href={`/rooms/${roomId}`} className="text-sm text-indigo hover:underline">← {R.select}</Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {classes.length === 0 && <p className="text-sm text-muted">{L.noClasses}</p>}
        {classes.map((c) => (
          <Link key={c.id} href={`/rooms/${roomId}/attendance?class=${c.id}`}
            className={cn("rounded-lg border px-3 py-1.5 text-sm", c.id === selected?.id ? "border-indigo bg-periwinkle text-indigo" : "border-border bg-card text-muted hover:text-ink")}>
            {c.title} <span className="tabular text-xs">{formatDhakaDateTime(c.starts_at, locale)}</span>
          </Link>
        ))}
      </div>

      {selected && (
        <Table
          rows={roster}
          rowKey={(r) => r.id}
          columns={[
            { key: "code", header: L.studentCode, mono: true, render: (r) => r.student_code },
            { key: "name", header: L.studentName, render: (r) => r.full_name },
            { key: "status", header: L.status, render: (r) => <AttendanceBadge status={r.rec?.attendance_status} labels={badgeLabels} /> },
            { key: "time", header: L.checkIn, mono: true, render: (r) => formatDhakaDateTime(r.rec?.check_in_at, locale) },
            { key: "method", header: L.method, render: (r) => r.rec?.entry_method === "CARD_OFFLINE" ? <Badge tone="warning">{L.offline}</Badge> : (r.rec?.entry_method ?? "—") },
          ]}
        />
      )}

      {ctx.role === "ADMIN" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h2 className="mb-3 text-sm font-semibold">{L.scheduleClass}</h2>
            <ActionForm action={createClassAction} submitLabel={L.scheduleClass}>
              <input type="hidden" name="roomId" value={roomId} />
              <Field label={L.className} htmlFor="title"><Input id="title" name="title" required /></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={L.startsAt} htmlFor="startsAt"><Input id="startsAt" name="startsAt" type="datetime-local" required /></Field>
                <Field label={L.minutes} htmlFor="minutes"><Input id="minutes" name="minutes" type="number" min={5} max={480} defaultValue={60} required /></Field>
              </div>
            </ActionForm>
          </Card>
          {selected && (
            <Card>
              <h2 className="mb-3 text-sm font-semibold">{L.addToClass}</h2>
              <ActionForm action={enrollInClassAction} submitLabel={L.addToClass}>
                <input type="hidden" name="classId" value={selected.id} />
                <Field label={L.student} htmlFor="studentId">
                  <Select id="studentId" name="studentId" required>
                    {allStudents.map((s) => <option key={s.id} value={s.id}>{s.full_name} ({s.student_code})</option>)}
                  </Select>
                </Field>
              </ActionForm>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
