"use client";

import { useEffect } from "react";

export function WaitingRoom({
  joinCode,
  quizTitle,
  nickname,
}: {
  joinCode: string;
  quizTitle: string;
  nickname: string;
}) {
  useEffect(() => {
    let cancelled = false;

    async function ping(isRetry = false) {
      try {
        const res = await fetch(`/room/${joinCode}/heartbeat`, {
          method: "POST",
        });
        // The very first ping can race the cookie set by joinRoomAction's
        // redirect-free router.refresh() in production (observed as a
        // one-off 401 that a retry a moment later always resolves). Retry
        // once after a short delay rather than silently waiting a full
        // 15s for the next interval tick.
        if (res.status === 401 && !isRetry && !cancelled) {
          setTimeout(() => ping(true), 1000);
        }
      } catch {
        // Transient network error -- next heartbeat tick will retry.
      }
    }

    ping();
    const interval = setInterval(() => ping(), 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [joinCode]);

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
        <p className="mb-1 text-sm text-zinc-500">{quizTitle}</p>
        <p className="mb-4 text-lg font-medium text-zinc-900">
          {nickname}님, 대기실에 입장했습니다
        </p>
        <p className="text-sm text-zinc-500">
          진행자가 퀴즈를 시작할 때까지 기다려주세요.
        </p>
      </div>
    </div>
  );
}
