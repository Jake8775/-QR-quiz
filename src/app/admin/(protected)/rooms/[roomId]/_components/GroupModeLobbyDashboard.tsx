"use client";

import { useState } from "react";
import { GroupRejectModal } from "./GroupRejectModal";

type GroupSlot = {
  id: string;
  slotIndex: number;
  questionText: string;
  complete: boolean;
  lockedBy: string | null;
  presenterComment: string | null;
};

type GroupMember = { id: string; nickname: string; online: boolean };

type GroupData = {
  id: string;
  name: string;
  pin: string;
  status: "DRAFTING" | "SUBMITTED" | "CONFIRMED";
  statusVersion: number;
  rejectionComment: string | null;
  members: GroupMember[];
  slots: GroupSlot[];
  completeCount: number;
  totalSlots: number;
  lastActivityAt: string | null;
};

const STATUS_LABEL: Record<GroupData["status"], string> = {
  DRAFTING: "작성 중",
  SUBMITTED: "제출됨 (검토 중)",
  CONFIRMED: "확정됨",
};
const STATUS_BADGE_CLASS: Record<GroupData["status"], string> = {
  DRAFTING: "bg-zinc-200 text-zinc-700",
  SUBMITTED: "bg-amber-100 text-amber-800",
  CONFIRMED: "bg-green-100 text-green-800",
};

export function GroupModeLobbyDashboard({
  roomId,
  groups,
  allConfirmed,
  onChanged,
  onStart,
  startDisabled,
  startSubmitting,
}: {
  roomId: string;
  groups: GroupData[];
  allConfirmed: boolean;
  onChanged: () => void | Promise<void>;
  onStart: () => void;
  startDisabled: boolean;
  startSubmitting: boolean;
}) {
  const [busyGroupId, setBusyGroupId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<GroupData | null>(null);
  const [errorByGroupId, setErrorByGroupId] = useState<Record<string, string>>({});

  async function callGroupAction(
    groupId: string,
    path: string,
    body?: unknown,
  ) {
    setBusyGroupId(groupId);
    setErrorByGroupId((prev) => ({ ...prev, [groupId]: "" }));
    try {
      const res = await fetch(`/api/admin/rooms/${roomId}/groups/${groupId}/${path}`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorByGroupId((prev) => ({ ...prev, [groupId]: json.error ?? "요청에 실패했습니다" }));
        return;
      }
      await onChanged();
    } catch {
      setErrorByGroupId((prev) => ({ ...prev, [groupId]: "네트워크 오류가 발생했습니다" }));
    } finally {
      setBusyGroupId(null);
    }
  }

  async function handleDeleteGroup(group: GroupData) {
    if (group.members.length > 0) return;
    if (!confirm(`${group.name}을 삭제하시겠습니까?`)) return;
    setBusyGroupId(group.id);
    try {
      const res = await fetch(`/api/admin/rooms/${roomId}/groups/${group.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorByGroupId((prev) => ({ ...prev, [group.id]: json.error ?? "삭제에 실패했습니다" }));
        return;
      }
      await onChanged();
    } catch {
      setErrorByGroupId((prev) => ({ ...prev, [group.id]: "네트워크 오류가 발생했습니다" }));
    } finally {
      setBusyGroupId(null);
    }
  }

  const unconfirmedGroups = groups.filter((g) => g.status !== "CONFIRMED");

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {groups.map((group) => {
          const busy = busyGroupId === group.id;
          const error = errorByGroupId[group.id];
          return (
            <div
              key={group.id}
              className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-4"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-zinc-900">{group.name}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASS[group.status]}`}
                >
                  {STATUS_LABEL[group.status]}
                </span>
              </div>

              <div className="flex items-center gap-2 text-sm text-zinc-500">
                <span>PIN</span>
                <code className="rounded bg-zinc-100 px-2 py-0.5">{group.pin}</code>
              </div>

              <p className="text-sm text-zinc-500">
                조원 {group.members.length}명 (
                {group.members.filter((m) => m.online).length}명 접속중)
                {group.members.length > 0 && (
                  <span className="ml-1">
                    - {group.members.map((m) => m.nickname).join(", ")}
                  </span>
                )}
              </p>

              <p className="text-sm text-zinc-500">
                완성 {group.completeCount} / {group.totalSlots}
              </p>

              {group.slots.some((s) => s.lockedBy) && (
                <p className="text-sm text-amber-600">
                  {group.slots
                    .filter((s) => s.lockedBy)
                    .map((s) => `${s.slotIndex + 1}번: ${s.lockedBy}님 편집 중`)
                    .join(", ")}
                </p>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                {group.status === "SUBMITTED" && (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setRejectTarget(group)}
                      className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 disabled:opacity-50"
                    >
                      반려
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => callGroupAction(group.id, "confirm")}
                      className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                    >
                      확정
                    </button>
                  </>
                )}
                {group.status === "CONFIRMED" && (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => callGroupAction(group.id, "unconfirm")}
                      className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 disabled:opacity-50"
                    >
                      확정 해제 후 수정
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setRejectTarget(group)}
                      className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 disabled:opacity-50"
                    >
                      확정 해제 후 반려
                    </button>
                  </>
                )}
                {group.status === "DRAFTING" && group.members.length === 0 && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleDeleteGroup(group)}
                    className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 disabled:opacity-50"
                  >
                    빈 조 삭제
                  </button>
                )}
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col items-center gap-2 pt-4">
        <button
          type="button"
          disabled={startDisabled || startSubmitting}
          onClick={onStart}
          className="rounded-md bg-zinc-900 px-10 py-4 text-xl font-medium text-white disabled:opacity-50"
        >
          게임 시작
        </button>
        {!allConfirmed && unconfirmedGroups.length > 0 && (
          <p className="text-sm text-zinc-400">
            아직 확정되지 않은 조: {unconfirmedGroups.map((g) => g.name).join(", ")}
          </p>
        )}
      </div>

      {rejectTarget && (
        <GroupRejectModal
          groupName={rejectTarget.name}
          submitting={busyGroupId === rejectTarget.id}
          onClose={() => setRejectTarget(null)}
          onConfirm={async (groupComment) => {
            await callGroupAction(rejectTarget.id, "reject", { groupComment });
            setRejectTarget(null);
          }}
        />
      )}
    </div>
  );
}
