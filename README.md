# Atoms Demo

一个参考 Atoms 文档实现的 AI App Builder Demo。用户可以输入自然语言需求，选择 Engineer / Team / Race 模式，生成 React 应用代码，并在 App Viewer 中实时预览、编辑、修复、发布和分享。

## 实现思路

- 工作流参考 Atoms 文档中的 Quick Start、Mode Switching、Agents Team、Race Mode、App Viewer、Issue Report、Publish 与 Share。
- 生成链路默认走服务端 `/api/generate`，本地配置为 DeepSeek Chat Completions JSON 输出，也保留 OpenAI Responses API 可选路径，再进入 Sandpack React 沙箱运行。
- 如果没有配置 `OPENAI_API_KEY`，系统会使用本地兜底生成器，保证评审时仍能完整体验初始化、预览、版本保存、发布和导出流程。
- 数据持久化使用 IndexedDB，保存项目、版本、运行记录与发布快照，不依赖 Supabase 或后端数据库。
- 发布功能生成压缩快照链接，导出功能生成包含所有 Sandpack 文件的 zip 包。

## 已完成能力

- Engineer / Team / Race 三种模式切换。
- Prompt 润色、应用生成、Race 候选选择。
- Sandpack App Viewer：桌面/移动预览、代码编辑、实时运行。
- Issue Report：提交报错或修复指令，由 `/api/repair` 返回修复后的文件。
- Visual Tokens：快速替换生成应用的主色和背景。
- IndexedDB 持久化：项目列表、版本历史、发布记录。
- Publish / Share：生成快照链接、复制链接、导出 zip。
- 单元与集成测试覆盖 schema、文件安全、发布快照、IndexedDB 和 mock LLM 返回。

## 本地运行

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

`.env.local` 示例：

```bash
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

如果要切回 OpenAI，可配置：

```bash
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.5
OPENAI_BASE_URL=https://api.openai.com/v1
```

## 验证命令

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm test
pnpm build
```

## 部署

默认推荐部署到 Vercel：

1. 推送代码到 GitHub，或在本地登录 Vercel CLI 后直接部署。
2. 在 Vercel 导入仓库，Framework 选择 `Next.js`。
3. 配置生产环境变量：

```bash
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=你的 DeepSeek Key
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

4. 使用默认 Next.js 构建命令部署：

```bash
pnpm build
```

如果使用 Vercel CLI：

```bash
pnpm dlx vercel login
pnpm dlx vercel --prod
```

部署成功后，Vercel 会返回一个 `https://xxx.vercel.app` 地址，其他人可直接通过该网址访问。

## 当前取舍

- 没有接 Supabase，原因是笔试要求只要求持久化，不要求多人协作数据库；IndexedDB 更适合快速交付可体验原型。
- 没有实现真实自定义域名发布，当前发布是压缩快照链接；这能覆盖分享与复现，不引入额外后端。
- Race Mode 当前并行生成两个候选，用户手动选择；后续可以增加模型评分和自动推荐。
- 代码运行限制在 Sandpack 白名单依赖内，降低远程资源和任意脚本风险。

## 后续扩展优先级

1. 接入真实用户登录和云端项目同步。
2. 增加 App World 展示页，把公开快照做成可浏览作品集。
3. 引入更严格的 LLM 结构化输出 schema 和自动修复重试。
4. 增加 Playwright E2E，覆盖真实浏览器里的生成、编辑、发布路径。
5. 增加 Supabase / 邮件 / 支付等集成向导，还原 Atoms Cloud 与 Connectors 体验。
