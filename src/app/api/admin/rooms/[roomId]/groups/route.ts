import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSlotComplete } from "@/lib/groupMode/slotDraft";

const ONLINE_THRESHOLD_MS = 30_000;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // RLS (owner_all on rooms, owner_select on quiz_runs/groups via the
  // rooms join) already scopes every query below to this user's own
  // rooms, so a non-owner's request simply yields no rows.
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

  // groups has an owner_select RLS policy so the RLS-scoped client above
  // is already allowed to read group_question_slots-adjacent summary
  // data, but group_question_slots itself has zero RLS policies (same
  // posture as question_answer_keys) -- the presenter's slot-content
  // visibility (completion counts, per-slot lock holders) goes through
  // the admin client, which is safe here because ownership of every
  // groupId is proven by the RLS-gated `groups` read below.
  const admin = createAdminClient();

  // settings and groups both only depend on run.id -- independent reads,
  // fired together instead of one-after-another. This dashboard is
  // shared by GROUP and SOLO (see LobbyClient.tsx's data.mode check), so
  // both settings tables are queried -- exactly one resolves per run.
  const [{ data: groupSettings }, { data: soloSettings }, { data: groups }] = await Promise.all([
    supabase
      .from("group_mode_settings")
      .select("topic, questions_per_group, time_limit_seconds, group_count, options_count")
      .eq("run_id", run.id)
      .maybeSingle(),
    supabase
      .from("solo_mode_settings")
      .select("topic, questions_per_person, time_limit_seconds, options_count")
      .eq("run_id", run.id)
      .maybeSingle(),
    supabase
      .from("groups")
      .select("id, name, pin, status, status_version, created_at")
      .eq("run_id", run.id)
      .order("created_at", { ascending: true }),
  ]);
  const settings = groupSettings
    ? {
        topic: groupSettings.topic,
        questionsPerGroup: groupSettings.questions_per_group,
        timeLimitSeconds: groupSettings.time_limit_seconds,
        groupCount: groupSettings.group_count,
        optionsCount: groupSettings.options_count,
      }
    : soloSettings
      ? {
          topic: soloSettings.topic,
          questionsPerGroup: soloSettings.questions_per_person,
          timeLimitSeconds: soloSettings.time_limit_seconds,
          groupCount: null,
          optionsCount: soloSettings.options_count,
        }
      : null;

  if (!groups) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const groupIds = groups.map((g) => g.id);

  // histories/slots/members each only depend on groupIds or run.id (not
  // on each other) -- same parallelization as above.
  const [{ data: histories }, { data: slots }, { data: members }] = await Promise.all([
    supabase
      .from("group_status_history")
      .select("group_id, comment, to_status, created_at")
      .in("group_id", groupIds.length > 0 ? groupIds : [""])
      .order("created_at", { ascending: false }),
    admin
      .from("group_question_slots")
      .select(
        "id, group_id, slot_index, question_text, options, correct_option_temp_id, presenter_comment, presenter_edited, last_edited_at",
      )
      .in("group_id", groupIds.length > 0 ? groupIds : [""]),
    supabase
      .from("participants")
      .select("id, nickname, group_id, last_seen_at")
      .eq("run_id", run.id)
      .not("group_id", "is", null),
  ]);

  const latestHistoryByGroupId = new Map<string, { comment: string | null; to_status: string }>();
  for (const h of histories ?? []) {
    if (!latestHistoryByGroupId.has(h.group_id)) {
      latestHistoryByGroupId.set(h.group_id, { comment: h.comment, to_status: h.to_status });
    }
  }

  const { data: locks } = await admin
    .from("group_question_locks")
    .select("slot_id, holder_participant_id, expires_at")
    .in(
      "slot_id",
      (slots ?? []).map((s) => s.id).length > 0 ? (slots ?? []).map((s) => s.id) : [""],
    );

  const { data: lockHolders } = await admin
    .from("participants")
    .select("id, nickname")
    .in(
      "id",
      (locks ?? []).map((l) => l.holder_participant_id).length > 0
        ? (locks ?? []).map((l) => l.holder_participant_id)
        : [""],
    );
  const lockHolderNicknameById = new Map((lockHolders ?? []).map((p) => [p.id, p.nickname]));
  const liveLockBySlotId = new Map(
    (locks ?? [])
      .filter((l) => new Date(l.expires_at).getTime() > Date.now())
      .map((l) => [l.slot_id, lockHolderNicknameById.get(l.holder_participant_id) ?? null]),
  );

  const now = Date.now();
  const groupPayload = groups.map((g) => {
    const groupMembers = (members ?? [])
      .filter((m) => m.group_id === g.id)
      .map((m) => ({
        id: m.id,
        nickname: m.nickname,
        online: now - new Date(m.last_seen_at).getTime() < ONLINE_THRESHOLD_MS,
      }));
    const groupSlots = (slots ?? [])
      .filter((s) => s.group_id === g.id)
      .sort((a, b) => a.slot_index - b.slot_index)
      .map((s) => ({
        id: s.id,
        slotIndex: s.slot_index,
        questionText: s.question_text,
        options: s.options,
        correctOptionTempId: s.correct_option_temp_id,
        presenterComment: s.presenter_comment,
        presenterEdited: s.presenter_edited,
        complete: isSlotComplete(s),
        lastEditedAt: s.last_edited_at,
        lockedBy: liveLockBySlotId.get(s.id) ?? null,
      }));
    const completeCount = groupSlots.filter((s) => s.complete).length;
    const lastActivityAt = groupSlots.reduce<string | null>((latest, s) => {
      if (!s.lastEditedAt) return latest;
      if (!latest || s.lastEditedAt > latest) return s.lastEditedAt;
      return latest;
    }, null);

    const latestHistory = latestHistoryByGroupId.get(g.id);
    return {
      id: g.id,
      name: g.name,
      pin: g.pin,
      status: g.status,
      statusVersion: g.status_version,
      rejectionComment:
        g.status === "DRAFTING" && latestHistory?.to_status === "DRAFTING"
          ? latestHistory.comment
          : null,
      members: groupMembers,
      slots: groupSlots,
      completeCount,
      totalSlots: groupSlots.length,
      lastActivityAt,
    };
  });

  const allConfirmed =
    groupPayload.length > 0 && groupPayload.every((g) => g.status === "CONFIRMED");

  return NextResponse.json({
    runStatus: run.status,
    settings,
    groups: groupPayload,
    allConfirmed,
  });
}
