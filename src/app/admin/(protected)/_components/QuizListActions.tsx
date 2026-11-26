"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { QuizMode } from "@/types/database.types";
import type { RoomSummary } from "../queries";
import { deleteQuizAction, duplicateQuizAction } from "../quizzes/actions";
import { createRoomAction } from "../rooms/actions";
import { createTeamRoomAction } from "../rooms/team-actions";
import { TeamGroupCountModal } from "./TeamGroupCountModal";
import { RoomListForQuiz } from "./RoomListForQuiz";

export function QuizListActions({
  quizId,
  mode = "NORMAL",
  rooms = [],
  questionCount,
}: {
  quizId: string;
  // NORMAL creates a room immediately with no extra input. TEAM needs a
  // team count first (see TeamGroupCountModal) -- the rest (수정/복제/
  // 삭제) is identical between the two since both author questions
  // through the same QuizEditor/saveQuizAction pipeline.
  mode?: QuizMode;
  // This quiz's rooms (there can be more than one -- NORMAL/TEAM quizzes
  // are reusable across rooms). deleteQuizAction force-deletes all of
  // them along with the quiz, so the confirm prompt warns if any carry
  // game history, and RoomListForQuiz lets the presenter inspect/delete
  // them individually without touching the quiz itself.
  rooms?: RoomSummary[];
  // Shown on the same row as "방 목록 보기", right-aligned.
  questionCount: number;
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
    const hasRoomActivity = rooms.some((r) => r.hasActivity);
    const warning = hasRoomActivity
      ? "⚠️ 이 퀴즈의 방에는 게임 기록(참가자/점수)이 있습니다. 삭제하면 기록이 복구 불가능하게 사라집니다.\n\n"
      : "";
    if (!confirm(`${warning}이 퀴즈를 삭제하시겠습니까?`)) return;
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
      <div className="flex items-center justify-between gap-2">
        <RoomListForQuiz rooms={rooms} />
        <span className="shrink-0 text-xs text-zinc-500">문제 {questionCount}개</span>
      </div>
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
