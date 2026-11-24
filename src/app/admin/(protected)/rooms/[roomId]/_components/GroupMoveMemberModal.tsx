"use client";

import { useState } from "react";

type GroupOption = { id: string; name: string };

// Pre-game-start only (spec section 6/9) -- the presenter picks a
// destination group for one member of `fromGroup`.
export function GroupMoveMemberModal({
  memberNickname,
  fromGroup,
  otherGroups,
  submitting,
  onClose,
  onConfirm,
}: {
  memberNickname: string;
  fromGroup: GroupOption;
  otherGroups: GroupOption[];
  submitting: boolean;
  onClose: () => void;
  onConfirm: (toGroupId: string) => void;
}) {
  const [toGroupId, setToGroupId] = useState(otherGroups[0]?.id ?? "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
        <h2 className="mb-1 text-lg font-semibold text-zinc-900">조원 이동</h2>
        <p className="mb-4 text-sm text-zinc-500">
          {memberNickname}님을 {fromGroup.name}에서 다른 조로 이동합니다.
        </p>

        <label className="mb-1 block text-sm font-medium text-zinc-700">이동할 조</label>
        <select
          value={toGroupId}
          onChange={(e) => setToGroupId(e.target.value)}
          className="mb-4 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        >
          {otherGroups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm text-zinc-700 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => toGroupId && onConfirm(toGroupId)}
            disabled={submitting || !toGroupId}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? "이동 중..." : "이동"}
          </button>
        </div>
      </div>
    </div>
  );
}
