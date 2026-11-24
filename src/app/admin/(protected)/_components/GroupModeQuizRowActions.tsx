"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { deleteQuizAction } from "../quizzes/actions";

// Group-mode quizzes have no author-written questions to edit/duplicate --
// members write them after the room exists -- so 수정/복제/방 만들기 are
// hidden here entirely (the room is already created at creation time) in
// favor of "방 보기" straight to the dashboard. 삭제 reuses the existing
// deleteQuizAction unmodified; its FK (rooms.quiz_id on delete restrict)
// already protects against deleting a quiz with a live room the same way
// it does for normal mode.
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
    if (!confirm("이 조별모드 방을 삭제하시겠습니까?")) return;
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
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-3 text-sm">
        {roomId ? (
          <Link href={`/admin/rooms/${roomId}`} className="text-zinc-600 underline">
            방 보기
          </Link>
        ) : (
          <span className="text-zinc-400">방 없음</span>
        )}
        <button
          type="button"
          onClick={handleDelete}
          disabled={busy}
          className="text-red-600 underline disabled:opacity-50"
        >
          삭제
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
