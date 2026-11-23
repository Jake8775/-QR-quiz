"use client";

type LeaderboardRow = {
  participantId: string;
  nickname: string;
  totalPoints: number;
};

export function LeaderboardDashboard({
  questionText,
  options,
  correctOptionId,
  correctCount,
  totalParticipants,
  leaderboard,
  isLastQuestion,
  onNext,
  submitting,
}: {
  questionText: string;
  options: { id: string; text: string }[];
  correctOptionId: string | null;
  correctCount: number;
  totalParticipants: number;
  leaderboard: LeaderboardRow[];
  isLastQuestion: boolean;
  onNext: () => void;
  submitting: boolean;
}) {
  return (
    <div>
      <h2 className="mb-3 text-lg font-medium text-zinc-900">
        {questionText}
      </h2>
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

      <p className="mt-3 text-sm text-zinc-500">
        정답자 {correctCount} / {totalParticipants}
      </p>

      <p className="mt-4 mb-1 text-sm font-medium text-zinc-900">누적 순위</p>
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

      <button
        type="button"
        disabled={submitting}
        onClick={onNext}
        className="mt-3 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {isLastQuestion ? "퀴즈 종료" : "다음 문제"}
      </button>
    </div>
  );
}
