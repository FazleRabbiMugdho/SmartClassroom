"use client";

import { useTransition } from "react";
import { setLocale } from "@/i18n/actions";
import type { Locale } from "@/i18n/dictionaries";
import { cn } from "@/components/ui/cn";

export function LocaleToggle({ locale }: { locale: Locale }) {
  const [pending, start] = useTransition();
  const choose = (l: Locale) => start(() => void setLocale(l));
  return (
    <div className="inline-flex items-center rounded-lg border border-border bg-card p-0.5 text-xs font-medium" role="group" aria-label="Language">
      {(["en", "bn"] as const).map((l) => (
        <button
          key={l}
          onClick={() => choose(l)}
          disabled={pending}
          aria-pressed={locale === l}
          className={cn("rounded-md px-2 py-1 transition-colors", locale === l ? "bg-indigo text-white" : "text-muted hover:text-ink")}
        >
          {l === "en" ? "EN" : "বাং"}
        </button>
      ))}
    </div>
  );
}
