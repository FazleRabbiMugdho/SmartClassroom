import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { resolveLocale, t } from "@/i18n/dictionaries";
import { assertAdmin, AuthzError } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

interface Attempt {
  occurred_at: string;
  identifier: string;
  success: boolean;
  failure_reason: string | null;
}

export default async function AuditPage() {
  const locale = resolveLocale((await cookies()).get("locale")?.value);
  try {
    await assertAdmin();
  } catch (e) {
    if (e instanceof AuthzError) redirect("/denied");
    throw e;
  }

  // RLS also restricts login_attempts to admins (defense in depth).
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("login_attempts")
    .select("occurred_at, identifier, success, failure_reason")
    .order("occurred_at", { ascending: false })
    .limit(100);
  const rows = (data ?? []) as Attempt[];

  const { data: audit } = await supabase
    .from("audit_logs")
    .select("id, occurred_at, action, target_type, target_id, actor:user_profiles(full_name)")
    .order("occurred_at", { ascending: false })
    .limit(100);
  const auditRows = (audit ?? []) as unknown as { id: number; occurred_at: string; action: string; target_type: string; target_id: string | null; actor: { full_name: string } | null }[];

  const mono = { fontFamily: "ui-monospace, monospace" } as const;
  return (
    <main style={{ padding: 24, maxWidth: 820, margin: "0 auto" }}>
      <h1>{t(locale, "audit.title")}</h1>
      <table style={{ ...mono, borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
        <thead>
          <tr>
            {[t(locale, "audit.time"), t(locale, "audit.user"), t(locale, "audit.result")].map((h) => (
              <th key={h} style={{ textAlign: "left", borderBottom: "1px solid #E2E8F0", padding: 6 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td style={{ padding: 6 }}>{r.occurred_at}</td>
              <td style={{ padding: 6 }}>{r.identifier}</td>
              <td style={{ padding: 6, color: r.success ? "#059669" : "#E11D48" }}>
                {r.success ? t(locale, "audit.success") : t(locale, "audit.failure")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2 style={{ marginTop: 32 }}>Audit log</h2>
      <table style={{ ...mono, borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
        <thead>
          <tr>
            {["Time", "Actor", "Action", "Target"].map((h) => (
              <th key={h} style={{ textAlign: "left", borderBottom: "1px solid #E2E8F0", padding: 6 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {auditRows.map((a) => (
            <tr key={a.id}>
              <td style={{ padding: 6 }}>{a.occurred_at}</td>
              <td style={{ padding: 6 }}>{a.actor?.full_name ?? "system"}</td>
              <td style={{ padding: 6 }}>{a.action}</td>
              <td style={{ padding: 6 }}>{a.target_type}{a.target_id ? ` ${a.target_id.slice(0, 8)}` : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
