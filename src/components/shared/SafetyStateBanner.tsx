import { ShieldCheck, TriangleAlert, Flame, Siren } from "lucide-react";
import { cn } from "@/components/ui/cn";

export type SafetyState = "SAFE" | "WARNING" | "DANGER" | "FIRE" | "PANIC";

const map = {
  SAFE: { icon: ShieldCheck, cls: "bg-mint text-safe border-mint", label: "Safe", loud: false },
  WARNING: { icon: TriangleAlert, cls: "bg-amber-tint text-warning border-amber-tint", label: "Warning", loud: false },
  DANGER: { icon: TriangleAlert, cls: "bg-coral text-danger border-coral", label: "Danger", loud: false },
  FIRE: { icon: Flame, cls: "bg-danger text-white border-danger", label: "Fire — evacuate", loud: true },
  PANIC: { icon: Siren, cls: "bg-danger text-white border-danger", label: "Panic", loud: true },
} as const;

// FIRE/PANIC are high-contrast and must stay visible (Level 3/4). Icon + word, not colour alone.
export function SafetyStateBanner({ state, detail }: { state: SafetyState; detail?: string }) {
  const s = map[state];
  const Icon = s.icon;
  return (
    <div
      role={s.loud ? "alert" : "status"}
      className={cn(
        "flex items-center gap-3 rounded-xl border px-4 py-3",
        s.cls,
        s.loud && "shadow-card",
      )}
    >
      <Icon className={cn("size-5 shrink-0", s.loud && "animate-pulse")} strokeWidth={2} aria-hidden />
      <div className="min-w-0">
        <p className="font-semibold leading-tight">{s.label}</p>
        {detail && <p className={cn("text-sm", s.loud ? "text-white/85" : "opacity-80")}>{detail}</p>}
      </div>
    </div>
  );
}
