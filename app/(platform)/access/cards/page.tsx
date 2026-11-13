import { cookies } from "next/headers";
import Link from "next/link";
import { labelsFor, resolveLocale } from "@/i18n/dictionaries";
import { pageRole, STAFF } from "@/server/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listRooms } from "@/features/rooms/queries";
import { listStudents } from "@/features/students/queries";
import { startCardRegistrationAction } from "@/features/students/actions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Table } from "@/components/ui/Table";
import { Select, Field } from "@/components/ui/Input";
import { ActionForm } from "@/components/ui/ActionForm";
import { formatDhakaDateTime } from "@/lib/time";

export default async function CardsPage() {
  const ctx = await pageRole(STAFF);
  const locale = resolveLocale((await cookies()).get("locale")?.value);
  const L = labelsFor(locale, "att");
  const supabase = await createSupabaseServerClient();

  const [{ data: cards }, { data: pending }, students, rooms] = await Promise.all([
    supabase.from("student_cards").select("id, card_uid, registered_at, student:students(id, full_name, student_code)").eq("status", "ACTIVE").order("registered_at", { ascending: false }),
    supabase.from("card_registrations").select("id, expires_at, room_id, student:students(full_name)").eq("status", "PENDING").gt("expires_at", new Date().toISOString()),
    listStudents(),
    listRooms(),
  ]);
  type CardRow = { id: string; card_uid: string; registered_at: string; student: { id: string; full_name: string; student_code: string } | null };
  const rows = (cards ?? []) as unknown as CardRow[];
  const waiting = (pending ?? []) as unknown as { id: string; expires_at: string; student: { full_name: string } | null }[];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">{L.cards}</h1>

      {ctx.role === "ADMIN" && (
        <Card>
          <h2 className="mb-1 text-sm font-semibold">{L.registerCard}</h2>
          <p className="mb-3 text-sm text-muted">{L.registerHint}</p>
          <ActionForm action={startCardRegistrationAction} submitLabel={L.registerCard}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={L.student} htmlFor="studentId">
                <Select id="studentId" name="studentId" required>
                  {students.map((s) => <option key={s.id} value={s.id}>{s.full_name} ({s.student_code})</option>)}
                </Select>
              </Field>
              <Field label={L.room} htmlFor="roomId">
                <Select id="roomId" name="roomId" required>
                  {rooms.map((r) => <option key={r.id} value={r.id}>{r.display_name}</option>)}
                </Select>
              </Field>
            </div>
          </ActionForm>
          {waiting.map((w) => (
            <p key={w.id} className="mt-3 flex items-center gap-2 text-sm text-warning" role="status">
              <Badge tone="warning">{L.pending}</Badge> {w.student?.full_name} · {formatDhakaDateTime(w.expires_at, locale)}
            </p>
          ))}
        </Card>
      )}

      <Table
        rows={rows}
        rowKey={(r) => r.id}
        columns={[
          { key: "uid", header: "UID", mono: true, render: (r) => r.card_uid },
          { key: "student", header: L.student, render: (r) => r.student ? <Link href={`/students/${r.student.id}`} className="text-indigo hover:underline">{r.student.full_name}</Link> : "—" },
          { key: "at", header: L.time, mono: true, align: "right", render: (r) => formatDhakaDateTime(r.registered_at, locale) },
        ]}
      />
    </div>
  );
}
