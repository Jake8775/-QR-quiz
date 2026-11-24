"use client";

import { RankingList } from "./RankingList";
import { GroupRankingList } from "./GroupRankingList";

type LeaderboardRow = {
  participantId: string;
  nickname: string;
  totalPoints: number;
  correctCount: number;
  answeredQuestions: number;
};

type GroupScoreRow = {
  groupId: string;
  name: string;
  averageScore: number;
  members: { nickname: string; totalPoints: number }[];
};

export function LeaderboardDashboard({
  correctCount,
  totalParticipants,
  leaderboard,
  isLastQuestion,
  onNext,
  submitting,
  nextAuthoringGroup,
  groupScores,
}: {
  correctCount: number;
  totalParticipants: number;
  leaderboard: LeaderboardRow[];
  isLastQuestion: boolean;
  onNext: () => void;
  submitting: boolean;
  // Group mode only -- undefined for every normal-mode render.
  nextAuthoringGroup?: { name: string; members: string[] };
  groupScores?: GroupScoreRow[];
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

      <div
        className={`w-full ${
          groupScores ? "grid grid-cols-1 gap-8 text-left lg:grid-cols-2" : ""
        }`}
      >
        <div className="flex flex-col gap-2">
          {groupScores && (
            <h3 className="text-center text-base font-medium text-zinc-700">개인 순위</h3>
          )}
          <RankingList leaderboard={leaderboard} />
        </div>
        {groupScores && (
          <div className="flex flex-col gap-2">
            <h3 className="text-center text-base font-medium text-zinc-700">조 순위</h3>
            <GroupRankingList groups={groupScores} />
          </div>
        )}
      </div>

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
