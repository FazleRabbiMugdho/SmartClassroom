import { z } from "zod";

// A model evaluation may only be recorded if its numbers are internally consistent. This is the
// guard against fabricated results: accuracy must equal the confusion matrix's own diagonal,
// the matrix must sum to the held-out count, and the held-out set must be >= 20% of the data.

export const evaluationInput = z.object({
  model_kind: z.enum(["HAND_RAISE", "WIFI_CSI_PRESENCE", "WIFI_CSI_LOCALIZATION"]),
  version: z.string().min(1).max(60),
  features: z.string().min(1).max(500),
  training_code_ref: z.string().regex(/^[0-9a-f]{40}$/, "training_code_ref must be a full git commit SHA").optional(),
  trained_at: z.string().datetime().optional(),
  dataset: z.object({
    version: z.string().min(1),
    raised_count: z.number().int().nonnegative(),
    not_raised_count: z.number().int().nonnegative(),
    held_out_raised: z.number().int().nonnegative(),
    held_out_not_raised: z.number().int().nonnegative(),
  }).optional(),
  metrics: z.object({
    held_out_accuracy: z.number().min(0).max(1),
    sample_count: z.number().int().positive(),
    held_out_count: z.number().int().positive(),
    labels: z.array(z.string().min(1)).min(2),
    confusion_matrix: z.array(z.array(z.number().int().nonnegative())),
    avg_prediction_ms: z.number().nonnegative().optional(),
    presence_delay_ms: z.number().nonnegative().optional(),
  }),
});
export type EvaluationInput = z.infer<typeof evaluationInput>;

export type Verdict = { ok: true } | { ok: false; error: string };

export function validateEvaluation(e: EvaluationInput): Verdict {
  const m = e.metrics;
  const n = m.labels.length;
  if (m.confusion_matrix.length !== n || m.confusion_matrix.some((r) => r.length !== n)) {
    return { ok: false, error: `confusion matrix must be ${n}x${n} to match the labels` };
  }
  const total = m.confusion_matrix.flat().reduce((s, v) => s + v, 0);
  if (total !== m.held_out_count) return { ok: false, error: `confusion matrix sums to ${total}, but held_out_count is ${m.held_out_count}` };
  const correct = m.confusion_matrix.reduce((s, row, i) => s + row[i], 0);
  if (Math.abs(correct / total - m.held_out_accuracy) > 0.0005) {
    return { ok: false, error: `held_out_accuracy ${m.held_out_accuracy} does not match the confusion matrix (${(correct / total).toFixed(4)})` };
  }
  if (m.held_out_count * 5 < m.sample_count) return { ok: false, error: "held-out set must be at least 20% of the samples" };
  if (m.held_out_count > m.sample_count) return { ok: false, error: "held_out_count cannot exceed sample_count" };

  const d = e.dataset;
  if (e.model_kind === "HAND_RAISE") {
    if (!d) return { ok: false, error: "a hand-raise evaluation must include its dataset counts" };
    if (d.raised_count < 100 || d.not_raised_count < 100) return { ok: false, error: "need at least 100 raised and 100 not-raised images" };
    if ((d.held_out_raised + d.held_out_not_raised) * 5 < d.raised_count + d.not_raised_count) return { ok: false, error: "at least 20% of the images must be held out" };
    if (d.raised_count + d.not_raised_count !== m.sample_count) return { ok: false, error: "sample_count must equal the dataset image total" };
    if (d.held_out_raised + d.held_out_not_raised !== m.held_out_count) return { ok: false, error: "held_out_count must equal the dataset held-out total" };
  }
  return { ok: true };
}
