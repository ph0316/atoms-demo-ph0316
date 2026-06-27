import { jsonrepair } from "jsonrepair";
import { DEEPSEEK_MODEL_FALLBACK, DEFAULT_FILES, MODEL_FALLBACK } from "@/lib/constants";
import { normalizeFiles } from "@/lib/file-safety";
import { createAgentEvents, createFallbackGeneration, createRepairFallback } from "@/lib/fallback-generator";
import { createId, nowIso } from "@/lib/ids";
import {
  type AgentEvent,
  type BuilderMode,
  type GenerateResponse,
  polishResponseSchema,
  type PolishResponse,
  repairResponseSchema,
  type RepairResponse,
  type SandpackFiles,
} from "@/lib/schemas";

const model = process.env.OPENAI_MODEL || MODEL_FALLBACK;
const deepSeekModel = process.env.DEEPSEEK_MODEL || DEEPSEEK_MODEL_FALLBACK;

type ChatMessage = { role: "system" | "user"; content: string };

export async function generateWithLlm(prompt: string, mode: BuilderMode, previousFiles?: SandpackFiles): Promise<GenerateResponse> {
  if (!hasModelKey()) {
    return createFallbackGeneration(prompt, mode);
  }

  const raceCount = mode === "race" ? 2 : 1;
  const outputs = await Promise.all(
    Array.from({ length: raceCount }, (_, index) =>
      requestGeneration(prompt, mode, index, previousFiles).catch((error) => {
        console.warn("Generation failed, using local fallback:", error);
        return createFallbackGeneration(prompt, mode, index);
      }),
    ),
  );

  if (mode === "race") {
    const first = outputs[0];
    return {
      ...first,
      mode,
      candidates: outputs.map((output, index) => ({
        id: `candidate_${index + 1}`,
        label: index === 0 ? "候选 A" : "候选 B",
        model: output.model,
        summary: output.summary,
        files: output.files,
        checks: output.checks,
      })),
    };
  }

  return outputs[0];
}

export async function polishWithLlm(prompt: string): Promise<PolishResponse> {
  if (!hasModelKey()) {
    return {
      polishedPrompt: `请生成一个可运行的 React 应用：${prompt}。要求包含清晰首屏、核心交互、响应式布局、可发布的视觉完成度，并保留后续扩展空间。`,
      brief: ["保留原始目标", "补充交互与响应式要求", "强调可运行与可发布"],
    };
  }

  const responseText = await callResponsesApi({
    model: activeModel(),
    input: [
      {
        role: "system",
        content:
          "你是 Atoms 风格的产品经理 Emma。请把用户的粗略想法改写成适合 AI App Builder 生成 React 应用的中文 prompt，只返回 JSON。",
      },
      {
        role: "user",
        content: `原始需求：${prompt}\n返回格式：{"polishedPrompt":"...","brief":["..."]}`,
      },
    ],
  });
  return polishResponseSchema.parse(extractJson(responseText));
}

export async function repairWithLlm(files: SandpackFiles, issue: string, instruction?: string): Promise<RepairResponse> {
  if (!hasModelKey()) {
    return repairResponseSchema.parse(createRepairFallback(files, issue));
  }

  const responseText = await callResponsesApi({
    model: activeModel(),
    input: [
      {
        role: "system",
        content: `${baseSystemPrompt("engineer")}
你是 Alex，请根据 Issue Report 修复代码。只返回 JSON：{"files":{...},"fixSummary":"...","agentEvents":[...]}`,
      },
      {
        role: "user",
        content: JSON.stringify({ issue, instruction, files }, null, 2),
      },
    ],
  });
  const parsed = repairResponseSchema.parse(extractJson(responseText));
  return {
    ...parsed,
    files: normalizeFiles(parsed.files),
    usedFallback: false,
  };
}

async function requestGeneration(
  prompt: string,
  mode: BuilderMode,
  variant: number,
  previousFiles?: SandpackFiles,
) {
  const responseText = await callResponsesApi({
    model: activeModel(),
    input: [
      {
        role: "system",
        content: `${baseSystemPrompt(mode)}
只返回 JSON，不要 Markdown 代码块。返回格式：
{
  "projectName": "短项目名",
  "mode": "${mode}",
  "model": "${activeModel()}",
  "usedFallback": false,
  "agentEvents": [{"id":"event_1","agent":"Alex","role":"Software Engineer","title":"...","detail":"...","status":"done","createdAt":"ISO时间"}],
  "files": {"/src/App.tsx":{"code":"...","active":true}, "/src/styles.css":{"code":"..."}, "/src/main.tsx":{"code":"..."}, "/package.json":{"code":"...","hidden":true}},
  "summary": "中文说明",
  "checks": ["..."]
}
注意：必须输出可被 JSON.parse 直接解析的合法 JSON。所有 files.*.code 必须是 JSON 字符串，换行写成 \\n，双引号写成 \\"，不要在 code 字段中输出未转义的真实换行或裸双引号。
`,
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            prompt,
            mode,
            variant,
            previousFiles,
            required: [
              "必须是可运行的 React + Vite + TypeScript 应用",
              "必须有真实按钮、表单、筛选、计数器或其他交互，不要纯静态页面",
              "必须响应式适配移动端和桌面端",
              "优先把组件写在 /src/App.tsx 单文件中；如果使用 ./UploadPanel 这类相对 import，必须在 files 中返回对应完整文件",
              "只能使用白名单依赖：react, react-dom, react-is, lucide-react, framer-motion, recharts, date-fns, clsx",
              "不要使用外部脚本、远程图片、localStorage 或网络请求",
              "上传文件功能必须在浏览器内模拟处理，只能读取文件名、大小、纯文本或 textarea 内容",
              "不要导入 pdfjs、mammoth、xlsx、docx、browserfs、node 内置模块或任何非白名单依赖",
              "如果需求包含简历评估，请用可编辑 textarea + 文件名上传模拟评分，不要真实解析 PDF/DOCX",
              "不要使用 Tailwind CSS、@tailwind、utility class 或 className=\"p-4 text-xl\" 这类写法；Sandpack 未配置 Tailwind",
              "所有视觉样式都必须写在 /src/styles.css 的普通 CSS 选择器中，JSX 只使用语义化 className",
            ],
          },
          null,
          2,
        ),
      },
    ],
  });

  const parsed = coerceGenerationPayload(extractJson(responseText), prompt, mode);
  return {
    ...parsed,
    mode,
    model: activeModel(),
    usedFallback: false,
    files: normalizeFiles(parsed.files),
    agentEvents: parsed.agentEvents.length ? parsed.agentEvents : createAgentEvents(mode, prompt),
  };
}

function coerceGenerationPayload(payload: unknown, prompt: string, mode: BuilderMode): GenerateResponse {
  if (!payload || typeof payload !== "object") {
    throw new Error("LLM JSON payload is not an object");
  }

  const record = payload as Record<string, unknown>;
  const files = coerceFiles(record.files);
  const agentEvents = coerceAgentEvents(record.agentEvents, mode, prompt);
  const checks = Array.isArray(record.checks)
    ? record.checks.map((item) => String(item)).filter(Boolean)
    : ["生成了 Sandpack 必需文件", "已完成结构归一化"];

  return {
    projectName: typeof record.projectName === "string" && record.projectName.trim() ? record.projectName.trim() : titleFromPrompt(prompt),
    mode,
    model: typeof record.model === "string" && record.model.trim() ? record.model.trim() : activeModel(),
    usedFallback: false,
    agentEvents,
    files,
    summary:
      typeof record.summary === "string" && record.summary.trim()
        ? record.summary.trim()
        : "已生成可在 App Viewer 中预览的 React 应用。",
    checks,
  };
}

function coerceFiles(value: unknown) {
  if (!value || typeof value !== "object") {
    return DEFAULT_FILES;
  }

  const files: SandpackFiles = {};
  for (const [path, fileValue] of Object.entries(value as Record<string, unknown>)) {
    if (typeof fileValue === "string") {
      files[path] = { code: fileValue };
      continue;
    }
    if (!fileValue || typeof fileValue !== "object") continue;
    const fileRecord = fileValue as Record<string, unknown>;
    if (typeof fileRecord.code !== "string") continue;
    files[path] = {
      code: fileRecord.code,
      active: typeof fileRecord.active === "boolean" ? fileRecord.active : undefined,
      hidden: typeof fileRecord.hidden === "boolean" ? fileRecord.hidden : undefined,
      readOnly: typeof fileRecord.readOnly === "boolean" ? fileRecord.readOnly : undefined,
    };
  }

  return Object.keys(files).length ? normalizeFiles(files) : DEFAULT_FILES;
}

function coerceAgentEvents(value: unknown, mode: BuilderMode, prompt: string): AgentEvent[] {
  if (!Array.isArray(value)) {
    return createAgentEvents(mode, prompt);
  }

  const events = value
    .map((item): AgentEvent | null => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      return {
        id: typeof record.id === "string" && record.id.trim() ? record.id : createId("event"),
        agent: coerceAgent(record.agent),
        role: typeof record.role === "string" && record.role.trim() ? record.role : "Agent",
        title: typeof record.title === "string" && record.title.trim() ? record.title : "完成任务",
        detail: typeof record.detail === "string" && record.detail.trim() ? record.detail : "智能体已完成该阶段。",
        status: coerceStatus(record.status),
        createdAt: typeof record.createdAt === "string" && record.createdAt.trim() ? record.createdAt : nowIso(),
      };
    })
    .filter((item): item is AgentEvent => Boolean(item));

  return events.length ? events : createAgentEvents(mode, prompt);
}

function coerceAgent(value: unknown): AgentEvent["agent"] {
  const allowed: AgentEvent["agent"][] = ["Mike", "Emma", "Bob", "Alex", "David", "Iris", "Sarah", "System"];
  return allowed.includes(value as AgentEvent["agent"]) ? (value as AgentEvent["agent"]) : "System";
}

function coerceStatus(value: unknown): AgentEvent["status"] {
  const normalized = String(value ?? "done").toLowerCase();
  if (["queued", "pending", "todo"].includes(normalized)) return "queued";
  if (["running", "in_progress", "processing"].includes(normalized)) return "running";
  if (["error", "failed", "failure"].includes(normalized)) return "error";
  return "done";
}

function titleFromPrompt(prompt: string) {
  return (
    prompt
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 6)
      .join(" ") || "Generated App"
  );
}

function provider() {
  if (process.env.AI_PROVIDER) return process.env.AI_PROVIDER.toLowerCase();
  if (process.env.DEEPSEEK_API_KEY) return "deepseek";
  return "openai";
}

function activeModel() {
  return provider() === "deepseek" ? deepSeekModel : model;
}

function hasModelKey() {
  return provider() === "deepseek" ? Boolean(process.env.DEEPSEEK_API_KEY) : Boolean(process.env.OPENAI_API_KEY);
}

async function callResponsesApi(body: { model: string; input: ChatMessage[] }) {
  if (provider() === "deepseek") {
    return callDeepSeekChatCompletions(body);
  }

  const baseUrl = process.env.OPENAI_BASE_URL?.replace(/\/$/, "") || "https://api.openai.com/v1";
  const response = await fetch(`${baseUrl}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string; type?: string }> }>;
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(payload.error?.message ?? "OpenAI Responses API request failed");
  }

  if (payload.output_text) return payload.output_text;

  const text = payload.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => content.text)
    .filter(Boolean)
    .join("\n");

  if (!text) {
    throw new Error("OpenAI response did not include text output");
  }

  return text;
}

async function callDeepSeekChatCompletions(body: { model: string; input: ChatMessage[] }) {
  const baseUrl = process.env.DEEPSEEK_BASE_URL?.replace(/\/$/, "") || "https://api.deepseek.com";
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: body.model,
      messages: body.input,
      response_format: { type: "json_object" },
      stream: false,
      max_tokens: 8192,
    }),
  });

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(payload.error?.message ?? "DeepSeek Chat Completions request failed");
  }

  const text = payload.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("DeepSeek response did not include text output");
  }

  return text;
}

function baseSystemPrompt(mode: BuilderMode) {
  return `你正在实现一个参考 Atoms 文档的 AI App Builder。
Atoms 文档要点：Engineer Mode 适合快速原型；Team Mode 由 Mike/Emma/Bob/Alex/Sarah 协作；Race Mode 并行生成多个候选；App Viewer 支持预览、编辑视觉元素、修复 bug、发布和分享。
你的输出会进入 Sandpack React 沙箱。必须生成完整文件，不要省略代码。
文件限制：只允许 /package.json、/src/main.tsx、/src/App.tsx、/src/styles.css 和 /src/ 下的辅助文件。
组件限制：优先单文件实现；如果拆分辅助组件，必须把每个相对 import 的文件完整放进 files。
代码要求：无外部脚本，无远程资源，无危险 HTML，CSS 字体不要用 viewport 缩放，卡片圆角不超过 8px。
样式要求：不要使用 Tailwind CSS 或 @tailwind；Sandpack 没有 Tailwind 构建链路。必须在 /src/styles.css 写普通 CSS，并在 JSX 中使用这些普通类名。
当前模式：${mode}。`;
}

function extractJson(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced?.[1] ?? trimmed;
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first === -1 || last === -1) {
    throw new Error("LLM response did not contain JSON");
  }
  const candidate = raw.slice(first, last + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return JSON.parse(jsonrepair(candidate));
  }
}
