"use client";

import { useActionState } from "react";
import { Button } from "./Button";
import { cn } from "./cn";

export interface ActionState { ok: boolean; message: string }
export const idle: ActionState = { ok: true, message: "" };

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/** Server-action form with a pending state and an accessible result message. */
export function ActionForm({
  action,
  submitLabel,
  variant = "primary",
  className,
  children,
  disabled,
}: {
  action: Action;
  submitLabel: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  className?: string;
  children?: React.ReactNode;
  disabled?: boolean;
}) {
  const [state, run, pending] = useActionState(action, idle);
  return (
    <form action={run} className={cn("flex flex-col gap-3", className)}>
      {children}
      <div className="flex items-center gap-3">
        <Button type="submit" variant={variant} disabled={pending || disabled} size="sm">
          {pending ? "Working…" : submitLabel}
        </Button>
        {state.message && (
          <p role={state.ok ? "status" : "alert"} className={cn("text-sm", state.ok ? "text-safe" : "text-danger")}>
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
