import type { HTMLAttributes } from "react";
import { cn } from "./cn";

type Tone = "neutral" | "safe" | "warning" | "danger" | "info";

const tones: Record<Tone, string> = {
  neutral: "bg-canvas text-muted",
  safe: "bg-mint text-safe",
  warning: "bg-amber-tint text-warning",
  danger: "bg-coral text-danger",
  info: "bg-periwinkle text-indigo",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
