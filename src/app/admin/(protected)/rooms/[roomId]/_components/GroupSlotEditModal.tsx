"use client";

import { useState } from "react";
import { QuestionCard } from "@/app/admin/(protected)/quizzes/_components/QuestionCard";
import { questionDraftSchema, type QuestionDraft } from "@/lib/validation/quiz";
import { slotToDraft, type ClientSlot } from "@/lib/groupMode/slotDraft";

// Presenter direct-edit, SUBMITTED-only (spec: "진행자는 SUBMITTED 상태에서만
// 문제 내용을 수정할 수 있다"). Reuses the exact same QuestionCard/
// questionDraftSchema the member's own editor and the normal-mode quiz
// editor both use.
export function GroupSlotEditModal({
  slot,
  slotIndex,
  submitting,
  onClose,
  onSave,
}: {
  slot: ClientSlot;
  slotIndex: number;
  submitting: boolean;
  onClose: () => void;
  onSave: (draft: QuestionDraft) => void;
}) {
  const [draft, setDraft] = useState<QuestionDraft>(() => slotToDraft(slot));
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    const check = questionDraftSchema.safeParse(draft);
    if (!check.success) {
      setError(check.error.issues[0]?.message ?? "입력값을 확인해주세요");
      return;
    }
    setError(null);
    onSave(check.data);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-lg">
        <h2 className="mb-4 text-lg font-semibold text-zinc-900">
          {slotIndex + 1}번 문제 직접 수정
        </h2>

        <QuestionCard
          question={draft}
          index={slotIndex}
          total={1}
          hideTimeLimit
          hideReorderControls
          onChange={setDraft}
          onDelete={() => {}}
          onMoveUp={() => {}}
          onMoveDown={() => {}}
        />

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

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
            onClick={handleSave}
            disabled={submitting}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
          >
            {submitting ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
