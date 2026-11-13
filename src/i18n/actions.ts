"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { locales, type Locale } from "./dictionaries";

// Persist the UI language in a cookie and refresh the current tree.
export async function setLocale(locale: Locale): Promise<void> {
  if (!locales.includes(locale)) return;
  (await cookies()).set("locale", locale, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
}
