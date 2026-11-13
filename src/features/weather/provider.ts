import type { HourPoint } from "./derive";

// Weather provider adapter. Open-Meteo needs no key; an optional OPEN_METEO_API_KEY (paid tier)
// is read server-side only and never reaches the browser. Replace this module to change provider.

export interface CurrentWeather { temp_c: number; humidity: number; apparent_c: number; precip_mm: number; wind_kmh: number; gust_kmh: number; code: number }
export interface WeatherData { provider: string; current: CurrentWeather; hourly: HourPoint[]; fetched_at: string }

export class WeatherUnavailable extends Error {}

interface OpenMeteo {
  current: { temperature_2m: number; relative_humidity_2m: number; apparent_temperature: number; precipitation: number; wind_speed_10m: number; wind_gusts_10m: number; weather_code: number };
  hourly: { time: string[]; temperature_2m: number[]; apparent_temperature: number[]; precipitation: number[]; wind_gusts_10m: number[] };
}

export async function fetchWeather(lat: number, lon: number): Promise<WeatherData> {
  const key = process.env.OPEN_METEO_API_KEY;
  const base = key ? "https://customer-api.open-meteo.com/v1/forecast" : "https://api.open-meteo.com/v1/forecast";
  const url = new URL(base);
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("current", "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,wind_speed_10m,wind_gusts_10m,weather_code");
  url.searchParams.set("hourly", "temperature_2m,apparent_temperature,precipitation,wind_gusts_10m");
  url.searchParams.set("forecast_hours", "24");
  url.searchParams.set("wind_speed_unit", "kmh");
  url.searchParams.set("timezone", "GMT");
  if (key) url.searchParams.set("apikey", key);

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
  } catch (e) {
    throw new WeatherUnavailable(e instanceof Error ? e.message : "network error");
  }
  if (!res.ok) throw new WeatherUnavailable(`weather service returned ${res.status}`);
  const j = (await res.json()) as OpenMeteo;
  if (!j.current || !j.hourly?.time) throw new WeatherUnavailable("unexpected weather response");

  return {
    provider: "open-meteo",
    fetched_at: new Date().toISOString(),
    current: {
      temp_c: j.current.temperature_2m, humidity: j.current.relative_humidity_2m, apparent_c: j.current.apparent_temperature,
      precip_mm: j.current.precipitation, wind_kmh: j.current.wind_speed_10m, gust_kmh: j.current.wind_gusts_10m, code: j.current.weather_code,
    },
    // timezone=GMT returns "2026-12-10T05:00": append seconds + Z so it parses as UTC.
    hourly: j.hourly.time.map((t, i) => ({
      time: `${t}:00Z`,
      temp_c: j.hourly.temperature_2m[i], apparent_c: j.hourly.apparent_temperature[i],
      precip_mm: j.hourly.precipitation[i] ?? 0, gust_kmh: j.hourly.wind_gusts_10m[i] ?? 0,
    })),
  };
}
