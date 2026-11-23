"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { deleteQuizAction, duplicateQuizAction } from "../quizzes/actions";
import { createRoomAction } from "../rooms/actions";

export function QuizListActions({ quizId }: { quizId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDuplicate() {
    if (busy) return;
    setBusy(true);
    await duplicateQuizAction(quizId);
    setBusy(false);
    router.refresh();
  }

  async function handleDelete() {
    if (busy) return;
    if (!confirm("이 퀴즈를 삭제하시겠습니까?")) return;
    setBusy(true);
    await deleteQuizAction(quizId);
    setBusy(false);
    router.refresh();
  }

  async function handleCreateRoom() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await createRoomAction(quizId);
    setBusy(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    router.push(`/admin/rooms/${result.roomId}`);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-3 text-sm">
        <Link
          href={`/admin/quizzes/${quizId}/edit`}
          className="text-zinc-600 underline"
        >
          수정
        </Link>
        <button
          type="button"
          onClick={handleDuplicate}
          disabled={busy}
          className="text-zinc-600 underline disabled:opacity-50"
        >
          복제
        </button>
        <button
          type="button"
          onClick={handleCreateRoom}
          disabled={busy}
          className="text-zinc-600 underline disabled:opacity-50"
        >
          방 만들기
        </button>
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
