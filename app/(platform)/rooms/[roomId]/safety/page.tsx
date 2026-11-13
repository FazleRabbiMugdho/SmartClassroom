import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { labelsFor, resolveLocale } from "@/i18n/dictionaries";
import { pageRole, STAFF } from "@/server/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getRoomSnapshot } from "@/features/rooms/queries";
import { deriveSafety, canOfferResetFire } from "@/features/rooms/derive";
import { DEFAULT_THRESHOLDS, HEAT_INDEX_FORMULA, replayStatus, trendOf, isAccepted, type Reading } from "@/features/safety/rules";
import { ackIncidentAction } from "@/features/students/actions";
import { resetFireAction } from "@/features/rooms/actions";
import { SafetyStateBanner } from "@/components/shared/SafetyStateBanner";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ActionForm } from "@/components/ui/ActionForm";
import { formatDhakaDateTime, formatDhakaTime } from "@/lib/time";

// Safety Centre (Levels 3/4). The DEVICE decides; this page shows what it reported and an
// independent cloud replay of the same readings. A disagreement is surfaced, never hidden.
export default async function SafetyPage({ params }: { params: Promise<{ roomId: string }> }) {
  const ctx = await pageRole(STAFF);
  const { roomId } = await params;
  const locale = resolveLocale((await cookies()).get("locale")?.value);
  const L = labelsFor(locale, "saf");
  const R = labelsFor(locale, "room");

  const snap = await getRoomSnapshot(roomId, 360);
  if (!snap.room) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: th } = await supabase.rpc("room_thresholds", { p_room: roomId });
  const limits = th
    ? { warning: Number((th as { warning_temp_c: number }).warning_temp_c), danger: Number((th as { danger_temp_c: number }).danger_temp_c) }
    : DEFAULT_THRESHOLDS;

  const readings: Reading[] = snap.series.map((s) => ({ t: Date.parse(s.device_ts), tempC: Number(s.temp_c), rh: Number(s.rh), quality: s.quality }));
  const replay = replayStatus(readings, limits);
  const trend = trendOf(readings);
  const rejected = snap.series.filter((s) => !isAccepted({ tempC: Number(s.temp_c), rh: Number(s.rh), quality: s.quality })).length;

  const latest = snap.latest;
  const safety = deriveSafety(latest, snap.incidents);
  const reported = latest?.status ?? null;
  const comparable = reported === "SAFE" || reported === "WARNING" || reported === "DANGER";
  const agree = !comparable || replay.status === reported;
  const reset = canOfferResetFire(ctx.role, safety, latest?.flame);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">{L.title} · {snap.room.display_name}</h1>
        <Link href={`/rooms/${roomId}`} className="text-sm text-indigo hover:underline">← {R.select}</Link>
      </div>

      <SafetyStateBanner state={safety} detail={safety === "FIRE" ? L.ackNote : undefined} />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-[13px] text-muted">{L.reported}</p>
          <p className="mt-1 text-xl font-semibold">{reported ?? "—"}</p>
          <p className="tabular text-xs text-muted">{formatDhakaDateTime(latest?.device_ts, locale)}</p>
        </Card>
        <Card tint={agree ? "mint" : "coral"}>
          <p className="text-[13px] text-muted">{L.cloudCheck}</p>
          <p className="mt-1 text-xl font-semibold">{replay.status}</p>
          <p className="text-xs">{agree ? L.agree : L.disagree}</p>
        </Card>
        <Card>
          <p className="text-[13px] text-muted">{L.limits}</p>
          <p className="tabular mt-1 text-xl font-semibold">{limits.warning} / {limits.danger} °C</p>
          <p className="text-xs text-muted">{L.hold}</p>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-[13px] text-muted">{L.heatIndex}</p>
          <p className="tabular mt-1 text-xl font-semibold">{latest ? `${Number(latest.heat_index_c).toFixed(1)} °C` : "—"}</p>
          <p className="text-xs text-muted">{L.formula}: {HEAT_INDEX_FORMULA}</p>
        </Card>
        <Card>
          <p className="text-[13px] text-muted">{L.trend}</p>
          <p className="mt-1 text-xl font-semibold">{latest?.heat_trend ?? "—"} <span className="text-xs font-normal text-muted">({trend ?? "—"})</span></p>
          <p className="text-xs text-muted">{L.trendNote}</p>
        </Card>
        <Card>
          <p className="text-[13px] text-muted">{L.invalid}</p>
          <p className="tabular mt-1 text-xl font-semibold">{rejected}</p>
        </Card>
      </div>

      <Card>
        <h2 className="mb-2 text-sm font-semibold">{L.transitions}</h2>
        {replay.transitions.length === 0 ? <p className="text-sm text-muted">{L.noTransitions}</p> : (
          <ul className="space-y-1 text-sm">
            {replay.transitions.slice(-10).reverse().map((t) => (
              <li key={t.at} className="tabular flex gap-3"><span className="text-muted">{formatDhakaTime(new Date(t.at).toISOString(), locale)}</span>{t.from} → {t.to}</li>
            ))}
          </ul>
        )}
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{L.incidents}</h2>
        {reset.show && (
          <ActionForm action={resetFireAction} submitLabel={R.resetFire} variant="danger" disabled={!reset.enabled || !snap.device}>
            <input type="hidden" name="deviceId" value={snap.device?.id ?? ""} />
          </ActionForm>
        )}
        {snap.incidents.length === 0 ? <p className="text-sm text-muted">{L.noIncidents}</p> : (
          <ul className="space-y-2">
            {snap.incidents.map((i) => (
              <li key={i.id}>
                <Card className="flex flex-wrap items-center gap-3">
                  <Badge tone={i.severity === "CRITICAL" || i.severity === "DANGER" ? "danger" : "warning"}>{i.incident_type}</Badge>
                  <span className="tabular text-sm text-muted">{formatDhakaDateTime(i.occurred_at, locale)}</span>
                  <Link href={`/incidents/${i.id}`} className="text-sm text-indigo hover:underline">{L.source}</Link>
                  <div className="ml-auto">
                    {i.state === "OPEN"
                      ? <ActionForm action={ackIncidentAction} submitLabel="Acknowledge" variant="secondary"><input type="hidden" name="incidentId" value={i.id} /></ActionForm>
                      : <Badge tone="safe">{i.state}</Badge>}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
