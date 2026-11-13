import { describe, it, expect } from "vitest";
import { nextStatus, replayStatus, isPlausible, heatIndexC, trendOf, DEFAULT_THRESHOLDS as TH, type Reading } from "@/features/safety/rules";

const r = (sec: number, tempC: number, rh = 60, quality: "good" | "bad" = "good"): Reading => ({ t: sec * 1000, tempC, rh, quality });

describe("entry thresholds (Level 3)", () => {
  it("WARNING at >=32 °C or >=85 %RH; not just below", () => {
    expect(nextStatus("SAFE", 31.9, 60, TH)).toBe("SAFE");
    expect(nextStatus("SAFE", 32, 60, TH)).toBe("WARNING");
    expect(nextStatus("SAFE", 25, 84.9, TH)).toBe("SAFE");
    expect(nextStatus("SAFE", 25, 85, TH)).toBe("WARNING");
  });
  it("DANGER at >=40 °C, straight from SAFE too", () => {
    expect(nextStatus("SAFE", 39.9, 60, TH)).toBe("WARNING");
    expect(nextStatus("SAFE", 40, 60, TH)).toBe("DANGER");
  });
});

describe("hysteresis: leave 2 °C below the limit", () => {
  it("DANGER holds until 38 °C or below, then falls to WARNING (not SAFE)", () => {
    expect(nextStatus("DANGER", 38.1, 60, TH)).toBe("DANGER");
    expect(nextStatus("DANGER", 38, 60, TH)).toBe("WARNING");
  });
  it("WARNING holds above 30 °C and until humidity <= 80 %", () => {
    expect(nextStatus("WARNING", 30.1, 60, TH)).toBe("WARNING");
    expect(nextStatus("WARNING", 30, 60, TH)).toBe("SAFE");
    expect(nextStatus("WARNING", 28, 80.1, TH)).toBe("WARNING");
    expect(nextStatus("WARNING", 28, 80, TH)).toBe("SAFE");
  });
  it("follows custom (Level 5) limits with the same 2 °C rule", () => {
    const custom = { warning: 45 - 10, danger: 45 };
    expect(nextStatus("DANGER", 43.1, 60, custom)).toBe("DANGER");
    expect(nextStatus("DANGER", 43, 60, custom)).toBe("WARNING");
  });
});

describe("3 s hold and invalid readings", () => {
  it("a new status counts only after holding 3 s", () => {
    const short = replayStatus([r(0, 33), r(1, 33), r(2, 33)], TH);
    expect(short.status).toBe("SAFE");
    const held = replayStatus([r(0, 33), r(1, 33), r(2, 33), r(3, 33)], TH);
    expect(held.status).toBe("WARNING");
    expect(held.transitions).toEqual([{ at: 3000, from: "SAFE", to: "WARNING" }]);
  });
  it("a blip that returns before 3 s does not change status", () => {
    expect(replayStatus([r(0, 33), r(1, 25), r(2, 33), r(3, 25)], TH).transitions).toHaveLength(0);
  });
  it("a full heat-up and cool-down goes DANGER -> WARNING -> SAFE, one transition each", () => {
    const rs: Reading[] = [];
    for (let s = 0; s < 10; s++) rs.push(r(s, 41));          // -> DANGER (after hold)
    for (let s = 10; s < 20; s++) rs.push(r(s, 37));         // <=38 -> WARNING
    for (let s = 20; s < 30; s++) rs.push(r(s, 29));         // <=30 & rh ok -> SAFE
    const out = replayStatus(rs, TH);
    expect(out.transitions.map((t) => t.to)).toEqual(["DANGER", "WARNING", "SAFE"]);
    expect(out.status).toBe("SAFE");
  });
  it("bad quality or out-of-range readings keep the last status and are never used", () => {
    const rs = [r(0, 33), r(1, 33), r(2, 33), r(3, 33), r(4, 99, 60, "good"), r(5, 10, 60, "bad"), r(6, 25, 5)];
    const out = replayStatus(rs, TH);
    expect(out.status).toBe("WARNING");
    expect(out.rejected).toBe(3);
  });
  it("plausibility bounds", () => {
    expect(isPlausible(0, 20)).toBe(true);
    expect(isPlausible(50, 90)).toBe(true);
    expect(isPlausible(-0.1, 50)).toBe(false);
    expect(isPlausible(25, 19.9)).toBe(false);
    expect(isPlausible(25, 90.1)).toBe(false);
  });
});

describe("heat index and trend", () => {
  it("heat index is at or above the air temperature when hot and humid", () => {
    expect(heatIndexC(32, 70)).toBeGreaterThan(36);
    expect(heatIndexC(29, 64)).toBeGreaterThan(29);
  });
  it("is deterministic and matches the NWS table for 90 °F / 70 %RH (~105 °F ≈ 40.6 °C)", () => {
    expect(heatIndexC(32.2, 70)).toBeCloseTo(40.6, 0);
  });
  it("trend uses the last 10 accepted readings", () => {
    const rising = Array.from({ length: 10 }, (_, i) => r(i, 28 + i * 0.3));
    const falling = Array.from({ length: 10 }, (_, i) => r(i, 31 - i * 0.3));
    const flat = Array.from({ length: 10 }, (_, i) => r(i, 29));
    expect(trendOf(rising)).toBe("RISING");
    expect(trendOf(falling)).toBe("FALLING");
    expect(trendOf(flat)).toBe("STABLE");
    expect(trendOf([r(0, 29)])).toBeNull();
  });
  it("trend ignores bad readings", () => {
    const rs = [...Array.from({ length: 6 }, (_, i) => r(i, 29)), r(6, 99, 60, "bad"), r(7, 29), r(8, 29)];
    expect(trendOf(rs)).toBe("STABLE");
  });
});
