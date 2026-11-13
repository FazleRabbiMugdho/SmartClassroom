"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Thermometer, Droplets, Gauge, DoorClosed, DoorOpen, Users, Cpu, CloudSun, ScanEye, Flame } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { ActionForm } from "@/components/ui/ActionForm";
import { MetricCard } from "@/components/shared/MetricCard";
import { ConnectionPill } from "@/components/shared/ConnectionPill";
import { DataFreshnessLabel } from "@/components/shared/DataFreshnessLabel";
import { SafetyStateBanner } from "@/components/shared/SafetyStateBanner";
import { TelemetryChart } from "./TelemetryChart";
import { EventTimeline } from "./EventTimeline";
import { resetFireAction } from "@/features/rooms/actions";
import { ageSeconds, canOfferResetFire, deliveryLatencyMs, deriveConnState, deriveSafety } from "@/features/rooms/derive";
import type { RoomSnapshot } from "@/features/rooms/queries";
import { formatDhakaDateTime } from "@/lib/time";

const TABLES = ["telemetry_readings", "device_events", "security_incidents", "device_health_snapshots", "attendance_records"] as const;

export function RoomDashboard({
  initial,
  role,
  labels,
  locale,
  simulated,
}: {
  initial: RoomSnapshot;
  role: "ADMIN" | "TEACHER" | "STUDENT" | "GUARDIAN";
  labels: Record<string, string>;
  locale: "en" | "bn";
  simulated: boolean;
}) {
  const roomId = initial.room!.id;
  const [snap, setSnap] = useState(initial);
  const [minutes, setMinutes] = useState(60);
  const [now, setNow] = useState(() => Date.now());
  const [live, setLive] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const minutesRef = useRef(minutes);
  minutesRef.current = minutes;

  // The snapshot route is the source of truth. Realtime only signals a change; we refetch
  // (debounced). The same refetch reconciles state after any reconnect.
  const refetch = useCallback(async () => {
    const res = await fetch(`/api/rooms/${roomId}/snapshot?minutes=${minutesRef.current}`, { cache: "no-store" });
    if (res.ok) setSnap(await res.json());
  }, [roomId]);
  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(refetch, 250);
  }, [refetch]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase.channel(`room:${roomId}`);
    for (const table of TABLES) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        (payload) => {
          const received = (payload.new as { received_at?: string } | null)?.received_at;
          if (received) setLatencyMs(deliveryLatencyMs(received, Date.now()));
          schedule();
        },
      );
    }
    channel.subscribe((status) => {
      setLive(status === "SUBSCRIBED");
      if (status === "SUBSCRIBED") void refetch(); // reconcile on (re)connect
    });
    return () => {
      void supabase.removeChannel(channel);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [roomId, schedule, refetch]);

  // Re-derive freshness every second so a silent device visibly goes stale.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => { void refetch(); }, [minutes, refetch]);

  const { latest, device, health, attendance } = snap;
  const conn = deriveConnState(device?.last_seen_at, now);
  const safety = deriveSafety(latest, snap.incidents);
  const reset = canOfferResetFire(role, safety, latest?.flame);
  const age = ageSeconds(device?.last_seen_at, now);
  const dash = "—";
  const num = (v: number | undefined, d = 1) => (v === undefined || v === null ? dash : Number(v).toFixed(d));
  const stale = conn !== "ONLINE";

  return (
    <div className="space-y-5">
      {simulated && (
        <p role="note" className="rounded-lg border border-amber-200 bg-amber-tint px-3 py-2 text-sm text-warning">{labels.simBanner}</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <ConnectionPill state={conn} rssi={latest?.rssi} />
        {age !== null && <DataFreshnessLabel ageSeconds={age} />}
        <span className="tabular ml-auto text-xs text-muted">
          {live ? labels.live : labels.reconnecting}
          {latencyMs !== null && ` · ${labels.latency} ${latencyMs} ms`}
        </span>
      </div>

      {/* Persistent while active: sticks under the header so it cannot scroll away. */}
      <div className={safety === "FIRE" || safety === "PANIC" ? "sticky top-[60px] z-20" : ""}>
        <SafetyStateBanner
          state={safety}
          detail={safety === "FIRE" ? `${labels.doorSimulated}: ${latest?.door === "UNLOCKED" ? labels.unlocked : latest?.door ?? dash}` : undefined}
        />
        {reset.show && (
          <div className="mt-2 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
            <Flame className="size-4 text-danger" aria-hidden />
            <ActionForm action={resetFireAction} submitLabel={labels.resetFire} variant="danger" disabled={!reset.enabled || !device}>
              <input type="hidden" name="deviceId" value={device?.id ?? ""} />
            </ActionForm>
            <span className="text-xs text-muted">{reset.enabled ? labels.resetFireHint : reset.reason}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Users} tint="periwinkle" label={labels.attendance}
          value={attendance ? `${attendance.present + attendance.late}/${attendance.enrolled}` : dash}
          sub={attendance ? `${attendance.present} ${labels.present} · ${attendance.late} ${labels.late} · ${attendance.absent} ${labels.absent}` : labels.noClass}
        />
        <MetricCard icon={Thermometer} tint="cyan" label={labels.temperature} value={num(latest?.temp_c)} unit="°C"
          sub={latest ? `${labels.trend}: ${latest.heat_trend}${latest.quality === "bad" ? " · quality bad" : ""}` : labels.noReading} />
        <MetricCard icon={Droplets} tint="cyan" label={labels.humidity} value={num(latest?.rh, 0)} unit="%" />
        <MetricCard icon={Gauge} tint="cyan" label={labels.heatIndex} value={num(latest?.heat_index_c)} unit="°C" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card tint={latest?.door === "UNLOCKED" ? "mint" : "amber"} className="flex items-center gap-4">
          {latest?.door === "UNLOCKED" ? <DoorOpen className="size-8 text-safe" aria-hidden /> : <DoorClosed className="size-8 text-warning" aria-hidden />}
          <div>
            <p className="text-[13px] font-medium text-muted">{labels.doorSimulated}</p>
            <p className="text-xl font-semibold">{latest ? (latest.door === "UNLOCKED" ? labels.unlocked : labels.locked) : dash}</p>
            <p className="tabular text-xs text-muted">{formatDhakaDateTime(latest?.device_ts, locale)}</p>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <div className="mb-3 flex items-center gap-2">
            <Cpu className="size-4 text-muted" aria-hidden />
            <h2 className="text-sm font-semibold">{labels.health}</h2>
            {device && <Badge className="ml-auto">{device.device_code}</Badge>}
          </div>
          {!device ? (
            <p className="text-sm text-muted">{labels.noDevice}</p>
          ) : (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              {[
                [labels.lastSeen, formatDhakaDateTime(device.last_seen_at, locale)],
                [labels.uptime, health ? `${Math.floor(health.uptime_s / 60)} min` : dash],
                [labels.rssi, health ? `${health.rssi} dBm` : latest ? `${latest.rssi} dBm` : dash],
                [labels.heap, health ? `${health.free_heap_kb} KB` : dash],
                [labels.chipTemp, health ? `${Number(health.chip_temp_c).toFixed(1)} °C` : dash],
                [labels.firmware, health?.fw ?? device.firmware_version ?? dash],
                [labels.resetReason, health?.reset_reason ?? dash],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="tabular text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </Card>
      </div>

      <Card className={stale && latest ? "opacity-90" : ""}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">{labels.chart}</h2>
          <Tabs value={String(minutes)} onChange={(v) => setMinutes(Number(v))}
            items={[{ value: "60", label: labels.p1 }, { value: "360", label: labels.p6 }, { value: "1440", label: labels.p24 }]} />
        </div>
        <TelemetryChart series={snap.series} />
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-2 text-sm font-semibold">{labels.timeline}</h2>
          <EventTimeline events={snap.events} empty={labels.noEvents} />
        </Card>
        <div className="space-y-4">
          <Card>
            <div className="mb-2 flex items-center gap-2"><CloudSun className="size-4 text-muted" aria-hidden /><h2 className="text-sm font-semibold">{labels.weather}</h2></div>
            {snap.weather.current ? (
              <div className="space-y-1">
                <p className="tabular text-2xl font-semibold">{snap.weather.current.temp_c.toFixed(1)} °C <span className="text-sm font-normal text-muted">{snap.weather.current.humidity}%</span></p>
                {snap.weather.ageSeconds !== null && <DataFreshnessLabel ageSeconds={snap.weather.ageSeconds} staleAfterS={1800} />}
              </div>
            ) : (
              <p className="text-sm text-muted">{labels.weatherPending}</p>
            )}
          </Card>
          <Card>
            <div className="mb-2 flex items-center gap-2"><ScanEye className="size-4 text-muted" aria-hidden /><h2 className="text-sm font-semibold">{labels.occupancy}</h2></div>
            <p className="text-sm text-muted">{labels.occupancyPending}</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
