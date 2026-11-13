import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { labelsFor, resolveLocale } from "@/i18n/dictionaries";
import { pageRole, STAFF } from "@/server/auth/guard";
import { getStudent, getActiveCard, attendanceFor } from "@/features/students/queries";
import { enrollFacesAction, removeCardAction, deleteStudentAction } from "@/features/students/actions";
import { CONSENT_NOTICE } from "@/features/students/consent";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input, Field } from "@/components/ui/Input";
import { ActionForm } from "@/components/ui/ActionForm";
import { AttendanceBadge } from "@/components/shared/AttendanceBadge";
import { formatDhakaDateTime } from "@/lib/time";

export default async function StudentProfilePage({ params }: { params: Promise<{ studentId: string }> }) {
  const ctx = await pageRole(STAFF);
  const { studentId } = await params;
  const locale = resolveLocale((await cookies()).get("locale")?.value);
  const L = labelsFor(locale, "att");
  const R = labelsFor(locale, "room");

  const student = await getStudent(studentId);
  if (!student) notFound();
  const [card, history] = await Promise.all([getActiveCard(studentId), attendanceFor([studentId])]);
  const isAdmin = ctx.role === "ADMIN";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">{student.full_name}</h1>
        <span className="tabular text-sm text-muted">{student.student_code}</span>
        <Badge tone={student.enrollment_status === "ENROLLED" ? "safe" : student.enrollment_status === "FAILED" ? "danger" : "neutral"}>{student.enrollment_status}</Badge>
      </div>

      <Card>
        <h2 className="mb-2 text-sm font-semibold">{L.card}</h2>
        {card ? (
          <div className="flex flex-wrap items-center gap-4">
            <span className="tabular text-sm">{card.card_uid}</span>
            {isAdmin && (
              <ActionForm action={removeCardAction} submitLabel={L.removeCard} variant="secondary">
                <input type="hidden" name="studentId" value={studentId} />
              </ActionForm>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted">{L.noCard}</p>
        )}
      </Card>

      {isAdmin && (
        <Card>
          <h2 className="mb-1 text-sm font-semibold">{L.enrolment}</h2>
          <p className="mb-3 text-sm text-muted">{L.enrolNote}</p>
          <div className="mb-4 rounded-lg bg-canvas p-3 text-sm text-muted">
            <p className="mb-1 font-medium text-ink">{L.consentTitle}</p>
            {CONSENT_NOTICE}
          </div>
          <ActionForm action={enrollFacesAction} submitLabel={L.enrol}>
            <input type="hidden" name="studentId" value={studentId} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="consent" className="size-4 accent-indigo" /> {L.consentCheck}
            </label>
            <Field label={L.photos} htmlFor="photos">
              <Input id="photos" name="photos" type="file" accept="image/*" multiple capture="user" className="h-auto py-2" />
            </Field>
          </ActionForm>
        </Card>
      )}

      <Card>
        <h2 className="mb-3 text-sm font-semibold">{L.title}</h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted">{L.noAttendance}</p>
        ) : (
          <ul className="divide-y divide-border/70">
            {history.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="tabular w-28 text-muted">{formatDhakaDateTime(a.check_in_at ?? a.class?.starts_at, locale)}</span>
                <span className="min-w-0 flex-1 truncate">{a.class?.title}</span>
                <AttendanceBadge status={a.attendance_status} labels={{ present: R.present, late: R.late, absent: R.absent, notMarked: L.notMarked }} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {isAdmin && (
        <Card className="border-danger/30">
          <h2 className="mb-1 text-sm font-semibold text-danger">{L.deleteTitle}</h2>
          <p className="mb-3 text-sm text-muted">{L.deleteBody}</p>
          <ActionForm action={deleteStudentAction} submitLabel={L.delete} variant="danger">
            <input type="hidden" name="studentId" value={studentId} />
            <Field label={`${L.deleteConfirm} (${student.student_code})`} htmlFor="confirm"><Input id="confirm" name="confirm" autoComplete="off" /></Field>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
