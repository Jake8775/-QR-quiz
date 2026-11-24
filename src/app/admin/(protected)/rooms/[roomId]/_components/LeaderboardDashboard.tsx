"use client";

import { RankingList } from "./RankingList";

type LeaderboardRow = {
  participantId: string;
  nickname: string;
  totalPoints: number;
  correctCount: number;
  answeredQuestions: number;
};

export function LeaderboardDashboard({
  correctCount,
  totalParticipants,
  leaderboard,
  isLastQuestion,
  onNext,
  submitting,
  nextAuthoringGroup,
}: {
  correctCount: number;
  totalParticipants: number;
  leaderboard: LeaderboardRow[];
  isLastQuestion: boolean;
  onNext: () => void;
  submitting: boolean;
  // Group mode only -- undefined for every normal-mode render.
  nextAuthoringGroup?: { name: string; members: string[] };
}) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col items-center px-4 text-center">
      <p className="text-sm text-zinc-500">
        정답자 {correctCount} / {totalParticipants}
      </p>
      <h2 className="mt-2 mb-6 text-3xl font-semibold text-zinc-900 sm:text-4xl">
        이번 라운드 순위
      </h2>
      {nextAuthoringGroup && (
        <p className="mb-4 text-sm text-zinc-400">
          다음: {nextAuthoringGroup.name} 출제 -{" "}
          {nextAuthoringGroup.members.join(", ")}
        </p>
      )}

      <RankingList leaderboard={leaderboard} />

      <button
        type="button"
        disabled={submitting}
        onClick={onNext}
        className="mt-8 rounded-md bg-zinc-900 px-8 py-4 text-lg font-medium text-white disabled:opacity-50"
      >
        {isLastQuestion ? "퀴즈 종료" : "다음 문제"}
      </button>
    </div>
  );
}
