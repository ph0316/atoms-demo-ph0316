import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getUserById, loginUser, registerUser } from "@/lib/auth";

describe("auth", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("注册并登录用户", async () => {
    const user = await registerUser({
      name: "Peng",
      email: "Peng@example.com",
      password: "secret123",
    });

    const loggedIn = await loginUser({
      email: "peng@example.com",
      password: "secret123",
    });
    const restored = await getUserById(user.id);

    expect(user.email).toBe("peng@example.com");
    expect(loggedIn.id).toBe(user.id);
    expect(restored?.name).toBe("Peng");
  });

  it("拒绝重复邮箱和错误密码", async () => {
    await registerUser({
      name: "Peng",
      email: "peng@example.com",
      password: "secret123",
    });

    await expect(
      registerUser({
        name: "Another",
        email: "PENG@example.com",
        password: "secret123",
      }),
    ).rejects.toThrow("该邮箱已注册");

    await expect(
      loginUser({
        email: "peng@example.com",
        password: "wrong-password",
      }),
    ).rejects.toThrow("邮箱或密码不正确");
  });
});
