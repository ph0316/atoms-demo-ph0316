import type { SandpackFiles } from "@/lib/schemas";

export const MODEL_FALLBACK = "gpt-5.5";
export const DEEPSEEK_MODEL_FALLBACK = "deepseek-v4-flash";

export const REQUIRED_FILES = [
  "/package.json",
  "/src/main.tsx",
  "/src/App.tsx",
  "/src/styles.css",
] as const;

export const ALLOWED_FILE_PREFIXES = ["/src/", "/public/"] as const;

export const ALLOWED_DEPENDENCIES = [
  "@vitejs/plugin-react",
  "vite",
  "typescript",
  "react",
  "react-dom",
  "react-is",
  "lucide-react",
  "framer-motion",
  "recharts",
  "date-fns",
  "clsx",
] as const;

export const DEFAULT_FILES: SandpackFiles = {
  "/package.json": {
    hidden: true,
    code: JSON.stringify(
      {
        scripts: {
          dev: "vite --host 0.0.0.0",
          build: "vite build",
        },
        dependencies: {
          "@vitejs/plugin-react": "latest",
          vite: "latest",
          typescript: "latest",
          react: "latest",
          "react-dom": "latest",
          "react-is": "latest",
          "lucide-react": "latest",
          recharts: "latest",
          "framer-motion": "latest",
          "date-fns": "latest",
          clsx: "latest",
        },
        devDependencies: {},
      },
      null,
      2,
    ),
  },
  "/src/main.tsx": {
    hidden: true,
    code: `import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`,
  },
  "/src/App.tsx": {
    active: true,
    code: `import { useState } from "react";
import { Sparkles, Wand2 } from "lucide-react";

const steps = ["需求澄清", "架构设计", "代码生成"];

export default function App() {
  const [theme, setTheme] = useState<"cobalt" | "mint" | "mono">("cobalt");

  function switchTheme() {
    setTheme((current) => (current === "cobalt" ? "mint" : current === "mint" ? "mono" : "cobalt"));
  }

  return (
    <main className={"shell " + theme}>
      <div className="topbar">
        <div className="badge"><Sparkles size={16} /> Atoms Demo</div>
        <button className="styleButton" onClick={switchTheme}>
          <Wand2 size={18} />
          修改视觉风格
        </button>
      </div>
      <section className="hero">
        <h1>用自然语言生成一个可运行应用</h1>
        <p>
          在左侧输入需求，选择智能体模式，生成结果会出现在这里。你可以继续编辑、
          修复错误、发布快照并导出代码。
        </p>
      </section>
      <section className="grid">
        {steps.map((item, index) => (
          <article key={item}>
            <span>0{index + 1}</span>
            <h2>{item}</h2>
            <p>智能体会把这个步骤记录在左侧任务流里，方便你理解构建过程。</p>
          </article>
        ))}
      </section>
    </main>
  );
}
`,
  },
  "/src/styles.css": {
    code: `* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #15171c;
  background: #f3f0e8;
}
.shell {
  min-height: 100vh;
  padding: 28px clamp(18px, 5vw, 72px) 56px;
  background:
    linear-gradient(135deg, rgba(51,75,250,.14), transparent 30%),
    linear-gradient(315deg, rgba(15,143,114,.15), transparent 32%),
    #f3f0e8;
}
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 42px;
}
.hero {
  max-width: 820px;
}
.badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid #d8d4c8;
  border-radius: 999px;
  background: rgba(255,255,255,.58);
  font-weight: 700;
}
h1 {
  margin: 24px 0 16px;
  font-size: clamp(42px, 8vw, 88px);
  line-height: .94;
  letter-spacing: 0;
}
p {
  max-width: 660px;
  color: #5a5d66;
  line-height: 1.7;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 28px;
}
button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 0;
  border-radius: 8px;
  padding: 12px 16px;
  color: white;
  background: #334bfa;
  font-weight: 800;
  cursor: pointer;
  transition: transform .18s ease, background .18s ease, opacity .18s ease;
}
button:hover {
  transform: translateY(-1px);
}
.styleButton {
  color: #15171c;
  background: white;
  border: 1px solid #dad6ca;
}
.grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-top: 52px;
}
article {
  position: relative;
  min-height: 170px;
  padding: 22px;
  border: 1px solid #ded9cd;
  border-radius: 8px;
  background: rgba(255,255,255,.64);
  transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease;
}
article span {
  font-weight: 900;
  color: #334bfa;
}
article h2 {
  margin: 18px 0 8px;
}
.shell.mint {
  background:
    linear-gradient(135deg, rgba(15,143,114,.18), transparent 30%),
    linear-gradient(315deg, rgba(51,75,250,.08), transparent 32%),
    #eef8f3;
}
.shell.mint article span {
  color: #0f8f72;
}
.shell.mono {
  background:
    linear-gradient(135deg, rgba(21,23,28,.08), transparent 34%),
    #f2f2f0;
}
.shell.mono article span {
  color: #15171c;
}
@media (max-width: 760px) {
  .topbar { align-items: flex-start; flex-direction: column; }
  .grid { grid-template-columns: 1fr; }
}
`,
  },
};
