"use client";

type LeaderboardRow = {
  participantId: string;
  nickname: string;
  totalPoints: number;
  correctCount: number;
  answeredQuestions: number;
};

const MEDALS = ["🥇", "🥈", "🥉"];
const MEDAL_STYLES = [
  "border-yellow-400 bg-yellow-50 text-yellow-900",
  "border-zinc-400 bg-zinc-100 text-zinc-800",
  "border-orange-400 bg-orange-50 text-orange-900",
];

export function RankingList({ leaderboard }: { leaderboard: LeaderboardRow[] }) {
  const top10 = leaderboard.slice(0, 10);
  const rest = leaderboard.length - top10.length;

  return (
    <div className="flex w-full flex-col gap-3">
      {top10.map((row, i) => {
        const isMedal = i < 3;
        return (
          <div
            key={row.participantId}
            className={`flex items-center gap-4 rounded-xl border-2 px-6 py-4 ${
              isMedal
                ? MEDAL_STYLES[i]
                : "border-zinc-200 bg-white text-zinc-900"
            }`}
          >
            <span
              className={isMedal ? "text-4xl sm:text-5xl" : "w-10 text-2xl sm:text-3xl text-zinc-400"}
            >
              {isMedal ? MEDALS[i] : i + 1}
            </span>
            <span
              className={`flex-1 truncate font-semibold ${
                isMedal ? "text-4xl sm:text-5xl" : "text-2xl sm:text-3xl"
              }`}
            >
              {row.nickname}
            </span>
            <span className="flex items-baseline gap-2">
              <span
                className={`font-bold ${
                  isMedal ? "text-4xl sm:text-5xl" : "text-2xl sm:text-3xl"
                }`}
              >
                {row.totalPoints}점
              </span>
              <span
                className={`text-zinc-400 ${
                  isMedal ? "text-lg sm:text-xl" : "text-sm sm:text-base"
                }`}
              >
                ({row.correctCount}/{row.answeredQuestions}문제 정답)
              </span>
            </span>
          </div>
        );
      })}
      {rest > 0 && (
        <p className="mt-2 text-center text-sm text-zinc-400">외 {rest}명</p>
      )}
    </div>
  );
}
