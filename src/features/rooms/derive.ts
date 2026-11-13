import type { ConnState } from "@/components/shared/ConnectionPill";
import type { SafetyState } from "@/components/shared/SafetyStateBanner";

// Pure derivations for the Command Centre. Kept free of React/IO so they are unit-tested.

export interface LatestTelemetry {
  device_ts: string; // ISO
  received_at: string; // ISO
  status: "SAFE" | "WARNING" | "DANGER" | "FIRE";
  flame: boolean;
  door: "LOCKED" | "UNLOCKED";
  quality: "good" | "bad";
}

export interface OpenIncident {
  incident_type: string;
  state: string;
}

const ONLINE_S = 30; // Level 2: offline within 30 s of silence
const STALE_S = 120; // data this old is shown as stale, never as live

/**
 * Connection state from the server's last receipt (not the device clock: skew-safe).
 *  - no receipt            -> UNKNOWN
 *  - <=30 s                -> ONLINE
 *  - 30..120 s             -> DELAYED
 *  - >120 s, still seen    -> OFFLINE after 2*STALE; STALE in between
 */
export function deriveConnState(lastSeenAt: string | null | undefined, nowMs: number): ConnState {
  if (!lastSeenAt) return "UNKNOWN";
  const age = (nowMs - Date.parse(lastSeenAt)) / 1000;
  if (Number.isNaN(age)) return "UNKNOWN";
  if (age <= ONLINE_S) return "ONLINE";
  if (age <= STALE_S) return "DELAYED";
  if (age <= STALE_S * 5) return "STALE";
  return "OFFLINE";
}

export function ageSeconds(iso: string | null | undefined, nowMs: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : Math.max(0, (nowMs - t) / 1000);
}

/**
 * Safety display state. An open FIRE/PANIC incident or FIRE status is persistent and wins:
 * it must stay visible until cleared (Level 3/4). Otherwise the latest reported status.
 */
export function deriveSafety(
  t: Pick<LatestTelemetry, "status"> | null,
  incidents: OpenIncident[],
): SafetyState {
  const open = incidents.filter((i) => i.state !== "CLOSED");
  if (open.some((i) => i.incident_type === "FIRE") || t?.status === "FIRE") return "FIRE";
  if (open.some((i) => i.incident_type === "PANIC")) return "PANIC";
  return t?.status ?? "SAFE";
}

/** Reset fire is offered only to Teacher/Admin, and only when no flame is reported. */
export function canOfferResetFire(
  role: "ADMIN" | "TEACHER" | "STUDENT" | "GUARDIAN",
  safety: SafetyState,
  flame: boolean | undefined,
): { show: boolean; enabled: boolean; reason?: string } {
  if (role !== "ADMIN" && role !== "TEACHER") return { show: false, enabled: false };
  if (safety !== "FIRE") return { show: false, enabled: false };
  if (flame) return { show: true, enabled: false, reason: "Flame present — cannot reset" };
  return { show: true, enabled: true };
}

export interface ChartPoint { t: number; temp: number | null; rh: number | null; hi: number | null }

/**
 * Chart data from stored readings. Gaps longer than `gapMs` become a null point so the
 * line breaks (no invented interpolation). Readings flagged quality=bad are not plotted.
 */
export function buildSeries(
  rows: { device_ts: string; temp_c: number; rh: number; heat_index_c: number; quality: "good" | "bad" }[],
  gapMs = 60_000,
): ChartPoint[] {
  const out: ChartPoint[] = [];
  let prev: number | null = null;
  for (const r of rows) {
    if (r.quality !== "good") continue;
    const t = Date.parse(r.device_ts);
    if (Number.isNaN(t)) continue;
    if (prev !== null && t - prev > gapMs) out.push({ t: prev + 1, temp: null, rh: null, hi: null });
    out.push({ t, temp: Number(r.temp_c), rh: Number(r.rh), hi: Number(r.heat_index_c) });
    prev = t;
  }
  return out;
}

/** Client-observed latency: client receipt minus server receipt. Device-clock skew is excluded on purpose. */
export function deliveryLatencyMs(serverReceivedAt: string, clientReceivedMs: number): number {
  return Math.max(0, clientReceivedMs - Date.parse(serverReceivedAt));
}
