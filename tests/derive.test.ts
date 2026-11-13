import { describe, it, expect } from "vitest";
import {
  deriveConnState, deriveSafety, canOfferResetFire, ageSeconds, deliveryLatencyMs, buildSeries,
} from "@/features/rooms/derive";

const NOW = Date.parse("2026-12-01T10:00:00Z");
const ago = (s: number) => new Date(NOW - s * 1000).toISOString();

describe("deriveConnState (freshness: stale never looks live)", () => {
  it("UNKNOWN without any receipt", () => expect(deriveConnState(null, NOW)).toBe("UNKNOWN"));
  it("ONLINE within 30 s", () => expect(deriveConnState(ago(5), NOW)).toBe("ONLINE"));
  it("boundary: exactly 30 s is still ONLINE, 31 s is DELAYED", () => {
    expect(deriveConnState(ago(30), NOW)).toBe("ONLINE");
    expect(deriveConnState(ago(31), NOW)).toBe("DELAYED");
  });
  it("STALE then OFFLINE as silence grows", () => {
    expect(deriveConnState(ago(300), NOW)).toBe("STALE");
    expect(deriveConnState(ago(3600), NOW)).toBe("OFFLINE");
  });
  it("garbage timestamps are UNKNOWN, not live", () => expect(deriveConnState("nope", NOW)).toBe("UNKNOWN"));
});

describe("deriveSafety (FIRE/PANIC persistent)", () => {
  it("FIRE status wins", () => expect(deriveSafety({ status: "FIRE" }, [])).toBe("FIRE"));
  it("an open FIRE incident keeps the banner even if telemetry already says SAFE", () =>
    expect(deriveSafety({ status: "SAFE" }, [{ incident_type: "FIRE", state: "OPEN" }])).toBe("FIRE"));
  it("an acknowledged-but-not-closed fire still shows (ack does not clear fire)", () =>
    expect(deriveSafety({ status: "SAFE" }, [{ incident_type: "FIRE", state: "ACKNOWLEDGED" }])).toBe("FIRE"));
  it("a closed fire no longer forces the banner", () =>
    expect(deriveSafety({ status: "SAFE" }, [{ incident_type: "FIRE", state: "CLOSED" }])).toBe("SAFE"));
  it("PANIC shows from an open incident", () =>
    expect(deriveSafety({ status: "SAFE" }, [{ incident_type: "PANIC", state: "OPEN" }])).toBe("PANIC"));
  it("falls back to the reported status, SAFE when no data", () => {
    expect(deriveSafety({ status: "WARNING" }, [])).toBe("WARNING");
    expect(deriveSafety(null, [])).toBe("SAFE");
  });
});

describe("canOfferResetFire (role + safety)", () => {
  it("hidden from Student and Guardian", () => {
    expect(canOfferResetFire("STUDENT", "FIRE", false).show).toBe(false);
    expect(canOfferResetFire("GUARDIAN", "FIRE", false).show).toBe(false);
  });
  it("hidden when not in FIRE", () => expect(canOfferResetFire("TEACHER", "SAFE", false).show).toBe(false));
  it("shown but disabled while flame present", () =>
    expect(canOfferResetFire("ADMIN", "FIRE", true)).toMatchObject({ show: true, enabled: false }));
  it("enabled for Teacher/Admin once flame is gone", () => {
    expect(canOfferResetFire("TEACHER", "FIRE", false)).toMatchObject({ show: true, enabled: true });
    expect(canOfferResetFire("ADMIN", "FIRE", false)).toMatchObject({ show: true, enabled: true });
  });
});

describe("buildSeries (no fake interpolation)", () => {
  const row = (s: number, q: "good" | "bad" = "good") => ({
    device_ts: new Date(NOW + s * 1000).toISOString(), temp_c: 30, rh: 60, heat_index_c: 32, quality: q,
  });
  it("breaks the line across a gap instead of interpolating", () => {
    const pts = buildSeries([row(0), row(5), row(300)]);
    expect(pts.some((p) => p.temp === null)).toBe(true);
    expect(pts.filter((p) => p.temp !== null)).toHaveLength(3);
  });
  it("does not plot quality=bad readings", () => {
    expect(buildSeries([row(0), row(5, "bad"), row(10)]).filter((p) => p.temp !== null)).toHaveLength(2);
  });
  it("continuous data has no null points", () => {
    expect(buildSeries([row(0), row(5), row(10)]).every((p) => p.temp !== null)).toBe(true);
  });
});

describe("helpers", () => {
  it("ageSeconds clamps at 0 and handles bad input", () => {
    expect(ageSeconds(ago(-10), NOW)).toBe(0);
    expect(ageSeconds(null, NOW)).toBeNull();
    expect(ageSeconds("x", NOW)).toBeNull();
  });
  it("deliveryLatencyMs measures client receipt vs server receipt", () =>
    expect(deliveryLatencyMs(ago(2), NOW)).toBe(2000));
});
