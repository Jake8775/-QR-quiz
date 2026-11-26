"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { quizEditorSchema, type QuizEditorInput, type QuestionDraft } from "@/lib/validation/quiz";
import type { QuizMode } from "@/types/database.types";
import { saveQuizAction } from "../actions";
import { QuestionCard } from "./QuestionCard";
import { PreviewModal } from "./PreviewModal";

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

// Fixed (non-random) ids for the very first question on a brand-new quiz.
// useState's initial value runs during SSR and again during client
// hydration; crypto.randomUUID() would produce different ids each time,
// causing a hydration mismatch on the radio group's `name` attribute.
// Every question added later goes through newQuestion() instead, which
// only ever runs client-side (post-hydration, inside an event handler),
// so randomUUID() there is safe.
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

export function QuizEditor({
  initialData,
  mode = "NORMAL",
}: {
  initialData: QuizEditorInput | null;
  // TEAM mode reuses this exact editor to author its questions (same
  // QuestionCard/questionDraftSchema pipeline as NORMAL) -- only the
  // heading text and saveQuizAction's mode param differ. Editing an
  // existing quiz ignores this (saveQuizAction never changes an
  // existing quiz's mode), so it only matters for a brand-new quiz.
  mode?: QuizMode;
}) {
  const router = useRouter();
  const [quizId] = useState<string | null>(initialData?.quizId ?? null);
  const [title, setTitle] = useState(initialData?.title ?? "");
  const [questions, setQuestions] = useState<QuestionDraft[]>(
    initialData?.questions ?? [initialBlankQuestion()],
  );
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

  async function handleSave() {
    if (saving) return;
    setError(null);

    const input: QuizEditorInput = { quizId, title, questions };
    const clientCheck = quizEditorSchema.safeParse(input);
    if (!clientCheck.success) {
      setError(clientCheck.error.issues[0]?.message ?? "입력값을 확인해주세요");
      return;
    }

    setSaving(true);
    const result = await saveQuizAction(input, mode);
    setSaving(false);

    if (!result.success) {
      setError(result.error);
      return;
    }
    router.push("/admin");
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {mode === "TEAM" && (
        <h1 className="mb-4 text-lg font-semibold text-zinc-900">팀전 문제 작성</h1>
      )}
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="퀴즈 제목"
        className="mb-6 w-full rounded-md border border-zinc-300 px-3 py-2 text-lg font-medium outline-none focus:border-zinc-500"
      />

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
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
        >
          {saving ? "저장 중..." : "저장"}
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
