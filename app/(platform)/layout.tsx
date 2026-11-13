import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser, getUserRoles } from "@/server/auth/session";
import { primaryRole } from "@/components/shell/nav";
import { AppShell } from "@/components/shell/AppShell";
import { resolveLocale, t } from "@/i18n/dictionaries";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveNotices } from "@/features/weather/queries";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const roles = await getUserRoles(user.id);
  const role = primaryRole(roles.map((r) => r.role));
  const locale = resolveLocale((await cookies()).get("locale")?.value);
  const name = (user.user_metadata?.full_name as string | undefined) ?? user.email ?? "User";

  const supabase = await createSupabaseServerClient();
  const [{ count }, notices] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    getActiveNotices(),
  ]);

  return (
    <AppShell
      role={role} locale={locale} userName={name} unread={count ?? 0} weatherNotices={notices}
      weatherLabels={{ danger: t(locale, "wx.dangerBanner"), derived: t(locale, "wx.derived"), test: t(locale, "wx.test") }}
    >
      {children}
    </AppShell>
  );
}
