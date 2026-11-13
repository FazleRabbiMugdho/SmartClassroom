import { cookies } from "next/headers";
import Link from "next/link";
import { labelsFor, resolveLocale } from "@/i18n/dictionaries";
import { pageRole, STAFF } from "@/server/auth/guard";
import { getHandRaiseDataset, getLatestEvaluation } from "@/features/models/queries";
import { ModelMetricPanel } from "@/components/models/ModelMetricPanel";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

// Model Lab (Level 10). Every number comes from stored records; with none it says "not evaluated".
export default async function HandRaiseModelPage() {
  await pageRole(STAFF);
  const locale = resolveLocale((await cookies()).get("locale")?.value);
  const L = labelsFor(locale, "mdl");
  const [ds, ev] = await Promise.all([getHandRaiseDataset(), getLatestEvaluation("HAND_RAISE")]);

  const total = ds ? ds.raised_count + ds.not_raised_count : 0;
  const held = ds ? ds.held_out_raised + ds.held_out_not_raised : 0;
  const okCounts = !!ds && ds.raised_count >= 100 && ds.not_raised_count >= 100;
  const okHeld = !!ds && total > 0 && held * 5 >= total;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">{L.handTitle}</h1>
        <Link href="/models/wifi-csi" className="text-sm text-indigo hover:underline">{L.csiTitle} →</Link>
      </div>
      <p className="text-xs text-muted">{L.handNote}</p>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold">{L.dataset}</h2>
        {!ds ? <p className="text-sm text-muted">{L.noDataset}</p> : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="tabular text-sm text-muted">{ds.version}</span>
              <Badge tone={ds.status === "READY" ? "safe" : "warning"}>{ds.status}</Badge>
              <Badge tone={okCounts ? "safe" : "warning"}>{L.min100}</Badge>
              <Badge tone={okHeld ? "safe" : "warning"}>{L.heldOut20}</Badge>
            </div>
            <table className="tabular w-full text-sm">
              <thead><tr className="text-left text-xs text-muted"><th className="py-1">{L.class}</th><th>{L.train}</th><th>{L.heldOutSet}</th><th>{L.total}</th></tr></thead>
              <tbody>
                <tr><td className="py-1">{L.raised}</td><td>{ds.raised_count - ds.held_out_raised}</td><td>{ds.held_out_raised}</td><td>{ds.raised_count}</td></tr>
                <tr><td className="py-1">{L.notRaised}</td><td>{ds.not_raised_count - ds.held_out_not_raised}</td><td>{ds.held_out_not_raised}</td><td>{ds.not_raised_count}</td></tr>
              </tbody>
            </table>
            <p className="text-xs text-muted">{L.splitNote}</p>
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
