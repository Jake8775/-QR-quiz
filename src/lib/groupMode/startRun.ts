import "server-only";
import { randomInt } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { openQuestion } from "@/lib/runEngine/openQuestion";
import { isSlotComplete } from "@/lib/groupMode/slotDraft";
import type { createClient } from "@/lib/supabase/server";

type Slot = {
  id: string;
  group_id: string;
  slot_index: number;
  question_text: string;
  options: unknown;
  correct_option_temp_id: string | null;
};

// Fisher-Yates using crypto.randomInt, consistent with the rest of this
// codebase's style (joinCode.ts, group PIN generation) -- cryptographic
// unpredictability isn't actually required here, just a plain shuffle.
function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Snapshot membership now, at game start -- members leaving/
// disconnecting mid-game must not change the authoring-group display or
// the group-score average's denominator (spec R6/8-2b). Shared by GROUP
// mode's flatten-and-start below and TEAM mode's start/route.ts branch
// (TEAM has no slots to flatten -- run_questions already exist -- but
// still needs this snapshot for buildGroupScores' averages).
export async function snapshotGroupMembership(
  admin: ReturnType<typeof createAdminClient>,
  runId: string,
): Promise<void> {
  const { data: groups } = await admin.from("groups").select("id").eq("run_id", runId);
  const { data: members } = await admin
    .from("participants")
    .select("id, nickname, group_id")
    .eq("run_id", runId)
    .not("group_id", "is", null);

  for (const group of groups ?? []) {
    const groupMembers = (members ?? [])
      .filter((m) => m.group_id === group.id)
      .map((m) => ({ participantId: m.id, nickname: m.nickname }));
    await admin.from("groups").update({ member_snapshot: groupMembers }).eq("id", group.id);
  }
}

// Shared core: validate every group is CONFIRMED, flatten+shuffle their
// slots into run_questions/run_options/run_answer_keys (source_group_id
// tagged), snapshot membership, and open question 1. Used by both
// startGroupModeRun (group_mode_settings) and startSoloModeRun
// (solo_mode_settings) below -- the only difference between the two
// callers is which settings table supplies timeLimitSeconds and which
// error string to show when it's missing.
async function flattenAndStart(
  supabase: Awaited<ReturnType<typeof createClient>>,
  runId: string,
  timeLimitSeconds: number,
  maxPoints: number,
  minPoints: number,
): Promise<{ error?: string; status?: number }> {
  const { data: groups } = await supabase
    .from("groups")
    .select("id, name, status")
    .eq("run_id", runId);
  if (!groups || groups.length === 0) {
    return { error: "조가 없습니다", status: 409 };
  }

  const unconfirmed = groups.filter((g) => g.status !== "CONFIRMED");
  if (unconfirmed.length > 0) {
    return {
      error: `모든 조가 확정되어야 시작할 수 있습니다 (미확정: ${unconfirmed
        .map((g) => g.name)
        .join(", ")})`,
      status: 409,
    };
  }

  // group_question_slots has zero RLS policies for any role (same
  // posture as question_answer_keys), so reading slot content requires
  // the admin client -- ownership of every groupId was already proven
  // by the RLS-gated `groups` read above.
  const admin = createAdminClient();
  const groupIds = groups.map((g) => g.id);
  const { data: slots } = await admin
    .from("group_question_slots")
    .select("id, group_id, slot_index, question_text, options, correct_option_temp_id")
    .in("group_id", groupIds);
  if (!slots) {
    return { error: "문제를 불러오지 못했습니다", status: 500 };
  }

  const incomplete = slots.filter((s) => !isSlotComplete(s));
  if (incomplete.length > 0) {
    return {
      error: "아직 완성되지 않은 문제가 있어 시작할 수 없습니다",
      status: 409,
    };
  }

  await snapshotGroupMembership(admin, runId);

  // Shuffle group order; within each group, preserve the slots' own
  // order_index (spec 8-2: "조 순서는 게임 시작 시 무작위로 정하고, 조 안의
  // 문제 순서는 슬롯 순서를 따른다").
  const shuffledGroups = shuffle(groups);
  const slotsByGroupId = new Map<string, Slot[]>();
  for (const slot of slots as Slot[]) {
    const list = slotsByGroupId.get(slot.group_id) ?? [];
    list.push(slot);
    slotsByGroupId.set(slot.group_id, list);
  }
  for (const list of slotsByGroupId.values()) {
    list.sort((a, b) => a.slot_index - b.slot_index);
  }

  const flattened: Slot[] = [];
  for (const group of shuffledGroups) {
    flattened.push(...(slotsByGroupId.get(group.id) ?? []));
  }

  let orderIndex = 0;
  let firstRunQuestionId: string | null = null;
  for (const slot of flattened) {
    const { data: insertedRunQuestion, error: insertQuestionError } = await admin
      .from("run_questions")
      .insert({
        run_id: runId,
        source_group_id: slot.group_id,
        order_index: orderIndex,
        question_text: slot.question_text,
        time_limit_seconds: timeLimitSeconds,
        max_points: maxPoints,
        min_points: minPoints,
      })
      .select("id")
      .single();
    if (insertQuestionError || !insertedRunQuestion) {
      return { error: "문제 생성에 실패했습니다", status: 500 };
    }
    if (orderIndex === 0) firstRunQuestionId = insertedRunQuestion.id;

    const options = Array.isArray(slot.options)
      ? (slot.options as { tempId: string; optionText: string }[])
      : [];
    const optionIdByTempId = new Map<string, string>();
    for (let i = 0; i < options.length; i++) {
      const { data: insertedOption, error: insertOptionError } = await admin
        .from("run_options")
        .insert({
          run_question_id: insertedRunQuestion.id,
          order_index: i,
          option_text: options[i].optionText,
        })
        .select("id")
        .single();
      if (insertOptionError || !insertedOption) {
        return { error: "보기 생성에 실패했습니다", status: 500 };
      }
      optionIdByTempId.set(options[i].tempId, insertedOption.id);
    }

    const correctOptionId = slot.correct_option_temp_id
      ? optionIdByTempId.get(slot.correct_option_temp_id)
      : undefined;
    if (!correctOptionId) {
      return { error: "정답 정보를 찾을 수 없습니다", status: 500 };
    }
    const { error: insertKeyError } = await admin.from("run_answer_keys").insert({
      run_question_id: insertedRunQuestion.id,
      correct_option_id: correctOptionId,
    });
    if (insertKeyError) {
      return { error: "정답 저장에 실패했습니다", status: 500 };
    }

    orderIndex++;
  }

  if (!firstRunQuestionId) {
    return { error: "문제가 없는 퀴즈입니다", status: 409 };
  }

  const { data: run } = await admin
    .from("quiz_runs")
    .select("state_version")
    .eq("id", runId)
    .maybeSingle();
  if (!run) {
    return { error: "not found", status: 404 };
  }

  const openError = await openQuestion(admin, {
    runId,
    runQuestionId: firstRunQuestionId,
    timeLimitSeconds,
    currentQuestionIndex: 0,
    stateVersion: run.state_version,
  });
  if (openError) {
    return { error: openError.error, status: 500 };
  }

  return {};
}

// Thin wrapper: GROUP mode's own settings table + the shared flatten
// core above.
export async function startGroupModeRun(
  supabase: Awaited<ReturnType<typeof createClient>>,
  runId: string,
): Promise<{ error?: string; status?: number }> {
  const { data: settings } = await supabase
    .from("group_mode_settings")
    .select("time_limit_seconds, max_points, min_points")
    .eq("run_id", runId)
    .maybeSingle();
  if (!settings) {
    return { error: "조별모드 설정을 찾을 수 없습니다", status: 409 };
  }
  return flattenAndStart(
    supabase,
    runId,
    settings.time_limit_seconds,
    settings.max_points,
    settings.min_points,
  );
}

// Thin wrapper: SOLO mode's own settings table + the same shared
// flatten core -- SOLO groups are 1-person "groups" created dynamically
// at join time (see joinRoomAction), so by the time this runs they look
// exactly like GROUP mode's groups to flattenAndStart.
export async function startSoloModeRun(
  supabase: Awaited<ReturnType<typeof createClient>>,
  runId: string,
): Promise<{ error?: string; status?: number }> {
  const { data: settings } = await supabase
    .from("solo_mode_settings")
    .select("time_limit_seconds, max_points, min_points")
    .eq("run_id", runId)
    .maybeSingle();
  if (!settings) {
    return { error: "개인별 출제전 설정을 찾을 수 없습니다", status: 409 };
  }
  return flattenAndStart(
    supabase,
    runId,
    settings.time_limit_seconds,
    settings.max_points,
    settings.min_points,
  );
}
