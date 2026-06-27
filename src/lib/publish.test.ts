import { describe, expect, it, vi } from "vitest";
import { DEFAULT_FILES } from "@/lib/constants";
import { buildSnapshotUrl, decodeSnapshot, encodeSnapshot } from "@/lib/publish";

describe("publish snapshots", () => {
  it("压缩并恢复发布快照", () => {
    const payload = {
      title: "测试应用",
      files: DEFAULT_FILES,
      createdAt: "2026-06-27T00:00:00.000Z",
    };

    const encoded = encodeSnapshot(payload);
    expect(decodeSnapshot(encoded)).toEqual(payload);
  });

  it("生成 hash 快照链接", () => {
    vi.stubGlobal("location", {
      origin: "https://demo.example.com",
      pathname: "/",
    });

    const url = buildSnapshotUrl({
      title: "Demo",
      files: DEFAULT_FILES,
      createdAt: "2026-06-27T00:00:00.000Z",
    });

    expect(url).toContain("https://demo.example.com/#snapshot=");
  });
});
