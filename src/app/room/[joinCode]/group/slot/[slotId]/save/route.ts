import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { questionDraftSchema } from "@/lib/validation/quiz";
import { draftToSlotPayload } from "@/lib/groupMode/slotDraft";
import { getOptionsCountForRun } from "@/lib/groupMode/settings";

const PARTICIPANT_COOKIE = "qz_participant";

const saveSlotSchema = z.object({
  draft: questionDraftSchema,
  lockVersion: z.number().int(),
});

// Lives under /room/[joinCode]/group/slot/[slotId]/save -- same cookie
// path-scope requirement as every other participant-facing route.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ joinCode: string; slotId: string }> },
) {
  const { joinCode, slotId } = await params;
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(PARTICIPANT_COOKIE)?.value;
  if (!sessionId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = saveSlotSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다" },
      { status: 400 },
    );
  }
  const { draft, lockVersion } = parsed.data;

  const admin = createAdminClient();

  const { data: room } = await admin
    .from("rooms")
    .select("active_run_id")
    .eq("public_join_code", joinCode)
    .maybeSingle();
  if (!room || !room.active_run_id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Defensive server-side enforcement -- the client hides the add/
  // remove-option controls (QuestionCard's lockOptionCount), but a
  // direct API call must not be able to bypass the presenter-fixed
  // option count.
  const optionsCount = await getOptionsCountForRun(admin, room.active_run_id);
  if (optionsCount !== null && draft.options.length !== optionsCount) {
    return NextResponse.json(
      { error: `보기는 정확히 ${optionsCount}개여야 합니다` },
      { status: 400 },
    );
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

  const { data: slot } = await admin
    .from("group_question_slots")
    .select("id, group_id")
    .eq("id", slotId)
    .eq("group_id", participant.group_id)
    .maybeSingle();
  if (!slot) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { data: group } = await admin
    .from("groups")
    .select("status")
    .eq("id", participant.group_id)
    .maybeSingle();
  if (!group || group.status !== "DRAFTING") {
    return NextResponse.json(
      { error: "지금은 문제를 편집할 수 없습니다" },
      { status: 409 },
    );
  }

  // Save is only valid while the caller still holds a live lock at the
  // version they were handed at acquire/heartbeat time -- a save arriving
  // after the lock already expired (or was stolen/force-released) is
  // rejected, not silently accepted.
  const { data: lock } = await admin
    .from("group_question_locks")
    .select("holder_participant_id, lock_version, expires_at")
    .eq("slot_id", slotId)
    .maybeSingle();
  const lockValid =
    lock &&
    lock.holder_participant_id === participant.id &&
    lock.lock_version === lockVersion &&
    new Date(lock.expires_at).getTime() > Date.now();
  if (!lockValid) {
    return NextResponse.json(
      { error: "LOCK_EXPIRED", message: "잠금이 만료되어 저장할 수 없습니다. 내용을 복사해두고 다시 시도해주세요" },
      { status: 409 },
    );
  }

  const payload = draftToSlotPayload(draft);
  const { error: updateError } = await admin
    .from("group_question_slots")
    .update({
      ...payload,
      last_edited_by_participant_id: participant.id,
      last_edited_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", slotId);
  if (updateError) {
    return NextResponse.json({ error: "저장에 실패했습니다" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
