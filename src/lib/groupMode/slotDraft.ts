import type { QuestionDraft } from "@/lib/validation/quiz";

export type MemberSnapshotEntry = { participantId: string; nickname: string };

// groups.member_snapshot comes back untyped from the Supabase client
// (this codebase's clients aren't instantiated with the Database
// generic), so `?? []` alone can infer `never[]` under strict mode --
// this helper gives every call site one explicit, correct shape.
export function memberNicknames(
  snapshot: MemberSnapshotEntry[] | null | undefined,
): string[] {
  return (snapshot ?? []).map((m) => m.nickname);
}

// A group_question_slots row has no time limit (that's set once, run-wide,
// in group_mode_settings) and no slot-reordering concept, but its content
// shape (question text + options + correct answer) is otherwise identical
// to a QuestionDraft -- so slots round-trip through the exact same
// QuestionCard/OptionRow/questionDraftSchema the normal-mode editor uses,
// padding in a placeholder time limit that is never read or persisted.
const PLACEHOLDER_TIME_LIMIT = 30;

export type SlotRow = {
  id: string;
  slot_index: number;
  question_text: string;
  options: { tempId: string; optionText: string }[];
  correct_option_temp_id: string | null;
};

// Client-side shape (matches GET /room/[joinCode]/group/workspace's JSON).
export type ClientSlot = {
  id: string;
  questionText: string;
  options: { tempId: string; optionText: string }[];
  correctOptionTempId: string | null;
};

export function slotToDraft(slot: ClientSlot): QuestionDraft {
  return {
    tempId: slot.id,
    questionText: slot.questionText,
    timeLimitSeconds: PLACEHOLDER_TIME_LIMIT,
    options:
      slot.options.length > 0
        ? slot.options
        : [
            { tempId: crypto.randomUUID(), optionText: "" },
            { tempId: crypto.randomUUID(), optionText: "" },
          ],
    correctOptionTempId: slot.correctOptionTempId ?? "",
  };
}

export function draftToSlotPayload(draft: QuestionDraft) {
  return {
    question_text: draft.questionText,
    options: draft.options,
    correct_option_temp_id: draft.correctOptionTempId || null,
  };
}

// Mirrors questionDraftSchema's invariants (>=2 options, no empty option
// text, a correct option actually among them) without round-tripping
// through zod -- used for cheap completion checks (submit gating,
// presenter dashboard counts) against raw DB rows.
export function isSlotComplete(slot: {
  question_text: string;
  options: unknown;
  correct_option_temp_id: string | null;
}): boolean {
  if (!slot.question_text.trim()) return false;
  if (!slot.correct_option_temp_id) return false;
  const options = Array.isArray(slot.options) ? slot.options : [];
  if (options.length < 2) return false;
  const hasEmptyOption = options.some(
    (o) => !o || typeof o !== "object" || !("optionText" in o) || !String(o.optionText).trim(),
  );
  if (hasEmptyOption) return false;
  const optionTexts = options.map((o) =>
    o && typeof o === "object" && "optionText" in o ? String(o.optionText).trim() : "",
  );
  if (new Set(optionTexts).size !== optionTexts.length) return false;
  const correctExists = options.some(
    (o) => o && typeof o === "object" && "tempId" in o && o.tempId === slot.correct_option_temp_id,
  );
  return correctExists;
}
