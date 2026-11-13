import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";
import { cn } from "./cn";

const field =
  "h-9 w-full rounded-lg border border-border bg-card px-3 text-sm text-ink " +
  "placeholder:text-slate-400 transition-shadow hover:border-slate-300";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(field, className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(field, "pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-muted">
        {label}
      </label>
      {children}
    </div>
  );
}
