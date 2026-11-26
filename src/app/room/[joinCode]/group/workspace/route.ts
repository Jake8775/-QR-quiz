import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

const PARTICIPANT_COOKIE = "qz_participant";

// Lives under /room/[joinCode]/group/workspace -- same cookie path-scope
// requirement as every other participant-facing route. Polled by the
// group workspace screen to drive slot content, completion, per-slot
// lock-holder presence, and group status/rejection comments.
export async function GET(
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

  const { data: run } = await admin
    .from("quiz_runs")
    .select("id, status")
    .eq("id", room.active_run_id)
    .maybeSingle();
  if (!run) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { data: participant } = await admin
    .from("participants")
    .select("id, group_id")
    .eq("participant_session_id", sessionId)
    .eq("run_id", run.id)
    .maybeSingle();
  if (!participant || !participant.group_id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { data: group } = await admin
    .from("groups")
    .select("id, name, status")
    .eq("id", participant.group_id)
    .maybeSingle();
  if (!group) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { data: slots } = await admin
    .from("group_question_slots")
    .select(
      "id, slot_index, question_text, options, correct_option_temp_id, presenter_comment, presenter_edited, last_edited_by_participant_id, last_edited_at",
    )
    .eq("group_id", group.id)
    .order("slot_index", { ascending: true });

  const { data: locks } = await admin
    .from("group_question_locks")
    .select("slot_id, holder_participant_id, expires_at, lock_version")
    .in(
      "slot_id",
      (slots ?? []).map((s) => s.id).length > 0 ? (slots ?? []).map((s) => s.id) : [""],
    );

  const liveLocks = (locks ?? []).filter(
    (l) => new Date(l.expires_at).getTime() > Date.now(),
  );
  const holderIds = liveLocks.map((l) => l.holder_participant_id);
  const { data: holders } = await admin
    .from("participants")
    .select("id, nickname")
    .in("id", holderIds.length > 0 ? holderIds : [""]);
  const nicknameById = new Map((holders ?? []).map((p) => [p.id, p.nickname]));
  const lockBySlotId = new Map(liveLocks.map((l) => [l.slot_id, l]));

  const { data: editorNames } = await admin
    .from("participants")
    .select("id, nickname")
    .eq("run_id", run.id);
  const editorNicknameById = new Map((editorNames ?? []).map((p) => [p.id, p.nickname]));

  // Most recent group-level rejection comment (if the group is currently
  // DRAFTING because of a rejection) -- surfaced as a dismissable
  // notification on the workspace screen.
  const { data: latestHistory } = await admin
    .from("group_status_history")
    .select("comment, to_status, created_at")
    .eq("group_id", group.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Mode-agnostic: GROUP rooms have a group_mode_settings row, SOLO rooms
  // have a solo_mode_settings row -- exactly one of the two exists for any
  // given run, so querying both and taking whichever resolves is safe
  // without knowing quizzes.mode here.
  const [{ data: groupSettings }, { data: soloSettings }] = await Promise.all([
    admin
      .from("group_mode_settings")
      .select("topic, options_count")
      .eq("run_id", run.id)
      .maybeSingle(),
    admin
      .from("solo_mode_settings")
      .select("topic, options_count")
      .eq("run_id", run.id)
      .maybeSingle(),
  ]);
  const topic = groupSettings?.topic ?? soloSettings?.topic ?? null;
  const optionsCount = groupSettings?.options_count ?? soloSettings?.options_count ?? 4;

  return NextResponse.json({
    runStatus: run.status,
    topic,
    optionsCount,
    group: { id: group.id, name: group.name, status: group.status },
    rejectionComment:
      group.status === "DRAFTING" && latestHistory?.to_status === "DRAFTING"
        ? latestHistory.comment
        : null,
    slots: (slots ?? []).map((s) => {
      const lock = lockBySlotId.get(s.id);
      return {
        id: s.id,
        slotIndex: s.slot_index,
        questionText: s.question_text,
        options: s.options,
        correctOptionTempId: s.correct_option_temp_id,
        presenterComment: s.presenter_comment,
        presenterEdited: s.presenter_edited,
        lastEditedByNickname: s.last_edited_by_participant_id
          ? editorNicknameById.get(s.last_edited_by_participant_id) ?? null
          : null,
        lockedBy: lock ? nicknameById.get(lock.holder_participant_id) ?? null : null,
        lockedByMe: lock ? lock.holder_participant_id === participant.id : false,
        lockVersion: lock?.lock_version ?? null,
        lockExpiresAt: lock?.expires_at ?? null,
      };
    }),
  });
}
