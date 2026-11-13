"use client";

import { useActionState } from "react";
import { askAssistantAction, type AskState } from "@/features/assistant/actions";
import { Button } from "@/components/ui/Button";
import { Input, Select, Field } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";

export function AssistantForm({ rooms, labels }: { rooms: { id: string; display_name: string }[]; labels: Record<string, string> }) {
  const [state, action, pending] = useActionState<AskState, FormData>(askAssistantAction, { ok: true });
  return (
    <div className="space-y-4">
      <form action={action} className="space-y-3">
        <Field label={labels.room} htmlFor="roomId"><Select id="roomId" name="roomId">{rooms.map((r) => <option key={r.id} value={r.id}>{r.display_name}</option>)}</Select></Field>
        <Field label={labels.ask} htmlFor="question"><Input id="question" name="question" placeholder={labels.placeholder} maxLength={300} required /></Field>
        <Button type="submit" size="sm" disabled={pending}>{pending ? "…" : labels.ask}</Button>
      </form>

      <div aria-live="polite">
        {state.ok && state.answer && (
          <Card tint={state.hasData ? "periwinkle" : "amber"} className="space-y-2">
            <p className="text-lg font-semibold">{state.answer}</p>
            {state.sources && state.sources.length > 0 && (
              <p className="tabular text-xs text-muted">{labels.sources}: {state.sources.map((s) => `${s.label}=${s.value}`).join(" · ")}</p>
            )}
          </Card>
        )}
        {!state.ok && state.error === "unsupported" && <p role="alert" className="text-sm text-muted">{labels.unsupported}</p>}
        {!state.ok && state.error === "forbidden" && <p role="alert" className="text-sm text-danger">Teachers and Admins only.</p>}
        {!state.ok && state.error === "room" && <p role="alert" className="text-sm text-danger">Room not available.</p>}
      </div>
    </div>
  );
}
