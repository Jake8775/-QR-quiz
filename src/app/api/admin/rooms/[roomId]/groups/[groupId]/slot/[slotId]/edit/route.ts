import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { questionDraftSchema } from "@/lib/validation/quiz";
import { draftToSlotPayload } from "@/lib/groupMode/slotDraft";
import { getOptionsCountForRun } from "@/lib/groupMode/settings";

// Presenter direct-edit, SUBMITTED-only (spec: "진행자는 SUBMITTED 상태에서만
// 문제 내용을 수정할 수 있다... DRAFTING 상태에서는 보기만 한다" -- avoids
// colliding with members actively editing). Records a before/after
// history row and flags the slot "진행자 수정".
export async function POST(
  request: Request,
  { params }: { params: Promise<{ roomId: string; groupId: string; slotId: string }> },
) {
  const { roomId, groupId, slotId } = await params;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = questionDraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다" },
      { status: 400 },
    );
  }

  const { data: room } = await supabase
    .from("rooms")
    .select("id, active_run_id")
    .eq("id", roomId)
    .maybeSingle();
  if (!room || !room.active_run_id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { data: run } = await supabase
    .from("quiz_runs")
    .select("id, status")
    .eq("id", room.active_run_id)
    .maybeSingle();
  if (!run) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (run.status !== "LOBBY") {
    return NextResponse.json(
      { error: "게임이 시작된 뒤에는 문제를 수정할 수 없습니다" },
      { status: 409 },
    );
  }

  const { data: group } = await supabase
    .from("groups")
    .select("id, status")
    .eq("id", groupId)
    .eq("run_id", run.id)
    .maybeSingle();
  if (!group) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (group.status !== "SUBMITTED") {
    return NextResponse.json(
      { error: "제출된 조의 문제만 직접 수정할 수 있습니다" },
      { status: 409 },
    );
  }

  // group_question_slots has zero RLS policies for any role (same
  // posture as question_answer_keys), so both the read and write go
  // through the admin client -- ownership of groupId was already
  // proven by the RLS-gated reads above.
  const admin = createAdminClient();
  const { data: slot } = await admin
    .from("group_question_slots")
    .select("id, question_text, options, correct_option_temp_id")
    .eq("id", slotId)
    .eq("group_id", groupId)
    .maybeSingle();
  if (!slot) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Same defensive enforcement as the member-facing save route -- the
  // presenter's own edit modal also hides the add/remove-option
  // controls, but a direct API call must not bypass the fixed count.
  const optionsCount = await getOptionsCountForRun(admin, run.id);
  if (optionsCount !== null && parsed.data.options.length !== optionsCount) {
    return NextResponse.json(
      { error: `보기는 정확히 ${optionsCount}개여야 합니다` },
      { status: 400 },
    );
  }

  const beforeSnapshot = {
    questionText: slot.question_text,
    options: Array.isArray(slot.options) ? slot.options : [],
    correctOptionTempId: slot.correct_option_temp_id ?? "",
  };
  const draft = parsed.data;
  const payload = draftToSlotPayload(draft);

  const { error: updateError } = await admin
    .from("group_question_slots")
    .update({
      ...payload,
      presenter_edited: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", slotId);
  if (updateError) {
    return NextResponse.json({ error: "저장에 실패했습니다" }, { status: 500 });
  }

  await admin.from("group_slot_edit_events").insert({
    slot_id: slotId,
    edited_by: "PRESENTER",
    before_snapshot: beforeSnapshot,
    after_snapshot: {
      questionText: draft.questionText,
      options: draft.options,
      correctOptionTempId: draft.correctOptionTempId,
    },
  });

  return NextResponse.json({ ok: true });
}
