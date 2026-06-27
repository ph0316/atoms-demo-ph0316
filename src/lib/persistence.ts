import { db } from "@/lib/db";
import { createId, nowIso } from "@/lib/ids";
import type {
  AgentEvent,
  BuilderMode,
  ProjectRecord,
  PublishedSnapshot,
  RunRecord,
  SandpackFiles,
  VersionRecord,
} from "@/lib/schemas";

export async function listProjects() {
  return db.projects.orderBy("updatedAt").reverse().toArray();
}

export async function listVersions(projectId: string) {
  return db.versions.where("projectId").equals(projectId).reverse().sortBy("createdAt");
}

export async function listSnapshots(projectId: string) {
  return db.publishedSnapshots.where("projectId").equals(projectId).reverse().sortBy("createdAt");
}

export async function listRuns(projectId: string) {
  return db.runs.where("projectId").equals(projectId).sortBy("createdAt");
}

export async function saveRun(input: Omit<RunRecord, "id" | "createdAt">) {
  const run: RunRecord = {
    ...input,
    id: createId("run"),
    createdAt: nowIso(),
  };
  await db.runs.put(run);
  return run;
}

export async function saveGeneratedProject(input: {
  projectId?: string;
  name: string;
  prompt: string;
  mode: BuilderMode;
  files: SandpackFiles;
  summary: string;
  agentEvents: AgentEvent[];
}) {
  const timestamp = nowIso();
  const project: ProjectRecord = {
    id: input.projectId ?? createId("project"),
    name: input.name,
    prompt: input.prompt,
    mode: input.mode,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const existing = input.projectId ? await db.projects.get(input.projectId) : undefined;
  await db.projects.put({
    ...project,
    createdAt: existing?.createdAt ?? project.createdAt,
  });

  const version: VersionRecord = {
    id: createId("version"),
    projectId: project.id,
    label: `v${Date.now().toString().slice(-5)}`,
    summary: input.summary,
    files: input.files,
    agentEvents: input.agentEvents,
    createdAt: timestamp,
  };
  await db.versions.put(version);

  const run: RunRecord = {
    id: createId("run"),
    projectId: project.id,
    mode: input.mode,
    prompt: input.prompt,
    status: "success",
    createdAt: timestamp,
    message: input.summary,
  };
  await db.runs.put(run);

  return { project, version, run };
}

export async function saveVersion(input: {
  projectId: string;
  label: string;
  summary: string;
  files: SandpackFiles;
  agentEvents: AgentEvent[];
}) {
  const timestamp = nowIso();
  const version: VersionRecord = {
    id: createId("version"),
    projectId: input.projectId,
    label: input.label,
    summary: input.summary,
    files: input.files,
    agentEvents: input.agentEvents,
    createdAt: timestamp,
  };
  await db.versions.put(version);
  const project = await db.projects.get(input.projectId);
  if (project) {
    await db.projects.put({ ...project, updatedAt: timestamp });
  }
  return version;
}

export async function saveSnapshot(input: Omit<PublishedSnapshot, "id" | "createdAt">) {
  const snapshot: PublishedSnapshot = {
    ...input,
    id: createId("snapshot"),
    createdAt: nowIso(),
  };
  await db.publishedSnapshots.put(snapshot);
  return snapshot;
}

export async function getLatestVersion(projectId: string) {
  const versions = await listVersions(projectId);
  return versions[0];
}
