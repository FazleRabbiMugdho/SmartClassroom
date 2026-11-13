"use client";

import { useActionState } from "react";
import { forgotPasswordAction } from "../actions";

const input = { width: "100%", padding: "9px 11px", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 14, boxSizing: "border-box" as const };

export function ForgotForm({ labels }: { labels: Record<string, string> }) {
  const [state, action, pending] = useActionState(forgotPasswordAction, { sent: false });
  if (state.sent) return <p style={{ fontSize: 14, color: "#475569" }}>{labels.sent}</p>;
  return (
    <form action={action}>
      <label style={{ display: "block", fontSize: 13, color: "#475569", marginBottom: 4 }} htmlFor="email">{labels.email}</label>
      <input style={input} id="email" name="email" type="email" required autoComplete="email" />
      <button type="submit" disabled={pending}
        style={{ width: "100%", marginTop: 18, padding: "10px 0", border: "none", borderRadius: 8, background: "#4F46E5", color: "#fff", fontSize: 14, cursor: "pointer" }}>
        {labels.submit}
      </button>
    </form>
  );
}
