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
    <div>
      <p className="text-sm text-zinc-500">
        문제 {currentQuestionIndex + 1} / {totalQuestions}
      </p>
      <h2 className="mb-3 text-lg font-medium text-zinc-900">
        {questionText}
      </h2>
      <div className="flex flex-col gap-1">
        {options.map((o) => (
          <div
            key={o.id}
            className="rounded-md border border-zinc-200 px-3 py-2 text-sm"
          >
            {o.text}
          </div>
        ))}
      </div>

      <p className="mt-3 text-sm text-zinc-500">
        제출 {submittedCount} / {totalParticipants}
        {closesAt && (
          <span className="ml-2 text-zinc-400">
            마감 {new Date(closesAt).toLocaleTimeString()}
          </span>
        )}
      </p>

      <button
        type="button"
        disabled={submitting}
        onClick={onReveal}
        className="mt-3 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        결과 보기
      </button>
    </div>
  );
}
