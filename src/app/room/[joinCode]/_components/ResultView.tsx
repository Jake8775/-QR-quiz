"use client";

import { SafetyBackdrop } from "@/components/SafetyBackdrop";

type LeaderboardRow = {
  participantId: string;
  nickname: string;
  totalPoints: number;
};

export function ResultView({
  questionText,
  options,
  correctOptionId,
  myResult,
  leaderboard,
  myRank,
  finished,
}: {
  questionText: string;
  options: { id: string; text: string }[];
  correctOptionId: string | null;
  myResult: {
    selectedOptionId: string;
    isCorrect: boolean;
    awardedPoints: number;
  } | null;
  leaderboard: LeaderboardRow[];
  myRank: number | null;
  finished: boolean;
}) {
  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-zinc-50 px-4 py-8">
      <SafetyBackdrop />
      <div className="relative w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
        {!finished && (
          <>
            <h1 className="mb-3 text-lg font-semibold text-zinc-900">
              {questionText}
            </h1>
            <div className="flex flex-col gap-1">
              {options.map((o) => (
                <div
                  key={o.id}
                  className={`rounded-md border px-3 py-2 text-sm ${
                    o.id === correctOptionId
                      ? "border-green-500 bg-green-50 font-medium text-green-700"
                      : "border-zinc-200"
                  }`}
                >
                  {o.text}
                </div>
              ))}
            </div>

            <p className="mt-3 text-center text-sm">
              {myResult?.isCorrect ? (
                <span className="font-medium text-green-700">
                  정답! +{myResult.awardedPoints}점
                </span>
              ) : (
                <span className="text-zinc-500">오답 또는 미제출</span>
              )}
            </p>
          </>
        )}

        {finished && (
          <h1 className="mb-3 text-lg font-semibold text-zinc-900">
            퀴즈가 종료되었습니다
          </h1>
        )}

        {myRank && (
          <p className="mb-1 text-center text-sm text-zinc-500">
            내 순위: {myRank}위
          </p>
        )}

        <p className="mt-4 mb-1 text-sm font-medium text-zinc-900">
          누적 순위
        </p>
        <div className="flex flex-col gap-1">
          {leaderboard.map((row, i) => (
            <div
              key={row.participantId}
              className="flex items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm"
            >
              <span className="w-6 text-zinc-400">{i + 1}</span>
              <span>{row.nickname}</span>
              <span className="ml-auto font-medium">{row.totalPoints}점</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
