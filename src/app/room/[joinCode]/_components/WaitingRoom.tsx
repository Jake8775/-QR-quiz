"use client";

import { useEffect, useState } from "react";
import { QuestionView } from "./QuestionView";
import { ResultView } from "./ResultView";
import { ReactionBar } from "./ReactionBar";
import { SafetyBackdrop } from "./SafetyBackdrop";

type RunStatus = "LOBBY" | "QUESTION_OPEN" | "LEADERBOARD" | "FINISHED";

type LeaderboardRow = {
  participantId: string;
  nickname: string;
  totalPoints: number;
};

type StateResponse = {
  status: RunStatus;
  question?: {
    id: string;
    text: string;
    options: { id: string; text: string }[];
    closesAt?: string | null;
    correctOptionId?: string | null;
  };
  hasSubmitted?: boolean;
  myResult?: {
    selectedOptionId: string;
    isCorrect: boolean;
    awardedPoints: number;
  } | null;
  leaderboard?: LeaderboardRow[];
  myRank?: number | null;
};

export function WaitingRoom({
  joinCode,
  quizTitle,
  nickname,
}: {
  joinCode: string;
  quizTitle: string;
  nickname: string;
}) {
  const [state, setState] = useState<StateResponse | null>(null);

  // Heartbeat: separate from the state poll, 15s interval, purely for the
  // presenter's online/offline display. See git history for the
  // first-ping cookie-propagation-race retry this already handles.
  useEffect(() => {
    let cancelled = false;

    async function ping(isRetry = false) {
      try {
        const res = await fetch(`/room/${joinCode}/heartbeat`, {
          method: "POST",
        });
        if (res.status === 401 && !isRetry && !cancelled) {
          setTimeout(() => ping(true), 1000);
        }
      } catch {
        // Transient network error -- next heartbeat tick will retry.
      }
    }

    ping();
    const interval = setInterval(() => ping(), 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [joinCode]);

  // State poll: drives which screen (lobby / question / result) is shown.
  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/room/${joinCode}/state`);
        if (!res.ok) return;
        const json = (await res.json()) as StateResponse;
        if (!cancelled) setState(json);
      } catch {
        // Transient network error -- next poll tick will retry.
      }
    }

    poll();
    const interval = setInterval(poll, 2500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [joinCode]);

  let content;
  if (state?.status === "QUESTION_OPEN" && state.question) {
    content = (
      <QuestionView
        key={state.question.id}
        joinCode={joinCode}
        questionText={state.question.text}
        options={state.question.options}
        closesAt={state.question.closesAt ?? null}
        hasSubmitted={state.hasSubmitted ?? false}
        runQuestionId={state.question.id}
      />
    );
  } else if (
    (state?.status === "LEADERBOARD" || state?.status === "FINISHED") &&
    state.question
  ) {
    content = (
      <ResultView
        questionText={state.question.text}
        options={state.question.options}
        correctOptionId={state.question.correctOptionId ?? null}
        myResult={state.myResult ?? null}
        leaderboard={state.leaderboard ?? []}
        myRank={state.myRank ?? null}
        finished={state.status === "FINISHED"}
      />
    );
  } else {
    content = (
      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-zinc-50 px-4">
        <SafetyBackdrop />
        <div className="relative w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
          <p className="mb-1 text-sm text-zinc-500">{quizTitle}</p>
          <p className="mb-4 text-lg font-medium text-zinc-900">
            {nickname}님, 대기실에 입장했습니다
          </p>
          <p className="text-sm text-zinc-500">
            진행자가 퀴즈를 시작할 때까지 기다려주세요.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col pb-20">
      {content}
      <ReactionBar joinCode={joinCode} />
    </div>
  );
}
