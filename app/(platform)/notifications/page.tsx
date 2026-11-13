import { cookies } from "next/headers";
import { Bell } from "lucide-react";
import { labelsFor, resolveLocale } from "@/i18n/dictionaries";
import { pageRole } from "@/server/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { saveTelegramChannelAction, markAllReadAction } from "@/features/notifications/actions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Field } from "@/components/ui/Input";
import { ActionForm } from "@/components/ui/ActionForm";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDhakaDateTime } from "@/lib/time";

type N = { id: string; kind: string; title: string; body: string; created_at: string; read_at: string | null };

export default async function NotificationsPage() {
  const ctx = await pageRole(["ADMIN", "TEACHER", "STUDENT", "GUARDIAN"]);
  const locale = resolveLocale((await cookies()).get("locale")?.value);
  const L = labelsFor(locale, "nt");
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("notifications").select("id, kind, title, body, created_at, read_at").order("created_at", { ascending: false }).limit(50);
  const rows = (data ?? []) as N[];

  // Delivery status is server-only data; fetch it only for the caller's own notification ids.
  const svc = createSupabaseServiceClient();
  const { data: del } = rows.length
    ? await svc.from("notification_deliveries").select("notification_id, status, provider, attempt_no, error_text").in("notification_id", rows.map((r) => r.id)).order("attempt_no", { ascending: false })
    : { data: [] };
  const latest = new Map<string, { status: string; provider: string; attempt_no: number; error_text: string | null }>();
  for (const d of (del ?? []) as { notification_id: string; status: string; provider: string; attempt_no: number; error_text: string | null }[]) if (!latest.has(d.notification_id)) latest.set(d.notification_id, d);

  const staff = ctx.role === "ADMIN" || ctx.role === "TEACHER";
  const { data: ch } = staff ? await svc.from("notification_channels").select("address").eq("user_id", ctx.userId).eq("channel", "TELEGRAM").maybeSingle() : { data: null };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">{L.title}</h1>
        <form action={markAllReadAction} className="ml-auto"><Button variant="ghost" size="sm" type="submit">Mark all read</Button></form>
      </div>

      {staff && (
        <Card>
          <h2 className="mb-1 text-sm font-semibold">{L.phone}</h2>
          <p className="mb-3 text-sm text-muted">{L.hint}</p>
          <ActionForm action={saveTelegramChannelAction} submitLabel={L.save}>
            <Field label={L.telegramChat} htmlFor="chatId"><Input id="chatId" name="chatId" defaultValue={ch?.address ?? ""} inputMode="numeric" /></Field>
          </ActionForm>
        </Card>
      )}

      {rows.length === 0 ? <EmptyState icon={Bell} title={L.none} /> : (
        <ul className="space-y-2">
          {rows.map((n) => {
            const d = latest.get(n.id);
            return (
              <li key={n.id}>
                <Card className={n.read_at ? "opacity-80" : ""}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={["FIRE", "PANIC", "HEAT_DANGER", "WEATHER_DANGER"].includes(n.kind) ? "danger" : "warning"}>{n.title}</Badge>
                    <span className="tabular text-xs text-muted">{formatDhakaDateTime(n.created_at, locale)}</span>
                    {d && <Badge tone={d.status === "SENT" || d.status === "DELIVERED" ? "safe" : d.status === "FAILED" ? "danger" : "neutral"}>{L.delivery}: {d.status}{d.error_text ? ` (${d.error_text})` : ""}</Badge>}
                  </div>
                  <p className="mt-1 text-sm">{n.body}</p>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
