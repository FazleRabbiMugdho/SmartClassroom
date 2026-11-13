import { cookies } from "next/headers";
import { ShieldCheck } from "lucide-react";
import { labelsFor, resolveLocale } from "@/i18n/dictionaries";
import { pageRole, STAFF } from "@/server/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ackIncidentAction, unblockCardAction } from "@/features/students/actions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ActionForm } from "@/components/ui/ActionForm";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDhakaDateTime } from "@/lib/time";

type Incident = { id: string; incident_type: string; severity: string; state: string; occurred_at: string; card_uid: string | null; snapshot_id: string | null };
type Block = { id: string; card_uid: string; blocked_until: string; reason: string };

// Level 8 UI foundation: alerts with private snapshot + atomic Ack, blocked cards + Admin unblock.
export default async function IncidentsPage() {
  const ctx = await pageRole(STAFF);
  const locale = resolveLocale((await cookies()).get("locale")?.value);
  const L = labelsFor(locale, "att");
  const supabase = await createSupabaseServerClient();

  const [{ data: inc }, { data: blk }] = await Promise.all([
    supabase.from("security_incidents").select("id, incident_type, severity, state, occurred_at, card_uid, snapshot_id").neq("state", "CLOSED").order("occurred_at", { ascending: false }).limit(50),
    supabase.from("blocked_cards").select("id, card_uid, blocked_until, reason").eq("status", "ACTIVE").gt("blocked_until", new Date().toISOString()),
  ]);
  const incidents = (inc ?? []) as Incident[];
  const blocked = (blk ?? []) as Block[];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">{L.incidents}</h1>

      {incidents.length === 0 ? (
        <EmptyState icon={ShieldCheck} title={L.noIncidents} />
      ) : (
        <ul className="space-y-3">
          {incidents.map((i) => (
            <li key={i.id}>
              <Card className="flex flex-wrap items-center gap-3">
                <Badge tone={i.severity === "CRITICAL" || i.severity === "DANGER" ? "danger" : "warning"}>{i.incident_type}</Badge>
                <span className="tabular text-sm text-muted">{formatDhakaDateTime(i.occurred_at, locale)}</span>
                {i.card_uid && <span className="tabular text-xs text-muted">{i.card_uid}</span>}
                {i.snapshot_id && <a className="text-sm text-indigo hover:underline" href={`/api/snapshots/${i.snapshot_id}`} target="_blank" rel="noreferrer">{L.snapshot}</a>}
                <div className="ml-auto">
                  {i.state === "OPEN" ? (
                    <ActionForm action={ackIncidentAction} submitLabel={L.ack} variant="secondary">
                      <input type="hidden" name="incidentId" value={i.id} />
                    </ActionForm>
                  ) : <Badge tone="safe">{i.state}</Badge>}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{L.blockedCards}</h2>
        {blocked.length === 0 ? <p className="text-sm text-muted">{L.noBlocked}</p> : (
          <ul className="space-y-2">
            {blocked.map((b) => (
              <li key={b.id}>
                <Card className="flex flex-wrap items-center gap-3">
                  <span className="tabular font-medium">{b.card_uid}</span>
                  <span className="text-sm text-muted">{L.until} {formatDhakaDateTime(b.blocked_until, locale)}</span>
                  {ctx.role === "ADMIN" && (
                    <div className="ml-auto">
                      <ActionForm action={unblockCardAction} submitLabel={L.unblock} variant="secondary">
                        <input type="hidden" name="blockId" value={b.id} />
                      </ActionForm>
                    </div>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
