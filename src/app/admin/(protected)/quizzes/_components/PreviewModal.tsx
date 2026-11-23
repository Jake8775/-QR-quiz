"use client";

import { useState } from "react";
import type { QuestionDraft } from "@/lib/validation/quiz";

export function PreviewModal({
  title,
  questions,
  onClose,
}: {
  title: string;
  questions: QuestionDraft[];
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const question = questions[index];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-medium text-zinc-500">
            미리보기 — {title || "(제목 없음)"}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-zinc-500 hover:text-zinc-900"
          >
            닫기
          </button>
        </div>

        {!question ? (
          <p className="text-sm text-zinc-500">문제가 없습니다.</p>
        ) : (
          <>
            <p className="mb-3 text-xs text-zinc-400">
              문제 {index + 1} / {questions.length} · 제한시간{" "}
              {question.timeLimitSeconds}초
            </p>
            <p className="mb-4 text-lg font-medium text-zinc-900">
              {question.questionText || "(질문 없음)"}
            </p>
            <div className="flex flex-col gap-2">
              {question.options.map((o) => (
                <div
                  key={o.tempId}
                  className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2 text-sm"
                >
                  <span>{o.optionText || "(보기 없음)"}</span>
                  {question.correctOptionTempId === o.tempId && (
                    <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      정답
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-4 flex justify-between">
              <button
                type="button"
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                disabled={index === 0}
                className="text-sm text-zinc-500 disabled:opacity-30"
              >
                이전
              </button>
              <button
                type="button"
                onClick={() =>
                  setIndex((i) => Math.min(questions.length - 1, i + 1))
                }
                disabled={index === questions.length - 1}
                className="text-sm text-zinc-500 disabled:opacity-30"
              >
                다음
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
