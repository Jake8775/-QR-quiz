"use client";

import { useEffect, useRef, useState } from "react";
import { JoinQr } from "./JoinQr";
import { QuestionDashboard } from "./QuestionDashboard";
import { LeaderboardDashboard } from "./LeaderboardDashboard";
import { RankingList } from "./RankingList";
import { ReactionOverlay } from "./ReactionOverlay";
import { GroupModeLobbyDashboard } from "./GroupModeLobbyDashboard";
import { GroupRankingList } from "./GroupRankingList";
import { SafetyBackdrop } from "@/components/SafetyBackdrop";

type Participant = { id: string; nickname: string; online: boolean };
type RunStatus =
  | "LOBBY"
  | "QUESTION_OPEN"
  | "REVEALED"
  | "LEADERBOARD"
  | "FINISHED";

type LeaderboardRow = {
  participantId: string;
  nickname: string;
  totalPoints: number;
  correctCount: number;
  answeredQuestions: number;
};

type RunStatusResponse = {
  status: RunStatus;
  mode?: "NORMAL" | "GROUP";
  currentQuestionIndex: number;
  totalQuestions: number;
  participants: Participant[];
  count: number;
  question?: {
    id: string;
    text: string;
    options: { id: string; text: string; count?: number }[];
    closesAt?: string | null;
    timeLimitSeconds?: number | null;
    correctOptionId?: string | null;
  };
  submittedCount?: number;
  correctCount?: number;
  leaderboard?: LeaderboardRow[];
  // Group mode only -- undefined for every normal-mode response.
  authoringGroup?: { name: string; members: string[] };
  nextAuthoringGroup?: { name: string; members: string[] };
  groupScores?: GroupScoreRow[];
};

type GroupScoreRow = {
  groupId: string;
  name: string;
  averageScore: number;
  members: { nickname: string; totalPoints: number }[];
};

type GroupData = {
  id: string;
  name: string;
  pin: string;
  status: "DRAFTING" | "SUBMITTED" | "CONFIRMED";
  statusVersion: number;
  rejectionComment: string | null;
  members: { id: string; nickname: string; online: boolean }[];
  slots: {
    id: string;
    slotIndex: number;
    questionText: string;
    complete: boolean;
    lockedBy: string | null;
    presenterComment: string | null;
  }[];
  completeCount: number;
  totalSlots: number;
  lastActivityAt: string | null;
};

type GroupsResponse = {
  groups: GroupData[];
  allConfirmed: boolean;
};

export function LobbyClient({
  roomId,
  joinUrl,
  quizTitle,
}: {
  roomId: string;
  joinUrl: string;
  quizTitle: string;
}) {
  const [data, setData] = useState<RunStatusResponse | null>(null);
  const [groupsData, setGroupsData] = useState<GroupsResponse | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef<() => Promise<void>>(async () => {});
  const pollGroupsRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/admin/rooms/${roomId}/run-status`);
        if (!res.ok) return;
        const json = (await res.json()) as RunStatusResponse;
        if (!cancelled) setData(json);
      } catch {
        // Transient network error — next poll tick will retry.
      }
    }
    pollRef.current = poll;

    poll();
    const interval = setInterval(poll, 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [roomId]);

  // Separate poll for group-mode's own dashboard data -- only runs while
  // the run is still LOBBY (group review happens before the game
  // starts), and only once run-status has told us this room is GROUP
  // mode. For normal mode data?.mode is always "NORMAL", so this never
  // fires at all on that path.
  useEffect(() => {
    if (data?.mode !== "GROUP" || data.status !== "LOBBY") return;
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/admin/rooms/${roomId}/groups`);
        if (!res.ok) return;
        const json = (await res.json()) as GroupsResponse;
        if (!cancelled) setGroupsData(json);
      } catch {
        // Transient network error — next poll tick will retry.
      }
    }
    pollGroupsRef.current = poll;

    poll();
    const interval = setInterval(poll, 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [roomId, data?.mode, data?.status]);

  async function callAction(path: string) {
    setSubmitting(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/rooms/${roomId}/${path}`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) {
        setActionError(json.error ?? "요청에 실패했습니다");
        return;
      }
      // Reflect the new state immediately instead of waiting up to 3s for
      // the next poll tick -- otherwise a click can look like it did
      // nothing until the following poll (or click) catches up.
      await pollRef.current();
    } catch {
      setActionError("네트워크 오류가 발생했습니다");
    } finally {
      setSubmitting(false);
    }
  }

  let content;

  if (!data) {
    content = (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-zinc-400">불러오는 중...</p>
      </div>
    );
  } else if (data.status === "LOBBY" && data.mode === "GROUP") {
    content = (
      <div className="flex min-h-screen flex-col px-6 py-8">
        {actionError && (
          <p className="mb-4 text-center text-sm text-red-600">{actionError}</p>
        )}

        <div className="mx-auto mb-6 flex flex-col items-center gap-2">
          <p className="text-lg text-zinc-500">{quizTitle}</p>
          <JoinQr joinUrl={joinUrl} />
        </div>

        {!groupsData ? (
          <p className="text-center text-sm text-zinc-400">불러오는 중...</p>
        ) : (
          <GroupModeLobbyDashboard
            roomId={roomId}
            groups={groupsData.groups}
            allConfirmed={groupsData.allConfirmed}
            onChanged={() => pollGroupsRef.current()}
            onStart={() => callAction("start")}
            startDisabled={!groupsData.allConfirmed}
            startSubmitting={submitting}
          />
        )}
      </div>
    );
  } else if (data.status === "LOBBY") {
    content = (
      <div className="flex min-h-screen flex-col px-6 py-8">
        {actionError && (
          <p className="mb-4 text-center text-sm text-red-600">{actionError}</p>
        )}

        <div className="grid flex-1 grid-cols-1 gap-8 lg:grid-cols-2">
          <div className="flex flex-col items-center justify-center gap-4">
            <p className="text-lg text-zinc-500">{quizTitle}</p>
            <JoinQr joinUrl={joinUrl} />
          </div>

          <div className="flex flex-col items-center justify-center gap-4">
            <h2 className="text-2xl font-semibold text-zinc-900 sm:text-3xl">
              참가자 {data.count}명
            </h2>
            <div className="max-h-[60vh] w-full max-w-xl overflow-y-auto">
              {data.participants.length === 0 ? (
                <p className="text-center text-lg text-zinc-400">
                  아직 입장한 참가자가 없습니다.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {data.participants.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-lg"
                    >
                      <span
                        className={`h-3 w-3 shrink-0 rounded-full ${
                          p.online ? "bg-green-500" : "bg-zinc-300"
                        }`}
                      />
                      <span className="truncate">{p.nickname}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center gap-2 pt-6">
          <button
            type="button"
            disabled={data.count === 0 || submitting}
            onClick={() => callAction("start")}
            className="rounded-md bg-zinc-900 px-10 py-4 text-xl font-medium text-white disabled:opacity-50"
          >
            퀴즈 시작
          </button>
          {data.count === 0 && (
            <p className="text-sm text-zinc-400">
              참가자가 입장해야 시작할 수 있습니다.
            </p>
          )}
        </div>
      </div>
    );
  } else if (
    (data.status === "QUESTION_OPEN" || data.status === "REVEALED") &&
    data.question
  ) {
    content = (
      <div className="flex min-h-screen flex-col items-center justify-center">
        {actionError && (
          <p className="mb-4 w-full text-center text-sm text-red-600">
            {actionError}
          </p>
        )}
        <QuestionDashboard
          key={data.question.id}
          questionText={data.question.text}
          options={data.question.options}
          closesAt={data.question.closesAt ?? null}
          timeLimitSeconds={data.question.timeLimitSeconds ?? null}
          submittedCount={data.submittedCount ?? 0}
          totalParticipants={data.count}
          correctCount={data.correctCount}
          currentQuestionIndex={data.currentQuestionIndex}
          totalQuestions={data.totalQuestions}
          revealed={data.status === "REVEALED"}
          correctOptionId={data.question.correctOptionId ?? null}
          onReveal={() => callAction("reveal")}
          onShowRanking={() => callAction("show-ranking")}
          submitting={submitting}
          authoringGroup={data.authoringGroup}
        />
      </div>
    );
  } else if (data.status === "LEADERBOARD") {
    content = (
      <div className="flex min-h-screen flex-col items-center justify-center">
        {actionError && (
          <p className="mb-4 text-sm text-red-600">{actionError}</p>
        )}
        <LeaderboardDashboard
          correctCount={data.correctCount ?? 0}
          totalParticipants={data.count}
          leaderboard={data.leaderboard ?? []}
          isLastQuestion={
            data.currentQuestionIndex >= data.totalQuestions - 1
          }
          onNext={() => callAction("next")}
          submitting={submitting}
          nextAuthoringGroup={data.nextAuthoringGroup}
          groupScores={data.groupScores}
        />
      </div>
    );
  } else {
    content = (
      <div className="flex min-h-screen flex-col items-center justify-center px-4">
        <h2 className="mb-6 text-3xl font-semibold text-zinc-900 sm:text-4xl">
          퀴즈가 종료되었습니다
        </h2>
        <div
          className={`w-full ${
            data.groupScores ? "grid max-w-5xl grid-cols-1 gap-8 lg:grid-cols-2" : "max-w-2xl"
          }`}
        >
          <div className="flex flex-col gap-2">
            {data.groupScores && (
              <h3 className="text-center text-lg font-medium text-zinc-700">개인 순위</h3>
            )}
            <RankingList leaderboard={data.leaderboard ?? []} />
          </div>
          {data.groupScores && (
            <div className="flex flex-col gap-2">
              <h3 className="text-center text-lg font-medium text-zinc-700">조 순위</h3>
              <GroupRankingList groups={data.groupScores} />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <SafetyBackdrop />
      <div className="relative">{content}</div>
      <ReactionOverlay roomId={roomId} />
    </div>
  );
}
