import {
  generateResponseSchema,
  type BuilderMode,
  type GenerateResponse,
  polishResponseSchema,
  type PolishResponse,
  repairResponseSchema,
  type RepairResponse,
  type SandpackFiles,
} from "@/lib/schemas";

export async function generateApp(input: {
  prompt: string;
  mode: BuilderMode;
  previousFiles?: SandpackFiles;
}): Promise<GenerateResponse> {
  return postJson("/api/generate", input, generateResponseSchema.parse);
}

export async function polishPrompt(prompt: string): Promise<PolishResponse> {
  return postJson("/api/polish", { prompt }, polishResponseSchema.parse);
}

export async function repairApp(input: {
  files: SandpackFiles;
  issue: string;
  instruction?: string;
}): Promise<RepairResponse> {
  return postJson("/api/repair", input, repairResponseSchema.parse);
}

async function postJson<T>(url: string, body: unknown, parse: (value: unknown) => T): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message || "请求失败");
  }

  return parse(payload);
}
