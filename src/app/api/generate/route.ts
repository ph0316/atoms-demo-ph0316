import { NextResponse } from "next/server";
import { generateWithLlm } from "@/lib/llm";
import { generateRequestSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  try {
    const body = generateRequestSchema.parse(await request.json());
    const result = await generateWithLlm(body.prompt, body.mode, body.previousFiles);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "生成失败",
      },
      { status: 400 },
    );
  }
}
