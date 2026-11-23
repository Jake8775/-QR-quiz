"use client";

import { useState } from "react";
import { login } from "./actions";

export default function LoginPage() {
  const [status, setStatus] = useState<"idle" | "verifying" | "error">(
    "idle",
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "verifying") return;
    setStatus("verifying");

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    const result = await login(email, password);
    // On success, login() redirects server-side and this line never runs.
    if (result?.error) {
      setStatus("error");
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-zinc-900">
          진행자 로그인
        </h1>
        <p className="mb-6 text-sm text-zinc-500">
          이메일과 비밀번호를 입력해주세요.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="email"
            name="email"
            required
            placeholder="you@example.com"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
          />
          <input
            type="password"
            name="password"
            required
            placeholder="비밀번호"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
          />
          <button
            type="submit"
            disabled={status === "verifying"}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {status === "verifying" ? "로그인 중..." : "로그인"}
          </button>
          {status === "error" && (
            <p className="text-sm text-red-600">
              이메일 또는 비밀번호가 올바르지 않습니다.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
