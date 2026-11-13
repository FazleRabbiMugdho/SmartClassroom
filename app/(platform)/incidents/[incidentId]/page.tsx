import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { labelsFor, resolveLocale } from "@/i18n/dictionaries";
import { pageRole, STAFF } from "@/server/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatDhakaDateTime } from "@/lib/time";

// Incident detail: event time vs received time, room/device, severity, state, door state at the
// time, the preserved source payload, and who acknowledged. Scope is RLS (room Teacher/Admin).
export default async function IncidentDetail({ params }: { params: Promise<{ incidentId: string }> }) {
  await pageRole(STAFF);
  const { incidentId } = await params;
  const locale = resolveLocale((await cookies()).get("locale")?.value);
  const L = labelsFor(locale, "saf");
  const supabase = await createSupabaseServerClient();

  const { data: inc } = await supabase.from("security_incidents")
    .select("id, incident_type, severity, state, occurred_at, received_at, room_id, device_id, source_event_id, detail, room:rooms(display_name), device:devices(device_code)")
    .eq("id", incidentId).maybeSingle();
  if (!inc) notFound();
  type Inc = typeof inc & { room: { display_name: string } | null; device: { device_code: string } | null };
  const i = inc as unknown as Inc;

  const [{ data: ev }, { data: door }, { data: ack }] = await Promise.all([
    i.source_event_id ? supabase.from("device_events").select("event_type, device_ts, received_at, detail").eq("id", i.source_event_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("telemetry_readings").select("door, status, device_ts").eq("room_id", i.room_id).lte("device_ts", i.occurred_at).order("device_ts", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("incident_acknowledgements").select("acknowledged_at, who:user_profiles(full_name)").eq("incident_id", incidentId).maybeSingle(),
  ]);
  const ackRow = ack as unknown as { acknowledged_at: string; who: { full_name: string } | null } | null;

  const row = (k: string, v: React.ReactNode) => (<div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="tabular text-sm">{v}</dd></div>);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/incidents" className="text-sm text-indigo hover:underline">← {L.back}</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">{i.incident_type.replace(/_/g, " ")}</h1>
        <Badge tone={i.severity === "CRITICAL" || i.severity === "DANGER" ? "danger" : "warning"}>{i.severity}</Badge>
        <Badge tone={i.state === "OPEN" ? "warning" : "safe"}>{i.state}</Badge>
      </div>
      <Card>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {row(L.eventTime, formatDhakaDateTime(i.occurred_at, locale))}
          {row(L.receivedTime, formatDhakaDateTime(i.received_at, locale))}
          {row("Room", i.room?.display_name ?? "—")}
          {row("Device", i.device?.device_code ?? "—")}
          {row(`${L.door} (simulated)`, door?.door ?? "—")}
          {row("Acknowledged", ackRow ? `${ackRow.who?.full_name ?? "—"} · ${formatDhakaDateTime(ackRow.acknowledged_at, locale)}` : "—")}
        </dl>
      </Card>
      <Card>
        <h2 className="mb-2 text-sm font-semibold">{L.source}</h2>
        {ev ? (
          <pre className="tabular overflow-x-auto rounded-lg bg-canvas p-3 text-xs">{JSON.stringify({ type: ev.event_type, device_ts: ev.device_ts, received_at: ev.received_at, detail: ev.detail }, null, 2)}</pre>
        ) : <p className="text-sm text-muted">{L.noEvents}</p>}
      </Card>
      <p className="text-xs text-muted">{L.ackNote}</p>
    </div>
  );
}
