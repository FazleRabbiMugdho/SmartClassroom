import { Check, X } from "lucide-react";
import { cn } from "@/components/ui/cn";

const STEPS = ["PENDING", "DELIVERED", "RECEIVED", "APPLIED", "ACKNOWLEDGED"] as const;
const FAILED = new Set(["FAILED", "EXPIRED", "REJECTED", "SUPERSEDED"]);

// Shows how far a command got. The UI never claims "applied" before the device says so.
export function CommandStatusStepper({ state }: { state: string }) {
  const failed = FAILED.has(state);
  const at = STEPS.indexOf(state as (typeof STEPS)[number]);
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" aria-label={`Command state ${state}`}>
      {STEPS.map((s, i) => {
        const done = !failed && at >= i;
        return (
          <li key={s} className="flex items-center gap-1.5">
            <span className={cn("flex size-4 items-center justify-center rounded-full", done ? "bg-safe text-white" : "bg-border text-muted")}>
              {done && <Check className="size-3" strokeWidth={3} aria-hidden />}
            </span>
            <span className={done ? "text-ink" : "text-muted"}>{s.charAt(0) + s.slice(1).toLowerCase()}</span>
            {i < STEPS.length - 1 && <span className="mx-1 h-px w-4 bg-border" aria-hidden />}
          </li>
        );
      })}
      {failed && (
        <li className="flex items-center gap-1.5 font-medium text-danger">
          <X className="size-4" aria-hidden /> {state}
        </li>
      )}
    </ol>
  );
}
