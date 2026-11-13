import type { z } from "zod";
import { sha256 } from "@/lib/crypto";

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

/** sha256 of the bearer token, or null if absent. */
export function bearerHash(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token ? sha256(token) : null;
}

/** Parse + Zod-validate the JSON body. */
export async function parseBody<T extends z.ZodTypeAny>(
  req: Request,
  schema: T,
): Promise<{ data: z.infer<T> } | { error: Response }> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { error: json({ error: "invalid_json" }, 400) };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return { error: json({ error: "invalid_payload", issues: parsed.error.issues }, 422) };
  }
  return { data: parsed.data };
}

/** Map a SQL ingest result's status to an HTTP response. */
export function mapStatus(r: unknown): Response {
  const status = (r as { status?: string } | null)?.status;
  switch (status) {
    case "unauthorized":
      return json({ error: "unauthorized" }, 401);
    case "device_mismatch":
      return json(r, 409);
    case "rejected":
      return json(r, 422);
    case "unknown_command":
      return json(r, 404);
    default:
      return json(r); // accepted | duplicate | ok | config body
  }
}
