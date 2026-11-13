"use client";

import { useEffect, useState } from "react";

// Minimal dev smoke dashboard proving the mock device drives the UI without
// hardware. The real role-aware, design-system dashboard (Part D) is built from
// Prompt 04 (M4) onward; this page is intentionally plain.
interface State {
  telemetry: Record<string, unknown> | null;
  health: Record<string, unknown> | null;
  events: { seq: number; type: string; ts: number; device_id: string }[];
}

const mono = { fontFamily: "ui-monospace, monospace" } as const;

export default function Page() {
  const [state, setState] = useState<State | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = () =>
      fetch("/api/internal/state")
        .then((r) => r.json())
        .then((s) => alive && setState(s))
        .catch(() => {});
    tick();
    const id = setInterval(tick, 3000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const t = state?.telemetry;
  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1>SmartClass — dev telemetry monitor</h1>
      <p style={{ color: "#475569" }}>
        Mock-device smoke view (Prompt 01). Not the product UI.
      </p>

      <h2>Latest telemetry</h2>
      {t ? (
        <pre style={{ ...mono, background: "#F4F6FB", padding: 12, overflowX: "auto" }}>
          {JSON.stringify(t, null, 2)}
        </pre>
      ) : (
        <p>No telemetry yet. Run <code>npm run mock</code> while <code>npm run dev</code> is up.</p>
      )}

      <h2>Recent events ({state?.events.length ?? 0})</h2>
      <table style={{ ...mono, borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            {["seq", "type", "ts", "device_id"].map((h) => (
              <th key={h} style={{ textAlign: "left", borderBottom: "1px solid #E2E8F0", padding: 6 }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(state?.events ?? []).map((e, i) => (
            <tr key={`${e.device_id}:${e.seq}:${i}`}>
              <td style={{ padding: 6 }}>{e.seq}</td>
              <td style={{ padding: 6 }}>{e.type}</td>
              <td style={{ padding: 6 }}>{e.ts}</td>
              <td style={{ padding: 6 }}>{e.device_id}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
