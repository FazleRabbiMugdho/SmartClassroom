import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-border bg-card/60 px-6 py-12 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-periwinkle text-indigo">
        <Icon className="size-5" strokeWidth={1.75} aria-hidden />
      </span>
      <div className="space-y-1">
        <p className="font-semibold text-ink">{title}</p>
        {description && <p className="mx-auto max-w-sm text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
