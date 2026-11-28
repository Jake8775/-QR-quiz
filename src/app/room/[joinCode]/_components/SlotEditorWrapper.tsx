"use client";

import { useEffect, useRef, useState } from "react";
import { QuestionCard } from "@/app/admin/(protected)/quizzes/_components/QuestionCard";
import { questionDraftSchema, type QuestionDraft } from "@/lib/validation/quiz";
import { slotToDraft } from "@/lib/groupMode/slotDraft";

const HEARTBEAT_INTERVAL_MS = 15_000;

// Mirrors the shape returned by GET /room/[joinCode]/group/workspace --
// the single source of truth for this shape lives there, this is just
// the client-side type for it.
export type SlotData = {
  id: string;
  slotIndex: number;
  questionText: string;
  options: { tempId: string; optionText: string }[];
  correctOptionTempId: string | null;
  presenterComment: string | null;
  lastEditedByNickname: string | null;
  lockedBy: string | null;
  lockedByMe: boolean;
  lockVersion: number | null;
};

export function SlotEditorWrapper({
  joinCode,
  slot,
  readOnly,
  optionsCount,
  onSaved,
}: {
  joinCode: string;
  slot: SlotData;
  readOnly: boolean;
  // Presenter-fixed option count for this run -- an empty slot pads to
  // exactly this many options, and QuestionCard's lockOptionCount hides
  // the add/remove-option controls so authors can't change it.
  optionsCount: number;
  onSaved: () => void;
}) {
  // While not actively editing, the draft is purely derived from the
  // latest server data -- no local state, so a workspace poll tick never
  // needs reconciling against anything. Once editing starts, local state
  // takes over (see startEditing) so further poll ticks don't overwrite
  // whatever the user is typing.
  const [editingDraft, setEditingDraft] = useState<QuestionDraft | null>(null);
  const draft = editingDraft ?? slotToDraft(slot, optionsCount);
  const editing = editingDraft !== null;
  const [lockVersion, setLockVersion] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Guards against firing multiple lock-acquire requests from rapid
  // keystrokes before the first one's response (and the editingDraft
  // state update it triggers) comes back.
  const acquiringRef = useRef(false);

  useEffect(() => {
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, []);

  async function startEditing() {
    if (readOnly || editing || acquiringRef.current) return;
    acquiringRef.current = true;
    setError(null);
    try {
      const res = await fetch(`/room/${joinCode}/group/slot/${slot.id}/lock`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "편집을 시작할 수 없습니다");
        return;
      }
      setLockVersion(json.lockVersion);
      // onChange may have already set editingDraft (optimistic keystroke)
      // before this request resolved -- only fall back to the server
      // snapshot if nothing local exists yet.
      setEditingDraft((current) => current ?? slotToDraft(slot, optionsCount));
      heartbeatRef.current = setInterval(async () => {
        const hbRes = await fetch(
          `/room/${joinCode}/group/slot/${slot.id}/heartbeat`,
          { method: "POST" },
        );
        if (hbRes.ok) {
          const hbJson = await hbRes.json();
          setLockVersion(hbJson.lockVersion);
        }
        // A failed heartbeat means the lock expired/was stolen -- the
        // user's typed text stays exactly as-is (draft state is untouched
        // here), only a save attempt will surface the LOCK_EXPIRED error.
      }, HEARTBEAT_INTERVAL_MS);
    } catch {
      setError("네트워크 오류가 발생했습니다");
    } finally {
      acquiringRef.current = false;
    }
  }

  async function stopEditing(release: boolean) {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    setEditingDraft(null);
    setLockVersion(null);
    if (release) {
      try {
        await fetch(`/room/${joinCode}/group/slot/${slot.id}/lock`, {
          method: "DELETE",
        });
      } catch {
        // Best-effort -- the lock's TTL is the real safety net.
      }
    }
  }

  async function handleSave() {
    const check = questionDraftSchema.safeParse(draft);
    if (!check.success) {
      setError(check.error.issues[0]?.message ?? "입력값을 확인해주세요");
      return;
    }
    if (lockVersion === null) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/room/${joinCode}/group/slot/${slot.id}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: check.data, lockVersion }),
      });
      const json = await res.json();
      if (!res.ok) {
        // LOCK_EXPIRED or any other failure: the draft stays in local
        // state exactly as typed so the user can copy it out, per spec.
        setError(json.message ?? json.error ?? "저장에 실패했습니다");
        return;
      }
      // Release the lock now that the save succeeded -- per spec,
      // "저장, 취소, 화면 이탈, 연결 끊김 시 잠금을 해제한다" (save, cancel,
      // navigate-away, and disconnect all release the lock).
      await stopEditing(true);
      onSaved();
    } catch {
      setError("네트워크 오류가 발생했습니다");
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel() {
    setError(null);
    await stopEditing(true);
  }

  const lockedByOther = !!slot.lockedBy && !slot.lockedByMe;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>
          {slot.lastEditedByNickname
            ? `마지막 수정: ${slot.lastEditedByNickname}`
            : "아직 작성되지 않음"}
        </span>
        {lockedByOther && (
          <span className="font-medium text-amber-600">
            {slot.lockedBy}님 편집 중
          </span>
        )}
      </div>

      {slot.presenterComment && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          진행자 코멘트: {slot.presenterComment}
        </p>
      )}

      <div className={lockedByOther ? "pointer-events-none opacity-50" : ""}>
        <QuestionCard
          question={draft}
          index={slot.slotIndex}
          total={1}
          hideTimeLimit
          hidePoints
          hideReorderControls
          lockOptionCount
          disabled={readOnly}
          onChange={(next) => {
            if (readOnly) return;
            // Optimistically reflect the keystroke locally right away;
            // the lock-acquire request runs in the background and fills
            // in lockVersion once it resolves (or surfaces an error if
            // someone else already holds the lock).
            setEditingDraft(next);
            if (!editing) void startEditing();
          }}
          onDelete={() => {}}
          onMoveUp={() => {}}
          onMoveDown={() => {}}
        />
      </div>

      {editing && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
          >
            {saving ? "저장 중..." : "저장"}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={saving}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50"
          >
            취소
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
