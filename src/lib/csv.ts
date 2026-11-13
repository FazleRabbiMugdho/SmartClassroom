export type Cell = string | number | boolean | null | undefined;

// Spreadsheet apps execute cells that start with these as formulas. Prefix text cells so an
// attacker-controlled value (e.g. a device name or notice text) cannot run a formula on export.
const RISKY = /^[=+\-@\t\r]/;

function cell(v: Cell): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  if (typeof v === "boolean") return v ? "true" : "false";
  const s = RISKY.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** RFC 4180 CSV with a UTF-8 BOM (so Excel reads Bangla correctly). */
export function toCsv(header: string[], rows: Cell[][]): string {
  return "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

export function csvResponse(name: string, body: string): Response {
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
      "cache-control": "no-store",
    },
  });
}
