import { cookies } from "next/headers";
import { Bell } from "lucide-react";
import { labelsFor, resolveLocale } from "@/i18n/dictionaries";
import { pageRole } from "@/server/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDhakaDateTime } from "@/lib/time";

export default async function GuardianNotifications() {
  await pageRole(["GUARDIAN"]);
  const locale = resolveLocale((await cookies()).get("locale")?.value);
  const L = labelsFor(locale, "att");
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("notifications").select("id, kind, title, body, created_at").order("created_at", { ascending: false }).limit(50);
  const rows = (data ?? []) as { id: string; kind: string; title: string; body: string; created_at: string }[];
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">{L.notifications}</h1>
      {rows.length === 0 ? <EmptyState icon={Bell} title={L.noNotifications} /> : (
        <ul className="space-y-2">
          {rows.map((n) => (
            <li key={n.id}>
              <Card className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge tone={n.kind === "GUARDIAN_ABSENT" ? "danger" : "warning"}>{n.title}</Badge>
                  <span className="tabular text-xs text-muted">{formatDhakaDateTime(n.created_at, locale)}</span>
                </div>
                <p className="text-sm">{n.body}</p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
