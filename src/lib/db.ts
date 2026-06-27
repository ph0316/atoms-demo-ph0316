import Dexie, { type Table } from "dexie";
import type { ProjectRecord, PublishedSnapshot, RunRecord, UserRecord, VersionRecord } from "@/lib/schemas";

export class AtomsDemoDatabase extends Dexie {
  users!: Table<UserRecord, string>;
  projects!: Table<ProjectRecord, string>;
  versions!: Table<VersionRecord, string>;
  runs!: Table<RunRecord, string>;
  publishedSnapshots!: Table<PublishedSnapshot, string>;

  constructor() {
    super("atoms-demo-db");
    this.version(1).stores({
      projects: "id, updatedAt, createdAt, mode",
      versions: "id, projectId, createdAt",
      runs: "id, projectId, createdAt, status",
      publishedSnapshots: "id, projectId, versionId, createdAt, permission",
    });
    this.version(2).stores({
      users: "id, &email, createdAt",
      projects: "id, updatedAt, createdAt, mode",
      versions: "id, projectId, createdAt",
      runs: "id, projectId, createdAt, status",
      publishedSnapshots: "id, projectId, versionId, createdAt, permission",
    });
  }
}

export const db = new AtomsDemoDatabase();
