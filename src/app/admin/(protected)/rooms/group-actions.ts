"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateJoinCode } from "@/lib/joinCode";
import { generateGroupPin } from "@/lib/groupMode/pin";
import {
  groupModeSetupSchema,
  type GroupModeSetupInput,
} from "@/lib/validation/groupMode";

type ActionResult<T = undefined> =
  | ({ success: true } & (T extends undefined ? object : T))
  | { success: false; error: string };

// Deliberately separate from createRoomAction (rooms/actions.ts) rather
// than a branch inside it -- group mode has no source quiz content to
// snapshot-copy at creation time (members author it later), so the two
// flows share nothing beyond "create quizzes/rooms/quiz_runs rows," and
// keeping them apart means createRoomAction's normal-mode body never
// needs a mode check at all.
export async function createGroupModeRoomAction(
  input: GroupModeSetupInput,
): Promise<ActionResult<{ roomId: string }>> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    return { success: false, error: "로그인이 필요합니다" };
  }

  const parsed = groupModeSetupSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다",
    };
  }
  const { topic, groupCount, questionsPerGroup, timeLimitSeconds } = parsed.data;

  const { data: quiz, error: quizError } = await supabase
    .from("quizzes")
    .insert({ owner_id: user.id, title: topic, mode: "GROUP" })
    .select("id")
    .single();
  if (quizError || !quiz) {
    return { success: false, error: "조별모드 퀴즈 생성에 실패했습니다" };
  }

  let joinCode = "";
  let room: { id: string } | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    joinCode = generateJoinCode();
    const { data: insertedRoom, error } = await supabase
      .from("rooms")
      .insert({ owner_id: user.id, quiz_id: quiz.id, public_join_code: joinCode })
      .select("id")
      .single();
    if (!error && insertedRoom) {
      room = insertedRoom;
      break;
    }
    if (error && error.code !== "23505") {
      return { success: false, error: "방 생성에 실패했습니다" };
    }
  }
  if (!room) {
    return { success: false, error: "방 코드 생성에 실패했습니다. 다시 시도해주세요" };
  }

  const { data: run, error: runError } = await supabase
    .from("quiz_runs")
    .insert({ room_id: room.id, run_number: 1, status: "LOBBY" })
    .select("id")
    .single();
  if (runError || !run) {
    return { success: false, error: "회차 생성에 실패했습니다" };
  }

  const { error: updateRoomError } = await supabase
    .from("rooms")
    .update({ active_run_id: run.id })
    .eq("id", room.id);
  if (updateRoomError) {
    return { success: false, error: "방 활성 회차 설정에 실패했습니다" };
  }

  const { error: settingsError } = await supabase.from("group_mode_settings").insert({
    run_id: run.id,
    topic,
    questions_per_group: questionsPerGroup,
    time_limit_seconds: timeLimitSeconds,
    group_count: groupCount,
  });
  if (settingsError) {
    return { success: false, error: "조별모드 설정 저장에 실패했습니다" };
  }

  // groups/group_question_slots only grant the owner SELECT (group_mode_
  // settings above is the one group-mode table with owner_all, since it
  // carries no secret), so these writes go through the admin client.
  const admin = createAdminClient();

  for (let i = 1; i <= groupCount; i++) {
    let pin = "";
    let groupId: string | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      pin = generateGroupPin();
      // A 4-digit numeric PIN colliding with the 8-char letter+digit join
      // code is impossible by length/charset alone, but the spec calls
      // for the guard explicitly -- cheap to check.
      if (pin === joinCode) continue;
      const { data: insertedGroup, error } = await admin
        .from("groups")
        .insert({ run_id: run.id, name: `${i}조`, pin })
        .select("id")
        .single();
      if (!error && insertedGroup) {
        groupId = insertedGroup.id;
        break;
      }
      if (error && error.code !== "23505") {
        return { success: false, error: "조 생성에 실패했습니다" };
      }
    }
    if (!groupId) {
      return { success: false, error: "조 PIN 생성에 실패했습니다. 다시 시도해주세요" };
    }

    const slotRows = Array.from({ length: questionsPerGroup }, (_, slotIndex) => ({
      group_id: groupId!,
      slot_index: slotIndex,
    }));
    const { error: slotsError } = await admin.from("group_question_slots").insert(slotRows);
    if (slotsError) {
      return { success: false, error: "조별 문제 슬롯 생성에 실패했습니다" };
    }
  }

  revalidatePath("/admin");
  return { success: true, roomId: room.id };
}
