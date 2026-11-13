import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { labelsFor, resolveLocale } from "@/i18n/dictionaries";
import { pageRole } from "@/server/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getLevelStatus, getResults, getRuns, isRealEvidence, summarize, type ResultRow } from "@/features/judge/queries";
import { addCodeRefAction, decideAttemptAction, startAttemptAction, updateRequirementAction } from "@/features/judge/actions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Input";
import { ActionForm } from "@/components/ui/ActionForm";
import { Stopwatch } from "@/components/judge/Stopwatch";
import { EvidenceUploader } from "@/components/judge/EvidenceUploader";
import { formatDhakaDateTime } from "@/lib/time";

const SOURCES = [
  ["SOFTWARE_TEST", "Software test"], ["MOCK_DEVICE", "Mock device (simulator)"],
  ["REAL_DEVICE_SELF_TEST", "Real device — self test"], ["REAL_DEVICE_JUDGE_OBSERVED", "Real device — judge observed"],
] as const;

export default async function JudgeLevelPage({ params }: { params: Promise<{ levelNumber: string }> }) {
  await pageRole(["ADMIN"]);
  const n = Number((await params).levelNumber);
  if (!Number.isInteger(n) || n < 1 || n > 12) notFound();
  const locale = resolveLocale((await cookies()).get("locale")?.value);
  const L = labelsFor(locale, "jdg");
  const s = await createSupabaseServerClient();

  const { data: lvl } = await s.from("competition_levels").select("name, group_name, marks").eq("level_no", n).maybeSingle();
  if (!lvl) notFound();
  const [st, runs] = await Promise.all([getLevelStatus(s, n), getRuns(s, n)]);
  const current = runs.find((r) => r.outcome === "PENDING") ?? runs[runs.length - 1];
  const results = await getResults(s, current ? [current.id] : []);
  const sum = summarize(results);
  const [{ data: refs }, { data: arts }, meas] = await Promise.all([
    s.from("level_code_references").select("git_tag, commit_sha, recorded_at").eq("level_no", n).order("git_tag"),
    s.from("evidence_artifacts").select("kind, file_name, uploaded_at, byte_size").eq("level_no", n).order("uploaded_at", { ascending: false }),
    createSupabaseServiceClient().rpc("judge_measurements"),
  ]);
  const suggestions = ((meas.data ?? []) as { key: string; level: number; value: number; unit: string; device: string }[]).filter((m) => m.level === n);
  const decided = current && current.outcome !== "PENDING";

  const tone = (r: ResultRow) => r.outcome === "PASS" ? "safe" : r.outcome === "FAIL" ? "danger" : r.outcome === "NOT_APPLICABLE" ? "neutral" : "warning";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/judge" className="text-sm text-indigo hover:underline">← {L.title}</Link>
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">{L.level} {n} · {lvl.name}</h1>
        <Badge>{lvl.marks} {L.marks}</Badge>
        {st.complete ? <Badge tone="safe">{L.complete}</Badge> : st.passed ? <Badge tone="warning">{L.passedNoEvidence}</Badge> : st.closed ? <Badge tone="danger">{L.closed}</Badge> : !st.previous_passed ? <Badge>{L.locked}</Badge> : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Stopwatch labels={L} />
        <Card className="space-y-2 lg:col-span-2">
          <h2 className="text-sm font-semibold">{L.attempts}</h2>
          <ul className="space-y-1 text-sm">
            {runs.length === 0 && <li className="text-muted">{L.noAttempts}</li>}
            {runs.map((r) => (
              <li key={r.id} className="tabular flex flex-wrap items-center gap-2">
                #{r.attempt_no} {r.call_no ? `(call ${r.call_no})` : ""}
                <Badge tone={r.outcome === "PASS" ? "safe" : r.outcome === "FAIL" ? "danger" : "info"}>{r.outcome}</Badge>
                {r.outcome === "PASS" && <span>{r.award_pct}%</span>}
                {r.judge_name && <span className="text-muted">{r.judge_name} · {formatDhakaDateTime(r.judged_at, locale)}</span>}
              </li>
            ))}
          </ul>
          {st.can_attempt && (
            <ActionForm action={startAttemptAction} submitLabel={L.startAttempt}>
              <input type="hidden" name="level" value={n} />
              <label className="flex w-40 flex-col gap-1 text-[13px] text-muted">{L.call}
                <Select name="call" defaultValue=""><option value="">—</option>{[1, 2, 3, 4].map((c) => <option key={c} value={c}>{c}</option>)}</Select>
              </label>
            </ActionForm>
          )}
          {!st.can_attempt && !st.passed && !st.closed && <p className="text-sm text-muted">{L.lockedNote}</p>}
        </Card>
      </div>

      {current && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold">{L.checklist}</h2>
            <Badge tone="safe">{L.proven}: {sum.hardwareProvenReal}/{sum.hardwareTotal} {L.hardwareWord}</Badge>
            <Badge tone="neutral">{L.softwarePassed}: {sum.softwarePassed}</Badge>
            <Badge tone={sum.pending ? "warning" : "safe"}>{L.pendingWord}: {sum.pending}</Badge>
            {sum.failed > 0 && <Badge tone="danger">{L.failedWord}: {sum.failed}</Badge>}
          </div>
          <p className="text-xs text-muted">{L.simNote}</p>

          {suggestions.length > 0 && (
            <Card tint="periwinkle" className="space-y-1">
              <p className="text-sm font-medium">{L.measurements}</p>
              <ul className="tabular text-sm">{suggestions.map((m) => <li key={m.key}>{m.key}: {m.value} {m.unit} {m.device && <span className="text-muted">({m.device})</span>}</li>)}</ul>
              <p className="text-xs text-muted">{L.measurementsNote}</p>
            </Card>
          )}

          <ul className="space-y-3">
            {results.map((r) => (
              <li key={r.id}>
                <Card className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tabular text-xs text-muted">{r.requirement_code}</span>
                    <span className="font-medium">{r.description}</span>
                    <Badge tone={r.hardware_required ? "info" : "neutral"}>{r.hardware_required ? L.hardwareReq : L.softwareReq}</Badge>
                    <Badge tone={tone(r)}>{r.outcome}</Badge>
                    {r.outcome === "PASS" && r.hardware_required && !isRealEvidence(r.evidence_source) && <Badge tone="danger">{L.notProven}</Badge>}
                    {r.limit_value !== null && <span className="tabular text-xs text-muted">{L.limit}: {r.limit_value} {r.unit}</span>}
                  </div>
                  {!decided && (
                    <ActionForm action={updateRequirementAction} submitLabel={L.saveRow} variant="secondary">
                      <input type="hidden" name="id" value={r.id} /><input type="hidden" name="level" value={n} />
                      <div className="grid gap-2 sm:grid-cols-4">
                        <Select name="outcome" defaultValue={r.outcome} aria-label={L.outcome}>{["PENDING", "PASS", "FAIL", "NOT_APPLICABLE"].map((o) => <option key={o}>{o}</option>)}</Select>
                        <Select name="source" defaultValue={r.evidence_source} aria-label={L.source}>{SOURCES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</Select>
                        <Input name="measured" type="number" step="any" defaultValue={r.measured_value ?? ""} placeholder={`${L.measured}${r.unit ? ` (${r.unit})` : ""}`} aria-label={L.measured} />
                        <Input name="notes" defaultValue={r.notes ?? ""} placeholder={L.notes} maxLength={500} aria-label={L.notes} />
                      </div>
                    </ActionForm>
                  )}
                  {decided && <p className="tabular text-xs text-muted">{r.measured_value ?? "—"} {r.unit} · {SOURCES.find(([v]) => v === r.evidence_source)?.[1]}{r.notes ? ` · ${r.notes}` : ""}</p>}
                </Card>
              </li>
            ))}
          </ul>

          {current.outcome === "PENDING" && (
            <Card className="space-y-2">
              <h3 className="text-sm font-semibold">{L.decide}</h3>
              <ActionForm action={decideAttemptAction} submitLabel={L.recordOutcome} variant="primary">
                <input type="hidden" name="runId" value={current.id} /><input type="hidden" name="level" value={n} />
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input name="judge" placeholder={L.judgeName} required maxLength={80} aria-label={L.judgeName} />
                  <Select name="outcome" defaultValue="PASS" aria-label={L.outcome}><option>PASS</option><option>FAIL</option></Select>
                </div>
              </ActionForm>
              <p className="text-xs text-muted">{L.decideNote}</p>
            </Card>
          )}
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="space-y-3">
          <h2 className="text-sm font-semibold">{L.codeRef}</h2>
          <ul className="tabular space-y-1 text-xs">{(refs ?? []).map((r) => <li key={r.git_tag}>{r.git_tag} → {r.commit_sha.slice(0, 12)}</li>)}</ul>
          <ActionForm action={addCodeRefAction} submitLabel={L.saveCommit} variant="secondary">
            <input type="hidden" name="level" value={n} />
            <Input name="sha" placeholder={L.commitPlaceholder} maxLength={40} required className="tabular" aria-label={L.commitPlaceholder} />
          </ActionForm>
          <p className="text-xs text-muted">{L.tagNote}</p>
        </Card>
        <Card className="space-y-3">
          <h2 className="text-sm font-semibold">{L.evidence}</h2>
          <div className="flex gap-2 text-xs">
            <Badge tone={st.evidence.video ? "safe" : "warning"}>{L.video}</Badge><Badge tone={st.evidence.writeup ? "safe" : "warning"}>{L.writeup}</Badge><Badge tone={st.evidence.code ? "safe" : "warning"}>{L.codeRef}</Badge>
          </div>
          <ul className="tabular space-y-0.5 text-xs text-muted">{(arts ?? []).map((a) => <li key={a.file_name}>{a.kind} · {a.file_name}{a.byte_size ? ` · ${(Number(a.byte_size) / 1048576).toFixed(1)} MB` : ""}</li>)}</ul>
          <EvidenceUploader level={n} labels={L} />
          <a href={`/api/judge/levels/${n}/outline`} className="inline-block text-sm text-indigo hover:underline">{L.downloadOutline}</a>
        </Card>
      </div>
    </div>
  );
}
