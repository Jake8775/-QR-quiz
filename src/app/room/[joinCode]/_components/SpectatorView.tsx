"use client";

import { useEffect, useState } from "react";
import { SafetyBackdrop } from "@/components/SafetyBackdrop";
import { AuthoringGroupBanner } from "./AuthoringGroupBanner";

function computeRemaining(closesAt: string): number {
  return Math.max(0, Math.ceil((new Date(closesAt).getTime() - Date.now()) / 1000));
}

// Shown instead of QuestionView when the current question's source
// group matches the viewer's own group (R2/8-4) -- no answer-submission
// affordance, since the server rejects any submit attempt for this
// question anyway. QuestionView itself never needs to know this exists.
export function SpectatorView({
  questionText,
  options,
  closesAt,
  authoringGroup,
}: {
  questionText: string;
  options: { id: string; text: string }[];
  closesAt: string | null;
  authoringGroup: { name: string; members: string[] } | undefined;
}) {
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

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-zinc-50 px-4">
      <SafetyBackdrop />
      <div className="relative w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
        <AuthoringGroupBanner authoringGroup={authoringGroup} />
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
            <div
              key={o.id}
              className="rounded-md border border-zinc-200 px-3 py-2 text-left text-sm text-zinc-500"
            >
              {o.text}
            </div>
          ))}
        </div>
        <p className="mt-4 text-center text-sm font-medium text-zinc-500">
          우리 조 문제 · 관전 중
        </p>
      </div>
    </div>
  );
}
