"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signInWithLockout, signOut } from "@/server/auth/login";

export type LoginState = { error?: "INVALID" | "LOCKED" };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const res = await signInWithLockout(email, password, null);
  if (res.status === "LOCKED") return { error: "LOCKED" };
  if (res.status === "INVALID") return { error: "INVALID" };
  redirect("/overview");
}

export async function logoutAction(): Promise<void> {
  await signOut();
  redirect("/login");
}

export async function forgotPasswordAction(_prev: { sent: boolean }, formData: FormData): Promise<{ sent: boolean }> {
  const email = String(formData.get("email") ?? "");
  const supabase = await createSupabaseServerClient();
  // Always report the same result: never reveal whether the account exists.
  await supabase.auth.resetPasswordForEmail(email);
  return { sent: true };
}
