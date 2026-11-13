import { cn } from "@/components/ui/cn";

// Shows data age. Over `staleAfterS` it reads "Data stale" — never show stale data as fresh.
export function DataFreshnessLabel({ ageSeconds, staleAfterS = 30 }: { ageSeconds: number; staleAfterS?: number }) {
  const stale = ageSeconds >= staleAfterS;
  const age = ageSeconds < 60 ? `${Math.max(0, Math.round(ageSeconds))}s` : `${Math.round(ageSeconds / 60)}m`;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", stale ? "text-warning" : "text-muted")}>
      <span className={cn("size-1.5 rounded-full", stale ? "bg-warning" : "bg-safe")} aria-hidden />
      {stale ? `Data stale · ${age} old` : `Updated ${age} ago`}
    </span>
  );
}
