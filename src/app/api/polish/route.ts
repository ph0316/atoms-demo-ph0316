import { NextResponse } from "next/server";
import { polishWithLlm } from "@/lib/llm";
import { polishRequestSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  try {
    const body = polishRequestSchema.parse(await request.json());
    const result = await polishWithLlm(body.prompt);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "润色失败",
      },
      { status: 400 },
    );
  }
}
