"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { generateJoinCode } from "@/lib/joinCode";
import { soloModeSetupSchema, type SoloModeSetupInput } from "@/lib/validation/solo";

type ActionResult<T = undefined> =
  | ({ success: true } & (T extends undefined ? object : T))
  | { success: false; error: string };

// SOLO mode: like createGroupModeRoomAction, but with no groupCount/group
// creation loop and no group_question_slots -- a SOLO "group" (really
// just one participant) is created dynamically at join time instead
// (see joinRoomAction's SOLO branch). This action only needs to create
// quiz+room+run+solo_mode_settings.
export async function createSoloModeRoomAction(
  input: SoloModeSetupInput,
): Promise<ActionResult<{ roomId: string }>> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    return { success: false, error: "로그인이 필요합니다" };
  }

  const parsed = soloModeSetupSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다",
    };
  }
  const { topic, questionsPerPerson, timeLimitSeconds } = parsed.data;

  const { data: quiz, error: quizError } = await supabase
    .from("quizzes")
    .insert({ owner_id: user.id, title: topic, mode: "SOLO" })
    .select("id")
    .single();
  if (quizError || !quiz) {
    return { success: false, error: "개인별 출제전 퀴즈 생성에 실패했습니다" };
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

  const { error: settingsError } = await supabase.from("solo_mode_settings").insert({
    run_id: run.id,
    topic,
    questions_per_person: questionsPerPerson,
    time_limit_seconds: timeLimitSeconds,
  });
  if (settingsError) {
    return { success: false, error: "개인별 출제전 설정 저장에 실패했습니다" };
  }

  revalidatePath("/admin");
  return { success: true, roomId: room.id };
}
