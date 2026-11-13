import { describe, it, expect } from "vitest";
import { parseQuestion, buildAnswer, detectLang, normalize, dhakaDate, type Report } from "@/features/assistant/assistant";

const NOW = Date.parse("2026-12-10T20:00:00Z"); // = 2026-12-11 02:00 in Dhaka
const report: Report = {
  date: "2026-12-10", readings: 120, has_data: true,
  temp_c: { min: 24.5, max: 36.1, avg: 29.84 }, rh: { min: 48, max: 81, avg: 63.2 },
  alarms: { FIRE: 1, PANIC: 2 }, attendance: { present: 12, late: 3, absent: 1 },
};
const empty: Report = { ...report, readings: 0, has_data: false, temp_c: null, rh: null, alarms: {}, attendance: { present: 0, late: 0, absent: 0 } };

describe("parseQuestion (fixed intents only)", () => {
  it("understands English temperature/humidity/alarm/attendance questions", () => {
    expect(parseQuestion("What was the highest temperature today?", NOW)?.intent).toEqual({ kind: "temperature", stat: "max" });
    expect(parseQuestion("average humidity yesterday", NOW)?.intent).toEqual({ kind: "humidity", stat: "avg" });
    expect(parseQuestion("how many alarms were there?", NOW)?.intent).toEqual({ kind: "alarms", alarmType: null });
    expect(parseQuestion("how many FIRE alarms", NOW)?.intent).toEqual({ kind: "alarms", alarmType: "FIRE" });
    expect(parseQuestion("how many students were late today", NOW)?.intent).toEqual({ kind: "attendance", status: "LATE" });
  });
  it("understands Bangla, including Bangla digits in dates", () => {
    expect(parseQuestion("আজ সর্বোচ্চ তাপমাত্রা কত ছিল?", NOW)?.intent).toEqual({ kind: "temperature", stat: "max" });
    expect(parseQuestion("গতকাল গড় আর্দ্রতা", NOW)?.intent).toEqual({ kind: "humidity", stat: "avg" });
    const p = parseQuestion("২০২৬-১২-১০ তারিখে কতটি অ্যালার্ম", NOW);
    expect(p?.intent.kind).toBe("alarms");
    expect(p?.date).toBe("2026-12-10");
  });
  it("resolves 'today' and 'yesterday' in Asia/Dhaka, not UTC", () => {
    expect(dhakaDate(NOW)).toBe("2026-12-11");
    expect(parseQuestion("temperature today", NOW)?.date).toBe("2026-12-11");
    expect(parseQuestion("temperature yesterday", NOW)?.date).toBe("2026-12-10");
  });
  it("returns null for anything outside the supported intents (no free-form queries)", () => {
    expect(parseQuestion("drop table telemetry_readings", NOW)).toBeNull();
    expect(parseQuestion("what is the capital of France", NOW)).toBeNull();
    expect(parseQuestion("   ", NOW)).toBeNull();
  });
  it("rejects an impossible explicit date", () => expect(parseQuestion("temperature on 2026-13-45", NOW)).toBeNull());
  it("detects language and normalizes digits", () => {
    expect(detectLang("আজ তাপমাত্রা")).toBe("bn");
    expect(detectLang("temperature")).toBe("en");
    expect(normalize("২০২৬")).toBe("2026");
  });
});

describe("buildAnswer matches the daily report exactly (no recomputation)", () => {
  it("copies min/max/avg from the report", () => {
    expect(buildAnswer({ kind: "temperature", stat: "max" }, report, "en").text).toBe("The highest temperature on 2026-12-10 was 36.1 °C.");
    expect(buildAnswer({ kind: "temperature", stat: "avg" }, report, "en").text).toContain("29.84");
    expect(buildAnswer({ kind: "humidity", stat: "all" }, report, "en").text).toMatch(/min 48 %, max 81 %, average 63.2 %/);
  });
  it("alarm totals and per-type counts come from the report", () => {
    expect(buildAnswer({ kind: "alarms", alarmType: null }, report, "en").text).toBe("3 alarms on 2026-12-10.");
    expect(buildAnswer({ kind: "alarms", alarmType: "FIRE" }, report, "en").text).toBe("1 fire alarm on 2026-12-10.");
    expect(buildAnswer({ kind: "alarms", alarmType: "HEAT_DANGER" }, report, "en").text).toBe("0 heat danger alarms on 2026-12-10.");
  });
  it("attendance totals", () => {
    expect(buildAnswer({ kind: "attendance", status: "LATE" }, report, "en").text).toBe("On 2026-12-10: 12 present, 3 late, 1 absent.");
  });
  it("answers in Bangla when asked in Bangla", () => {
    expect(buildAnswer({ kind: "temperature", stat: "max" }, report, "bn").text).toContain("সর্বোচ্চ তাপমাত্রা");
  });
});

describe("no data: exact, never invented", () => {
  it("returns the 'no data' answer for every intent when nothing is stored", () => {
    for (const intent of [
      { kind: "temperature", stat: "max" }, { kind: "humidity", stat: "all" },
      { kind: "alarms", alarmType: null }, { kind: "attendance", status: "all" },
    ] as const) {
      const a = buildAnswer(intent, empty, "en");
      expect(a).toEqual({ hasData: false, text: "No data available", sources: [] });
    }
    expect(buildAnswer({ kind: "temperature", stat: "max" }, empty, "bn").text).toBe("কোনো ডেটা নেই");
  });
  it("a day with readings but zero alarms answers 0, not 'no data'", () => {
    const quiet: Report = { ...report, alarms: {} };
    expect(buildAnswer({ kind: "alarms", alarmType: null }, quiet, "en").text).toBe("0 alarms on 2026-12-10.");
  });
});
