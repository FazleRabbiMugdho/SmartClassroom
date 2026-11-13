import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { labelsFor, resolveLocale } from "@/i18n/dictionaries";
import { pageRole } from "@/server/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uploadFirmwareAction, startOtaAction } from "@/features/devices/actions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input, Select, Field } from "@/components/ui/Input";
import { Table } from "@/components/ui/Table";
import { ActionForm } from "@/components/ui/ActionForm";
import { formatDhakaDateTime } from "@/lib/time";

type Release = { id: string; version: string; file_size_bytes: number; sha256: string; uploaded_at: string; device_target: string; uploader: { full_name: string } | null };
type Job = { id: string; state: string; progress_pct: number; result_detail: string | null; created_at: string; release: { version: string } | null };

const jobTone = (s: string) => (s === "DONE" ? "safe" : s === "REJECTED" || s === "ROLLED_BACK" || s === "FAILED" ? "danger" : "info") as "safe" | "danger" | "info";

// Admin only. A job is shown DONE / REJECTED / ROLLED_BACK only after the matching device event.
export default async function OtaPage({ params }: { params: Promise<{ deviceId: string }> }) {
  await pageRole(["ADMIN"]);
  const { deviceId } = await params;
  const locale = resolveLocale((await cookies()).get("locale")?.value);
  const L = labelsFor(locale, "dev");
  const supabase = await createSupabaseServerClient();

  const [{ data: device }, { data: rel }, { data: jobs }] = await Promise.all([
    supabase.from("devices").select("id, device_code, firmware_version").eq("id", deviceId).maybeSingle(),
    supabase.from("ota_releases").select("id, version, file_size_bytes, sha256, uploaded_at, device_target, uploader:user_profiles(full_name)").order("uploaded_at", { ascending: false }),
    supabase.from("ota_jobs").select("id, state, progress_pct, result_detail, created_at, release:ota_releases(version)").eq("device_id", deviceId).order("created_at", { ascending: false }).limit(10),
  ]);
  if (!device) notFound();
  const releases = (rel ?? []) as unknown as Release[];
  const jobRows = (jobs ?? []) as unknown as Job[];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">{L.ota} · <span className="tabular">{device.device_code}</span></h1>
        <Badge>{L.firmware} <span className="tabular ml-1">{device.firmware_version ?? "—"}</span></Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-sm font-semibold">{L.upload}</h2>
          <ActionForm action={uploadFirmwareAction} submitLabel={L.upload}>
            <Field label={L.version} htmlFor="version"><Input id="version" name="version" placeholder="1.0.1" required /></Field>
            <Field label=".bin" htmlFor="file"><Input id="file" name="file" type="file" accept=".bin" className="h-auto py-2" required /></Field>
            <p className="text-xs text-muted">{L.fileHint}</p>
          </ActionForm>
        </Card>
        <Card>
          <h2 className="mb-3 text-sm font-semibold">{L.startUpdate}</h2>
          <ActionForm action={startOtaAction} submitLabel={L.startUpdate} disabled={releases.length === 0}>
            <input type="hidden" name="deviceId" value={deviceId} />
            <Field label={L.pickRelease} htmlFor="releaseId">
              <Select id="releaseId" name="releaseId" required>{releases.map((r) => <option key={r.id} value={r.id}>{r.version}</option>)}</Select>
            </Field>
          </ActionForm>
        </Card>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">{L.releases}</h2>
        {releases.length === 0 ? <p className="text-sm text-muted">{L.noReleases}</p> : (
          <Table rows={releases} rowKey={(r) => r.id} columns={[
            { key: "v", header: L.version, mono: true, render: (r) => r.version },
            { key: "s", header: L.size, mono: true, render: (r) => `${(r.file_size_bytes / 1024).toFixed(1)} KB` },
            { key: "h", header: L.sha, mono: true, render: (r) => `${r.sha256.slice(0, 16)}…` },
            { key: "t", header: L.target, render: (r) => r.device_target },
            { key: "u", header: L.uploadedAt, render: (r) => `${r.uploader?.full_name ?? "—"} · ${formatDhakaDateTime(r.uploaded_at, locale)}` },
          ]} />
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">{L.job}</h2>
        {jobRows.length === 0 ? <p className="text-sm text-muted">{L.noJobs}</p> : (
          <Table rows={jobRows} rowKey={(r) => r.id} columns={[
            { key: "v", header: L.version, mono: true, render: (r) => r.release?.version ?? "—" },
            { key: "s", header: L.state, render: (r) => <Badge tone={jobTone(r.state)}>{r.state}</Badge> },
            { key: "p", header: "%", mono: true, render: (r) => r.progress_pct },
            { key: "r", header: L.result, render: (r) => r.result_detail ?? "—" },
            { key: "t", header: L.when, mono: true, align: "right", render: (r) => formatDhakaDateTime(r.created_at, locale) },
          ]} />
        )}
      </section>
    </div>
  );
}
