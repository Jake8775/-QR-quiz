"use client";

import type { QuestionDraft } from "@/lib/validation/quiz";
import { OptionRow } from "./OptionRow";

export function QuestionCard({
  question,
  index,
  total,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  hideTimeLimit = false,
  hideReorderControls = false,
  disabled = false,
  lockOptionCount = false,
}: {
  question: QuestionDraft;
  index: number;
  total: number;
  onChange: (next: QuestionDraft) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  // Group-mode slot editing reuses this component but has no concept of
  // per-question time limit (it's set once at the run level) or of
  // adding/removing/reordering slots (fixed at K, created once). Both
  // default to false so normal mode's render is byte-identical.
  hideTimeLimit?: boolean;
  hideReorderControls?: boolean;
  // Group/solo slot editing after submission/confirmation: inputs must
  // look and behave as truly read-only (not just dimmed), so participants
  // don't mistake a submitted question for one they can still edit.
  disabled?: boolean;
  // GROUP/SOLO fairness: the presenter fixes the option count for the
  // whole run (group_mode_settings.options_count / solo_mode_settings.
  // options_count) so every author's question has the same number of
  // choices. Hides "보기 추가" and each option's "삭제" button -- the
  // option TEXT remains editable (independent of `disabled`).
  lockOptionCount?: boolean;
}) {
  function addOption() {
    if (question.options.length >= 6) return;
    onChange({
      ...question,
      options: [
        ...question.options,
        { tempId: crypto.randomUUID(), optionText: "" },
      ],
    });
  }

  function deleteOption(optionTempId: string) {
    if (question.options.length <= 2) return;
    const nextOptions = question.options.filter(
      (o) => o.tempId !== optionTempId,
    );
    const nextCorrect =
      question.correctOptionTempId === optionTempId
        ? ""
        : question.correctOptionTempId;
    onChange({ ...question, options: nextOptions, correctOptionTempId: nextCorrect });
  }

  function updateOptionText(optionTempId: string, text: string) {
    onChange({
      ...question,
      options: question.options.map((o) =>
        o.tempId === optionTempId ? { ...o, optionText: text } : o,
      ),
    });
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-500">
          문제 {index + 1}
        </span>
        {!hideReorderControls && (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={onMoveUp}
              disabled={index === 0}
              className="px-2 py-1 text-sm text-zinc-500 hover:text-zinc-900 disabled:opacity-30"
            >
              ▲
            </button>
            <button
              type="button"
              onClick={onMoveDown}
              disabled={index === total - 1}
              className="px-2 py-1 text-sm text-zinc-500 hover:text-zinc-900 disabled:opacity-30"
            >
              ▼
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="px-2 py-1 text-sm text-zinc-500 hover:text-red-600"
            >
              문제 삭제
            </button>
          </div>
        )}
      </div>

      <input
        type="text"
        value={question.questionText}
        onChange={(e) =>
          onChange({ ...question, questionText: e.target.value })
        }
        disabled={disabled}
        placeholder="질문을 입력하세요"
        className="mb-3 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 disabled:bg-zinc-100 disabled:text-zinc-500"
      />

      {!hideTimeLimit && (
        <div className="mb-3 flex items-center gap-2">
          <label className="text-sm text-zinc-500">제한 시간(초)</label>
          <input
            type="number"
            min={5}
            max={300}
            value={question.timeLimitSeconds}
            onChange={(e) =>
              onChange({
                ...question,
                timeLimitSeconds: Number(e.target.value),
              })
            }
            disabled={disabled}
            className="w-20 rounded-md border border-zinc-300 px-2 py-1 text-sm outline-none focus:border-zinc-500 disabled:bg-zinc-100 disabled:text-zinc-500"
          />
        </div>
      )}

      <div className="flex flex-col gap-2">
        {question.options.map((o) => (
          <OptionRow
            key={o.tempId}
            option={o}
            questionTempId={question.tempId}
            isCorrect={question.correctOptionTempId === o.tempId}
            canDelete={question.options.length > 2 && !lockOptionCount}
            onChangeText={(text) => updateOptionText(o.tempId, text)}
            onSetCorrect={() =>
              onChange({ ...question, correctOptionTempId: o.tempId })
            }
            onDelete={() => deleteOption(o.tempId)}
            disabled={disabled}
          />
        ))}
      </div>

      {!disabled && !lockOptionCount && (
        <button
          type="button"
          onClick={addOption}
          disabled={question.options.length >= 6}
          className="mt-2 text-sm text-zinc-600 underline disabled:opacity-30"
        >
          보기 추가
        </button>
      )}
    </div>
  );
}
