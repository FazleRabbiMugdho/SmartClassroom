import type { LucideIcon } from "lucide-react";
import { Card, type Tint } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";

const badgeTint: Record<Exclude<Tint, "none">, string> = {
  periwinkle: "bg-white/70 text-indigo",
  cyan: "bg-white/70 text-cyan-700",
  mint: "bg-white/70 text-safe",
  amber: "bg-white/70 text-warning",
  coral: "bg-white/70 text-danger",
};

export function MetricCard({
  icon: Icon,
  label,
  value,
  unit,
  sub,
  tint = "periwinkle",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  unit?: string;
  sub?: React.ReactNode;
  tint?: Exclude<Tint, "none">;
}) {
  return (
    <Card tint={tint} className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-muted">{label}</span>
        <span className={cn("flex size-8 items-center justify-center rounded-lg", badgeTint[tint])}>
          <Icon className="size-4" strokeWidth={1.75} aria-hidden />
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="tabular text-3xl font-semibold leading-none text-ink">{value}</span>
        {unit && <span className="text-sm text-muted">{unit}</span>}
      </div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </Card>
  );
}
