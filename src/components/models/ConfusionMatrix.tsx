import { cn } from "@/components/ui/cn";

// Rows = actual, columns = predicted. Counts are printed (not colour alone); the diagonal is tinted.
export function ConfusionMatrix({ labels, matrix, actualLabel, predictedLabel }: { labels: string[]; matrix: number[][]; actualLabel: string; predictedLabel: string }) {
  const max = Math.max(1, ...matrix.flat());
  return (
    <div className="overflow-x-auto">
      <table className="tabular border-collapse text-sm" aria-label="Confusion matrix">
        <caption className="mb-1 text-left text-xs text-muted">{actualLabel} ↓ · {predictedLabel} →</caption>
        <thead>
          <tr><th />{labels.map((l) => <th key={l} scope="col" className="px-3 py-1 text-xs font-medium text-muted">{l}</th>)}</tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={labels[i]}>
              <th scope="row" className="pr-3 text-right text-xs font-medium text-muted">{labels[i]}</th>
              {row.map((v, j) => (
                <td key={j} style={{ backgroundColor: i === j ? `rgba(5,150,105,${0.12 + 0.5 * (v / max)})` : v ? `rgba(225,29,72,${0.1 + 0.4 * (v / max)})` : undefined }}
                  className={cn("border border-border px-3 py-2 text-center", i === j && "font-semibold")}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
