import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSlotComplete } from "@/lib/groupMode/slotDraft";

const PARTICIPANT_COOKIE = "qz_participant";

// Lives under /room/[joinCode]/group/submit -- same cookie path-scope
// requirement as every other participant-facing route. Any group member
// may call this; the status_version check below makes a concurrent
// double-click process only once.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ joinCode: string }> },
) {
  const { joinCode } = await params;
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(PARTICIPANT_COOKIE)?.value;
  if (!sessionId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: room } = await admin
    .from("rooms")
    .select("active_run_id")
    .eq("public_join_code", joinCode)
    .maybeSingle();
  if (!room || !room.active_run_id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { data: participant } = await admin
    .from("participants")
    .select("id, group_id")
    .eq("participant_session_id", sessionId)
    .eq("run_id", room.active_run_id)
    .maybeSingle();
  if (!participant || !participant.group_id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { data: group } = await admin
    .from("groups")
    .select("id, status, status_version")
    .eq("id", participant.group_id)
    .maybeSingle();
  if (!group) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (group.status !== "DRAFTING") {
    // Idempotent-safe: a concurrent double-click (or a stale retry) sees
    // the status has already moved on and gets a friendly message
    // instead of an error.
    return NextResponse.json({ ok: true, alreadySubmitted: true });
  }

  const { data: slots } = await admin
    .from("group_question_slots")
    .select("id, question_text, options, correct_option_temp_id")
    .eq("group_id", group.id);
  if (!slots || slots.length === 0) {
    return NextResponse.json({ error: "문제 슬롯을 찾을 수 없습니다" }, { status: 404 });
  }

  const incompleteCount = slots.filter((s) => !isSlotComplete(s)).length;
  if (incompleteCount > 0) {
    return NextResponse.json(
      { error: `아직 작성되지 않은 문제가 ${incompleteCount}개 있습니다` },
      { status: 409 },
    );
  }

  const slotIds = slots.map((s) => s.id);
  const { data: liveLocks } = await admin
    .from("group_question_locks")
    .select("slot_id, expires_at")
    .in("slot_id", slotIds)
    .gt("expires_at", new Date().toISOString());
  if ((liveLocks ?? []).length > 0) {
    return NextResponse.json(
      { error: "다른 조원이 편집 중인 문제가 있어 제출할 수 없습니다" },
      { status: 409 },
    );
  }

  // Version-checked transition, serializing concurrent submit attempts
  // from different group members to exactly one winner.
  const { data: updated, error: updateError } = await admin
    .from("groups")
    .update({ status: "SUBMITTED", status_version: group.status_version + 1 })
    .eq("id", group.id)
    .eq("status_version", group.status_version)
    .select("id")
    .maybeSingle();
  if (updateError || !updated) {
    return NextResponse.json({ ok: true, alreadySubmitted: true });
  }

  await admin.from("group_status_history").insert({
    group_id: group.id,
    actor: "MEMBER",
    actor_participant_id: participant.id,
    from_status: "DRAFTING",
    to_status: "SUBMITTED",
  });

  // Release every remaining lock on this group's slots -- members become
  // read-only once submitted.
  await admin.from("group_question_locks").delete().in("slot_id", slotIds);

  return NextResponse.json({ ok: true, alreadySubmitted: false });
}
