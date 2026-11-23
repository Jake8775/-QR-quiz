"use client";

import { useEffect, useState } from "react";

type Participant = { id: string; nickname: string; online: boolean };

export function LobbyClient({ roomId }: { roomId: string }) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/admin/rooms/${roomId}/lobby-status`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setParticipants(data.participants ?? []);
          setCount(data.count ?? 0);
        }
      } catch {
        // Transient network error — next poll tick will retry.
      }
    }

    poll();
    const interval = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [roomId]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm text-zinc-500">참가자 {count}명</p>
        <div className="mt-2 flex flex-col gap-1">
          {participants.length === 0 ? (
            <p className="text-sm text-zinc-400">
              아직 입장한 참가자가 없습니다.
            </p>
          ) : (
            participants.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm"
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    p.online ? "bg-green-500" : "bg-zinc-300"
                  }`}
                />
                <span>{p.nickname}</span>
                <span className="ml-auto text-xs text-zinc-400">
                  {p.online ? "온라인" : "자리비움"}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <div>
        {/* TODO(stage-4): wire this button to the LOBBY->QUESTION_OPEN
            transition. Unconditionally disabled for Stage 3 regardless of
            participant count, since that transition doesn't exist yet.
            The participant-count check is still computed/displayed via the
            caption so Stage 4 only needs to remove the hardcoded disable. */}
        <button
          type="button"
          disabled
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white opacity-50"
        >
          퀴즈 시작
        </button>
        <p className="mt-1 text-xs text-zinc-400">
          {count === 0
            ? "참가자가 입장해야 시작할 수 있습니다."
            : "퀴즈 시작 기능은 다음 단계에서 제공됩니다."}
        </p>
      </div>
    </div>
  );
}
