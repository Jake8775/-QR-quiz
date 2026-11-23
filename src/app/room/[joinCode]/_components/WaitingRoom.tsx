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
    function ping() {
      fetch(`/room/${joinCode}/heartbeat`, { method: "POST" }).catch(
        () => {
          // Transient network error -- next heartbeat tick will retry.
        },
      );
    }

    ping();
    const interval = setInterval(ping, 15000);
    return () => clearInterval(interval);
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
