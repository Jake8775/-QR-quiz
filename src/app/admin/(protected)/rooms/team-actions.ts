"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateGroupPin } from "@/lib/groupMode/pin";
import { teamModeSetupSchema, type TeamModeSetupInput } from "@/lib/validation/team";
import { createRoomAndRun, type ActionResult } from "./room-creation";

// TEAM mode: the presenter authors questions directly (exactly like
// NORMAL mode's saveQuizAction + createRoomAction combined into one
// step), but participants join a team via the same group+PIN flow as
// GROUP mode. Teams are created CONFIRMED (no group_question_slots --
// there is nothing for members to author or for the presenter to
// review), so the existing LOBBY/start machinery treats them as already
// approved and the presenter can start as soon as participants join.
export async function createTeamModeRoomAction(
  input: TeamModeSetupInput,
): Promise<ActionResult<{ roomId: string }>> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    return { success: false, error: "로그인이 필요합니다" };
  }

  const parsed = teamModeSetupSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다",
    };
  }
  const { title, groupCount, questions } = parsed.data;

  const { data: quiz, error: quizError } = await supabase
    .from("quizzes")
    .insert({ owner_id: user.id, title, mode: "TEAM" })
    .select("id")
    .single();
  if (quizError || !quiz) {
    return { success: false, error: "팀전 퀴즈 생성에 실패했습니다" };
  }

  // Mirrors saveQuizAction's question/option insert loop so the quiz's
  // own questions/options tables are populated identically to a NORMAL
  // quiz -- the /admin list's existing questions(count) query then shows
  // the right count with no query change needed.
  const questionIdByTempId = new Map<string, string>();
  for (let qIndex = 0; qIndex < questions.length; qIndex++) {
    const q = questions[qIndex];
    const { data: insertedQuestion, error } = await supabase
      .from("questions")
      .insert({
        quiz_id: quiz.id,
        order_index: qIndex,
        question_text: q.questionText,
        time_limit_seconds: q.timeLimitSeconds,
      })
      .select("id")
      .single();
    if (error || !insertedQuestion) {
      return { success: false, error: "문제 저장에 실패했습니다" };
    }
    questionIdByTempId.set(q.tempId, insertedQuestion.id);
  }

  const optionIdByTempId = new Map<string, string>();
  for (const q of questions) {
    const questionId = questionIdByTempId.get(q.tempId)!;
    for (let oIndex = 0; oIndex < q.options.length; oIndex++) {
      const o = q.options[oIndex];
      const { data: insertedOption, error } = await supabase
        .from("options")
        .insert({
          question_id: questionId,
          order_index: oIndex,
          option_text: o.optionText,
        })
        .select("id")
        .single();
      if (error || !insertedOption) {
        return { success: false, error: "보기 저장에 실패했습니다" };
      }
      optionIdByTempId.set(`${q.tempId}:${o.tempId}`, insertedOption.id);
    }
  }

  const admin = createAdminClient();
  for (const q of questions) {
    const questionId = questionIdByTempId.get(q.tempId)!;
    const correctOptionId = optionIdByTempId.get(`${q.tempId}:${q.correctOptionTempId}`);
    if (!correctOptionId) {
      return { success: false, error: "정답 보기를 찾을 수 없습니다" };
    }
    const { error } = await admin.from("question_answer_keys").insert({
      question_id: questionId,
      correct_option_id: correctOptionId,
    });
    if (error) {
      return { success: false, error: "정답 저장에 실패했습니다" };
    }
  }

  const createdRoom = await createRoomAndRun(supabase, { ownerId: user.id, quizId: quiz.id });
  if ("error" in createdRoom) {
    return { success: false, error: createdRoom.error };
  }
  const { room, run, joinCode } = createdRoom;

  // Snapshot questions/options/answer-keys into run_questions/run_options/
  // run_answer_keys exactly like createRoomAction (NORMAL mode) does --
  // source_group_id stays null on every row, so the game-progression
  // layer (answer/route.ts's spectator gate, state/run-status's
  // authoringGroup) treats every question as normal-mode, which is
  // correct: the presenter authored these, not any team.
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const questionId = questionIdByTempId.get(q.tempId)!;
    const { data: insertedRunQuestion, error } = await admin
      .from("run_questions")
      .insert({
        run_id: run.id,
        source_question_id: questionId,
        order_index: i,
        question_text: q.questionText,
        time_limit_seconds: q.timeLimitSeconds,
      })
      .select("id")
      .single();
    if (error || !insertedRunQuestion) {
      return { success: false, error: "문제 정보를 복사하지 못했습니다" };
    }

    const runOptionIdByOptionTempId = new Map<string, string>();
    for (let oIndex = 0; oIndex < q.options.length; oIndex++) {
      const o = q.options[oIndex];
      const { data: insertedRunOption, error: optError } = await admin
        .from("run_options")
        .insert({
          run_question_id: insertedRunQuestion.id,
          order_index: oIndex,
          option_text: o.optionText,
        })
        .select("id")
        .single();
      if (optError || !insertedRunOption) {
        return { success: false, error: "보기 정보를 복사하지 못했습니다" };
      }
      runOptionIdByOptionTempId.set(o.tempId, insertedRunOption.id);
    }

    const correctRunOptionId = runOptionIdByOptionTempId.get(q.correctOptionTempId);
    if (!correctRunOptionId) {
      return { success: false, error: "정답 정보를 복사하지 못했습니다" };
    }
    const { error: keyError } = await admin.from("run_answer_keys").insert({
      run_question_id: insertedRunQuestion.id,
      correct_option_id: correctRunOptionId,
    });
    if (keyError) {
      return { success: false, error: "정답 정보를 복사하지 못했습니다" };
    }
  }

  // Teams are created CONFIRMED and with zero group_question_slots --
  // there is no member-authored content to review, so this room is
  // start-ready as soon as the presenter likes (GroupModeLobbyDashboard's
  // "모든 조 확정" gate is already satisfied).
  for (let i = 1; i <= groupCount; i++) {
    let pin = "";
    let created = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      pin = generateGroupPin();
      if (pin === joinCode) continue;
      const { error } = await admin
        .from("groups")
        .insert({ run_id: run.id, name: `${i}조`, pin, status: "CONFIRMED" });
      if (!error) {
        created = true;
        break;
      }
      if (error.code !== "23505") {
        return { success: false, error: "조 생성에 실패했습니다" };
      }
    }
    if (!created) {
      return { success: false, error: "조 PIN 생성에 실패했습니다. 다시 시도해주세요" };
    }
  }

  revalidatePath("/admin");
  return { success: true, roomId: room.id };
}
