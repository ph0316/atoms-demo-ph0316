import { z } from "zod";

export const builderModeSchema = z.enum(["engineer", "team", "race"]);

export const sandpackFilesSchema = z.record(
  z.string().min(1),
  z.object({
    code: z.string(),
    active: z.boolean().optional(),
    hidden: z.boolean().optional(),
    readOnly: z.boolean().optional(),
  }),
);

export const agentEventSchema = z.object({
  id: z.string(),
  agent: z.enum(["Mike", "Emma", "Bob", "Alex", "David", "Iris", "Sarah", "System"]),
  role: z.string(),
  title: z.string(),
  detail: z.string(),
  status: z.enum(["queued", "running", "done", "error"]),
  createdAt: z.string(),
});

export const generationCandidateSchema = z.object({
  id: z.string(),
  label: z.string(),
  model: z.string(),
  summary: z.string(),
  files: sandpackFilesSchema,
  checks: z.array(z.string()),
});

export const generateRequestSchema = z.object({
  prompt: z.string().trim().min(3).max(4000),
  mode: builderModeSchema.default("team"),
  previousFiles: sandpackFilesSchema.optional(),
});

export const generateResponseSchema = z.object({
  projectName: z.string(),
  mode: builderModeSchema,
  model: z.string(),
  usedFallback: z.boolean().default(false),
  agentEvents: z.array(agentEventSchema),
  candidates: z.array(generationCandidateSchema).optional(),
  files: sandpackFilesSchema,
  summary: z.string(),
  checks: z.array(z.string()),
});

export const polishRequestSchema = z.object({
  prompt: z.string().trim().min(3).max(4000),
});

export const polishResponseSchema = z.object({
  polishedPrompt: z.string(),
  brief: z.array(z.string()),
});

export const repairRequestSchema = z.object({
  files: sandpackFilesSchema,
  issue: z.string().trim().min(1).max(4000),
  instruction: z.string().trim().max(3000).optional(),
});

export const repairResponseSchema = z.object({
  files: sandpackFilesSchema,
  fixSummary: z.string(),
  agentEvents: z.array(agentEventSchema),
  usedFallback: z.boolean().default(false),
});

export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  prompt: z.string(),
  mode: builderModeSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const versionSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  label: z.string(),
  summary: z.string(),
  files: sandpackFilesSchema,
  agentEvents: z.array(agentEventSchema),
  createdAt: z.string(),
});

export const runSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  mode: builderModeSchema,
  prompt: z.string(),
  status: z.enum(["success", "error"]),
  createdAt: z.string(),
  message: z.string(),
});

export const publishedSnapshotSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  versionId: z.string(),
  title: z.string(),
  permission: z.enum(["public", "link", "private"]),
  url: z.string(),
  files: sandpackFilesSchema,
  createdAt: z.string(),
});

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  passwordHash: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type BuilderMode = z.infer<typeof builderModeSchema>;
export type SandpackFiles = z.infer<typeof sandpackFilesSchema>;
export type AgentEvent = z.infer<typeof agentEventSchema>;
export type GenerationCandidate = z.infer<typeof generationCandidateSchema>;
export type GenerateRequest = z.infer<typeof generateRequestSchema>;
export type GenerateResponse = z.infer<typeof generateResponseSchema>;
export type PolishResponse = z.infer<typeof polishResponseSchema>;
export type RepairResponse = z.infer<typeof repairResponseSchema>;
export type ProjectRecord = z.infer<typeof projectSchema>;
export type VersionRecord = z.infer<typeof versionSchema>;
export type RunRecord = z.infer<typeof runSchema>;
export type PublishedSnapshot = z.infer<typeof publishedSnapshotSchema>;
export type UserRecord = z.infer<typeof userSchema>;
