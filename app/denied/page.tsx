import { cookies } from "next/headers";
import Link from "next/link";
import { resolveLocale, t } from "@/i18n/dictionaries";

export default async function DeniedPage() {
  const locale = resolveLocale((await cookies()).get("locale")?.value);
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#F4F6FB" }}>
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: 22, color: "#0F172A" }}>{t(locale, "auth.denied.title")}</h1>
        <p style={{ color: "#475569" }}>{t(locale, "auth.denied.body")}</p>
        <Link href="/overview" style={{ color: "#4F46E5" }}>{t(locale, "nav.overview")}</Link>
      </div>
    </main>
  );
}
