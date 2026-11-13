"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CloudLightning } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

interface Notice { id: string; category: string; severity: string; source_kind: string; notice_text: string }

// Red Danger banner on every logged-in dashboard (Level 6, within 10 s). Realtime signals a
// change; we refetch the authoritative list. Derived/test notices are labelled as such.
export function WeatherBanner({ initial, label, derivedLabel, testLabel }: { initial: Notice[]; label: string; derivedLabel: string; testLabel: string }) {
  const [notices, setNotices] = useState(initial);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/weather/notices", { cache: "no-store" });
    if (res.ok) setNotices((await res.json()).notices);
  }, []);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const ch = supabase.channel("weather-notices")
      .on("postgres_changes", { event: "*", schema: "public", table: "weather_notices" }, () => void refetch())
      .subscribe((s) => { if (s === "SUBSCRIBED") void refetch(); });
    const poll = setInterval(refetch, 30_000); // also expires notices whose window ended
    return () => { void supabase.removeChannel(ch); clearInterval(poll); };
  }, [refetch]);

  const danger = notices.filter((n) => n.severity === "DANGER");
  if (danger.length === 0) return null;
  return (
    <div role="alert" className="space-y-1 border-b border-danger bg-danger px-4 py-2.5 text-white md:px-6">
      {danger.map((n) => (
        <Link key={n.id} href="/weather" className="flex items-start gap-2.5">
          <CloudLightning className="mt-0.5 size-5 shrink-0" aria-hidden />
          <span className="text-sm">
            <strong className="font-semibold">{label}: {n.category.replace(/_/g, " ")}</strong>{" "}
            <span className="text-white/90">{n.notice_text}</span>{" "}
            <span className="rounded bg-white/20 px-1.5 py-0.5 text-xs">{n.source_kind === "FORECAST_DERIVED" ? derivedLabel : n.source_kind === "TEST" ? testLabel : "Official"}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}
