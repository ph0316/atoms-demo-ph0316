"use client";

import { LogIn, Sparkles, UserPlus } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { AUTH_SESSION_KEY, getUserById, loginUser, registerUser, type AuthUser } from "@/lib/auth";
import { Workspace } from "@/components/workspace";

type AuthMode = "login" | "register";

export function AuthGate() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("请登录后继续使用工作台");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sessionUserId = window.localStorage.getItem(AUTH_SESSION_KEY);
    if (!sessionUserId) {
      setLoading(false);
      return;
    }

    getUserById(sessionUserId)
      .then((nextUser) => {
        if (nextUser) {
          setUser(nextUser);
          setStatus(`欢迎回来，${nextUser.name}`);
        } else {
          window.localStorage.removeItem(AUTH_SESSION_KEY);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    try {
      const nextUser =
        authMode === "register"
          ? await registerUser({ name, email, password })
          : await loginUser({ email, password });
      window.localStorage.setItem(AUTH_SESSION_KEY, nextUser.id);
      setUser(nextUser);
      setPassword("");
      setStatus(`欢迎，${nextUser.name}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "认证失败");
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    window.localStorage.removeItem(AUTH_SESSION_KEY);
    setUser(null);
    setPassword("");
    setStatus("已退出登录");
  }

  if (user) {
    return <Workspace currentUser={user} onLogout={handleLogout} />;
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f7f4] p-4 text-ink">
      <section className="grid w-full max-w-5xl overflow-hidden rounded-lg border border-line bg-white shadow-soft lg:grid-cols-[1fr_420px]">
        <div className="flex min-h-[520px] flex-col justify-between bg-panel p-8">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-2 text-sm font-black">
              <Sparkles className="h-4 w-4 text-cobalt" />
              Atoms Demo
            </div>
            <h1 className="mt-10 max-w-xl text-4xl font-black leading-tight md:text-5xl">
              登录后继续构建你的 AI 应用工作台
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-6 text-ink/62">
              注册账号后，项目、版本、对话记录和发布快照会保存在本机 IndexedDB 中，刷新页面也能恢复当前会话。
            </p>
          </div>
          <div className="grid gap-3 text-sm font-bold text-ink/62 sm:grid-cols-3">
            <div className="rounded-lg border border-line bg-white p-4">项目历史持久化</div>
            <div className="rounded-lg border border-line bg-white p-4">AI 对话记录</div>
            <div className="rounded-lg border border-line bg-white p-4">实时 App Viewer</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col justify-center p-6 md:p-8">
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-line bg-panel p-1">
            <button
              type="button"
              onClick={() => setAuthMode("login")}
              className={`inline-flex h-10 items-center justify-center gap-2 rounded-md text-sm font-black ${
                authMode === "login" ? "bg-white text-cobalt shadow-sm" : "text-ink/60"
              }`}
            >
              <LogIn className="h-4 w-4" />
              登录
            </button>
            <button
              type="button"
              onClick={() => setAuthMode("register")}
              className={`inline-flex h-10 items-center justify-center gap-2 rounded-md text-sm font-black ${
                authMode === "register" ? "bg-white text-cobalt shadow-sm" : "text-ink/60"
              }`}
            >
              <UserPlus className="h-4 w-4" />
              注册
            </button>
          </div>

          <div className="mt-6 space-y-4">
            {authMode === "register" && (
              <label className="block">
                <span className="mb-2 block text-sm font-black">昵称</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="h-11 w-full rounded-lg border border-line bg-panel px-3 text-sm outline-none focus:border-cobalt"
                  placeholder="例如 Peng"
                  autoComplete="name"
                />
              </label>
            )}
            <label className="block">
              <span className="mb-2 block text-sm font-black">邮箱</span>
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-11 w-full rounded-lg border border-line bg-panel px-3 text-sm outline-none focus:border-cobalt"
                placeholder="you@example.com"
                autoComplete="email"
                inputMode="email"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-black">密码</span>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-11 w-full rounded-lg border border-line bg-panel px-3 text-sm outline-none focus:border-cobalt"
                placeholder="至少 6 位"
                type="password"
                autoComplete={authMode === "register" ? "new-password" : "current-password"}
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-cobalt px-4 text-sm font-black text-white disabled:opacity-60"
          >
            {authMode === "register" ? <UserPlus className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
            {loading ? "处理中..." : authMode === "register" ? "创建账号" : "登录工作台"}
          </button>

          <p className="mt-4 min-h-5 text-sm font-bold text-ink/55">{status}</p>
        </form>
      </section>
    </main>
  );
}
