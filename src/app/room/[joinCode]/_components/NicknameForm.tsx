"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { joinRoomAction } from "../actions";

export function NicknameForm({
  joinCode,
  quizTitle,
}: {
  joinCode: string;
  quizTitle: string;
}) {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    const result = await joinRoomAction(joinCode, { nickname });
    setSubmitting(false);

    if (!result.success) {
      setError(result.error);
      return;
    }
    // The Server Action already set the cookie server-side before
    // returning, so a plain refresh (not a client-side mutate-then-push)
    // safely re-renders this route now that the cookie is present.
    router.refresh();
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
        <p className="mb-1 text-sm text-zinc-500">{quizTitle}</p>
        <h1 className="mb-6 text-xl font-semibold text-zinc-900">
          닉네임을 입력해주세요
        </h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="text"
            required
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="닉네임"
            maxLength={20}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
          />
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? "입장 중..." : "참여하기"}
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      </div>
    </div>
  );
}
