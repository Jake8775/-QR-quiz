"use client";

import { useState } from "react";

export function GroupRejectModal({
  groupName,
  onConfirm,
  onClose,
  submitting,
}: {
  groupName: string;
  onConfirm: (groupComment: string) => void;
  onClose: () => void;
  submitting: boolean;
}) {
  const [comment, setComment] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
        <h2 className="mb-3 text-lg font-semibold text-zinc-900">
          {groupName} 반려
        </h2>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-zinc-700">조 전체 코멘트 (필수)</span>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
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
            onClick={() => onConfirm(comment)}
            disabled={submitting || !comment.trim()}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            {submitting ? "처리 중..." : "반려"}
          </button>
        </div>
      </div>
    </div>
  );
}
