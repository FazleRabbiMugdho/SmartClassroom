"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { prepareEvidenceUploadAction, confirmEvidenceAction } from "@/features/judge/actions";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";

// Large files (a 720p video) go straight from the browser to private storage with a one-time
// signed upload URL, so they never pass through a serverless function.
export function EvidenceUploader({ level, labels }: { level: number; labels: Record<string, string> }) {
  const [kind, setKind] = useState<"VIDEO" | "WRITEUP" | "SCREENSHOT">("VIDEO");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = (new FormData(e.currentTarget).get("file") as File | null);
    if (!file || file.size === 0) return setMsg({ ok: false, text: labels.pickFile });
    setBusy(true); setMsg(null);
    const prep = await prepareEvidenceUploadAction(level, kind, file.name);
    if (!prep.ok) { setBusy(false); return setMsg({ ok: false, text: prep.message }); }
    const up = await createSupabaseBrowserClient().storage.from("evidence-artifacts").uploadToSignedUrl(prep.path, prep.token, file);
    if (up.error) { setBusy(false); return setMsg({ ok: false, text: up.error.message }); }
    const done = await confirmEvidenceAction(level, kind, prep.fileName, prep.path);
    setBusy(false); setMsg({ ok: done.ok, text: done.message });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-[13px] text-muted">{labels.kind}
        <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="w-40">
          <option value="VIDEO">{labels.video}</option><option value="WRITEUP">{labels.writeup}</option><option value="SCREENSHOT">{labels.screenshot}</option>
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-[13px] text-muted">{labels.file}
        <Input name="file" type="file" accept={kind === "VIDEO" ? "video/mp4" : kind === "WRITEUP" ? "application/pdf" : "image/*"} className="h-auto w-64 py-2" required />
      </label>
      <Button type="submit" size="sm" disabled={busy}>{busy ? "…" : labels.uploadEvidence}</Button>
      {msg && <span role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-safe" : "text-danger"}`}>{msg.text}</span>}
    </form>
  );
}
