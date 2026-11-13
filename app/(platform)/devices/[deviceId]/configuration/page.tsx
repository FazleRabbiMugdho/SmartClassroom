import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { labelsFor, resolveLocale } from "@/i18n/dictionaries";
import { pageRole } from "@/server/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { changeThresholdsAction } from "@/features/devices/actions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input, Field } from "@/components/ui/Input";
import { Table } from "@/components/ui/Table";
import { ActionForm } from "@/components/ui/ActionForm";
import { CommandStatusStepper } from "@/components/shared/CommandStatusStepper";
import { formatDhakaDateTime } from "@/lib/time";

type Hist = { config_revision: number; previous_warning_temp_c: number | null; new_warning_temp_c: number; previous_danger_temp_c: number | null; new_danger_temp_c: number; changed_at: string; changer: { full_name: string } | null };

// Admin only (Level 5). The page redirects Teachers to /denied; RLS also hides the tables.
export default async function ConfigurationPage({ params }: { params: Promise<{ deviceId: string }> }) {
  await pageRole(["ADMIN"]);
  const { deviceId } = await params;
  const locale = resolveLocale((await cookies()).get("locale")?.value);
  const L = labelsFor(locale, "dev");
  const supabase = await createSupabaseServerClient();

  const [{ data: device }, { data: cfg }, { data: hist }, { data: cmd }] = await Promise.all([
    supabase.from("devices").select("id, device_code").eq("id", deviceId).maybeSingle(),
    supabase.from("device_configurations").select("config_revision, applied_revision, desired_warning_temp_c, desired_danger_temp_c").eq("device_id", deviceId).maybeSingle(),
    supabase.from("device_config_history")
      .select("config_revision, previous_warning_temp_c, new_warning_temp_c, previous_danger_temp_c, new_danger_temp_c, changed_at, changer:user_profiles(full_name)")
      .eq("device_id", deviceId).order("changed_at", { ascending: false }).limit(20),
    supabase.from("device_commands").select("state").eq("device_id", deviceId).eq("command_type", "SET_THRESHOLDS").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!device || !cfg) notFound();
  const rows = (hist ?? []) as unknown as Hist[];
  const pending = cfg.applied_revision < cfg.config_revision;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">{L.configuration} · <span className="tabular">{device.device_code}</span></h1>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted">{L.desiredRev}</span><span className="tabular font-medium">{cfg.config_revision}</span>
          <span className="text-muted">{L.appliedRev}</span><span className="tabular font-medium">{cfg.applied_revision}</span>
          {pending ? <Badge tone="warning">{L.pendingApply}</Badge> : <Badge tone="safe">OK</Badge>}
        </div>
        {cmd && (<div><p className="mb-1 text-xs text-muted">{L.command}</p><CommandStatusStepper state={cmd.state} /></div>)}
      </Card>

      <Card>
        <ActionForm action={changeThresholdsAction} submitLabel={L.save}>
          <input type="hidden" name="deviceId" value={deviceId} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={L.warningLimit} htmlFor="warning"><Input id="warning" name="warning" type="number" step="0.5" min={0} max={50} defaultValue={cfg.desired_warning_temp_c} required /></Field>
            <Field label={L.dangerLimit} htmlFor="danger"><Input id="danger" name="danger" type="number" step="0.5" min={0} max={50} defaultValue={cfg.desired_danger_temp_c} required /></Field>
          </div>
          <p className="text-xs text-muted">{L.validationOrder} {L.hysteresisNote}</p>
        </ActionForm>
      </Card>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">{L.history}</h2>
        {rows.length === 0 ? <p className="text-sm text-muted">{L.noHistory}</p> : (
          <Table rows={rows} rowKey={(r) => String(r.config_revision)} columns={[
            { key: "rev", header: "#", mono: true, render: (r) => r.config_revision },
            { key: "who", header: L.changedBy, render: (r) => r.changer?.full_name ?? "—" },
            { key: "w", header: L.warningLimit, mono: true, render: (r) => `${r.previous_warning_temp_c ?? "—"} → ${r.new_warning_temp_c}` },
            { key: "d", header: L.dangerLimit, mono: true, render: (r) => `${r.previous_danger_temp_c ?? "—"} → ${r.new_danger_temp_c}` },
            { key: "t", header: L.when, mono: true, align: "right", render: (r) => formatDhakaDateTime(r.changed_at, locale) },
          ]} />
        )}
      </section>
    </div>
  );
}
