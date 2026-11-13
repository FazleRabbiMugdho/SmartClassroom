import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { labelsFor } from "@/i18n/dictionaries";

// Guards against a page using a label that was never translated (it would render blank).
// A file declares which prefix its `L`/`R`/`H` variables hold via `labelsFor(locale, "prefix")`;
// components that receive `labels` as a prop are mapped explicitly below.
const COMPONENT_PREFIX: Record<string, string[]> = {
  "VisionConsole.tsx": ["vis"], "CameraViewport.tsx": ["vis"], "CameraFaultOverlay.tsx": ["vis"], "SeatMapEditor.tsx": ["vis"],
  "ReferenceUploader.tsx": ["vis"], "SeatOccupancyMap.tsx": ["vis"], "ModelMetricPanel.tsx": ["mdl"], "CsiZoneMap.tsx": ["csi"],
  "Stopwatch.tsx": ["jdg"], "EvidenceUploader.tsx": ["jdg"], "RoomDashboard.tsx": ["room"], "AssistantForm.tsx": ["ast"],
};

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (f !== "node_modules" && f !== ".next") walk(p, out); }
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

describe("every label key used in the UI exists", () => {
  const en = (prefix: string) => labelsFor("en", prefix);
  const files = [...walk("app"), ...walk("src")];

  for (const file of files) {
    const src = readFileSync(file, "utf8");
    const base = file.split(/[\\/]/).pop()!;
    // variable -> prefix from `const L = labelsFor(locale, "vis")` style declarations
    const vars: Record<string, string> = {};
    for (const m of src.matchAll(/const\s+(\w+)\s*=\s*labelsFor\(\s*[^,]+,\s*"(\w+)"\s*\)/g)) vars[m[1]] = m[2];
    const used: [string, string][] = [];
    for (const [v, prefix] of Object.entries(vars)) for (const m of src.matchAll(new RegExp(`\\b${v}\\.(\\w+)\\b`, "g"))) used.push([prefix, m[1]]);
    for (const prefix of COMPONENT_PREFIX[base] ?? []) for (const m of src.matchAll(/\blabels\.(\w+)\b/g)) used.push([prefix, m[1]]);
    if (used.length === 0) continue;

    it(`${file.replace(/\\/g, "/")}`, () => {
      const missing = used.filter(([prefix, key]) => !(key in en(prefix))).map(([p, k]) => `${p}.${k}`);
      expect([...new Set(missing)]).toEqual([]);
    });
  }
});
