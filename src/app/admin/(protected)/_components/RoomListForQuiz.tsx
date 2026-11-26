"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { QuizRunStatus } from "@/types/database.types";
import type { RoomSummary } from "../queries";
import { deleteRoomsAction } from "../rooms/actions";

const STATUS_LABEL: Record<QuizRunStatus, string> = {
  LOBBY: "대기 중",
  QUESTION_OPEN: "진행 중",
  REVEALED: "진행 중",
  LEADERBOARD: "진행 중",
  FINISHED: "종료됨",
};

function roomLabel(room: RoomSummary): string {
  if (!room.status) return "알 수 없음";
  if (room.status === "LOBBY" && !room.hasActivity) return "대기 중 (비어있음)";
  return STATUS_LABEL[room.status];
}

// Expandable per-quiz room list -- a quiz can have more than one room
// (TEAM/NORMAL quizzes are explicitly reusable, see createRoomAction/
// createTeamRoomAction), so the list page can no longer show just one
// "방 보기" link. Rooms with no activity yet (still LOBBY, nobody
// joined) are safe to delete without losing anything; rooms past that
// point carry real game history, called out with a warning on delete.
export function RoomListForQuiz({ rooms }: { rooms: RoomSummary[] }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (rooms.length === 0) {
    return <span className="text-xs text-zinc-400">방 없음</span>;
  }

  function toggle(roomId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(roomId)) next.delete(roomId);
      else next.add(roomId);
      return next;
    });
  }

  async function handleDeleteSelected() {
    if (busy || selected.size === 0) return;
    const ids = [...selected];
    const anyActivity = rooms.some((r) => ids.includes(r.id) && r.hasActivity);
    const warning = anyActivity
      ? `선택한 방 중 ${rooms.filter((r) => ids.includes(r.id) && r.hasActivity).length}개는 게임 기록(참가자/점수)이 있습니다. 삭제하면 기록이 복구 불가능하게 사라집니다.\n\n`
      : "";
    if (!confirm(`${warning}선택한 방 ${ids.length}개를 삭제하시겠습니까?`)) return;

    setBusy(true);
    setError(null);
    const result = await deleteRoomsAction(ids);
    setBusy(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setSelected(new Set());
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="text-left text-xs text-zinc-500 underline transition-colors hover:text-zinc-700"
      >
        방 목록 {expanded ? "숨기기" : `보기 (${rooms.length})`}
      </button>

      {expanded && (
        <div className="flex flex-col gap-1.5 rounded-md border border-zinc-100 bg-zinc-50 p-2">
          {rooms.map((room) => (
            <div key={room.id} className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={selected.has(room.id)}
                onChange={() => toggle(room.id)}
                className="h-3.5 w-3.5"
              />
              <span
                className={`rounded-full px-2 py-0.5 font-medium ${
                  room.hasActivity
                    ? "bg-amber-100 text-amber-700"
                    : "bg-zinc-200 text-zinc-600"
                }`}
              >
                {roomLabel(room)}
              </span>
              <Link
                href={`/admin/rooms/${room.id}`}
                className="text-zinc-600 underline transition-colors hover:text-zinc-900"
              >
                방 보기
              </Link>
            </div>
          ))}

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={handleDeleteSelected}
              disabled={busy || selected.size === 0}
              className="text-xs text-red-600 underline transition-colors hover:text-red-700 disabled:opacity-40"
            >
              선택한 방 삭제 ({selected.size})
            </button>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
