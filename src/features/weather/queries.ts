import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CurrentWeather } from "./provider";
import type { HourPoint } from "./derive";
import { STALE_AFTER_MS } from "./refresh";

export interface WeatherView {
  current: (CurrentWeather & { fetched_at: string }) | null;
  hourly: HourPoint[];
  fetched_at: string | null;
  stale: boolean; // older than two missed fetches: never present it as current
  ageSeconds: number | null;
}
export interface NoticeRow {
  id: string; category: string; severity: "ADVISORY" | "WARNING" | "DANGER"; source_kind: "OFFICIAL" | "FORECAST_DERIVED" | "TEST";
  source_name: string; window_start: string; window_end: string; notice_text: string;
}

// RLS-bound: any member of the school can read weather. Nothing here reaches a provider.
export async function getWeather(nowMs = Date.now()): Promise<WeatherView> {
  const s = await createSupabaseServerClient();
  const [{ data: cur }, { data: fc }] = await Promise.all([
    s.from("weather_cache").select("payload, fetched_at").eq("data_kind", "CURRENT").order("fetched_at", { ascending: false }).limit(1).maybeSingle(),
    s.from("weather_cache").select("payload, fetched_at").eq("data_kind", "FORECAST_24H").order("fetched_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const fetched = cur?.fetched_at ?? null;
  const age = fetched ? Math.max(0, (nowMs - Date.parse(fetched)) / 1000) : null;
  return {
    current: cur ? { ...(cur.payload as CurrentWeather), fetched_at: cur.fetched_at } : null,
    hourly: (fc?.payload as HourPoint[] | undefined) ?? [],
    fetched_at: fetched,
    ageSeconds: age,
    stale: age !== null && age * 1000 >= STALE_AFTER_MS,
  };
}

/** Active (not withdrawn, window still open) notices, most severe first. */
export async function getActiveNotices(nowMs = Date.now()): Promise<NoticeRow[]> {
  const s = await createSupabaseServerClient();
  const { data } = await s.from("weather_notices")
    .select("id, category, severity, source_kind, source_name, window_start, window_end, notice_text")
    .is("withdrawn_at", null).gt("window_end", new Date(nowMs).toISOString()).lte("window_start", new Date(nowMs).toISOString());
  const rank = { DANGER: 0, WARNING: 1, ADVISORY: 2 } as const;
  return ((data ?? []) as NoticeRow[]).sort((a, b) => rank[a.severity] - rank[b.severity]);
}
