import { NextResponse } from "next/server";
import { repairWithLlm } from "@/lib/llm";
import { repairRequestSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  try {
    const body = repairRequestSchema.parse(await request.json());
    const result = await repairWithLlm(body.files, body.issue, body.instruction);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "修复失败",
      },
      { status: 400 },
    );
  }
}
