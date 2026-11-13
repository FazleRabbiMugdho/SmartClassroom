import { commandAck } from "@/features/device/schemas";
import { bearerHash, parseBody, mapStatus, json } from "@/features/device/http";
import { callJsonFn } from "@/lib/db";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ commandId: string }> },
) {
  const hash = bearerHash(req);
  if (!hash) return json({ error: "unauthorized" }, 401);
  const parsed = await parseBody(req, commandAck);
  if ("error" in parsed) return parsed.error;
  const { commandId } = await params;
  const r = await callJsonFn("select public.ack_command($1, $2, $3, $4, $5) as r", [
    hash,
    commandId,
    parsed.data.status,
    parsed.data.applied_config_revision ?? null,
    parsed.data.detail ?? null,
  ]);
  return mapStatus(r);
}
