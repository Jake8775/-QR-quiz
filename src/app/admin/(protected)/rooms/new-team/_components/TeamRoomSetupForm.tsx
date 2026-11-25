"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { QuestionDraft } from "@/lib/validation/quiz";
import { teamModeSetupSchema, type TeamModeSetupInput } from "@/lib/validation/team";
import { QuestionCard } from "../../../quizzes/_components/QuestionCard";
import { PreviewModal } from "../../../quizzes/_components/PreviewModal";
import { createTeamModeRoomAction } from "../../team-actions";

function newQuestion(): QuestionDraft {
  const optionA = { tempId: crypto.randomUUID(), optionText: "" };
  const optionB = { tempId: crypto.randomUUID(), optionText: "" };
  return {
    tempId: crypto.randomUUID(),
    questionText: "",
    timeLimitSeconds: 30,
    options: [optionA, optionB],
    correctOptionTempId: optionA.tempId,
  };
}

// Same hydration-mismatch rationale as QuizEditor.tsx's
// initialBlankQuestion -- fixed (non-random) ids for the first question
// on a brand-new form so SSR and client hydration produce the same
// radio-group `name`.
function initialBlankQuestion(): QuestionDraft {
  return {
    tempId: "initial-question",
    questionText: "",
    timeLimitSeconds: 30,
    options: [
      { tempId: "initial-option-a", optionText: "" },
      { tempId: "initial-option-b", optionText: "" },
    ],
    correctOptionTempId: "initial-option-a",
  };
}

// TEAM mode's setup screen is QuizEditor (question authoring) plus
// GroupRoomSetupForm's single groupCount field, combined into one
// "create immediately" step like GROUP mode -- the presenter authors
// questions directly, teams are created already-confirmed.
export function TeamRoomSetupForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [groupCount, setGroupCount] = useState(4);
  const [questions, setQuestions] = useState<QuestionDraft[]>([
    initialBlankQuestion(),
  ]);
  const [showPreview, setShowPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function updateQuestion(index: number, next: QuestionDraft) {
    setQuestions((qs) => qs.map((q, i) => (i === index ? next : q)));
  }

  function deleteQuestion(index: number) {
    setQuestions((qs) => qs.filter((_, i) => i !== index));
  }

  function moveQuestion(index: number, direction: -1 | 1) {
    setQuestions((qs) => {
      const target = index + direction;
      if (target < 0 || target >= qs.length) return qs;
      const next = [...qs];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function handleSubmit() {
    if (saving) return;
    setError(null);

    const input: TeamModeSetupInput = { title, groupCount, questions };
    const clientCheck = teamModeSetupSchema.safeParse(input);
    if (!clientCheck.success) {
      setError(clientCheck.error.issues[0]?.message ?? "입력값을 확인해주세요");
      return;
    }

    setSaving(true);
    const result = await createTeamModeRoomAction(input);
    setSaving(false);

    if (!result.success) {
      setError(result.error);
      return;
    }
    router.push(`/admin/rooms/${result.roomId}`);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-lg font-semibold text-zinc-900">팀전 방 만들기</h1>

      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="퀴즈 제목"
        className="mb-4 w-full rounded-md border border-zinc-300 px-3 py-2 text-lg font-medium outline-none focus:border-zinc-500"
      />

      <label className="mb-6 flex flex-col gap-1">
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

      <div className="flex flex-col gap-4">
        {questions.map((q, i) => (
          <QuestionCard
            key={q.tempId}
            question={q}
            index={i}
            total={questions.length}
            onChange={(next) => updateQuestion(i, next)}
            onDelete={() => deleteQuestion(i)}
            onMoveUp={() => moveQuestion(i, -1)}
            onMoveDown={() => moveQuestion(i, 1)}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => setQuestions((qs) => [...qs, newQuestion()])}
        className="mt-4 rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
      >
        문제 추가
      </button>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-6 flex gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
        >
          {saving ? "생성 중..." : "방 생성"}
        </button>
        <button
          type="button"
          onClick={() => setShowPreview(true)}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
        >
          미리보기
        </button>
      </div>

      {showPreview && (
        <PreviewModal
          title={title}
          questions={questions}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  );
}
