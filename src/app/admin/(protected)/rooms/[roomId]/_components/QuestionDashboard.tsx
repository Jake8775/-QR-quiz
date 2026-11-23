"use client";

export function QuestionDashboard({
  questionText,
  options,
  closesAt,
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
  submittedCount: number;
  totalParticipants: number;
  currentQuestionIndex: number;
  totalQuestions: number;
  onReveal: () => void;
  submitting: boolean;
}) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col items-center px-4 text-center">
      <p className="text-lg text-zinc-500 sm:text-xl">
        문제 {currentQuestionIndex + 1} / {totalQuestions}
      </p>
      <h2 className="mt-2 mb-8 text-3xl font-semibold text-zinc-900 sm:text-5xl">
        {questionText}
      </h2>
      <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
        {options.map((o) => (
          <div
            key={o.id}
            className="rounded-xl border border-zinc-200 px-6 py-5 text-xl text-zinc-900 sm:text-2xl"
          >
            {o.text}
          </div>
        ))}
      </div>

      <p className="mt-8 text-lg text-zinc-500 sm:text-xl">
        제출 {submittedCount} / {totalParticipants}
        {closesAt && (
          <span className="ml-3 text-zinc-400">
            마감 {new Date(closesAt).toLocaleTimeString()}
          </span>
        )}
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
  );
}
