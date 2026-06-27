import { describe, expect, it } from "vitest";
import { normalizeFiles, sanitizePackageJson } from "@/lib/file-safety";

describe("file safety", () => {
  it("补齐必需文件并过滤危险路径", () => {
    const files = normalizeFiles({
      "../secret.ts": { code: "nope" },
      "/src/App.tsx": { code: "<div onclick=\"alert(1)\">ok</div>", active: true },
    });

    expect(files["../secret.ts"]).toBeUndefined();
    expect(files["/src/App.tsx"].code).not.toContain("onclick");
    expect(files["/package.json"]).toBeDefined();
    expect(files["/src/main.tsx"]).toBeDefined();
    expect(files["/src/styles.css"]).toBeDefined();
  });

  it("只保留白名单依赖", () => {
    const code = sanitizePackageJson(
      JSON.stringify({
        dependencies: {
          react: "latest",
          "left-pad": "latest",
          "lucide-react": "latest",
        },
      }),
    );

    const parsed = JSON.parse(code) as { dependencies: Record<string, string> };
    expect(parsed.dependencies.react).toBe("latest");
    expect(parsed.dependencies["react-is"]).toBe("latest");
    expect(parsed.dependencies["lucide-react"]).toBe("latest");
    expect(parsed.dependencies["left-pad"]).toBeUndefined();
  });

  it("为缺失的相对组件 import 补齐可预览占位文件", () => {
    const files = normalizeFiles({
      "/src/App.tsx": {
        active: true,
        code: `import AdvicePanel from "./AdvicePanel";
import { ScorePanel } from "./ScorePanel";

export default function App() {
  return (
    <main>
      <AdvicePanel />
      <ScorePanel />
    </main>
  );
}
`,
      },
    });

    expect(files["/src/AdvicePanel.tsx"]?.code).toContain("建议面板");
    expect(files["/src/AdvicePanel.tsx"]?.code).toContain("export default AdvicePanel");
    expect(files["/src/ScorePanel.tsx"]?.code).toContain("评分面板");
    expect(files["/src/ScorePanel.tsx"]?.code).toContain("export { ScorePanel }");
  });
});
