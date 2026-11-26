"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { soloModeSetupSchema, type SoloModeSetupInput } from "@/lib/validation/solo";
import { createRoomAndRun, type ActionResult } from "./room-creation";

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

  const created = await createRoomAndRun(supabase, { ownerId: user.id, quizId: quiz.id });
  if ("error" in created) {
    return { success: false, error: created.error };
  }
  const { room, run } = created;

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
