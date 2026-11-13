import { cookies } from "next/headers";
import Link from "next/link";
import { Users } from "lucide-react";
import { labelsFor, resolveLocale } from "@/i18n/dictionaries";
import { pageRole, STAFF } from "@/server/auth/guard";
import { listStudents } from "@/features/students/queries";
import { createStudentAction } from "@/features/students/actions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Table } from "@/components/ui/Table";
import { Input, Field } from "@/components/ui/Input";
import { ActionForm } from "@/components/ui/ActionForm";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function StudentsPage() {
  const ctx = await pageRole(STAFF);
  const L = labelsFor(resolveLocale((await cookies()).get("locale")?.value), "att");
  const students = await listStudents();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">{L.students}</h1>

      {ctx.role === "ADMIN" && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold">{L.addStudent}</h2>
          <ActionForm action={createStudentAction} submitLabel={L.addStudent} className="max-w-xl">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={L.studentCode} htmlFor="code"><Input id="code" name="code" required /></Field>
              <Field label={L.studentName} htmlFor="name"><Input id="name" name="name" required /></Field>
              <Field label={L.classLabel} htmlFor="classLabel"><Input id="classLabel" name="classLabel" /></Field>
            </div>
          </ActionForm>
        </Card>
      )}

      {students.length === 0 ? (
        <EmptyState icon={Users} title={L.noStudents} />
      ) : (
        <Table
          rows={students}
          rowKey={(s) => s.id}
          columns={[
            { key: "code", header: L.studentCode, mono: true, render: (s) => s.student_code },
            { key: "name", header: L.studentName, render: (s) => <Link href={`/students/${s.id}`} className="font-medium text-indigo hover:underline">{s.full_name}</Link> },
            { key: "class", header: L.classLabel, render: (s) => s.class_label ?? "—" },
            { key: "enrol", header: L.enrolment, render: (s) => <Badge tone={s.enrollment_status === "ENROLLED" ? "safe" : s.enrollment_status === "FAILED" ? "danger" : "neutral"}>{s.enrollment_status}</Badge> },
          ]}
        />
      )}
    </div>
  );
}
