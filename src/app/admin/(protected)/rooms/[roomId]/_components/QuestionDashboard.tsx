"use client";

import { useEffect, useRef, useState } from "react";

function computeRemaining(closesAt: string): number {
  return Math.max(0, (new Date(closesAt).getTime() - Date.now()) / 1000);
}

// ratio 1 (time just opened) -> blue, ratio 0 (time's up) -> red.
function gaugeColor(ratio: number): string {
  const hue = Math.max(0, Math.min(210, ratio * 210));
  return `hsl(${hue}, 85%, 50%)`;
}

// The clamp()'s upper bound alone isn't enough -- a long question at
// max size wraps into many lines and pushes the option cards (and the
// timer) off the projected screen. Scale the ceiling down as the text
// gets longer so long questions still fit on one screen, while short
// ones keep the original large, readable size.
function questionFontSize(text: string): string {
  const len = text.length;
  if (len <= 20) return "clamp(2.25rem, 5vw, 4.75rem)";
  if (len <= 40) return "clamp(2rem, 4.2vw, 3.75rem)";
  if (len <= 70) return "clamp(1.75rem, 3.4vw, 3rem)";
  if (len <= 110) return "clamp(1.5rem, 2.6vw, 2.25rem)";
  return "clamp(1.25rem, 2vw, 1.75rem)";
}

function questionMarginClass(text: string): string {
  const len = text.length;
  if (len <= 40) return "mb-10";
  if (len <= 70) return "mb-8";
  return "mb-5";
}

// Same rationale as questionFontSize, applied to each option card's own
// text so an unusually long option can't overflow its box either.
function optionFontSize(text: string): string {
  const len = text.length;
  if (len <= 15) return "clamp(1.5rem, 2.8vw, 2.5rem)";
  if (len <= 30) return "clamp(1.25rem, 2.4vw, 2.1rem)";
  if (len <= 50) return "clamp(1.1rem, 2vw, 1.75rem)";
  return "clamp(1rem, 1.6vw, 1.4rem)";
}

export function QuestionDashboard({
  questionText,
  options,
  closesAt,
  timeLimitSeconds,
  submittedCount,
  totalParticipants,
  correctCount,
  currentQuestionIndex,
  totalQuestions,
  revealed,
  correctOptionId,
  onReveal,
  onShowRanking,
  submitting,
  authoringGroup,
  spectatorCount,
}: {
  questionText: string;
  options: { id: string; text: string; count?: number }[];
  closesAt: string | null;
  timeLimitSeconds: number | null;
  submittedCount: number;
  totalParticipants: number;
  correctCount?: number;
  currentQuestionIndex: number;
  totalQuestions: number;
  revealed: boolean;
  correctOptionId?: string | null;
  onReveal: () => void;
  onShowRanking: () => void;
  submitting: boolean;
  // Group mode only -- undefined for every normal-mode render.
  authoringGroup?: { name: string; members: string[] };
  // Group/solo mode only -- count of participants excluded from
  // totalParticipants because they authored the current question.
  spectatorCount?: number;
}) {
  const [remaining, setRemaining] = useState<number | null>(() =>
    closesAt ? computeRemaining(closesAt) : null,
  );
  // Guards against firing onReveal more than once for the same question
  // (e.g. if this effect re-runs after remaining already hit 0) — reset
  // whenever a new question's closesAt comes in.
  const autoRevealedRef = useRef(false);

  useEffect(() => {
    autoRevealedRef.current = false;
  }, [closesAt]);

  useEffect(() => {
    if (!closesAt) return;
    const interval = setInterval(() => {
      const next = computeRemaining(closesAt);
      setRemaining(next);
      if (next <= 0 && !revealed && !autoRevealedRef.current) {
        autoRevealedRef.current = true;
        onReveal();
      }
    }, 200);
    return () => clearInterval(interval);
  }, [closesAt, revealed, onReveal]);

  const ratio =
    remaining !== null && timeLimitSeconds
      ? Math.max(0, Math.min(1, remaining / timeLimitSeconds))
      : 1;
  const color = gaugeColor(ratio);
  const timeUp = remaining !== null && remaining <= 0;
  const maxCount = Math.max(1, submittedCount);

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
        {authoringGroup && (
          <p className="text-sm text-zinc-400">
            출제: {authoringGroup.name} - {authoringGroup.members.join(", ")}
          </p>
        )}
        <h2
          className={`mt-2 font-semibold text-zinc-900 ${questionMarginClass(questionText)}`}
          style={{ fontSize: questionFontSize(questionText) }}
        >
          {questionText}
        </h2>

        {!revealed ? (
          <div className="grid w-full grid-cols-1 gap-5 sm:grid-cols-2">
            {options.map((o) => (
              <div
                key={o.id}
                className="rounded-xl border border-zinc-200 bg-white px-8 py-6 text-zinc-900"
                style={{ fontSize: optionFontSize(o.text) }}
              >
                {o.text}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex w-full flex-col gap-4">
            {options.map((o) => {
              const count = o.count ?? 0;
              const isCorrect = o.id === correctOptionId;
              return (
                <div key={o.id} className="text-left">
                  <div className="mb-1 flex items-baseline justify-between gap-3">
                    <span
                      className={`font-medium ${
                        isCorrect ? "text-green-700" : "text-zinc-700"
                      }`}
                      style={{ fontSize: "clamp(1.1rem, 1.8vw, 1.5rem)" }}
                    >
                      {o.text}
                      {isCorrect && " ✓"}
                    </span>
                    <span
                      className={`font-semibold ${
                        isCorrect ? "text-green-700" : "text-zinc-500"
                      }`}
                    >
                      {count}명
                    </span>
                  </div>
                  <div className="h-6 w-full overflow-hidden rounded-full bg-zinc-100">
                    <div
                      className={`h-full rounded-full transition-[width] duration-500 ease-out ${
                        isCorrect ? "bg-green-500" : "bg-blue-400"
                      }`}
                      style={{ width: `${(count / maxCount) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!revealed ? (
          <>
            <p className="mt-8 text-lg text-zinc-500 sm:text-xl">
              제출 {submittedCount} / {totalParticipants}
            </p>
            {!!spectatorCount && (
              <p className="text-sm text-zinc-400">관전 중 {spectatorCount}명</p>
            )}
            <button
              type="button"
              disabled={submitting}
              onClick={onReveal}
              className="mt-6 rounded-md bg-zinc-900 px-8 py-4 text-lg font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
            >
              결과 보기
            </button>
          </>
        ) : (
          <>
            <p className="mt-8 text-lg text-zinc-500 sm:text-xl">
              정답자 {correctCount ?? 0} / {totalParticipants}명
            </p>
            {!!spectatorCount && (
              <p className="text-sm text-zinc-400">관전 중 {spectatorCount}명</p>
            )}
            <button
              type="button"
              disabled={submitting}
              onClick={onShowRanking}
              className="mt-6 rounded-md bg-zinc-900 px-8 py-4 text-lg font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
            >
              순위 보기
            </button>
          </>
        )}
      </div>

      {!revealed && remaining !== null ? (
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
      ) : (
        <div aria-hidden className="hidden lg:block" />
      )}
    </div>
  );
}
