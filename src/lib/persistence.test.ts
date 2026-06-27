import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_FILES } from "@/lib/constants";
import { db } from "@/lib/db";
import { listProjects, listRuns, listVersions, saveGeneratedProject, saveRun, saveSnapshot } from "@/lib/persistence";
import { createAgentEvents } from "@/lib/fallback-generator";

describe("persistence", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("保存项目、版本和发布快照", async () => {
    const agentEvents = createAgentEvents("team", "做一个看板");
    const saved = await saveGeneratedProject({
      name: "看板",
      prompt: "做一个看板",
      mode: "team",
      files: DEFAULT_FILES,
      summary: "已生成",
      agentEvents,
    });

    const projects = await listProjects();
    const versions = await listVersions(saved.project.id);
    const initialRuns = await listRuns(saved.project.id);
    const snapshot = await saveSnapshot({
      projectId: saved.project.id,
      versionId: saved.version.id,
      title: saved.project.name,
      permission: "link",
      url: "https://example.com/#snapshot=1",
      files: DEFAULT_FILES,
    });

    expect(projects).toHaveLength(1);
    expect(versions).toHaveLength(1);
    expect(initialRuns).toHaveLength(1);
    expect(initialRuns[0]?.prompt).toBe("做一个看板");
    expect(snapshot.projectId).toBe(saved.project.id);
  });

  it("按时间保存项目对话历史", async () => {
    const saved = await saveGeneratedProject({
      name: "看板",
      prompt: "做一个看板",
      mode: "team",
      files: DEFAULT_FILES,
      summary: "已生成",
      agentEvents: createAgentEvents("team", "做一个看板"),
    });

    await saveRun({
      projectId: saved.project.id,
      mode: "team",
      prompt: "把指标卡改成三列",
      status: "success",
      message: "已调整指标卡布局",
    });

    const runs = await listRuns(saved.project.id);

    expect(runs.map((run) => run.prompt)).toEqual(["做一个看板", "把指标卡改成三列"]);
    expect(runs[1]?.message).toBe("已调整指标卡布局");
  });
});
