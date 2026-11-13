import { cookies } from "next/headers";
import { CloudSun } from "lucide-react";
import { labelsFor, resolveLocale } from "@/i18n/dictionaries";
import { pageRole, STAFF } from "@/server/auth/guard";
import { getWeather, getActiveNotices } from "@/features/weather/queries";
import { addTestNoticeAction, withdrawNoticeAction } from "@/features/weather/actions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input, Select, Field } from "@/components/ui/Input";
import { ActionForm } from "@/components/ui/ActionForm";
import { EmptyState } from "@/components/ui/EmptyState";
import { DataFreshnessLabel } from "@/components/shared/DataFreshnessLabel";
import { formatDhakaDateTime, formatDhakaTime } from "@/lib/time";
import { STALE_AFTER_MS } from "@/features/weather/refresh";

export default async function WeatherPage() {
  const ctx = await pageRole(STAFF);
  const locale = resolveLocale((await cookies()).get("locale")?.value);
  const L = labelsFor(locale, "wx");
  const [w, notices] = await Promise.all([getWeather(), getActiveNotices()]);
  const tone = (s: string) => (s === "DANGER" ? "danger" : s === "WARNING" ? "warning" : "info") as "danger" | "warning" | "info";
  const srcLabel = (k: string) => (k === "FORECAST_DERIVED" ? L.derived : k === "TEST" ? L.test : L.official);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">{L.title}</h1>

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold">{L.current}</h2>
          {w.ageSeconds !== null && <DataFreshnessLabel ageSeconds={w.ageSeconds} staleAfterS={STALE_AFTER_MS / 1000} />}
          {w.stale && <Badge tone="warning">{L.stale}</Badge>}
        </div>
        {!w.current ? (
          <EmptyState icon={CloudSun} title={L.noWeather} description={L.noLocation} />
        ) : (
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              ["°C", `${w.current.temp_c.toFixed(1)}`], [L.feels, `${w.current.apparent_c.toFixed(1)} °C`],
              [L.wind, `${w.current.gust_kmh.toFixed(0)} km/h`], [L.rain, `${w.current.precip_mm.toFixed(1)} mm`],
            ].map(([k, v]) => (<div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="tabular text-2xl font-semibold">{v}</dd></div>))}
          </dl>
        )}
        {w.current && <p className="tabular mt-2 text-xs text-muted">{L.fetched}: {formatDhakaDateTime(w.fetched_at, locale)}</p>}
      </Card>

      {w.hourly.length > 0 && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold">{L.forecast}</h2>
          <ol className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs sm:grid-cols-6 lg:grid-cols-8">
            {w.hourly.map((h) => (
              <li key={h.time} className="tabular flex justify-between gap-2 border-b border-border/60 py-1">
                <span className="text-muted">{formatDhakaTime(h.time, locale).slice(0, 5)}</span>
                <span>{h.temp_c.toFixed(0)}°{h.precip_mm > 0 ? ` · ${h.precip_mm.toFixed(1)}mm` : ""}</span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{L.notices}</h2>
        <p className="text-xs text-muted">{L.noOfficial}</p>
        {notices.length === 0 ? <p className="text-sm text-muted">{L.none}</p> : (
          <ul className="space-y-2">
            {notices.map((n) => (
              <li key={n.id}>
                <Card className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={tone(n.severity)}>{n.severity}</Badge>
                    <span className="text-sm font-medium">{n.category.replace(/_/g, " ")}</span>
                    <Badge>{srcLabel(n.source_kind)}</Badge>
                    <span className="tabular ml-auto text-xs text-muted">{L.until} {formatDhakaDateTime(n.window_end, locale)}</span>
                  </div>
                  <p className="text-sm">{n.notice_text}</p>
                  <p className="text-xs text-muted">{L.source}: {n.source_name}</p>
                  {ctx.role === "ADMIN" && n.source_kind === "TEST" && (
                    <ActionForm action={withdrawNoticeAction} submitLabel={L.withdraw} variant="secondary">
                      <input type="hidden" name="noticeId" value={n.id} />
                    </ActionForm>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {ctx.role === "ADMIN" && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold">{L.addTest}</h2>
          <ActionForm action={addTestNoticeAction} submitLabel={L.add}>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={L.category} htmlFor="category">
                <Select id="category" name="category"><option value="STORM">Storm</option><option value="CYCLONE">Cyclone</option><option value="HEAVY_RAIN_FLOOD">Heavy rain / flood</option><option value="HEATWAVE">Heatwave</option></Select>
              </Field>
              <Field label={L.severity} htmlFor="severity">
                <Select id="severity" name="severity"><option>ADVISORY</option><option>WARNING</option><option>DANGER</option></Select>
              </Field>
              <Field label={L.windowHours} htmlFor="hours"><Input id="hours" name="hours" type="number" min={1} max={48} defaultValue={2} /></Field>
            </div>
            <Field label={L.text} htmlFor="text"><Input id="text" name="text" maxLength={280} required /></Field>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
