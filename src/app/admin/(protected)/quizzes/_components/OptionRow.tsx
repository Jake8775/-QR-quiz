"use client";

import type { OptionDraft } from "@/lib/validation/quiz";

export function OptionRow({
  option,
  questionTempId,
  isCorrect,
  canDelete,
  onChangeText,
  onSetCorrect,
  onDelete,
}: {
  option: OptionDraft;
  questionTempId: string;
  isCorrect: boolean;
  canDelete: boolean;
  onChangeText: (text: string) => void;
  onSetCorrect: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="radio"
        name={`correct-${questionTempId}`}
        checked={isCorrect}
        onChange={onSetCorrect}
        aria-label="정답으로 지정"
        className="h-4 w-4"
      />
      <input
        type="text"
        value={option.optionText}
        onChange={(e) => onChangeText(e.target.value)}
        placeholder="보기 내용"
        className="flex-1 rounded-md border border-zinc-300 px-2 py-1.5 text-sm outline-none focus:border-zinc-500"
      />
      <button
        type="button"
        onClick={onDelete}
        disabled={!canDelete}
        className="px-2 py-1 text-xs text-zinc-500 hover:text-red-600 disabled:opacity-30"
      >
        삭제
      </button>
    </div>
  );
}
