"use client";

import { useState } from "react";
import { saveReferenceAction } from "@/features/vision/actions";
import { Button } from "@/components/ui/Button";
import { Input, Select, Field } from "@/components/ui/Input";
import type { ActionState } from "@/components/ui/ActionForm";

// Reads the image's pixel size in the browser (so the server can store it with the reference),
// then posts the JPEG privately. The server re-checks the JPEG header and size.
export function ReferenceUploader({ roomId, labels }: { roomId: string; labels: Record<string, string> }) {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [res, setRes] = useState<ActionState | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return setDims(null);
    const bmp = await createImageBitmap(f).catch(() => null);
    setDims(bmp ? { w: bmp.width, h: bmp.height } : null);
    bmp?.close();
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!dims) return setRes({ ok: false, message: labels.pickImage });
    const fd = new FormData(e.currentTarget);
    fd.set("width", String(dims.w)); fd.set("height", String(dims.h));
    setBusy(true);
    setRes(await saveReferenceAction({ ok: true, message: "" }, fd));
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <input type="hidden" name="roomId" value={roomId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={labels.position} htmlFor="ref-pos"><Select id="ref-pos" name="position"><option value="DOOR">DOOR</option><option value="ROOM">ROOM</option></Select></Field>
        <Field label="JPEG" htmlFor="ref-file"><Input id="ref-file" name="file" type="file" accept="image/jpeg" onChange={onFile} className="h-auto py-2" required /></Field>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={busy}>{busy ? "…" : labels.saveReference}</Button>
        {dims && <span className="tabular text-xs text-muted">{dims.w}×{dims.h}px</span>}
        {res && <span role={res.ok ? "status" : "alert"} className={`text-sm ${res.ok ? "text-safe" : "text-danger"}`}>{res.message}</span>}
      </div>
    </form>
  );
}
