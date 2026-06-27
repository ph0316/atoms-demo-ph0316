"use client";

import {
  SandpackCodeEditor,
  SandpackLayout,
  SandpackPreview,
  SandpackProvider,
  useSandpack,
} from "@codesandbox/sandpack-react";
import {
  AlertTriangle,
  Bot,
  Check,
  ChevronRight,
  Code2,
  Copy,
  Download,
  Eye,
  History,
  Laptop,
  Loader2,
  LogOut,
  MonitorSmartphone,
  Paintbrush,
  PanelLeft,
  Play,
  Rocket,
  Share2,
  Smartphone,
  Sparkles,
  UserCircle2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AuthUser } from "@/lib/auth";
import { DEFAULT_FILES } from "@/lib/constants";
import { generateApp, polishPrompt, repairApp } from "@/lib/api-client";
import { normalizeFiles } from "@/lib/file-safety";
import { createId, nowIso } from "@/lib/ids";
import {
  getLatestVersion,
  listProjects,
  listRuns,
  listSnapshots,
  listVersions,
  saveGeneratedProject,
  saveRun,
  saveSnapshot,
  saveVersion,
} from "@/lib/persistence";
import { buildSnapshotUrl, decodeSnapshot, exportZip } from "@/lib/publish";
import type {
  AgentEvent,
  BuilderMode,
  GenerationCandidate,
  ProjectRecord,
  PublishedSnapshot,
  RunRecord,
  SandpackFiles,
  VersionRecord,
} from "@/lib/schemas";

const samplePrompts = [
  "给独立咖啡馆做一个会员积分和新品预订小程序首页",
  "生成一个 AI 简历评估工具，包含上传、评分和建议面板",
  "做一个 SaaS 销售漏斗看板，有筛选、指标卡和趋势图",
];

const modeMeta: Record<BuilderMode, { label: string; icon: typeof Bot }> = {
  engineer: { label: "Engineer", icon: Code2 },
  team: { label: "Team", icon: Bot },
  race: { label: "Race", icon: Play },
};

type BuildProgress = {
  id: string;
  prompt: string;
  mode: BuilderMode;
  createdAt: string;
  status: "running" | "error";
  message: string;
  phase: number;
  agentEvents: AgentEvent[];
};

type ConversationRun = RunRecord | BuildProgress;

export function Workspace({ currentUser, onLogout }: { currentUser: AuthUser; onLogout: () => void }) {
  const [prompt, setPrompt] = useState(samplePrompts[0]);
  const [mode, setMode] = useState<BuilderMode>("team");
  const [files, setFiles] = useState<SandpackFiles>(DEFAULT_FILES);
  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [versions, setVersions] = useState<VersionRecord[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [snapshots, setSnapshots] = useState<PublishedSnapshot[]>([]);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [agentEvents, setAgentEvents] = useState<AgentEvent[]>([]);
  const [summary, setSummary] = useState("等待构建");
  const [status, setStatus] = useState("Ready");
  const [issue, setIssue] = useState("");
  const [repairInstruction, setRepairInstruction] = useState("");
  const [publishUrl, setPublishUrl] = useState("");
  const [permission, setPermission] = useState<PublishedSnapshot["permission"]>("link");
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [viewerMode, setViewerMode] = useState<"preview" | "code">("preview");
  const [candidates, setCandidates] = useState<GenerationCandidate[]>([]);
  const [activeCandidateId, setActiveCandidateId] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [buildProgress, setBuildProgress] = useState<BuildProgress | null>(null);
  const [todayLabel, setTodayLabel] = useState("今天");
  const [sandpackKey, setSandpackKey] = useState(createId("sandpack"));

  const replaceFiles = useCallback((nextFiles: SandpackFiles) => {
    setFiles(nextFiles);
    setSandpackKey(createId("sandpack"));
  }, []);

  const refreshLists = useCallback(async (projectId?: string) => {
    const [nextProjects, nextVersions, nextSnapshots, nextRuns] = await Promise.all([
      listProjects(),
      projectId ? listVersions(projectId) : Promise.resolve([]),
      projectId ? listSnapshots(projectId) : Promise.resolve([]),
      projectId ? listRuns(projectId) : Promise.resolve([]),
    ]);
    setProjects(nextProjects);
    setVersions(nextVersions);
    setSnapshots(nextSnapshots);
    setRuns(nextRuns);
  }, []);

  useEffect(() => {
    refreshLists().catch(() => undefined);
  }, [refreshLists]);

  useEffect(() => {
    const appCode = files["/src/App.tsx"]?.code ?? "";
    if (!project && (appCode.includes("开始构建") || appCode.includes("function startBuild"))) {
      replaceFiles(DEFAULT_FILES);
    }
  }, [files, project, replaceFiles]);

  useEffect(() => {
    setTodayLabel(
      new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "numeric",
        day: "numeric",
      }).format(new Date()),
    );
  }, []);

  useEffect(() => {
    if (!window.location.hash.startsWith("#snapshot=")) return;
    try {
      const payload = decodeSnapshot(window.location.hash.replace("#snapshot=", ""));
      replaceFiles(normalizeFiles(payload.files));
      setViewerMode("preview");
      setSummary(`已载入发布快照：${payload.title}`);
      setStatus("Snapshot");
    } catch {
      setStatus("Snapshot parse failed");
    }
  }, [replaceFiles]);

  useEffect(() => {
    if (!buildProgress || buildProgress.status !== "running") return;

    const interval = window.setInterval(() => {
      setBuildProgress((current) => {
        if (!current || current.status !== "running") return current;
        const nextPhase = Math.min(current.phase + 1, getBuildProgressPlan(current.mode).length - 1);

        return {
          ...current,
          phase: nextPhase,
          message: getBuildProgressMessage(current.mode, nextPhase),
          agentEvents: createProgressEvents(current.mode, current.prompt, nextPhase),
        };
      });
    }, 1500);

    return () => window.clearInterval(interval);
  }, [buildProgress]);

  const activeCandidate = useMemo(
    () => candidates.find((candidate) => candidate.id === activeCandidateId),
    [activeCandidateId, candidates],
  );

  const conversationRuns = useMemo<ConversationRun[]>(
    () => (buildProgress ? [...runs, buildProgress] : runs),
    [buildProgress, runs],
  );

  const lastRunPrompt = runs.at(-1)?.prompt ?? "";
  const shouldShowDraftPrompt = !buildProgress && prompt.trim().length > 0 && prompt.trim() !== lastRunPrompt.trim();

  async function handleGenerate() {
    const buildPrompt = prompt.trim();
    if (!buildPrompt) return;
    const startedAt = nowIso();
    setPrompt("");
    setBuildProgress({
      id: createId("pending-run"),
      prompt: buildPrompt,
      mode,
      createdAt: startedAt,
      status: "running",
      message: getBuildProgressMessage(mode, 0),
      phase: 0,
      agentEvents: createProgressEvents(mode, buildPrompt, 0),
    });
    setStatus("Generating");
    setLoading(true);
    setCandidates([]);
    try {
      const result = await generateApp({ prompt: buildPrompt, mode, previousFiles: files });
      const nextFiles = normalizeFiles(result.files);
      replaceFiles(nextFiles);
      setViewerMode("preview");
      setAgentEvents(result.agentEvents);
      setSummary(result.summary);
      setCandidates(result.candidates ?? []);
      setActiveCandidateId(result.candidates?.[0]?.id ?? "");
      const saved = await saveGeneratedProject({
        projectId: project?.id,
        name: result.projectName,
        prompt: buildPrompt,
        mode,
        files: nextFiles,
        summary: result.summary,
        agentEvents: result.agentEvents,
      });
      setProject(saved.project);
      await refreshLists(saved.project.id);
      setBuildProgress(null);
      setStatus(result.usedFallback ? "Local fallback" : "Generated");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Generate failed";
      setBuildProgress((current) =>
        current
          ? {
              ...current,
              status: "error",
              message,
              agentEvents: current.agentEvents.map((event, index, events) => ({
                ...event,
                status: index === events.length - 1 ? "error" : event.status === "running" ? "error" : event.status,
              })),
            }
          : null,
      );
      setStatus(message);
    } finally {
      setLoading(false);
    }
  }

  async function handlePolish() {
    setStatus("Polishing");
    setLoading(true);
    try {
      const result = await polishPrompt(prompt);
      setPrompt(result.polishedPrompt);
      setSummary(result.brief.join(" / "));
      setStatus("Polished");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Polish failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleRepair() {
    const issueText = issue || "请检查当前应用中的运行错误、布局溢出和交互问题。";
    setStatus("Repairing");
    setLoading(true);
    try {
      const result = await repairApp({ files, issue: issueText, instruction: repairInstruction });
      const nextFiles = normalizeFiles(result.files);
      replaceFiles(nextFiles);
      setViewerMode("preview");
      setAgentEvents(result.agentEvents);
      setSummary(result.fixSummary);
      if (project) {
        await saveVersion({
          projectId: project.id,
          label: "fix",
          summary: result.fixSummary,
          files: nextFiles,
          agentEvents: result.agentEvents,
        });
        await saveRun({
          projectId: project.id,
          mode,
          prompt: repairInstruction ? `${issueText}\n\n修复方向：${repairInstruction}` : issueText,
          status: "success",
          message: result.fixSummary,
        });
        await refreshLists(project.id);
      }
      setIssue("");
      setRepairInstruction("");
      setStatus(result.usedFallback ? "Local fix" : "Fixed");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Repair failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleProjectLoad(nextProject: ProjectRecord) {
    const latest = await getLatestVersion(nextProject.id);
    setProject(nextProject);
    setPrompt(nextProject.prompt);
    setMode(nextProject.mode);
    if (latest) {
      replaceFiles(normalizeFiles(latest.files));
      setViewerMode("preview");
      setAgentEvents(latest.agentEvents);
      setSummary(latest.summary);
    }
    await refreshLists(nextProject.id);
  }

  async function handleVersionLoad(version: VersionRecord) {
    replaceFiles(normalizeFiles(version.files));
    setViewerMode("preview");
    setAgentEvents(version.agentEvents);
    setSummary(version.summary);
    setStatus(`Loaded ${version.label}`);
  }

  function handleCandidateSelect(candidate: GenerationCandidate) {
    setActiveCandidateId(candidate.id);
    replaceFiles(normalizeFiles(candidate.files));
    setViewerMode("preview");
    setSummary(candidate.summary);
  }

  async function handleSaveVersion() {
    if (!project) return;
    const version = await saveVersion({
      projectId: project.id,
      label: "manual",
      summary: "手动保存 App Viewer 当前代码",
      files,
      agentEvents,
    });
    await refreshLists(project.id);
    setStatus(`Saved ${version.label}`);
  }

  async function handlePublish() {
    const title = project?.name ?? "Atoms Demo Snapshot";
    const url = buildSnapshotUrl({ title, files, createdAt: nowIso() });
    setPublishUrl(url);
    if (project) {
      const version = versions[0] ?? (await saveVersion({
        projectId: project.id,
        label: "publish",
        summary: "发布快照",
        files,
        agentEvents,
      }));
      await saveSnapshot({
        projectId: project.id,
        versionId: version.id,
        title,
        permission,
        url,
        files,
      });
      await refreshLists(project.id);
    }
    setStatus("Published");
  }

  async function handleCopy() {
    if (!publishUrl) return;
    await navigator.clipboard.writeText(publishUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1300);
  }

  function applyVisualToken(token: "cobalt" | "mint" | "mono") {
    const styles = files["/src/styles.css"]?.code ?? "";
    const palette =
      token === "mint"
        ? { primary: "#0f8f72", bg: "#eef8f3" }
        : token === "mono"
          ? { primary: "#15171c", bg: "#f2f2f0" }
          : { primary: "#334bfa", bg: "#eef3ff" };
    const nextStyles = styles
      .replace(/#334bfa|#0f8f72|#15171c/g, palette.primary)
      .replace(/#eef3ff|#eef8f3|#f2f2f0|#fff7e2/g, palette.bg);
    replaceFiles({
      ...files,
      "/src/styles.css": {
        ...(files["/src/styles.css"] ?? { code: "" }),
        code: nextStyles,
      },
    });
  }

  return (
    <main className="h-screen overflow-hidden bg-[#f7f7f4] p-3 text-ink md:p-4">
      <div className="grid h-full min-h-0 grid-cols-1 gap-3 lg:grid-cols-[420px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-line bg-white shadow-soft">
          <div className="border-b border-line px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <Sparkles className="h-5 w-5 shrink-0 text-cobalt" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-black">{project?.name ?? "Atoms Demo"}</div>
                  <div className="truncate text-xs font-bold text-ink/50">{modeMeta[mode].label} workspace</div>
                </div>
              </div>
              <span className="shrink-0 rounded-full bg-panel px-2.5 py-1 text-xs font-black text-ink/70">{status}</span>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-line bg-panel px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <UserCircle2 className="h-4 w-4 shrink-0 text-cobalt" />
                <div className="min-w-0">
                  <div className="truncate text-xs font-black">{currentUser.name}</div>
                  <div className="truncate text-[11px] font-bold text-ink/50">{currentUser.email}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={onLogout}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-white text-ink hover:border-cobalt"
                title="退出登录"
                aria-label="退出登录"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2" aria-label="Mode">
              {(Object.entries(modeMeta) as Array<[BuilderMode, (typeof modeMeta)[BuilderMode]]>).map(([key, meta]) => {
                const Icon = meta.icon;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setMode(key)}
                    className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg border text-xs font-black transition ${
                      mode === key
                        ? "border-cobalt bg-cobalt text-white"
                        : "border-line bg-white text-ink hover:border-cobalt"
                    }`}
                    title={`${meta.label} Mode`}
                  >
                    <Icon className="h-4 w-4" />
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-5 overflow-auto px-4 py-4">
            <div className="flex items-center gap-3 text-xs font-black text-ink/45">
              <span className="h-px flex-1 bg-line" />
              {todayLabel}
              <span className="h-px flex-1 bg-line" />
            </div>

            {conversationRuns.length === 0 ? (
              <>
                <ChatBubble role="user" title="你" time="当前输入">
                  <p className="whitespace-pre-wrap text-sm leading-6">{prompt || "描述你想生成的应用"}</p>
                </ChatBubble>

                <ChatBubble role="assistant" title="Alex" subtitle="AI Engineer">
                  <div className="space-y-3">
                    <p className="text-sm leading-6 text-ink/78">{summary}</p>
                    <EmptyLine label="AI 回复会在 Build 后出现在这里" />
                  </div>
                </ChatBubble>
              </>
            ) : (
              conversationRuns.map((run, index) => {
                const isLatestRun = index === conversationRuns.length - 1;
                const isProgressRun = isBuildProgress(run);
                const visibleAgentEvents = isProgressRun ? run.agentEvents : isLatestRun ? agentEvents : [];

                return (
                  <div key={run.id} className="space-y-3">
                    <ChatBubble role="user" title="你" time={formatRunTime(run.createdAt)}>
                      <p className="whitespace-pre-wrap text-sm leading-6">{run.prompt}</p>
                    </ChatBubble>

                    <ChatBubble
                      role="assistant"
                      title={visibleAgentEvents[0]?.agent ?? "Alex"}
                      subtitle={getRunSubtitle(run)}
                      time={formatRunTime(run.createdAt)}
                    >
                      <div className="space-y-3">
                        <p className="whitespace-pre-wrap text-sm leading-6 text-ink/78">{run.message}</p>
                        {visibleAgentEvents.length > 0 && (
                          <div className="space-y-2">
                            <div className="inline-flex items-center gap-2 rounded-full bg-panel px-3 py-1 text-xs font-black text-ink/60">
                              {isProgressRun && run.status === "running" ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-cobalt" />
                              ) : (
                                <Check className="h-3.5 w-3.5 text-mint" />
                              )}
                              {isProgressRun && run.status === "running"
                                ? `正在处理第 ${run.phase + 1} 步`
                                : `已处理 ${visibleAgentEvents.length} 步`}
                            </div>
                            {visibleAgentEvents.map((event) => (
                              <AgentEventItem key={event.id} event={event} />
                            ))}
                          </div>
                        )}
                      </div>
                    </ChatBubble>
                  </div>
                );
              })
            )}

            {conversationRuns.length > 0 && shouldShowDraftPrompt && (
              <ChatBubble role="user" title="你" time="草稿">
                <p className="whitespace-pre-wrap text-sm leading-6">{prompt}</p>
              </ChatBubble>
            )}

            {candidates.length > 0 && (
              <ChatBubble role="assistant" title="Race 候选" subtitle="选择一个进入右侧预览">
                <div className="grid gap-2">
                  {candidates.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      onClick={() => handleCandidateSelect(candidate)}
                      className={`rounded-lg border p-3 text-left text-sm ${
                        activeCandidate?.id === candidate.id ? "border-mint bg-mint/10" : "border-line bg-white"
                      }`}
                    >
                      <span className="block font-black">{candidate.label}</span>
                      <span className="line-clamp-2 text-xs leading-5 text-ink/60">{candidate.summary}</span>
                    </button>
                  ))}
                </div>
              </ChatBubble>
            )}

            <details className="group rounded-lg border border-line bg-white p-3">
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-black">
                <span className="inline-flex items-center gap-2">
                  <Paintbrush className="h-4 w-4 text-cobalt" />
                  视觉与修复
                </span>
                <ChevronRight className="h-4 w-4 text-ink/45 transition group-open:rotate-90" />
              </summary>
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <Swatch color="#334bfa" label="Cobalt" onClick={() => applyVisualToken("cobalt")} />
                  <Swatch color="#0f8f72" label="Mint" onClick={() => applyVisualToken("mint")} />
                  <Swatch color="#15171c" label="Mono" onClick={() => applyVisualToken("mono")} />
                </div>
                <textarea
                  value={issue}
                  onChange={(event) => setIssue(event.target.value)}
                  className="h-24 w-full resize-none rounded-lg border border-line bg-panel p-3 text-sm outline-none focus:border-ember"
                  placeholder="粘贴报错或描述问题"
                />
                <textarea
                  value={repairInstruction}
                  onChange={(event) => setRepairInstruction(event.target.value)}
                  className="h-20 w-full resize-none rounded-lg border border-line bg-panel p-3 text-sm outline-none focus:border-ember"
                  placeholder="可选修复方向"
                />
                <button
                  type="button"
                  onClick={handleRepair}
                  disabled={loading}
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-ember px-4 text-sm font-black text-white disabled:opacity-60"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
                  Resolve
                </button>
              </div>
            </details>

            <details className="group rounded-lg border border-line bg-white p-3">
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-black">
                <span className="inline-flex items-center gap-2">
                  <Share2 className="h-4 w-4 text-cobalt" />
                  发布与分享
                </span>
                <ChevronRight className="h-4 w-4 text-ink/45 transition group-open:rotate-90" />
              </summary>
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  {(["link", "public", "private"] as const).map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setPermission(item)}
                      className={`h-10 rounded-lg border text-xs font-black ${
                        permission === item ? "border-cobalt bg-cobalt text-white" : "border-line bg-white"
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handlePublish}
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-cobalt px-4 text-sm font-black text-white"
                >
                  <Rocket className="h-4 w-4" />
                  Publish
                </button>
                {publishUrl && (
                  <div className="rounded-lg border border-line bg-panel p-3">
                    <div className="mb-2 line-clamp-2 break-all text-xs text-ink/65">{publishUrl}</div>
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-line bg-white text-xs font-black text-ink"
                    >
                      {copied ? <Check className="h-4 w-4 text-mint" /> : <Copy className="h-4 w-4" />}
                      Copy
                    </button>
                  </div>
                )}
                {snapshots.map((snapshot) => (
                  <a
                    key={snapshot.id}
                    href={snapshot.url}
                    className="block rounded-lg border border-line bg-white p-3 text-sm no-underline hover:border-cobalt"
                  >
                    <span className="block font-black text-ink">{snapshot.title}</span>
                    <span className="text-xs text-ink/55">
                      {snapshot.permission} · {new Date(snapshot.createdAt).toLocaleString()}
                    </span>
                  </a>
                ))}
              </div>
            </details>
          </div>

          <div className="border-t border-line bg-white p-4">
            <label className="sr-only" htmlFor="prompt-composer">
              输入需求
            </label>
            <textarea
              id="prompt-composer"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              className="h-28 w-full resize-none rounded-lg border border-line bg-panel p-3 text-sm leading-6 outline-none focus:border-cobalt"
              placeholder="输入你的应用需求，AI 的回复会出现在上方对话流"
            />
            <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={loading}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-cobalt px-4 text-sm font-black text-white disabled:opacity-60"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Build
              </button>
              <button
                type="button"
                onClick={handlePolish}
                disabled={loading}
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-white text-ink disabled:opacity-60"
                title="优化提示词"
              >
                <Sparkles className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {samplePrompts.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setPrompt(item)}
                  className="shrink-0 rounded-full border border-line bg-white px-3 py-1.5 text-left text-xs font-bold text-ink/75 hover:border-cobalt"
                >
                  {item}
                </button>
              ))}
            </div>
            <details className="group mt-3 rounded-lg border border-line bg-panel/55 p-3">
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-black">
                <span className="inline-flex items-center gap-2">
                  <PanelLeft className="h-4 w-4 text-cobalt" />
                  项目与版本
                </span>
                <ChevronRight className="h-4 w-4 text-ink/45 transition group-open:rotate-90" />
              </summary>
              <div className="mt-3 space-y-3">
                <div className="grid gap-2">
                  {projects.length === 0 ? (
                    <EmptyLine label="尚无项目" />
                  ) : (
                    projects.slice(0, 4).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleProjectLoad(item)}
                        className={`flex w-full items-center justify-between rounded-lg border p-3 text-left text-sm ${
                          project?.id === item.id ? "border-cobalt bg-cobalt/8" : "border-line bg-white"
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-black">{item.name}</span>
                          <span className="text-xs text-ink/55">{item.mode}</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-ink/45" />
                      </button>
                    ))
                  )}
                </div>

                {versions.length > 0 && (
                  <details className="group rounded-lg border border-line bg-white p-3">
                    <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-black">
                      <span className="inline-flex items-center gap-2">
                        <History className="h-4 w-4 text-cobalt" />
                        版本历史
                      </span>
                      <ChevronRight className="h-4 w-4 text-ink/45 transition group-open:rotate-90" />
                    </summary>
                    <div className="mt-3 max-h-48 space-y-2 overflow-auto">
                      {versions.map((version) => (
                        <button
                          key={version.id}
                          type="button"
                          onClick={() => handleVersionLoad(version)}
                          className="w-full rounded-lg border border-line bg-white p-3 text-left text-sm hover:border-cobalt"
                        >
                          <span className="font-black">{version.label}</span>
                          <span className="ml-2 text-xs text-ink/55">{new Date(version.createdAt).toLocaleString()}</span>
                          <span className="mt-1 line-clamp-2 block text-xs leading-5 text-ink/60">{version.summary}</span>
                        </button>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </details>
          </div>
        </aside>

        <section className="grid min-h-[560px] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border border-line bg-white shadow-soft lg:h-full lg:max-h-full lg:min-h-0">
          <div className="row-start-1 flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <MonitorSmartphone className="h-5 w-5 shrink-0 text-mint" />
              <div className="min-w-0">
                <div className="truncate text-sm font-black">应用查看器</div>
                <div className="truncate text-xs text-ink/55">{summary}</div>
              </div>
              <span className="hidden rounded-full bg-mint/10 px-2 py-1 text-xs font-black text-mint md:inline-flex">
                Live
              </span>
            </div>
            <div className="flex items-center gap-2">
              <IconButton
                active={viewerMode === "preview"}
                title="预览"
                tooltip="预览应用：查看当前生成页面"
                onClick={() => setViewerMode("preview")}
              >
                <Eye className="h-4 w-4" />
              </IconButton>
              <IconButton
                active={viewerMode === "code"}
                title="代码"
                tooltip="代码编辑：查看并修改生成文件"
                onClick={() => setViewerMode("code")}
              >
                <Code2 className="h-4 w-4" />
              </IconButton>
              <IconButton
                active={previewMode === "desktop" && viewerMode === "preview"}
                title="桌面预览"
                tooltip="桌面尺寸：按宽屏查看应用"
                onClick={() => {
                  setPreviewMode("desktop");
                  setViewerMode("preview");
                }}
              >
                <Laptop className="h-4 w-4" />
              </IconButton>
              <IconButton
                active={previewMode === "mobile" && viewerMode === "preview"}
                title="移动预览"
                tooltip="移动尺寸：按手机宽度查看应用"
                onClick={() => {
                  setPreviewMode("mobile");
                  setViewerMode("preview");
                }}
              >
                <Smartphone className="h-4 w-4" />
              </IconButton>
              <IconButton
                title="保存版本"
                tooltip="保存版本：记录当前代码和预览状态"
                onClick={handleSaveVersion}
                disabled={!project}
              >
                <Check className="h-4 w-4" />
              </IconButton>
              <IconButton title="发布" tooltip="发布快照：生成可分享链接" onClick={handlePublish}>
                <Rocket className="h-4 w-4" />
              </IconButton>
              <IconButton
                title="导出 ZIP"
                tooltip="导出代码：下载当前 Sandpack 文件"
                onClick={() => exportZip(files, project?.name ?? "atoms-demo")}
              >
                <Download className="h-4 w-4" />
              </IconButton>
            </div>
          </div>

          <div className="builder-sandpack-slot row-start-2 min-h-0 overflow-hidden">
            <SandpackProvider
              key={sandpackKey}
              template="react-ts"
              files={files}
              theme="light"
              options={{
                activeFile: "/src/App.tsx",
                visibleFiles: ["/src/App.tsx", "/src/styles.css"],
              }}
            >
              <FileSync onFilesChange={setFiles} />
              <PreviewFrameClamp watchKey={`${sandpackKey}:${viewerMode}:${previewMode}`} />
              <div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)] overflow-auto overscroll-contain">
                <div
                  className={`sandpack-wrapper sandpack-preview-shell col-start-1 row-start-1 h-full max-h-full min-h-0 overflow-hidden bg-[#f8f8f5] p-3 transition-opacity ${
                    viewerMode === "preview" ? "z-10 opacity-100" : "pointer-events-none z-0 opacity-0"
                  }`}
                  aria-hidden={viewerMode !== "preview"}
                >
                  <div
                    className={`mx-auto h-full max-h-full overflow-hidden rounded-lg border border-line bg-white ${
                      previewMode === "mobile" ? "max-w-[390px]" : "w-full"
                    }`}
                  >
                    <SandpackLayout>
                      <SandpackPreview
                        showNavigator
                        showOpenInCodeSandbox={false}
                        showRefreshButton
                        style={{ minHeight: "100%", height: "100%" }}
                      />
                    </SandpackLayout>
                  </div>
                </div>

                <div
                  className={`sandpack-wrapper col-start-1 row-start-1 h-full max-h-full min-h-0 border-t border-line bg-white transition-opacity ${
                    viewerMode === "code" ? "z-10 opacity-100" : "pointer-events-none z-0 opacity-0"
                  }`}
                  aria-hidden={viewerMode !== "code"}
                >
                  <SandpackLayout>
                    <SandpackCodeEditor
                      showTabs
                      showLineNumbers
                      showInlineErrors
                      wrapContent
                      style={{ height: "100%" }}
                    />
                  </SandpackLayout>
                </div>
              </div>
            </SandpackProvider>
          </div>
        </section>
      </div>
    </main>
  );
}

function FileSync({ onFilesChange }: { onFilesChange: (files: SandpackFiles) => void }) {
  const { sandpack } = useSandpack();
  const lastSnapshotRef = useRef("");

  useEffect(() => {
    const normalized = normalizeFiles(sandpack.files as SandpackFiles);
    const nextSnapshot = JSON.stringify(normalized);
    if (nextSnapshot === lastSnapshotRef.current) return;
    lastSnapshotRef.current = nextSnapshot;
    onFilesChange(normalized);
  }, [onFilesChange, sandpack.files]);

  return null;
}

function PreviewFrameClamp({ watchKey }: { watchKey: string }) {
  useEffect(() => {
    let disposed = false;

    const clamp = () => {
      if (disposed) return;
      const root = document.querySelector<HTMLElement>(".sandpack-preview-shell");
      if (!root) return;

      root
        .querySelectorAll<HTMLElement>(".sp-layout, .sp-stack, .sp-preview, .sp-preview-container")
        .forEach((node) => {
          node.style.setProperty("height", "100%", "important");
          node.style.setProperty("min-height", "100%", "important");
          node.style.setProperty("max-height", "100%", "important");
        });

      root.querySelectorAll<HTMLIFrameElement>("iframe").forEach((iframe) => {
        iframe.style.setProperty("height", "100%", "important");
        iframe.style.setProperty("min-height", "100%", "important");
        iframe.style.setProperty("max-height", "100%", "important");
        iframe.setAttribute("scrolling", "yes");

        try {
          const doc = iframe.contentDocument;
          if (!doc) return;
          doc.documentElement.style.overflowY = "auto";
          doc.documentElement.style.height = "auto";
          if (doc.body) {
            doc.body.style.overflowY = "auto";
            doc.body.style.minHeight = "100%";
          }
        } catch {
          // Sandpack may isolate the preview iframe; style the frame itself when inner access is blocked.
        }
      });
    };

    const root = document.querySelector<HTMLElement>(".sandpack-preview-shell");
    const observer = root ? new MutationObserver(clamp) : null;
    if (root && observer) {
      observer.observe(root, { childList: true, subtree: true });
    }

    clamp();
    const animationFrame = window.requestAnimationFrame(clamp);
    const timeout = window.setTimeout(clamp, 250);
    const interval = window.setInterval(clamp, 700);

    return () => {
      disposed = true;
      observer?.disconnect();
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, [watchKey]);

  return null;
}

function SectionTitle({ icon: Icon, label }: { icon: typeof Bot; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm font-black">
      <Icon className="h-4 w-4 text-cobalt" />
      {label}
    </div>
  );
}

function EmptyLine({ label }: { label: string }) {
  return <div className="rounded-lg border border-dashed border-line bg-panel p-3 text-sm text-ink/50">{label}</div>;
}

function formatRunTime(createdAt: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(createdAt));
}

function isBuildProgress(run: ConversationRun): run is BuildProgress {
  return run.status === "running" || (run.status === "error" && "phase" in run);
}

function getRunSubtitle(run: ConversationRun) {
  if (isBuildProgress(run)) return run.status === "running" ? "正在构建" : "构建失败";
  return run.status === "success" ? "已完成" : "需要处理";
}

function getBuildProgressPlan(mode: BuilderMode) {
  if (mode === "race") {
    return [
      {
        agent: "System" as const,
        role: "Race Coordinator",
        title: "启动双方案生成",
        detail: "正在把需求拆成两个候选方向，并准备并行生成。",
      },
      {
        agent: "David" as const,
        role: "Candidate A",
        title: "生成候选 A",
        detail: "围绕核心功能快速搭建一个可运行版本。",
      },
      {
        agent: "Iris" as const,
        role: "Candidate B",
        title: "生成候选 B",
        detail: "从不同布局和交互角度生成第二个候选版本。",
      },
      {
        agent: "Alex" as const,
        role: "Reviewer",
        title: "比较候选并整理结果",
        detail: "正在检查文件结构、依赖和可预览性，准备把候选交给你选择。",
      },
    ];
  }

  if (mode === "team") {
    return [
      {
        agent: "Emma" as const,
        role: "Product Manager",
        title: "梳理需求",
        detail: "正在把你的描述拆成目标用户、核心页面、关键交互和验收点。",
      },
      {
        agent: "Mike" as const,
        role: "Software Engineer",
        title: "设计架构",
        detail: "正在确定 React 组件结构、状态管理方式和 Sandpack 可运行文件。",
      },
      {
        agent: "Bob" as const,
        role: "Designer",
        title: "设计界面",
        detail: "正在安排布局、颜色、间距和主要组件的视觉层级。",
      },
      {
        agent: "Alex" as const,
        role: "Full Stack Developer",
        title: "生成代码",
        detail: "正在编写 App.tsx、样式和必要的辅助组件。",
      },
      {
        agent: "Sarah" as const,
        role: "QA Specialist",
        title: "检查预览",
        detail: "正在检查依赖白名单、文件路径和可运行预览。",
      },
    ];
  }

  return [
    {
      agent: "Alex" as const,
      role: "Engineer",
      title: "理解需求",
      detail: "正在提取应用目标、页面结构和核心交互。",
    },
    {
      agent: "Alex" as const,
      role: "Engineer",
      title: "生成 React 原型",
      detail: "正在编写可直接预览的 React 组件和样式。",
    },
    {
      agent: "Alex" as const,
      role: "Engineer",
      title: "检查运行结果",
      detail: "正在确认文件结构、依赖和 App Viewer 兼容性。",
    },
  ];
}

function getBuildProgressMessage(mode: BuilderMode, phase: number) {
  const step = getBuildProgressPlan(mode)[phase] ?? getBuildProgressPlan(mode).at(-1);
  return step ? `${step.agent} 正在${step.title}：${step.detail}` : "AI 正在生成应用。";
}

function createProgressEvents(mode: BuilderMode, promptText: string, activePhase: number): AgentEvent[] {
  return getBuildProgressPlan(mode).map((step, index) => ({
    id: `progress-${mode}-${index}`,
    agent: step.agent,
    role: step.role,
    title: step.title,
    detail: index === 0 ? `${step.detail}\n需求：${promptText}` : step.detail,
    status: index < activePhase ? "done" : index === activePhase ? "running" : "queued",
    createdAt: nowIso(),
  }));
}

function ChatBubble({
  role,
  title,
  subtitle,
  time,
  children,
}: {
  role: "user" | "assistant";
  title: string;
  subtitle?: string;
  time?: string;
  children: React.ReactNode;
}) {
  const isUser = role === "user";

  return (
    <article className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cobalt text-white">
          <Bot className="h-4 w-4" />
        </div>
      )}
      <div className={`min-w-0 flex-1 ${isUser ? "max-w-[92%]" : ""}`}>
        <div className={`mb-1 flex items-center gap-2 text-xs font-black text-ink/50 ${isUser ? "justify-end" : ""}`}>
          <span>{title}</span>
          {subtitle && <span className="font-bold">{subtitle}</span>}
          {time && <span className="font-bold">{time}</span>}
        </div>
        <div
          className={`rounded-lg border p-3 ${
            isUser ? "border-cobalt/25 bg-cobalt/8" : "border-line bg-white"
          }`}
        >
          {children}
        </div>
      </div>
    </article>
  );
}

function IconButton({
  children,
  title,
  tooltip,
  active,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  tooltip?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`group relative inline-flex h-10 w-10 items-center justify-center rounded-lg border text-ink disabled:opacity-40 ${
        active ? "border-cobalt bg-cobalt text-white" : "border-line bg-white hover:border-cobalt"
      }`}
    >
      {children}
      {tooltip && (
        <span className="pointer-events-none absolute left-1/2 top-[calc(100%+8px)] z-50 w-max max-w-56 -translate-x-1/2 rounded-md bg-ink px-2.5 py-1.5 text-left text-[11px] font-bold leading-4 text-white opacity-0 shadow-soft transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          {tooltip}
        </span>
      )}
    </button>
  );
}

function Swatch({ color, label, onClick }: { color: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-14 flex-col items-center justify-center gap-1 rounded-lg border border-line bg-white text-xs font-black"
      title={label}
    >
      <span className="h-5 w-5 rounded-full border border-black/10" style={{ background: color }} />
      {label}
    </button>
  );
}

function AgentEventItem({ event }: { event: AgentEvent }) {
  return (
    <article className="rounded-lg border border-line bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="font-black">{event.agent}</div>
        <span className="rounded-full bg-panel px-2 py-1 text-[11px] font-black text-ink/55">{event.status}</span>
      </div>
      <div className="mt-1 text-xs font-bold text-ink/55">{event.role}</div>
      <div className="mt-2 text-sm font-black">{event.title}</div>
      <p className="mt-1 line-clamp-3 text-xs leading-5 text-ink/62">{event.detail}</p>
    </article>
  );
}
