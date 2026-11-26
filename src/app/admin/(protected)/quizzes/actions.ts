"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { quizEditorSchema, type QuizEditorInput } from "@/lib/validation/quiz";
import type { QuizMode } from "@/types/database.types";
import type { ActionResult } from "../rooms/room-creation";

// `mode` only matters on creation (data.quizId === null) -- TEAM mode
// reuses this exact function (and QuizEditor.tsx) to author its
// questions, just like NORMAL, so the presenter-authored quiz content
// pipeline stays shared between the two. Editing an existing quiz never
// changes its mode, so the update branch below doesn't take this param.
export async function saveQuizAction(
  input: QuizEditorInput,
  mode: QuizMode = "NORMAL",
): Promise<ActionResult<{ quizId: string }>> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    return { success: false, error: "로그인이 필요합니다" };
  }

  const parsed = quizEditorSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다" };
  }
  const data = parsed.data;

  let quizId: string;
  if (data.quizId === null) {
    const { data: inserted, error } = await supabase
      .from("quizzes")
      .insert({ owner_id: user.id, title: data.title, mode })
      .select("id")
      .single();
    if (error || !inserted) {
      return { success: false, error: "퀴즈 생성에 실패했습니다" };
    }
    quizId = inserted.id;
  } else {
    const { data: existing } = await supabase
      .from("quizzes")
      .select("id")
      .eq("id", data.quizId)
      .maybeSingle();
    if (!existing) {
      return { success: false, error: "퀴즈를 찾을 수 없습니다" };
    }
    quizId = existing.id;

    const { error: updateError } = await supabase
      .from("quizzes")
      .update({ title: data.title })
      .eq("id", quizId);
    if (updateError) {
      return { success: false, error: "퀴즈 수정에 실패했습니다" };
    }

    // TODO(stage-3): once rooms/quiz_runs exist, reject this save if any
    // room pointing at this quiz_id has a run that is not FINISHED
    // ("진행 중인 회차의 문제는 수정하지 못하게 한다"). Not checkable yet
    // since no run state exists.
    const { error: deleteError } = await supabase
      .from("questions")
      .delete()
      .eq("quiz_id", quizId);
    if (deleteError) {
      return { success: false, error: "기존 문제 삭제에 실패했습니다" };
    }
  }

  const questionIdByTempId = new Map<string, string>();
  for (let qIndex = 0; qIndex < data.questions.length; qIndex++) {
    const q = data.questions[qIndex];
    const { data: insertedQuestion, error } = await supabase
      .from("questions")
      .insert({
        quiz_id: quizId,
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
  for (const q of data.questions) {
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

  // Independent ownership re-check immediately before the RLS-bypassing
  // service-role write below. question_answer_keys has zero RLS policies
  // for any role, so this manual check is the only gate protecting it.
  const { data: ownedQuiz } = await supabase
    .from("quizzes")
    .select("id")
    .eq("id", quizId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!ownedQuiz) {
    return { success: false, error: "권한이 없습니다" };
  }

  const admin = createAdminClient();
  for (const q of data.questions) {
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

  revalidatePath("/admin");
  revalidatePath(`/admin/quizzes/${quizId}/edit`);
  return { success: true, quizId };
}

// rooms.quiz_id is `on delete restrict`, so a quiz with any room would
// otherwise block deletion at the DB level. This is a deliberate forced
// delete: every room pointing at this quiz (and everything cascading
// from it -- quiz_runs, participants, answers, groups, etc.) is deleted
// first, THEN the quiz itself. The caller is responsible for warning the
// user that this permanently destroys game history before calling this.
export async function deleteQuizAction(
  quizId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    return { success: false, error: "로그인이 필요합니다" };
  }

  const { error: roomsError } = await supabase
    .from("rooms")
    .delete()
    .eq("quiz_id", quizId)
    .eq("owner_id", user.id);
  if (roomsError) {
    return { success: false, error: "방 삭제에 실패했습니다" };
  }

  const { error } = await supabase.from("quizzes").delete().eq("id", quizId);
  if (error) {
    return { success: false, error: "삭제에 실패했습니다" };
  }

  revalidatePath("/admin");
  return { success: true };
}

// Batch version of deleteQuizAction, for the list's multi-select delete.
export async function deleteQuizzesAction(
  quizIds: string[],
): Promise<ActionResult<{ deletedCount: number }>> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    return { success: false, error: "로그인이 필요합니다" };
  }
  if (quizIds.length === 0) {
    return { success: true, deletedCount: 0 };
  }

  const { error: roomsError } = await supabase
    .from("rooms")
    .delete()
    .in("quiz_id", quizIds)
    .eq("owner_id", user.id);
  if (roomsError) {
    return { success: false, error: "방 삭제에 실패했습니다" };
  }

  const { data: deleted, error } = await supabase
    .from("quizzes")
    .delete()
    .in("id", quizIds)
    .eq("owner_id", user.id)
    .select("id");
  if (error) {
    return { success: false, error: "삭제에 실패했습니다" };
  }

  revalidatePath("/admin");
  return { success: true, deletedCount: deleted?.length ?? 0 };
}

export async function duplicateQuizAction(
  quizId: string,
): Promise<ActionResult<{ newQuizId: string }>> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    return { success: false, error: "로그인이 필요합니다" };
  }

  const { data: original } = await supabase
    .from("quizzes")
    .select("id, title, mode")
    .eq("id", quizId)
    .maybeSingle();
  if (!original) {
    return { success: false, error: "퀴즈를 찾을 수 없습니다" };
  }

  const { data: originalQuestions, error: qError } = await supabase
    .from("questions")
    .select("id, order_index, question_text, time_limit_seconds")
    .eq("quiz_id", quizId)
    .order("order_index", { ascending: true });
  if (qError || !originalQuestions) {
    return { success: false, error: "문제를 불러오지 못했습니다" };
  }

  const originalQuestionIds = originalQuestions.map((q) => q.id);
  const { data: originalOptions, error: oError } = await supabase
    .from("options")
    .select("id, question_id, order_index, option_text")
    .in("question_id", originalQuestionIds.length > 0 ? originalQuestionIds : [""])
    .order("order_index", { ascending: true });
  if (oError) {
    return { success: false, error: "보기를 불러오지 못했습니다" };
  }

  // Ownership of originalQuestionIds is already proven by the RLS-gated
  // reads above (empty result would have meant "not owned"), so it's safe
  // to use the admin client to read the otherwise-unreadable answer keys
  // for exactly these question ids.
  const admin = createAdminClient();
  const { data: originalKeys, error: keyError } = await admin
    .from("question_answer_keys")
    .select("question_id, correct_option_id")
    .in("question_id", originalQuestionIds.length > 0 ? originalQuestionIds : [""]);
  if (keyError) {
    return { success: false, error: "정답을 불러오지 못했습니다" };
  }

  const { data: newQuiz, error: insertQuizError } = await supabase
    .from("quizzes")
    .insert({ owner_id: user.id, title: `${original.title} (복제)`, mode: original.mode })
    .select("id")
    .single();
  if (insertQuizError || !newQuiz) {
    return { success: false, error: "복제에 실패했습니다" };
  }

  const questionIdMap = new Map<string, string>();
  for (const q of originalQuestions) {
    const { data: insertedQuestion, error } = await supabase
      .from("questions")
      .insert({
        quiz_id: newQuiz.id,
        order_index: q.order_index,
        question_text: q.question_text,
        time_limit_seconds: q.time_limit_seconds,
      })
      .select("id")
      .single();
    if (error || !insertedQuestion) {
      return { success: false, error: "문제 복제에 실패했습니다" };
    }
    questionIdMap.set(q.id, insertedQuestion.id);
  }

  const optionIdMap = new Map<string, string>();
  for (const o of originalOptions ?? []) {
    const newQuestionId = questionIdMap.get(o.question_id);
    if (!newQuestionId) continue;
    const { data: insertedOption, error } = await supabase
      .from("options")
      .insert({
        question_id: newQuestionId,
        order_index: o.order_index,
        option_text: o.option_text,
      })
      .select("id")
      .single();
    if (error || !insertedOption) {
      return { success: false, error: "보기 복제에 실패했습니다" };
    }
    optionIdMap.set(o.id, insertedOption.id);
  }

  for (const key of originalKeys ?? []) {
    const newQuestionId = questionIdMap.get(key.question_id);
    const newOptionId = optionIdMap.get(key.correct_option_id);
    if (!newQuestionId || !newOptionId) continue;
    const { error } = await admin.from("question_answer_keys").insert({
      question_id: newQuestionId,
      correct_option_id: newOptionId,
    });
    if (error) {
      return { success: false, error: "정답 복제에 실패했습니다" };
    }
  }

  revalidatePath("/admin");
  return { success: true, newQuizId: newQuiz.id };
}
