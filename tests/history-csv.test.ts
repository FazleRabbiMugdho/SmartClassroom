import { describe, it, expect } from "vitest";
import { toCsv } from "@/lib/csv";
import { parseEventFilters, eventFilterPlan, applyPlan, dhakaLocalToIso, eventSeverity, EVENT_TYPES } from "@/features/history/filters";

describe("toCsv", () => {
  it("quotes commas, quotes and newlines (RFC 4180) and starts with a UTF-8 BOM", () => {
    const out = toCsv(["a", "b"], [["x,y", 'he said "hi"'], ["line1\nline2", 3]]);
    expect(out.startsWith("﻿")).toBe(true);
    expect(out).toContain('"x,y","he said ""hi"""');
    expect(out).toContain('"line1\nline2",3');
  });
  it("neutralizes spreadsheet formulas in text but keeps real negative numbers", () => {
    const out = toCsv(["v"], [["=HYPERLINK(\"http://evil\")"], ["+1+1"], ["-cmd"], ["@sum"], [-5], [0]]);
    expect(out).toContain("'=HYPERLINK");
    expect(out).toContain("'+1+1");
    expect(out).toContain("'-cmd");
    expect(out).toContain("'@sum");
    expect(out).toContain("\r\n-5\r\n");
  });
  it("renders null, undefined, NaN as empty and booleans as words; keeps Bangla intact", () => {
    expect(toCsv(["a", "b", "c", "d"], [[null, undefined, NaN, true]])).toContain(",,,true");
    expect(toCsv(["n"], [["অ্যালার্ম"]])).toContain("অ্যালার্ম");
  });
});

describe("event filters (page and CSV share one plan)", () => {
  it("turns Dhaka local time into UTC", () => {
    expect(dhakaLocalToIso("2026-12-10T06:00")).toBe("2026-12-10T00:00:00.000Z");
    expect(dhakaLocalToIso("2026-12-10")).toBeNull();
    expect(dhakaLocalToIso("garbage")).toBeNull();
  });
  it("only accepts known event types; ignores unknown (no injection into the query)", () => {
    expect(parseEventFilters("r1", { type: "FIRE" }).type).toBe("FIRE");
    expect(parseEventFilters("r1", { type: "FIRE; drop table x" }).type).toBeNull();
    expect(EVENT_TYPES).toContain("CARD_TAP");
  });
  it("always scopes to the room and builds the expected plan", () => {
    const f = parseEventFilters("room-1", { type: "PANIC", from: "2026-12-10T06:00", to: "2026-12-10T08:00", page: "2" });
    expect(f.page).toBe(2);
    expect(eventFilterPlan(f)).toEqual([
      ["eq", "room_id", "room-1"], ["eq", "event_type", "PANIC"],
      ["gte", "received_at", "2026-12-10T00:00:00.000Z"], ["lt", "received_at", "2026-12-10T02:01:00.000Z"],
    ]);
  });
  it("no filters => only the room scope; bad page clamps to 1", () => {
    expect(eventFilterPlan(parseEventFilters("r", {}))).toEqual([["eq", "room_id", "r"]]);
    expect(parseEventFilters("r", { page: "-4" }).page).toBe(1);
  });
  it("applyPlan applies each op in order to a builder", () => {
    const seen: string[] = [];
    const b: Record<string, unknown> = {};
    for (const op of ["eq", "gte", "lt"]) b[op] = (c: string, v: string) => { seen.push(`${op}:${c}=${v}`); return b; };
    applyPlan(b, [["eq", "room_id", "r"], ["gte", "received_at", "t"]]);
    expect(seen).toEqual(["eq:room_id=r", "gte:received_at=t"]);
  });
  it("severity classification", () => {
    expect(eventSeverity("FIRE")).toBe("CRITICAL");
    expect(eventSeverity("ENTRY_DENIED")).toBe("WARNING");
    expect(eventSeverity("ENTRY_GRANTED")).toBe("OK");
    expect(eventSeverity("CARD_TAP")).toBe("INFO");
  });
});
