import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { labelsFor, resolveLocale } from "@/i18n/dictionaries";
import { pageRole, STAFF } from "@/server/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildTimeline, checkBleName, deriveLinkState, recoveryCheck, type RecoveryResult } from "@/features/resilience/recovery";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ConnectionPill } from "@/components/shared/ConnectionPill";
import { formatDhakaDateTime, formatDhakaTime } from "@/lib/time";

type LinkRow = { sync_state: "LIVE" | "OFFLINE" | "SYNCING"; ap_active: boolean; pending_records: number; oldest_pending_ts: string | null; ble_name: string | null; local_ip: string | null; mdns_name: string | null; last_sync_at: string | null; last_error: string | null };

// Level 12 recovery dashboard. Everything is what the device REPORTED; gaps and disagreements are shown.
export default async function RecoveryPage({ params }: { params: Promise<{ roomId: string }> }) {
  await pageRole(STAFF);
  const { roomId } = await params;
  const locale = resolveLocale((await cookies()).get("locale")?.value);
  const L = labelsFor(locale, "rec");
  const supabase = await createSupabaseServerClient();

  const { data: room } = await supabase.from("rooms").select("display_name").eq("id", roomId).maybeSingle();
  if (!room) notFound();
  const { data: dev } = await supabase.from("devices").select("id, device_code, team_code, last_seen_at").eq("room_id", roomId).limit(1).maybeSingle();
  if (!dev) return <p className="text-sm text-muted">{L.noDevice}</p>;

  const [{ data: link }, { data: syncs }, { data: hist }, { data: evs }, { data: tel }, { data: offline }] = await Promise.all([
    supabase.from("device_link_status").select("*").eq("device_id", dev.id).maybeSingle(),
    supabase.from("sync_batches").select("received_at, total, accepted, duplicates, rejected, oldest_device_ts, newest_device_ts").eq("device_id", dev.id).order("received_at", { ascending: false }).limit(10),
    supabase.from("device_link_history").select("changed_at, sync_state, ap_active, ble_name, pending_records").eq("device_id", dev.id).order("changed_at", { ascending: false }).limit(20),
    supabase.from("device_events").select("event_type, device_ts, received_at, detail, is_offline_sync").eq("device_id", dev.id).order("received_at", { ascending: false }).limit(60),
    supabase.from("telemetry_readings").select("status, door, device_ts").eq("device_id", dev.id).order("device_ts", { ascending: false }).limit(400),
    supabase.from("card_checkins").select("card_uid, occurred_at, student:students(full_name)").eq("room_id", roomId).eq("is_offline_sync", true).order("occurred_at", { ascending: false }).limit(10),
  ]);

  const now = Date.now();
  const l = link as LinkRow | null;
  const state = deriveLinkState(l?.sync_state, dev.last_seen_at, now);
  const ble = checkBleName(l?.ble_name, dev.team_code);

  const readings = ((tel ?? []) as { status: string; door: string; device_ts: string }[]).map((r) => ({ status: r.status, door: r.door, ts: Date.parse(r.device_ts) })).sort((a, b) => a.ts - b.ts);
  const boots = ((evs ?? []) as { event_type: string; device_ts: string | null; received_at: string }[]).filter((e) => e.event_type === "BOOT").slice(0, 3);
  const checks = boots.map((b) => {
    const at = Date.parse(b.device_ts ?? b.received_at);
    const pre = [...readings].reverse().find((r) => r.ts < at);
    const post = readings.find((r) => r.ts >= at);
    return { at, res: recoveryCheck(pre ? { status: pre.status, door: pre.door, deviceTs: pre.ts } : null, post ? { status: post.status, door: post.door, deviceTs: post.ts } : null, at) as RecoveryResult };
  });

  const timeline = buildTimeline(
    ((evs ?? []) as { event_type: string; device_ts: string | null; received_at: string; detail: Record<string, unknown>; is_offline_sync: boolean }[]).map((e) => ({ at: e.device_ts ?? e.received_at, type: e.event_type, detail: e.detail, offline: e.is_offline_sync })),
    ((syncs ?? []) as { received_at: string; total: number; accepted: number; duplicates: number; rejected: number }[]).map((s) => ({ at: s.received_at, total: s.total, accepted: s.accepted, duplicates: s.duplicates, rejected: s.rejected })),
    ((hist ?? []) as { changed_at: string; sync_state: string; ap_active: boolean; ble_name: string | null; pending_records: number }[]).map((h) => ({ at: h.changed_at, sync_state: h.sync_state, ap_active: h.ap_active, ble_name: h.ble_name, pending: h.pending_records })),
  ).slice(0, 40);
  const lastSync = (syncs ?? [])[0] as { received_at: string; total: number; accepted: number; duplicates: number; rejected: number } | undefined;
  const connTone = state === "LIVE" ? "safe" : state === "SYNCING" ? "info" : state === "OFFLINE" ? "danger" : "neutral";
  const resTone = { AGREE: "safe", DISAGREE: "danger", NO_REPORT: "warning", NO_BASELINE: "neutral" } as const;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">{L.title} · {room.display_name}</h1>
        <Link href={`/rooms/${roomId}`} className="text-sm text-indigo hover:underline">← {room.display_name}</Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="space-y-2">
          <p className="text-[13px] text-muted">{L.connection}</p>
          <div className="flex items-center gap-2"><Badge tone={connTone}>{state}</Badge><ConnectionPill state={state === "LIVE" || state === "SYNCING" ? "ONLINE" : state === "OFFLINE" ? "OFFLINE" : "UNKNOWN"} /></div>
          <p className="tabular text-xs text-muted">{L.lastSeen}: {formatDhakaDateTime(dev.last_seen_at, locale)}</p>
        </Card>
        <Card className="space-y-1">
          <p className="text-[13px] text-muted">{L.pending}</p>
          <p className="tabular text-3xl font-semibold">{l?.pending_records ?? "—"}</p>
          <p className="tabular text-xs text-muted">{L.oldest}: {formatDhakaDateTime(l?.oldest_pending_ts, locale)}</p>
        </Card>
        <Card className="space-y-1">
          <p className="text-[13px] text-muted">{L.ble}</p>
          <p className="tabular break-all text-lg font-semibold">{l?.ble_name ?? "—"}</p>
          {ble.present && <Badge tone={ble.valid ? "safe" : "warning"}>{ble.valid ? L.bleOk : L.bleOff}</Badge>}
        </Card>
      </div>

      <Card className="space-y-2">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted">{L.ap}:</span> <Badge tone={l?.ap_active ? "info" : "neutral"}>{l ? (l.ap_active ? L.apOn : L.apOff) : "—"}</Badge>
          {(l?.local_ip || l?.mdns_name) && (
            <span className="text-muted">{L.localPage}: <span className="tabular text-ink">{l?.mdns_name ?? l?.local_ip}</span> <span className="text-xs">({L.deviceHosted})</span></span>
          )}
        </div>
        {l?.last_error && <p role="alert" className="text-sm text-danger">{L.lastError}: {l.last_error}</p>}
        {lastSync ? (
          <p className="tabular text-sm">{L.lastSync}: {formatDhakaDateTime(lastSync.received_at, locale)} · {lastSync.accepted} {L.accepted}, {lastSync.duplicates} {L.duplicates}, <span className={lastSync.rejected ? "text-danger" : ""}>{lastSync.rejected} {L.rejected}</span> / {lastSync.total}</p>
        ) : <p className="text-sm text-muted">{L.noSync}</p>}
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold">{L.restartChecks}</h2>
        <p className="text-xs text-muted">{L.restartNote}</p>
        {checks.length === 0 ? <p className="text-sm text-muted">{L.noRestarts}</p> : (
          <ul className="space-y-1.5 text-sm">
            {checks.map((c) => (
              <li key={c.at} className="flex flex-wrap items-center gap-2">
                <span className="tabular text-muted">{formatDhakaDateTime(new Date(c.at).toISOString(), locale)}</span>
                <Badge tone={resTone[c.res.result]}>{c.res.result}</Badge>
                {"detail" in c.res && <span className="text-xs text-muted">{c.res.detail}</span>}
                {c.res.result === "AGREE" && <span className="tabular text-xs text-muted">{(c.res.afterMs / 1000).toFixed(1)} s</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="space-y-2">
        <h2 className="text-sm font-semibold">{L.offlineEntries}</h2>
        {((offline ?? []) as unknown[]).length === 0 ? <p className="text-sm text-muted">{L.noOffline}</p> : (
          <ul className="space-y-1 text-sm">
            {((offline ?? []) as unknown as { card_uid: string; occurred_at: string; student: { full_name: string } | null }[]).map((o, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2"><span className="tabular text-muted">{formatDhakaDateTime(o.occurred_at, locale)}</span>{o.student?.full_name ?? o.card_uid}<Badge tone="warning">{L.faceNotVerified}</Badge></li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-semibold">{L.timeline}</h2>
        <ol className="divide-y divide-border/70">
          {timeline.map((t, i) => (
            <li key={i} className="flex flex-wrap items-center gap-3 py-2 text-sm">
              <span className="tabular w-[72px] shrink-0 text-xs text-muted">{formatDhakaTime(new Date(t.at).toISOString(), locale)}</span>
              <Badge tone={t.kind === "LINK" ? "info" : t.kind === "SYNC" ? "safe" : "neutral"}>{t.kind}</Badge>
              <span className="font-medium">{t.label}</span>
              {t.offlineSync && <Badge tone="warning">{L.offlineSync}</Badge>}
              {t.detail && <span className="text-xs text-muted">{t.detail}</span>}
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
