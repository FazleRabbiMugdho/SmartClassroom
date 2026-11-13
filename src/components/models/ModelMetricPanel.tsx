import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ConfusionMatrix } from "./ConfusionMatrix";
import type { Evaluation } from "@/features/models/queries";
import { formatDhakaDateTime } from "@/lib/time";

// Shows ONLY real stored results. With none, it says "not evaluated" and shows nothing else.
export function ModelMetricPanel({ evaluation, labels, locale }: { evaluation: Evaluation | null; labels: Record<string, string>; locale: "en" | "bn" }) {
  if (!evaluation) {
    return (
      <Card tint="amber" className="space-y-1">
        <Badge tone="warning">{labels.notEvaluated}</Badge>
        <p className="text-sm text-muted">{labels.notEvaluatedBody}</p>
      </Card>
    );
  }
  const e = evaluation;
  const stat = (k: string, v: string) => (<div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="tabular text-2xl font-semibold">{v}</dd></div>);
  return (
    <Card className="space-y-4">
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stat(labels.accuracy, `${(e.accuracy * 100).toFixed(1)}%`)}
        {stat(labels.heldOut, `${e.heldOutCount} / ${e.sampleCount}`)}
        {e.avgPredictionMs !== null && stat(labels.latency, `${e.avgPredictionMs} ms`)}
        {e.presenceDelayMs !== null && stat(labels.presenceDelay, `${e.presenceDelayMs} ms`)}
      </dl>
      <ConfusionMatrix labels={e.labels} matrix={e.matrix} actualLabel={labels.actual} predictedLabel={labels.predicted} />
      <p className="text-xs text-muted">
        {labels.version}: <span className="tabular">{e.run.version}</span> · {labels.features}: {e.run.features}
        {e.run.training_code_ref && <> · {labels.code}: <span className="tabular">{e.run.training_code_ref.slice(0, 8)}</span></>} · {labels.evaluated} {formatDhakaDateTime(e.evaluatedAt, locale)}
      </p>
    </Card>
  );
}
