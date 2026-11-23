"use client";

import { useEffect, useState } from "react";
import { QuestionDashboard } from "./QuestionDashboard";
import { LeaderboardDashboard } from "./LeaderboardDashboard";

type Participant = { id: string; nickname: string; online: boolean };
type RunStatus = "LOBBY" | "QUESTION_OPEN" | "LEADERBOARD" | "FINISHED";

type LeaderboardRow = {
  participantId: string;
  nickname: string;
  totalPoints: number;
};

type RunStatusResponse = {
  status: RunStatus;
  currentQuestionIndex: number;
  totalQuestions: number;
  participants: Participant[];
  count: number;
  question?: {
    id: string;
    text: string;
    options: { id: string; text: string }[];
    closesAt?: string | null;
    correctOptionId?: string | null;
  };
  submittedCount?: number;
  correctCount?: number;
  leaderboard?: LeaderboardRow[];
};

export function LobbyClient({ roomId }: { roomId: string }) {
  const [data, setData] = useState<RunStatusResponse | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/admin/rooms/${roomId}/run-status`);
        if (!res.ok) return;
        const json = (await res.json()) as RunStatusResponse;
        if (!cancelled) setData(json);
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

  async function callAction(path: string) {
    setSubmitting(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/rooms/${roomId}/${path}`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) {
        setActionError(json.error ?? "요청에 실패했습니다");
      }
    } catch {
      setActionError("네트워크 오류가 발생했습니다");
    } finally {
      setSubmitting(false);
    }
  }

  if (!data) {
    return <p className="text-sm text-zinc-400">불러오는 중...</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {actionError && <p className="text-sm text-red-600">{actionError}</p>}

      {data.status === "LOBBY" && (
        <>
          <div>
            <p className="text-sm text-zinc-500">참가자 {data.count}명</p>
            <div className="mt-2 flex flex-col gap-1">
              {data.participants.length === 0 ? (
                <p className="text-sm text-zinc-400">
                  아직 입장한 참가자가 없습니다.
                </p>
              ) : (
                data.participants.map((p) => (
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
            <button
              type="button"
              disabled={data.count === 0 || submitting}
              onClick={() => callAction("start")}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              퀴즈 시작
            </button>
            {data.count === 0 && (
              <p className="mt-1 text-xs text-zinc-400">
                참가자가 입장해야 시작할 수 있습니다.
              </p>
            )}
          </div>
        </>
      )}

      {data.status === "QUESTION_OPEN" && data.question && (
        <QuestionDashboard
          questionText={data.question.text}
          options={data.question.options}
          closesAt={data.question.closesAt ?? null}
          submittedCount={data.submittedCount ?? 0}
          totalParticipants={data.count}
          currentQuestionIndex={data.currentQuestionIndex}
          totalQuestions={data.totalQuestions}
          onReveal={() => callAction("reveal")}
          submitting={submitting}
        />
      )}

      {data.status === "LEADERBOARD" && data.question && (
        <LeaderboardDashboard
          questionText={data.question.text}
          options={data.question.options}
          correctOptionId={data.question.correctOptionId ?? null}
          correctCount={data.correctCount ?? 0}
          totalParticipants={data.count}
          leaderboard={data.leaderboard ?? []}
          isLastQuestion={
            data.currentQuestionIndex >= data.totalQuestions - 1
          }
          onNext={() => callAction("next")}
          submitting={submitting}
        />
      )}

      {data.status === "FINISHED" && (
        <div>
          <p className="mb-3 text-sm font-medium text-zinc-900">
            퀴즈가 종료되었습니다
          </p>
          <div className="flex flex-col gap-1">
            {(data.leaderboard ?? []).map((row, i) => (
              <div
                key={row.participantId}
                className="flex items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm"
              >
                <span className="w-6 text-zinc-400">{i + 1}</span>
                <span>{row.nickname}</span>
                <span className="ml-auto font-medium">
                  {row.totalPoints}점
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
