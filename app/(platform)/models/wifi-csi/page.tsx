import { cookies } from "next/headers";
import Link from "next/link";
import { labelsFor, resolveLocale } from "@/i18n/dictionaries";
import { pageRole, STAFF } from "@/server/auth/guard";
import { getLatestEvaluation } from "@/features/models/queries";
import { query } from "@/lib/db";
import { ModelMetricPanel } from "@/components/models/ModelMetricPanel";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

const LABELS = ["EMPTY", "ZONE_1", "ZONE_2", "ZONE_3", "ZONE_4"] as const;

// Model Lab (Level 11). Sample counts are real rows from the labelled collection (server-only table).
export default async function CsiModelPage() {
  await pageRole(STAFF);
  const locale = resolveLocale((await cookies()).get("locale")?.value);
  const L = labelsFor(locale, "mdl");

  const [ev, counts, ds] = await Promise.all([
    getLatestEvaluation("WIFI_CSI_LOCALIZATION"),
    query<{ label: string; split: string; n: string }>(
      `select label, split, count(*)::text n from public.csi_labelled_samples
       where dataset_version_id = (select id from public.csi_dataset_versions order by created_at desc limit 1) group by 1, 2`).catch(() => []),
    query<{ version: string; status: string }>("select version, status from public.csi_dataset_versions order by created_at desc limit 1").catch(() => []),
  ]);
  const get = (label: string, split: string) => Number(counts.find((c) => c.label === label && c.split === split)?.n ?? 0);
  const total = counts.reduce((s, c) => s + Number(c.n), 0);
  const held = counts.filter((c) => c.split === "HELD_OUT").reduce((s, c) => s + Number(c.n), 0);
  const heldOk = total > 0 && held * 5 >= total;
  const allClasses = LABELS.every((l) => get(l, "TRAIN") + get(l, "HELD_OUT") > 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">{L.csiTitle}</h1>
        <Link href="/models/hand-raise" className="text-sm text-indigo hover:underline">{L.handTitle} →</Link>
      </div>
      <p className="text-xs text-muted">{L.csiNote}</p>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold">{L.dataset}</h2>
        {total === 0 ? <p className="text-sm text-muted">{L.noDataset}</p> : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="tabular text-sm text-muted">{ds[0]?.version}</span>
              <Badge tone={allClasses ? "safe" : "warning"}>{L.allZones}</Badge>
              <Badge tone={heldOk ? "safe" : "warning"}>{L.heldOut20}</Badge>
            </div>
            <table className="tabular w-full text-sm">
              <thead><tr className="text-left text-xs text-muted"><th className="py-1">{L.class}</th><th>{L.train}</th><th>{L.heldOutSet}</th><th>{L.total}</th></tr></thead>
              <tbody>{LABELS.map((l) => (<tr key={l}><td className="py-1">{l}</td><td>{get(l, "TRAIN")}</td><td>{get(l, "HELD_OUT")}</td><td>{get(l, "TRAIN") + get(l, "HELD_OUT")}</td></tr>))}</tbody>
            </table>
            <p className="text-xs text-muted">{L.csiSplitNote}</p>
          </>
        )}
      </Card>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{L.results}</h2>
        <ModelMetricPanel evaluation={ev} labels={L} locale={locale} />
      </section>
    </div>
  );
}
