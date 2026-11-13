import { cookies } from "next/headers";
import { resolveLocale, t } from "@/i18n/dictionaries";
import { ForgotForm } from "./ForgotForm";

export default async function ForgotPasswordPage() {
  const locale = resolveLocale((await cookies()).get("locale")?.value);
  return (
    <main>
      <h1 style={{ fontSize: 20, margin: "0 0 14px" }}>{t(locale, "auth.forgot.title")}</h1>
      <ForgotForm labels={{ email: t(locale, "auth.email"), submit: t(locale, "auth.forgot.submit"), sent: t(locale, "auth.forgot.sent") }} />
    </main>
  );
}
