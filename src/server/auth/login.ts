import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export type SignInResult =
  | { status: "OK" }
  | { status: "LOCKED" }
  | { status: "INVALID" };

/**
 * Level 4 sign-in with lockout. 5 consecutive failures lock the identifier for 30s,
 * refusing even a correct password. Locked attempts are not recorded (so the window
 * ends). Every real attempt is recorded for the Admin login history.
 */
export async function signInWithLockout(
  identifier: string,
  password: string,
  ipHash: string | null,
): Promise<SignInResult> {
  const svc = createSupabaseServiceClient();

  const { data: locked } = await svc.rpc("is_locked_out", { p_identifier: identifier });
  if (locked === true) return { status: "LOCKED" };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: identifier, password });

  await svc.rpc("record_login_attempt", {
    p_identifier: identifier,
    p_user: data?.user?.id ?? null,
    p_success: !error,
    p_reason: error?.message ?? null,
    p_ip_hash: ipHash,
  });

  return error ? { status: "INVALID" } : { status: "OK" };
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
}
