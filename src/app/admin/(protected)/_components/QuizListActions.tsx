"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { QuizMode } from "@/types/database.types";
import { deleteQuizAction, duplicateQuizAction } from "../quizzes/actions";
import { createRoomAction } from "../rooms/actions";
import { createTeamRoomAction } from "../rooms/team-actions";
import { TeamGroupCountModal } from "./TeamGroupCountModal";

export function QuizListActions({
  quizId,
  mode = "NORMAL",
}: {
  quizId: string;
  // NORMAL creates a room immediately with no extra input. TEAM needs a
  // team count first (see TeamGroupCountModal) -- the rest (수정/복제/
  // 삭제) is identical between the two since both author questions
  // through the same QuizEditor/saveQuizAction pipeline.
  mode?: QuizMode;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTeamModal, setShowTeamModal] = useState(false);

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
    if (mode === "TEAM") {
      setShowTeamModal(true);
      return;
    }
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

  async function handleCreateTeamRoom(groupCount: number) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await createTeamRoomAction({ quizId, groupCount });
    setBusy(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setShowTeamModal(false);
    router.push(`/admin/rooms/${result.roomId}`);
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap gap-3 text-sm">
        <Link
          href={`/admin/quizzes/${quizId}/edit`}
          className="text-zinc-600 underline transition-colors hover:text-zinc-900"
        >
          수정
        </Link>
        <button
          type="button"
          onClick={handleDuplicate}
          disabled={busy}
          className="text-zinc-600 underline transition-colors hover:text-zinc-900 disabled:opacity-50"
        >
          복제
        </button>
        <button
          type="button"
          onClick={handleCreateRoom}
          disabled={busy}
          className="text-zinc-600 underline transition-colors hover:text-zinc-900 disabled:opacity-50"
        >
          방 만들기
        </button>
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
      {showTeamModal && (
        <TeamGroupCountModal
          submitting={busy}
          onClose={() => setShowTeamModal(false)}
          onConfirm={handleCreateTeamRoom}
        />
      )}
    </div>
  );
}
