import type { ReactNode } from "react";

// Minimal centered auth shell. Full design-system shell arrives in Prompt 05.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#F4F6FB" }}>
      <div
        style={{
          width: 360,
          background: "#FFFFFF",
          border: "1px solid #E2E8F0",
          borderRadius: 16,
          padding: 28,
          boxShadow: "0 10px 30px -10px rgba(15,23,42,0.08)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
