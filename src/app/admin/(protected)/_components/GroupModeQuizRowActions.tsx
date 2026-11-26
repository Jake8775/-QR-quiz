"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { deleteQuizAction } from "../quizzes/actions";

// Shared row actions for GROUP/SOLO -- both create their room+content
// together at room-creation time (members author questions after
// joining), so there is no standalone quiz-editor screen to route
// 수정/복제/방 만들기 to, only "방 보기"/"삭제" make sense. TEAM mode no
// longer uses this component -- it authors questions through the same
// QuizEditor/saveQuizAction pipeline as NORMAL, so it reuses
// QuizListActions instead (see page.tsx). 삭제 reuses the existing
// deleteQuizAction unmodified; its FK (rooms.quiz_id on delete restrict)
// already protects against deleting a quiz with a live room the same
// way it does for normal mode.
export function GroupModeQuizRowActions({
  quizId,
  roomId,
}: {
  quizId: string;
  roomId: string | undefined;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (busy) return;
    if (!confirm("이 방을 삭제하시겠습니까?")) return;
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
      <div className="flex flex-wrap gap-3 text-sm">
        {roomId ? (
          <Link
            href={`/admin/rooms/${roomId}`}
            className="text-zinc-600 underline transition-colors hover:text-zinc-900"
          >
            방 보기
          </Link>
        ) : (
          <span className="text-zinc-400">방 없음</span>
        )}
        <button
          type="button"
          onClick={handleDelete}
          disabled={busy}
          className="text-red-600 underline transition-colors hover:text-red-700 disabled:opacity-50"
        >
          삭제
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
