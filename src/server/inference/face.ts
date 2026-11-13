// Face inference adapter (Level 7/8). The platform integrates a team-owned or hosted
// inference service over HTTP; it must not fabricate matches. Unconfigured => throws
// InferenceUnavailable and the caller denies/pends (never grants).
//
//   POST {INFERENCE_URL}/embed  { images: [base64...] }
//        -> { embedding: base64, dimensions, model, version }
//   POST {INFERENCE_URL}/match  { crop: base64, embeddings: [base64...] }
//        -> { result: "MATCH" | "MISMATCH" | "NO_FACE" | "SPOOF" }
//
// Dev only: MOCK_INFERENCE=1 (never in production) returns SYNTHETIC results, clearly labelled.

export class InferenceUnavailable extends Error {
  constructor(message = "face inference service is not configured") {
    super(message);
    this.name = "InferenceUnavailable";
  }
}

export type FaceResult = "MATCH" | "MISMATCH" | "NO_FACE" | "SPOOF";

export interface EmbedResult {
  embeddingBase64: string;
  dimensions: number;
  model: string;
  version: string;
  synthetic: boolean;
}

const useMock = () => process.env.MOCK_INFERENCE === "1" && process.env.NODE_ENV !== "production";

async function post<T>(path: string, body: unknown): Promise<T> {
  const base = process.env.INFERENCE_URL;
  if (!base) throw new InferenceUnavailable();
  const res = await fetch(`${base.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(process.env.INFERENCE_TOKEN ? { authorization: `Bearer ${process.env.INFERENCE_TOKEN}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new InferenceUnavailable(`inference service returned ${res.status}`);
  return (await res.json()) as T;
}

export async function embedFaces(imagesBase64: string[]): Promise<EmbedResult> {
  if (imagesBase64.length < 3) throw new Error("at least 3 face images are required");
  if (useMock()) {
    return { embeddingBase64: Buffer.from("SYNTHETIC-EMBEDDING").toString("base64"), dimensions: 128, model: "mock", version: "synthetic", synthetic: true };
  }
  const r = await post<{ embedding: string; dimensions: number; model: string; version: string }>("/embed", { images: imagesBase64 });
  return { embeddingBase64: r.embedding, dimensions: r.dimensions, model: r.model, version: r.version, synthetic: false };
}

export async function matchFace(cropBase64: string, ownerEmbeddingsBase64: string[]): Promise<{ result: FaceResult; synthetic: boolean }> {
  if (useMock()) return { result: "MATCH", synthetic: true }; // SYNTHETIC: dev only, never production
  const r = await post<{ result: FaceResult }>("/match", { crop: cropBase64, embeddings: ownerEmbeddingsBase64 });
  return { result: r.result, synthetic: false };
}
