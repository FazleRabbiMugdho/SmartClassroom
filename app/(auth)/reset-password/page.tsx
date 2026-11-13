import { cookies } from "next/headers";
import { resolveLocale, t } from "@/i18n/dictionaries";
import { PasswordSetForm } from "../PasswordSetForm";

export default async function ResetPasswordPage() {
  const locale = resolveLocale((await cookies()).get("locale")?.value);
  return (
    <main>
      <h1 style={{ fontSize: 20, margin: "0 0 14px" }}>{t(locale, "auth.reset.title")}</h1>
      <PasswordSetForm submitLabel={t(locale, "auth.reset.submit")} redirectTo="/overview" />
    </main>
  );
}
