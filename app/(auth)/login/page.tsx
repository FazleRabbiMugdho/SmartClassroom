import Link from "next/link";
import { cookies } from "next/headers";
import { resolveLocale, t } from "@/i18n/dictionaries";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  const locale = resolveLocale((await cookies()).get("locale")?.value);
  const labels = {
    email: t(locale, "auth.email"),
    password: t(locale, "auth.password"),
    submit: t(locale, "auth.submit"),
    invalid: t(locale, "auth.invalid"),
    locked: t(locale, "auth.locked"),
  };
  return (
    <main>
      <h1 style={{ fontSize: 20, margin: "0 0 4px" }}>{t(locale, "auth.login.title")}</h1>
      <LoginForm labels={labels} />
      <p style={{ marginTop: 16, fontSize: 13 }}>
        <Link href="/forgot-password" style={{ color: "#4F46E5" }}>{t(locale, "auth.forgot.link")}</Link>
      </p>
    </main>
  );
}
