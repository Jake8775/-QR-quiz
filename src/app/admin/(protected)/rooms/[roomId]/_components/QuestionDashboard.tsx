"use client";

import { useEffect, useState } from "react";

function computeRemaining(closesAt: string): number {
  return Math.max(0, (new Date(closesAt).getTime() - Date.now()) / 1000);
}

// ratio 1 (time just opened) -> blue, ratio 0 (time's up) -> red.
function gaugeColor(ratio: number): string {
  const hue = Math.max(0, Math.min(210, ratio * 210));
  return `hsl(${hue}, 85%, 50%)`;
}

export function QuestionDashboard({
  questionText,
  options,
  closesAt,
  timeLimitSeconds,
  submittedCount,
  totalParticipants,
  currentQuestionIndex,
  totalQuestions,
  onReveal,
  submitting,
}: {
  questionText: string;
  options: { id: string; text: string }[];
  closesAt: string | null;
  timeLimitSeconds: number | null;
  submittedCount: number;
  totalParticipants: number;
  currentQuestionIndex: number;
  totalQuestions: number;
  onReveal: () => void;
  submitting: boolean;
}) {
  const [remaining, setRemaining] = useState<number | null>(() =>
    closesAt ? computeRemaining(closesAt) : null,
  );

  useEffect(() => {
    if (!closesAt) return;
    const interval = setInterval(() => {
      setRemaining(computeRemaining(closesAt));
    }, 200);
    return () => clearInterval(interval);
  }, [closesAt]);

  const ratio =
    remaining !== null && timeLimitSeconds
      ? Math.max(0, Math.min(1, remaining / timeLimitSeconds))
      : 1;
  const color = gaugeColor(ratio);
  const timeUp = remaining !== null && remaining <= 0;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-10 px-4 lg:flex-row lg:items-center lg:justify-center">
      <div className="flex flex-1 flex-col items-center text-center">
        <p className="text-lg text-zinc-500 sm:text-xl">
          문제 {currentQuestionIndex + 1} / {totalQuestions}
        </p>
        <h2 className="mt-2 mb-10 text-4xl font-semibold text-zinc-900 sm:text-6xl">
          {questionText}
        </h2>
        <div className="grid w-full grid-cols-1 gap-5 sm:grid-cols-2">
          {options.map((o) => (
            <div
              key={o.id}
              className="rounded-xl border border-zinc-200 px-8 py-6 text-2xl text-zinc-900 sm:text-3xl"
            >
              {o.text}
            </div>
          ))}
        </div>

        <p className="mt-8 text-lg text-zinc-500 sm:text-xl">
          제출 {submittedCount} / {totalParticipants}
        </p>

        <button
          type="button"
          disabled={submitting}
          onClick={onReveal}
          className="mt-6 rounded-md bg-zinc-900 px-8 py-4 text-lg font-medium text-white disabled:opacity-50"
        >
          결과 보기
        </button>
      </div>

      {remaining !== null && (
        <div className="flex flex-row items-center gap-4 lg:flex-col">
          <p
            className="font-bold tabular-nums text-4xl sm:text-6xl"
            style={{ color }}
          >
            {Math.ceil(remaining)}
            <span className="ml-1 text-xl sm:text-2xl">초</span>
          </p>
          <div className="relative h-48 w-10 overflow-hidden rounded-full border border-zinc-200 bg-zinc-100 sm:h-64 sm:w-14">
            <div
              className="absolute inset-x-0 bottom-0 transition-[height] duration-200 ease-linear"
              style={{ height: `${ratio * 100}%`, backgroundColor: color }}
            />
          </div>
          {timeUp && (
            <p className="text-sm font-medium text-red-600 sm:text-base">
              제출 마감
            </p>
          )}
        </div>
      )}
    </div>
  );
}
