import { query } from "@/lib/db";
import { fetchWeather, WeatherUnavailable } from "./provider";
import { deriveNotices } from "./derive";

export const REFRESH_EVERY_MS = 15 * 60_000; // Level 6 individual text: every 15 minutes
export const STALE_AFTER_MS = 2 * REFRESH_EVERY_MS; // older than two missed fetches => "Data stale"

interface School { id: string; latitude: number; longitude: number }

/**
 * Fetch weather for every school with a location, at most once per 15 minutes each. On failure
 * the previous cache row is left untouched (the UI shows it with its age and "Data stale").
 */
export async function refreshWeatherIfDue(now = Date.now()): Promise<{ fetched: number; failed: number; skipped: number }> {
  const schools = await query<School>("select id, latitude::float8 as latitude, longitude::float8 as longitude from public.schools where latitude is not null and longitude is not null");
  let fetched = 0, failed = 0, skipped = 0;

  for (const s of schools) {
    const last = await query<{ fetched_at: string }>(
      "select fetched_at from public.weather_cache where location_key = $1 and data_kind = 'CURRENT' order by fetched_at desc limit 1",
      [s.id],
    );
    if (last[0] && now - Date.parse(last[0].fetched_at) < REFRESH_EVERY_MS) { skipped++; continue; }

    try {
      const w = await fetchWeather(s.latitude, s.longitude);
      await query(
        `insert into public.weather_cache (provider, location_key, data_kind, fetched_at, valid_from, valid_to, payload, source_meta)
         values ($1,$2,'CURRENT',$3,$3,null,$4::jsonb,$5::jsonb),
                ($1,$2,'FORECAST_24H',$3,$6,$7,$8::jsonb,$5::jsonb)`,
        [w.provider, s.id, w.fetched_at, JSON.stringify(w.current), JSON.stringify({ lat: s.latitude, lon: s.longitude }),
         w.hourly[0]?.time ?? null, w.hourly.at(-1)?.time ?? null, JSON.stringify(w.hourly)],
      );

      // Re-assert derived notices: withdraw all, then upsert the ones the new forecast still supports.
      await query("update public.weather_notices set withdrawn_at = now() where school_id = $1 and source_kind = 'FORECAST_DERIVED' and withdrawn_at is null", [s.id]);
      for (const n of deriveNotices(w.hourly)) {
        await query(
          `insert into public.weather_notices (school_id, category, severity, source_kind, source_name, window_start, window_end, notice_text)
           values ($1,$2,$3,'FORECAST_DERIVED','Open-Meteo forecast (derived)',$4,$5,$6)
           on conflict (school_id, category, window_start) where source_kind = 'FORECAST_DERIVED'
           do update set severity = excluded.severity, window_end = excluded.window_end, notice_text = excluded.notice_text, withdrawn_at = null`,
          [s.id, n.category, n.severity, n.window_start, n.window_end, n.text],
        );
      }
      fetched++;
    } catch (e) {
      if (!(e instanceof WeatherUnavailable)) throw e;
      failed++; // keep last known data; staleness is computed from fetched_at
    }
  }
  return { fetched, failed, skipped };
}
