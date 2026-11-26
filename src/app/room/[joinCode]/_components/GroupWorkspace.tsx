"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SafetyBackdrop } from "@/components/SafetyBackdrop";
import { isSlotComplete } from "@/lib/groupMode/slotDraft";
import { SlotEditorWrapper, type SlotData } from "./SlotEditorWrapper";

type WorkspaceResponse = {
  runStatus: string;
  topic: string | null;
  group: { id: string; name: string; status: "DRAFTING" | "SUBMITTED" | "CONFIRMED" };
  rejectionComment: string | null;
  slots: SlotData[];
};

const STATUS_LABEL: Record<WorkspaceResponse["group"]["status"], string> = {
  DRAFTING: "작성 중",
  SUBMITTED: "제출됨 (검토 중)",
  CONFIRMED: "제출 마감 (확정)",
};

export function GroupWorkspace({ joinCode }: { joinCode: string }) {
  const router = useRouter();
  const [data, setData] = useState<WorkspaceResponse | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const leavingRef = useRef(false);

  async function poll() {
    if (leavingRef.current) return;
    try {
      const res = await fetch(`/room/${joinCode}/group/workspace`);
      if (!res.ok) return;
      const json = await res.json();
      // Once the presenter starts the game, the run leaves LOBBY -- this
      // screen (the group-authoring workspace) has nothing left to show,
      // so hand off to page.tsx's server-side routing (which renders
      // WaitingRoom once the run is no longer LOBBY) by refreshing
      // rather than tracking run progression here itself.
      if (json.runStatus && json.runStatus !== "LOBBY") {
        leavingRef.current = true;
        router.refresh();
        return;
      }
      setData(json);
    } catch {
      // Transient network error -- next poll tick will retry.
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      if (cancelled) return;
      await poll();
    }
    tick();
    const interval = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinCode]);

  async function handleSubmit() {
    if (submitting) return;
    if (!confirm("모든 조원이 작성을 마쳤다면 제출할까요? 제출 후에는 수정할 수 없습니다.")) {
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/room/${joinCode}/group/submit`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setSubmitError(json.error ?? "제출에 실패했습니다");
        return;
      }
      await poll();
    } catch {
      setSubmitError("네트워크 오류가 발생했습니다");
    } finally {
      setSubmitting(false);
    }
  }

  if (!data) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4">
        <p className="text-sm text-zinc-400">불러오는 중...</p>
      </div>
    );
  }

  const readOnly = data.group.status !== "DRAFTING";
  const incompleteSlots = data.slots.filter((s) => !isSlotComplete({
    question_text: s.questionText,
    options: s.options,
    correct_option_temp_id: s.correctOptionTempId,
  }));
  const lockedSlot = data.slots.find((s) => s.lockedBy && !s.lockedByMe);

  let disabledReason: string | null = null;
  if (readOnly) {
    disabledReason = null;
  } else if (incompleteSlots.length > 0) {
    disabledReason = `${incompleteSlots[0].slotIndex + 1}번 미완성`;
  } else if (lockedSlot) {
    disabledReason = `${lockedSlot.lockedBy}님 편집 중`;
  }

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden bg-zinc-50 px-4 py-8">
      <SafetyBackdrop />
      <div className="relative mx-auto flex w-full max-w-xl flex-col gap-4">
        {data.topic && (
          <p className="text-xl font-bold text-zinc-900 sm:text-2xl">{data.topic}</p>
        )}
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-zinc-900">
            {data.group.name} 문제 작성
          </h1>
          <span className="rounded-full bg-zinc-200 px-3 py-1 text-xs font-medium text-zinc-700">
            {STATUS_LABEL[data.group.status]}
          </span>
        </div>

        {data.rejectionComment && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            반려 사유: {data.rejectionComment}
          </p>
        )}

        <p className="text-sm text-zinc-500">
          완성 문제 {data.slots.length - incompleteSlots.length} / {data.slots.length}
        </p>

        <div className="flex flex-col gap-4">
          {data.slots.map((slot) => (
            <SlotEditorWrapper
              key={slot.id}
              joinCode={joinCode}
              slot={slot}
              readOnly={readOnly}
              onSaved={poll}
            />
          ))}
        </div>

        {!readOnly && (
          <div className="mt-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !!disabledReason}
              className="rounded-md bg-zinc-900 px-6 py-3 text-base font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
            >
              {submitting ? "제출 중..." : "제출하기"}
            </button>
            {disabledReason && (
              <p className="mt-1 text-sm text-zinc-500">{disabledReason}</p>
            )}
            {submitError && (
              <p className="mt-1 text-sm text-red-600">{submitError}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
