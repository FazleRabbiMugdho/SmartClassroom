import { describe, it, expect } from "vitest";
import { deriveLinkState, checkBleName, recoveryCheck, buildTimeline } from "@/features/resilience/recovery";

const NOW = Date.parse("2027-01-01T10:00:00Z");
const ago = (s: number) => new Date(NOW - s * 1000).toISOString();

describe("deriveLinkState", () => {
  it("silence beats whatever the device last reported", () => {
    expect(deriveLinkState("LIVE", ago(31), NOW)).toBe("OFFLINE");
    expect(deriveLinkState("SYNCING", ago(120), NOW)).toBe("OFFLINE");
  });
  it("uses the reported state while the device is talking", () => {
    expect(deriveLinkState("SYNCING", ago(2), NOW)).toBe("SYNCING");
    expect(deriveLinkState(null, ago(2), NOW)).toBe("LIVE");
    expect(deriveLinkState("LIVE", ago(30), NOW)).toBe("LIVE"); // exactly 30 s is still live
  });
  it("UNKNOWN when nothing was ever received", () => expect(deriveLinkState("LIVE", null, NOW)).toBe("UNKNOWN"));
});

describe("BLE name convention SC-<TeamID>-<STATE>", () => {
  it("accepts the paper's examples verbatim", () => {
    expect(checkBleName("SC-T07-OFFLINE", "T07")).toEqual({ present: true, valid: true, state: "OFFLINE" });
    expect(checkBleName("SC-T07-FIRE", "T07")).toEqual({ present: true, valid: true, state: "FIRE" });
  });
  it("flags a different team or a generic name (shown anyway, never rewritten)", () => {
    expect(checkBleName("SC-T09-OFFLINE", "T07").valid).toBe(false);
    expect(checkBleName("FR-T07", "T07")).toMatchObject({ present: true, valid: false });
    expect(checkBleName(null, "T07")).toEqual({ present: false, valid: false, state: null });
  });
});

describe("recoveryCheck (agreement within 20 s after a restart)", () => {
  const boot = 1_000_000;
  const snap = (status: string, door: string, offsetMs: number) => ({ status, door, deviceTs: boot + offsetMs });
  it("a latched FIRE that comes back as FIRE + UNLOCKED agrees", () => {
    expect(recoveryCheck(snap("FIRE", "UNLOCKED", -5000), snap("FIRE", "UNLOCKED", 8000), boot)).toMatchObject({ result: "AGREE", afterMs: 8000 });
  });
  it("losing the fire latch or the door state is a DISAGREE, spelled out", () => {
    const r = recoveryCheck(snap("FIRE", "UNLOCKED", -5000), snap("SAFE", "LOCKED", 8000), boot);
    expect(r.result).toBe("DISAGREE");
    expect(r).toMatchObject({ detail: expect.stringMatching(/door UNLOCKED -> LOCKED.*fire latch lost/) });
  });
  it("a first report later than 20 s is NO_REPORT, not a pass", () => {
    expect(recoveryCheck(snap("SAFE", "LOCKED", -1000), snap("SAFE", "LOCKED", 21_000), boot).result).toBe("NO_REPORT");
    expect(recoveryCheck(snap("SAFE", "LOCKED", -1000), snap("SAFE", "LOCKED", 20_000), boot).result).toBe("AGREE");
  });
  it("missing data is never agreement", () => {
    expect(recoveryCheck(null, snap("SAFE", "LOCKED", 1000), boot).result).toBe("NO_BASELINE");
    expect(recoveryCheck(snap("SAFE", "LOCKED", -1000), null, boot).result).toBe("NO_REPORT");
  });
});

describe("buildTimeline", () => {
  it("merges events, syncs and link changes newest-first and keeps the offline-sync flag", () => {
    const t = buildTimeline(
      [{ at: ago(100), type: "BOOT", detail: { reason: "POWER_ON" } }, { at: ago(50), type: "CARD_TAP", offline: true }],
      [{ at: ago(10), total: 5, accepted: 4, duplicates: 1, rejected: 0 }],
      [{ at: ago(60), sync_state: "OFFLINE", ap_active: true, ble_name: "SC-T07-OFFLINE", pending: 9 }],
    );
    expect(t.map((x) => x.kind)).toEqual(["SYNC", "EVENT", "LINK", "EVENT"]);
    expect(t[1].offlineSync).toBe(true);
    expect(t[3].detail).toBe("reason POWER_ON");
    expect(t[2].detail).toContain("AP on");
  });
});
