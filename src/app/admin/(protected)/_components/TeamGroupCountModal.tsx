"use client";

import { useState } from "react";

// Same modal shape as GroupModeLobbyDashboard's GroupRejectModal, just a
// number input instead of a textarea -- collects the one TEAM-specific
// setting (team count) needed to turn an already-saved TEAM quiz into a
// new room, letting the same quiz be reused across many rooms with a
// different team count each time.
export function TeamGroupCountModal({
  onConfirm,
  onClose,
  submitting,
}: {
  onConfirm: (groupCount: number) => void;
  onClose: () => void;
  submitting: boolean;
}) {
  const [groupCount, setGroupCount] = useState(4);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
        <h2 className="mb-3 text-lg font-semibold text-zinc-900">팀전 방 만들기</h2>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-zinc-700">조 개수</span>
          <input
            type="number"
            min={2}
            max={20}
            value={groupCount}
            onChange={(e) => setGroupCount(Number(e.target.value))}
            className="w-24 rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
          />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => onConfirm(groupCount)}
            disabled={submitting}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
          >
            {submitting ? "생성 중..." : "방 생성"}
          </button>
        </div>
      </div>
    </div>
  );
}
