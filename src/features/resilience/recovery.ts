// Level 12 helpers. Pure functions: nothing here invents device data; disagreement is surfaced.

export type LinkState = "LIVE" | "OFFLINE" | "SYNCING" | "UNKNOWN";
const SILENT_AFTER_S = 30; // Level 2: offline within 30 s of silence

/**
 * The device can only tell us it is "OFFLINE" before it loses the link, so the server also infers
 * it from silence: nothing received for 30 s => OFFLINE, whatever the last report said.
 */
export function deriveLinkState(reported: "LIVE" | "OFFLINE" | "SYNCING" | null | undefined, lastSeenAt: string | null | undefined, nowMs: number): LinkState {
  if (!lastSeenAt) return "UNKNOWN";
  const age = (nowMs - Date.parse(lastSeenAt)) / 1000;
  if (Number.isNaN(age)) return "UNKNOWN";
  if (age > SILENT_AFTER_S) return "OFFLINE";
  return reported ?? "LIVE";
}

/** BLE name convention (Level 12): SC-<TeamID>-<STATE>, e.g. SC-T07-OFFLINE. Shown verbatim; this only flags it. */
export function checkBleName(name: string | null | undefined, teamCode: string): { present: boolean; valid: boolean; state: string | null } {
  if (!name) return { present: false, valid: false, state: null };
  const m = name.match(/^SC-([A-Za-z0-9]+)-([A-Z_]+)$/);
  return { present: true, valid: !!m && m[1] === teamCode, state: m ? m[2] : null };
}

export interface Snapshot { status: string; door: string; deviceTs: number } // deviceTs in ms

export type RecoveryResult =
  | { result: "AGREE"; afterMs: number }
  | { result: "DISAGREE"; afterMs: number; detail: string }
  | { result: "NO_REPORT"; detail: string }
  | { result: "NO_BASELINE"; detail: string };

/**
 * After a restart the device state must come back as it was (e.g. a latched FIRE keeps FIRE +
 * UNLOCKED), and be reported within 20 s. Compares the last telemetry before the BOOT with the
 * first one after it. A mismatch is DISAGREE, never smoothed over.
 */
export function recoveryCheck(pre: Snapshot | null, post: Snapshot | null, bootAtMs: number, limitMs = 20_000): RecoveryResult {
  if (!pre) return { result: "NO_BASELINE", detail: "no telemetry before the restart to compare against" };
  if (!post) return { result: "NO_REPORT", detail: "no telemetry received after the restart" };
  const afterMs = post.deviceTs - bootAtMs;
  if (afterMs > limitMs) return { result: "NO_REPORT", detail: `first report came ${(afterMs / 1000).toFixed(1)} s after the restart (limit ${limitMs / 1000} s)` };
  const diffs: string[] = [];
  if (pre.door !== post.door) diffs.push(`door ${pre.door} -> ${post.door}`);
  if (pre.status === "FIRE" && post.status !== "FIRE") diffs.push(`fire latch lost (${post.status})`);
  if (pre.status !== "FIRE" && pre.status !== post.status && post.status === "FIRE") diffs.push(`status ${pre.status} -> FIRE`);
  return diffs.length ? { result: "DISAGREE", afterMs, detail: diffs.join("; ") } : { result: "AGREE", afterMs };
}

export type TimelineKind = "EVENT" | "SYNC" | "LINK";
export interface TimelineItem { at: number; kind: TimelineKind; label: string; detail?: string; offlineSync?: boolean }

export function buildTimeline(
  events: { at: string; type: string; detail?: Record<string, unknown>; offline?: boolean }[],
  syncs: { at: string; total: number; accepted: number; duplicates: number; rejected: number }[],
  links: { at: string; sync_state: string; ap_active: boolean; ble_name: string | null; pending: number }[],
): TimelineItem[] {
  const out: TimelineItem[] = [
    ...events.map((e): TimelineItem => ({
      at: Date.parse(e.at), kind: "EVENT", label: e.type, offlineSync: e.offline,
      detail: e.type === "BOOT" && typeof e.detail?.reason === "string" ? `reason ${e.detail.reason}` : undefined,
    })),
    ...syncs.map((s): TimelineItem => ({ at: Date.parse(s.at), kind: "SYNC", label: "SYNC", detail: `${s.accepted} new, ${s.duplicates} duplicate, ${s.rejected} rejected of ${s.total}` })),
    ...links.map((l): TimelineItem => ({ at: Date.parse(l.at), kind: "LINK", label: l.sync_state, detail: `${l.ap_active ? "AP on" : "AP off"}${l.ble_name ? ` · BLE ${l.ble_name}` : ""} · ${l.pending} pending` })),
  ];
  return out.filter((i) => !Number.isNaN(i.at)).sort((a, b) => b.at - a.at);
}
