import { afterEach, describe, expect, it, vi } from "vitest";
import { generateWithLlm } from "@/lib/llm";

describe("llm generation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.OPENAI_API_KEY;
  });

  it("没有 API Key 时返回本地兜底结果", async () => {
    const result = await generateWithLlm("生成一个预约页面", "engineer");

    expect(result.usedFallback).toBe(true);
    expect(result.files["/src/App.tsx"]).toBeDefined();
    expect(result.agentEvents.some((event) => event.agent === "Alex")).toBe(true);
  });

  it("解析 mock Responses API JSON 输出", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          output_text: JSON.stringify({
            projectName: "Mock App",
            mode: "team",
            model: "mock",
            usedFallback: false,
            agentEvents: [
              {
                id: "event_1",
                agent: "Alex",
                role: "Software Engineer",
                title: "生成代码",
                detail: "完成",
                status: "done",
                createdAt: "2026-06-27T00:00:00.000Z",
              },
            ],
            files: {
              "/src/App.tsx": { code: "export default function App(){return <div>ok</div>}", active: true },
              "/src/styles.css": { code: "body{margin:0}" },
              "/src/main.tsx": { code: "import './App'" },
              "/package.json": { code: "{\"dependencies\":{\"react\":\"latest\"}}", hidden: true },
            },
            summary: "ok",
            checks: ["schema"],
          }),
        }),
      })),
    );

    const result = await generateWithLlm("生成一个工具", "team");

    expect(result.projectName).toBe("Mock App");
    expect(result.usedFallback).toBe(false);
    expect(result.files["/package.json"].code).toContain("react");
  });
});
