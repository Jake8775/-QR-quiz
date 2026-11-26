"use client";

import { useState } from "react";
import type { QuestionDraft } from "@/lib/validation/quiz";
import { GroupRejectModal } from "./GroupRejectModal";
import { GroupMoveMemberModal } from "./GroupMoveMemberModal";
import { GroupSlotEditModal } from "./GroupSlotEditModal";

type GroupSlot = {
  id: string;
  slotIndex: number;
  questionText: string;
  options: { tempId: string; optionText: string }[];
  correctOptionTempId: string | null;
  complete: boolean;
  lockedBy: string | null;
  presenterComment: string | null;
  presenterEdited: boolean;
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
  hideGroupMechanics = false,
  optionsCount,
}: {
  roomId: string;
  groups: GroupData[];
  allConfirmed: boolean;
  onChanged: () => void | Promise<void>;
  onStart: () => void;
  startDisabled: boolean;
  startSubmitting: boolean;
  // SOLO mode only -- each "group" is really just one participant, so
  // its PIN (never used to join -- SOLO has no PIN step) and its
  // "이동" button (moving a 1-person group's only member just renames
  // who's in which group, not a real reassignment) are both meaningless.
  // Defaults to false so GROUP mode's render is byte-identical.
  hideGroupMechanics?: boolean;
  // Presenter-fixed option count for this run -- passed through to the
  // direct-edit modal so a presenter edit can't change the count either.
  optionsCount: number;
}) {
  const [busyGroupId, setBusyGroupId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<GroupData | null>(null);
  const [moveTarget, setMoveTarget] = useState<{ member: GroupMember; fromGroup: GroupData } | null>(
    null,
  );
  const [editTarget, setEditTarget] = useState<{ group: GroupData; slot: GroupSlot } | null>(null);
  const [errorByGroupId, setErrorByGroupId] = useState<Record<string, string>>({});
  // Only one group's PIN is ever shown at a time -- this screen is beamed
  // via projector for all participants to see, so a revealed PIN must not
  // linger once the presenter moves on to announce the next group's.
  const [revealedPinGroupId, setRevealedPinGroupId] = useState<string | null>(null);

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

  async function handleForceReleaseLock(group: GroupData, slotId: string) {
    setBusyGroupId(group.id);
    setErrorByGroupId((prev) => ({ ...prev, [group.id]: "" }));
    try {
      const res = await fetch(
        `/api/admin/rooms/${roomId}/groups/${group.id}/lock/${slotId}/force-release`,
        { method: "POST" },
      );
      const json = await res.json();
      if (!res.ok) {
        setErrorByGroupId((prev) => ({ ...prev, [group.id]: json.error ?? "잠금 해제에 실패했습니다" }));
        return;
      }
      await onChanged();
    } catch {
      setErrorByGroupId((prev) => ({ ...prev, [group.id]: "네트워크 오류가 발생했습니다" }));
    } finally {
      setBusyGroupId(null);
    }
  }

  async function handleMoveMember(toGroupId: string) {
    if (!moveTarget) return;
    const { member, fromGroup } = moveTarget;
    setBusyGroupId(fromGroup.id);
    setErrorByGroupId((prev) => ({ ...prev, [fromGroup.id]: "" }));
    try {
      const res = await fetch(
        `/api/admin/rooms/${roomId}/groups/${fromGroup.id}/move-member`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ participantId: member.id, toGroupId }),
        },
      );
      const json = await res.json();
      if (!res.ok) {
        setErrorByGroupId((prev) => ({ ...prev, [fromGroup.id]: json.error ?? "이동에 실패했습니다" }));
        return;
      }
      setMoveTarget(null);
      await onChanged();
    } catch {
      setErrorByGroupId((prev) => ({ ...prev, [fromGroup.id]: "네트워크 오류가 발생했습니다" }));
    } finally {
      setBusyGroupId(null);
    }
  }

  async function handleSaveSlotEdit(draft: QuestionDraft) {
    if (!editTarget) return;
    const { group, slot } = editTarget;
    setBusyGroupId(group.id);
    setErrorByGroupId((prev) => ({ ...prev, [group.id]: "" }));
    try {
      const res = await fetch(
        `/api/admin/rooms/${roomId}/groups/${group.id}/slot/${slot.id}/edit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      const json = await res.json();
      if (!res.ok) {
        setErrorByGroupId((prev) => ({ ...prev, [group.id]: json.error ?? "수정에 실패했습니다" }));
        return;
      }
      setEditTarget(null);
      await onChanged();
    } catch {
      setErrorByGroupId((prev) => ({ ...prev, [group.id]: "네트워크 오류가 발생했습니다" }));
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
              className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-5"
            >
              <div className="flex items-center justify-between">
                <span className="text-lg font-medium text-zinc-900">{group.name}</span>
                <span
                  className={`rounded-full px-3 py-1 text-sm font-medium ${STATUS_BADGE_CLASS[group.status]}`}
                >
                  {STATUS_LABEL[group.status]}
                </span>
              </div>

              {!hideGroupMechanics && (
                <div className="flex items-center gap-2">
                  {revealedPinGroupId === group.id ? (
                    <>
                      <code className="rounded bg-zinc-100 px-2 py-0.5 text-lg font-semibold">
                        {group.pin}
                      </code>
                      <button
                        type="button"
                        onClick={() => setRevealedPinGroupId(null)}
                        className="text-sm text-zinc-500 underline transition-colors hover:text-zinc-700"
                      >
                        숨기기
                      </button>
                    </>
                  ) : (
                    <>
                      <code className="rounded bg-zinc-100 px-2 py-0.5 text-lg font-semibold tracking-widest text-zinc-400">
                        ••••
                      </code>
                      <button
                        type="button"
                        onClick={() => setRevealedPinGroupId(group.id)}
                        className="text-sm text-zinc-500 underline transition-colors hover:text-zinc-700"
                      >
                        PIN 확인
                      </button>
                    </>
                  )}
                </div>
              )}

              <div className="text-base text-zinc-500">
                <span>
                  조원 {group.members.length}명 (
                  {group.members.filter((m) => m.online).length}명 접속중)
                </span>
                {group.members.length > 0 && (
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {group.members.map((m) => (
                      <li key={m.id} className="flex items-center justify-between gap-2">
                        <span>{m.nickname}</span>
                        {!hideGroupMechanics && groups.length > 1 && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setMoveTarget({ member: m, fromGroup: group })}
                            className="text-xs text-zinc-400 underline hover:text-zinc-600 disabled:opacity-50"
                          >
                            이동
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <p className="text-base text-zinc-500">
                완성 {group.completeCount} / {group.totalSlots}
              </p>

              {group.status === "SUBMITTED" && (
                <ul className="flex flex-col gap-1">
                  {group.slots.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between gap-2 rounded-md bg-zinc-50 px-2 py-1 text-sm"
                    >
                      <span className="truncate text-zinc-700">
                        {s.slotIndex + 1}. {s.questionText || "(미작성)"}
                        {s.presenterEdited && (
                          <span className="ml-1 text-xs font-medium text-amber-600">
                            (진행자 수정됨)
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setEditTarget({ group, slot: s })}
                        className="shrink-0 text-xs text-zinc-500 underline hover:text-zinc-700 disabled:opacity-50"
                      >
                        직접 수정
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {group.slots.some((s) => s.lockedBy) && (
                <ul className="flex flex-col gap-0.5">
                  {group.slots
                    .filter((s) => s.lockedBy)
                    .map((s) => (
                      <li
                        key={s.id}
                        className="flex items-center justify-between gap-2 text-sm text-amber-600"
                      >
                        <span>
                          {s.slotIndex + 1}번: {s.lockedBy}님 편집 중
                        </span>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleForceReleaseLock(group, s.id)}
                          className="text-xs text-amber-700 underline hover:text-amber-900 disabled:opacity-50"
                        >
                          강제 해제
                        </button>
                      </li>
                    ))}
                </ul>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                {group.status === "SUBMITTED" && (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setRejectTarget(group)}
                      className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                    >
                      반려
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => callGroupAction(group.id, "confirm")}
                      className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
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
                      className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50"
                    >
                      확정 해제 후 수정
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setRejectTarget(group)}
                      className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
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
                    className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
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
          className="rounded-md bg-zinc-900 px-10 py-4 text-xl font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
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

      {moveTarget && (
        <GroupMoveMemberModal
          memberNickname={moveTarget.member.nickname}
          fromGroup={moveTarget.fromGroup}
          otherGroups={groups.filter((g) => g.id !== moveTarget.fromGroup.id)}
          submitting={busyGroupId === moveTarget.fromGroup.id}
          onClose={() => setMoveTarget(null)}
          onConfirm={handleMoveMember}
        />
      )}

      {editTarget && (
        <GroupSlotEditModal
          slot={editTarget.slot}
          slotIndex={editTarget.slot.slotIndex}
          submitting={busyGroupId === editTarget.group.id}
          optionsCount={optionsCount}
          onClose={() => setEditTarget(null)}
          onSave={handleSaveSlotEdit}
        />
      )}
    </div>
  );
}
