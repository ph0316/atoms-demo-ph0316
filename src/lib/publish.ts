import JSZip from "jszip";
import LZString from "lz-string";
import type { SandpackFiles } from "@/lib/schemas";

export type SnapshotPayload = {
  title: string;
  files: SandpackFiles;
  createdAt: string;
};

export function encodeSnapshot(payload: SnapshotPayload) {
  return LZString.compressToEncodedURIComponent(JSON.stringify(payload));
}

export function decodeSnapshot(encoded: string): SnapshotPayload {
  const raw = LZString.decompressFromEncodedURIComponent(encoded);
  if (!raw) {
    throw new Error("无法解析发布快照");
  }
  return JSON.parse(raw) as SnapshotPayload;
}

export function buildSnapshotUrl(payload: SnapshotPayload) {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}${window.location.pathname}#snapshot=${encodeSnapshot(payload)}`;
}

export async function exportZip(files: SandpackFiles, title: string) {
  const zip = new JSZip();
  for (const [path, file] of Object.entries(files)) {
    zip.file(path.replace(/^\//, ""), file.code);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${slugify(title)}.zip`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "atoms-demo-export";
}
