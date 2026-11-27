"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { QuizMode } from "@/types/database.types";
import type { QuizListItem } from "../queries";
import { deleteQuizzesAction } from "../quizzes/actions";
import { QuizListActions } from "./QuizListActions";
import { GroupModeQuizRowActions } from "./GroupModeQuizRowActions";

const MODE_SECTIONS: { mode: QuizMode; title: string }[] = [
  { mode: "NORMAL", title: "개인전" },
  { mode: "TEAM", title: "팀전" },
  { mode: "SOLO", title: "개인별 출제전" },
  { mode: "GROUP", title: "조별 출제전" },
];

// Two page-level columns, each holding two mode sections stacked: 개인전
// + 팀전 (presenter-authored content) on the left, 개인별 출제전 + 조별
// 출제전 (participant-authored content) on the right -- these two pairs
// read as related to each other, so grouping them this way is more
// legible than 4 same-width columns side by side.
const LAYOUT_COLUMNS: QuizMode[][] = [
  ["NORMAL", "TEAM"],
  ["SOLO", "GROUP"],
];

const BADGE_CLASS: Record<QuizMode, string> = {
  NORMAL: "bg-zinc-100 text-zinc-600",
  TEAM: "bg-purple-100 text-purple-700",
  SOLO: "bg-amber-100 text-amber-700",
  GROUP: "bg-blue-100 text-blue-700",
};

// Per-card badge text -- SOLO/GROUP's labels wrap onto a second line at
// a fixed point ("개인별"/"출제전") instead of wherever the badge's width
// happens to force a break, so every badge in a column looks the same
// shape regardless of the card's width.
const BADGE_LABEL: Record<QuizMode, string> = {
  NORMAL: "개인전",
  TEAM: "팀전",
  SOLO: "개인별\n출제전",
  GROUP: "조별\n출제전",
};

// Two page-level columns (presenter-authored vs participant-authored
// modes, see LAYOUT_COLUMNS), each stacking two mode sections. Every
// section has its own checkbox selection and "선택 삭제" button so
// selecting quizzes in one mode never interacts with another's.
// Deletion here is a forced delete (see deleteQuizzesAction): any rooms
// the selected quizzes have, and all their game history, are destroyed
// along with the quiz, so a warning is added to the confirm prompt
// whenever the selection includes a quiz with room activity.
export function QuizListGrid({ quizzes }: { quizzes: QuizListItem[] }) {
  const router = useRouter();

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
      {LAYOUT_COLUMNS.map((modes, i) => (
        <div key={i} className="flex flex-col gap-6">
          {modes.map((mode) => {
            const section = MODE_SECTIONS.find((s) => s.mode === mode)!;
            return (
              <ModeColumn
                key={mode}
                mode={section.mode}
                title={section.title}
                quizzes={quizzes.filter((q) => q.mode === mode)}
                onDeleted={() => router.refresh()}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function ModeColumn({
  mode,
  title,
  quizzes,
  onDeleted,
}: {
  mode: QuizMode;
  title: string;
  quizzes: QuizListItem[];
  onDeleted: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(quizId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(quizId)) next.delete(quizId);
      else next.add(quizId);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === quizzes.length ? new Set() : new Set(quizzes.map((q) => q.id)),
    );
  }

  async function handleDeleteSelected() {
    if (busy || selected.size === 0) return;
    const ids = [...selected];
    const activeCount = quizzes.filter(
      (q) => ids.includes(q.id) && q.rooms.some((r) => r.hasActivity),
    ).length;
    const warning =
      activeCount > 0
        ? `⚠️ 선택한 퀴즈 중 ${activeCount}개는 게임 기록(참가자/점수)이 있습니다. 삭제하면 기록이 복구 불가능하게 사라집니다.\n\n`
        : "";
    if (!confirm(`${warning}선택한 퀴즈 ${ids.length}개를 삭제하시겠습니까?`)) return;

    setBusy(true);
    setError(null);
    const result = await deleteQuizzesAction(ids);
    setBusy(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setSelected(new Set());
    onDeleted();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
        {quizzes.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-xs text-zinc-500">
              <input
                type="checkbox"
                checked={selected.size === quizzes.length}
                onChange={toggleAll}
                className="h-3.5 w-3.5"
              />
              전체선택
            </label>
            <button
              type="button"
              onClick={handleDeleteSelected}
              disabled={busy || selected.size === 0}
              className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              선택 삭제 ({selected.size})
            </button>
          </div>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}

      {quizzes.length === 0 ? (
        <p className="text-sm text-zinc-400">아직 만든 퀴즈가 없습니다.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {quizzes.map((quiz) => (
            <div
              key={quiz.id}
              className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3"
            >
              {/* min-h matches SOLO/GROUP's two-line badge height so this
                  top row is the same height across every mode -- NORMAL/
                  TEAM's one-line badge would otherwise make their row
                  (and so the whole card) shorter than SOLO/GROUP's. */}
              <div className="flex min-h-[34px] items-center gap-2">
                <input
                  type="checkbox"
                  checked={selected.has(quiz.id)}
                  onChange={() => toggle(quiz.id)}
                  className="h-3.5 w-3.5 shrink-0"
                />
                <div className="flex items-center gap-2">
                  <p className="font-medium text-zinc-900">{quiz.title}</p>
                  <span
                    className={`whitespace-pre-line rounded-full px-2 py-0.5 text-center text-xs font-medium leading-tight ${BADGE_CLASS[mode]}`}
                  >
                    {BADGE_LABEL[mode]}
                  </span>
                </div>
              </div>

              {mode === "GROUP" || mode === "SOLO" ? (
                <GroupModeQuizRowActions quizId={quiz.id} rooms={quiz.rooms} />
              ) : (
                <QuizListActions
                  quizId={quiz.id}
                  mode={mode}
                  rooms={quiz.rooms}
                  questionCount={quiz.questionCount}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
