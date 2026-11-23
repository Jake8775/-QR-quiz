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
    <div className="mx-auto grid w-full max-w-7xl items-center gap-8 px-4 lg:grid-cols-[1fr_minmax(0,56rem)_1fr]">
      {/* Empty spacer -- same flex share (1fr) as the timer column on the
          right, so the middle (question) column lands at the true visual
          center of the screen regardless of the timer's own width. Without
          this, the timer sitting only on one side pulls the question text
          off-center, most noticeably when the presenter window is wide
          (fullscreen). */}
      <div aria-hidden className="hidden lg:block" />

      <div className="flex flex-col items-center text-center">
        <p className="text-lg text-zinc-500 sm:text-xl">
          문제 {currentQuestionIndex + 1} / {totalQuestions}
        </p>
        <h2
          className="mt-2 mb-10 font-semibold text-zinc-900"
          style={{ fontSize: "clamp(2.25rem, 5vw, 4.75rem)" }}
        >
          {questionText}
        </h2>
        <div className="grid w-full grid-cols-1 gap-5 sm:grid-cols-2">
          {options.map((o) => (
            <div
              key={o.id}
              className="rounded-xl border border-zinc-200 bg-white px-8 py-6 text-zinc-900"
              style={{ fontSize: "clamp(1.5rem, 2.8vw, 2.5rem)" }}
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
        <div className="flex flex-row items-center justify-center gap-4 lg:flex-col lg:justify-self-end">
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
