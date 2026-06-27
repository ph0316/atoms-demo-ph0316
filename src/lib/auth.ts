import { db } from "@/lib/db";
import { createId, nowIso } from "@/lib/ids";
import type { UserRecord } from "@/lib/schemas";

export const AUTH_SESSION_KEY = "atoms-demo-session-user-id";

export async function registerUser(input: { name: string; email: string; password: string }) {
  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  const password = input.password.trim();

  if (name.length < 2) {
    throw new Error("请输入至少 2 个字符的昵称");
  }
  if (!isEmail(email)) {
    throw new Error("请输入有效邮箱");
  }
  if (password.length < 6) {
    throw new Error("密码至少 6 位");
  }

  const existing = await db.users.where("email").equals(email).first();
  if (existing) {
    throw new Error("该邮箱已注册，请直接登录");
  }

  const timestamp = nowIso();
  const user: UserRecord = {
    id: createId("user"),
    name,
    email,
    passwordHash: hashPassword(password),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await db.users.put(user);
  return publicUser(user);
}

export async function loginUser(input: { email: string; password: string }) {
  const email = normalizeEmail(input.email);
  const passwordHash = hashPassword(input.password.trim());
  const user = await db.users.where("email").equals(email).first();

  if (!user || user.passwordHash !== passwordHash) {
    throw new Error("邮箱或密码不正确");
  }

  return publicUser(user);
}

export async function getUserById(userId: string) {
  const user = await db.users.get(userId);
  return user ? publicUser(user) : null;
}

export type AuthUser = Pick<UserRecord, "id" | "name" | "email" | "createdAt">;

function publicUser(user: UserRecord): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
  };
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function hashPassword(password: string) {
  let hash = 2166136261;
  for (let index = 0; index < password.length; index += 1) {
    hash ^= password.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a:${(hash >>> 0).toString(16)}`;
}
