"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const input = { width: "100%", padding: "9px 11px", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 14, boxSizing: "border-box" as const };

// Used by both reset-password and invite/accept: the email link establishes a
// session, then the user sets a password via Supabase Auth (hashing is Supabase-side).
export function PasswordSetForm({ submitLabel, redirectTo }: { submitLabel: string; redirectTo: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password });
    setPending(false);
    if (error) setError(error.message);
    else router.replace(redirectTo);
  }

  return (
    <form onSubmit={onSubmit}>
      <input style={input} type="password" required minLength={8} autoComplete="new-password"
        value={password} onChange={(e) => setPassword(e.target.value)} />
      {error && <p role="alert" style={{ color: "#E11D48", fontSize: 13, marginTop: 12 }}>{error}</p>}
      <button type="submit" disabled={pending}
        style={{ width: "100%", marginTop: 18, padding: "10px 0", border: "none", borderRadius: 8, background: "#4F46E5", color: "#fff", fontSize: 14, cursor: "pointer" }}>
        {submitLabel}
      </button>
    </form>
  );
}
