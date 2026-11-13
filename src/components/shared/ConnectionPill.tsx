import { cn } from "@/components/ui/cn";

export type ConnState = "ONLINE" | "OFFLINE" | "DELAYED" | "STALE" | "UNKNOWN";

const map: Record<ConnState, { dot: string; text: string; label: string }> = {
  ONLINE: { dot: "bg-safe", text: "text-safe", label: "Online" },
  OFFLINE: { dot: "bg-danger", text: "text-danger", label: "Offline" },
  DELAYED: { dot: "bg-warning", text: "text-warning", label: "Delayed" },
  STALE: { dot: "bg-warning", text: "text-warning", label: "Stale" },
  UNKNOWN: { dot: "bg-slate-400", text: "text-muted", label: "Unknown" },
};

// A stale/delayed value must never look live (Prompt 06 rule). Dot + word, not colour alone.
export function ConnectionPill({ state, rssi }: { state: ConnState; rssi?: number }) {
  const s = map[state];
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium shadow-pill">
      <span className={cn("size-2 rounded-full", s.dot, state === "ONLINE" && "animate-pulse")} aria-hidden />
      <span className={s.text}>{s.label}</span>
      {typeof rssi === "number" && <span className="tabular text-muted">{rssi} dBm</span>}
    </span>
  );
}
