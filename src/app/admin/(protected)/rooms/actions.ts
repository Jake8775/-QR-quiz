"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateJoinCode } from "@/lib/joinCode";

type ActionResult<T = undefined> =
  | ({ success: true } & (T extends undefined ? object : T))
  | { success: false; error: string };

export async function createRoomAction(
  quizId: string,
): Promise<ActionResult<{ roomId: string }>> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    return { success: false, error: "로그인이 필요합니다" };
  }

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id")
    .eq("id", quizId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!quiz) {
    return { success: false, error: "퀴즈를 찾을 수 없습니다" };
  }

  const { data: questions, error: qError } = await supabase
    .from("questions")
    .select("id, order_index, question_text, time_limit_seconds")
    .eq("quiz_id", quizId)
    .order("order_index", { ascending: true });
  if (qError || !questions) {
    return { success: false, error: "문제를 불러오지 못했습니다" };
  }
  if (questions.length === 0) {
    return { success: false, error: "문제가 없는 퀴즈로는 방을 만들 수 없습니다" };
  }

  const questionIds = questions.map((q) => q.id);
  const { data: options, error: oError } = await supabase
    .from("options")
    .select("id, question_id, order_index, option_text")
    .in("question_id", questionIds)
    .order("order_index", { ascending: true });
  if (oError) {
    return { success: false, error: "보기를 불러오지 못했습니다" };
  }

  // Ownership of questionIds is already proven by the RLS-gated reads
  // above, so the admin client may safely read the otherwise-unreadable
  // answer keys for exactly these question ids.
  const admin = createAdminClient();
  const { data: answerKeys, error: keyError } = await admin
    .from("question_answer_keys")
    .select("question_id, correct_option_id")
    .in("question_id", questionIds);
  if (keyError) {
    return { success: false, error: "정답을 불러오지 못했습니다" };
  }

  // Defensive completeness check: every question must have exactly one
  // answer key before a room can be created. Stage 2's save flow already
  // enforces this, so this guards only against data drift.
  const keyedQuestionIds = new Set((answerKeys ?? []).map((k) => k.question_id));
  const missingAnswerKey = questions.some((q) => !keyedQuestionIds.has(q.id));
  if (missingAnswerKey) {
    return {
      success: false,
      error:
        "이 퀴즈에 정답이 설정되지 않은 문제가 있어 방을 만들 수 없습니다. 퀴즈 편집 화면에서 모든 문제에 정답을 지정해주세요.",
    };
  }

  let joinCode = "";
  let room: { id: string } | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    joinCode = generateJoinCode();
    const { data: insertedRoom, error } = await supabase
      .from("rooms")
      .insert({ owner_id: user.id, quiz_id: quizId, public_join_code: joinCode })
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

  // Snapshot copy, mirroring duplicateQuizAction's id-remapping shape.
  // run_questions/run_options only have owner-SELECT RLS policies (not
  // owner-INSERT), so this write must go through the admin client
  // regardless of the ownership already proven above.
  const questionIdMap = new Map<string, string>();
  for (const q of questions) {
    const { data: insertedRunQuestion, error } = await admin
      .from("run_questions")
      .insert({
        run_id: run.id,
        source_question_id: q.id,
        order_index: q.order_index,
        question_text: q.question_text,
        time_limit_seconds: q.time_limit_seconds,
      })
      .select("id")
      .single();
    if (error || !insertedRunQuestion) {
      return { success: false, error: "문제 정보를 복사하지 못했습니다" };
    }
    questionIdMap.set(q.id, insertedRunQuestion.id);
  }

  const optionIdMap = new Map<string, string>();
  for (const o of options ?? []) {
    const newQuestionId = questionIdMap.get(o.question_id);
    if (!newQuestionId) continue;
    const { data: insertedRunOption, error } = await admin
      .from("run_options")
      .insert({
        run_question_id: newQuestionId,
        order_index: o.order_index,
        option_text: o.option_text,
      })
      .select("id")
      .single();
    if (error || !insertedRunOption) {
      return { success: false, error: "보기 정보를 복사하지 못했습니다" };
    }
    optionIdMap.set(o.id, insertedRunOption.id);
  }

  for (const key of answerKeys ?? []) {
    const newQuestionId = questionIdMap.get(key.question_id);
    const newOptionId = optionIdMap.get(key.correct_option_id);
    if (!newQuestionId || !newOptionId) continue;
    const { error } = await admin.from("run_answer_keys").insert({
      run_question_id: newQuestionId,
      correct_option_id: newOptionId,
    });
    if (error) {
      return { success: false, error: "정답 정보를 복사하지 못했습니다" };
    }
  }

  revalidatePath("/admin");
  return { success: true, roomId: room.id };
}
