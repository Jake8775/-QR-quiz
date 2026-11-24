"use client";

type GroupScoreRow = {
  groupId: string;
  name: string;
  averageScore: number;
  members: { nickname: string; totalPoints: number }[];
};

const MEDALS = ["🥇", "🥈", "🥉"];
const MEDAL_STYLES = [
  "border-yellow-400 bg-yellow-50 text-yellow-900",
  "border-zinc-400 bg-zinc-100 text-zinc-800",
  "border-orange-400 bg-orange-50 text-orange-900",
];

// R6: group score = average of its game-start member snapshot's
// individual totals. Mirrors RankingList's visual language so the two
// can sit side by side on the presenter's result screens.
export function GroupRankingList({ groups }: { groups: GroupScoreRow[] }) {
  return (
    <div className="flex w-full flex-col gap-3">
      {groups.map((group, i) => {
        const isMedal = i < 3;
        return (
          <div
            key={group.groupId}
            className={`flex flex-col gap-1 rounded-xl border-2 px-6 py-4 ${
              isMedal ? MEDAL_STYLES[i] : "border-zinc-200 bg-white text-zinc-900"
            }`}
          >
            <div className="flex items-center gap-4">
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
                {group.name}
              </span>
              <span
                className={`font-bold ${isMedal ? "text-4xl sm:text-5xl" : "text-2xl sm:text-3xl"}`}
              >
                평균 {group.averageScore.toFixed(1)}점
              </span>
            </div>
            <p className="pl-14 text-sm text-zinc-500">
              {group.members.map((m) => `${m.nickname} ${m.totalPoints}점`).join(" · ")}
            </p>
          </div>
        );
      })}
    </div>
  );
}
