"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RoomSummary } from "../queries";
import { deleteQuizAction } from "../quizzes/actions";
import { RoomListForQuiz } from "./RoomListForQuiz";

// Shared row actions for GROUP/SOLO -- both create their room+content
// together at room-creation time (members author questions after
// joining), so there is no standalone quiz-editor screen to route
// 수정/복제/방 만들기 to, only "방 보기"/"삭제" make sense (in practice
// each GROUP/SOLO quiz has exactly one room, created together with it,
// but RoomListForQuiz is reused here anyway for a consistent delete/
// warning UI). TEAM mode no longer uses this component -- it authors
// questions through the same QuizEditor/saveQuizAction pipeline as
// NORMAL, so it reuses QuizListActions instead (see page.tsx). 삭제
// reuses the existing deleteQuizAction, which now force-deletes this
// quiz's rooms (and their game history) along with the quiz itself.
export function GroupModeQuizRowActions({
  quizId,
  rooms,
}: {
  quizId: string;
  rooms: RoomSummary[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (busy) return;
    const hasRoomActivity = rooms.some((r) => r.hasActivity);
    const warning = hasRoomActivity
      ? "⚠️ 이 퀴즈의 방에는 게임 기록(참가자/점수)이 있습니다. 삭제하면 기록이 복구 불가능하게 사라집니다.\n\n"
      : "";
    if (!confirm(`${warning}이 퀴즈를 삭제하시겠습니까?`)) return;
    setBusy(true);
    setError(null);
    const result = await deleteQuizAction(quizId);
    setBusy(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button
          type="button"
          onClick={handleDelete}
          disabled={busy}
          className="text-red-600 underline transition-colors hover:text-red-700 disabled:opacity-50"
        >
          삭제
        </button>
        {/* GROUP/SOLO has no 수정/복제/방 만들기 (content is authored by
            participants after joining, not by the presenter beforehand),
            but NORMAL/TEAM's QuizListActions has all 4 on this row -- this
            invisible spacer keeps both action rows (and so both cards)
            the same height instead of GROUP/SOLO cards looking shorter. */}
        <span aria-hidden className="invisible">
          수정 복제 방 만들기
        </span>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <RoomListForQuiz rooms={rooms} />
    </div>
  );
}
