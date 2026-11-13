import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export type Tint = "none" | "periwinkle" | "cyan" | "mint" | "amber" | "coral";

const tints: Record<Tint, string> = {
  none: "bg-card",
  periwinkle: "bg-periwinkle",
  cyan: "bg-cyan-tint",
  mint: "bg-mint",
  amber: "bg-amber-tint",
  coral: "bg-coral",
};

export function Card({
  tint = "none",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { tint?: Tint }) {
  return (
    <div
      className={cn(
        "rounded-card border border-border p-5 shadow-card",
        tints[tint],
        className,
      )}
      {...props}
    />
  );
}
