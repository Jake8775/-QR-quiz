import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

  const { data: settings } = await supabase
    .from("group_mode_settings")
    .select("topic, questions_per_group, time_limit_seconds, group_count")
    .eq("run_id", run.id)
    .maybeSingle();

  const { data: groups } = await supabase
    .from("groups")
    .select("id, name, pin, status, status_version, created_at")
    .eq("run_id", run.id)
    .order("created_at", { ascending: true });

  if (!groups) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const groupIds = groups.map((g) => g.id);

  // groups has an owner_select RLS policy so the RLS-scoped client above
  // is already allowed to read group_question_slots-adjacent summary
  // data, but group_question_slots itself has zero RLS policies (same
  // posture as question_answer_keys) -- the presenter's slot-content
  // visibility (completion counts, per-slot lock holders) goes through
  // the admin client, which is safe here because ownership of every
  // groupId above was already proven by the RLS-gated `groups` read.
  const admin = createAdminClient();

  const { data: slots } = await admin
    .from("group_question_slots")
    .select("id, group_id, slot_index, question_text, options, correct_option_temp_id, last_edited_at")
    .in("group_id", groupIds.length > 0 ? groupIds : [""]);

  const { data: locks } = await admin
    .from("group_question_locks")
    .select("slot_id, holder_participant_id, expires_at")
    .in(
      "slot_id",
      (slots ?? []).map((s) => s.id).length > 0 ? (slots ?? []).map((s) => s.id) : [""],
    );

  const { data: members } = await supabase
    .from("participants")
    .select("id, nickname, group_id, last_seen_at")
    .eq("run_id", run.id)
    .not("group_id", "is", null);

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

    return {
      id: g.id,
      name: g.name,
      pin: g.pin,
      status: g.status,
      statusVersion: g.status_version,
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
    settings: settings
      ? {
          topic: settings.topic,
          questionsPerGroup: settings.questions_per_group,
          timeLimitSeconds: settings.time_limit_seconds,
          groupCount: settings.group_count,
        }
      : null,
    groups: groupPayload,
    allConfirmed,
  });
}

function isSlotComplete(slot: {
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
  const correctExists = options.some(
    (o) => o && typeof o === "object" && "tempId" in o && o.tempId === slot.correct_option_temp_id,
  );
  return correctExists;
}
