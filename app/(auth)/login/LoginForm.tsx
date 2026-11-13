"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "../actions";

const label = { display: "block", fontSize: 13, color: "#475569", marginBottom: 4, marginTop: 14 } as const;
const input = {
  width: "100%",
  padding: "9px 11px",
  border: "1px solid #E2E8F0",
  borderRadius: 8,
  fontSize: 14,
  boxSizing: "border-box" as const,
};

export function LoginForm({ labels }: { labels: Record<string, string> }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});

  return (
    <form action={action}>
      <label style={label} htmlFor="email">{labels.email}</label>
      <input style={input} id="email" name="email" type="email" required autoComplete="email" />

      <label style={label} htmlFor="password">{labels.password}</label>
      <input style={input} id="password" name="password" type="password" required autoComplete="current-password" />

      {state.error && (
        <p role="alert" style={{ color: "#E11D48", fontSize: 13, marginTop: 12 }}>
          {state.error === "LOCKED" ? labels.locked : labels.invalid}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        style={{
          width: "100%", marginTop: 18, padding: "10px 0", border: "none", borderRadius: 8,
          background: pending ? "#A5B4FC" : "#4F46E5", color: "#fff", fontSize: 14, cursor: "pointer",
        }}
      >
        {labels.submit}
      </button>
    </form>
  );
}
