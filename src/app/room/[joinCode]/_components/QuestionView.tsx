"use client";

import { useEffect, useState } from "react";
import { SafetyBackdrop } from "@/components/SafetyBackdrop";

function computeRemaining(closesAt: string): number {
  return Math.max(0, Math.ceil((new Date(closesAt).getTime() - Date.now()) / 1000));
}

export function QuestionView({
  joinCode,
  questionText,
  options,
  closesAt,
  hasSubmitted,
  runQuestionId,
}: {
  joinCode: string;
  questionText: string;
  options: { id: string; text: string }[];
  closesAt: string | null;
  hasSubmitted: boolean;
  runQuestionId: string;
}) {
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Caller re-mounts this component (keyed by runQuestionId) for each new
  // question, so these only ever need to initialize from props once.
  const [localSubmitted, setLocalSubmitted] = useState(hasSubmitted);
  const [remaining, setRemaining] = useState<number | null>(() =>
    closesAt ? computeRemaining(closesAt) : null,
  );

  useEffect(() => {
    if (!closesAt) return;
    const interval = setInterval(() => {
      setRemaining(computeRemaining(closesAt));
    }, 500);
    return () => clearInterval(interval);
  }, [closesAt]);

  async function handleSubmit() {
    if (!selectedOptionId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/room/${joinCode}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runQuestionId,
          selectedOptionId,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "제출에 실패했습니다");
        return;
      }
      setLocalSubmitted(true);
    } catch {
      setError("네트워크 오류가 발생했습니다");
    } finally {
      setSubmitting(false);
    }
  }

  if (localSubmitted) {
    return (
      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-zinc-50 px-4">
        <SafetyBackdrop />
        <div className="relative w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
          <p className="text-lg font-medium text-zinc-900">
            제출 완료! 결과를 기다려주세요.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-zinc-50 px-4">
      <SafetyBackdrop />
      <div className="relative w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
        {remaining !== null && (
          <p className="mb-2 text-center text-sm text-zinc-500">
            남은 시간 {remaining}초
          </p>
        )}
        <h1 className="mb-4 text-lg font-semibold text-zinc-900">
          {questionText}
        </h1>
        <div className="flex flex-col gap-2">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setSelectedOptionId(o.id)}
              className={`rounded-md border-2 px-3 py-2 text-left text-sm font-medium transition-colors ${
                selectedOptionId === o.id
                  ? "border-blue-500 bg-blue-50 text-blue-900"
                  : "border-zinc-300 bg-white text-zinc-700"
              }`}
            >
              {o.text}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={!selectedOptionId || submitting}
          onClick={handleSubmit}
          className="mt-4 w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          제출하기
        </button>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
