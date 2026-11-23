import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { QuizEditorInput } from "@/lib/validation/quiz";

export async function loadQuizForEdit(
  quizId: string,
): Promise<QuizEditorInput | null> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, title")
    .eq("id", quizId)
    .maybeSingle();
  if (!quiz) return null;

  const { data: questions } = await supabase
    .from("questions")
    .select("id, order_index, question_text, time_limit_seconds")
    .eq("quiz_id", quizId)
    .order("order_index", { ascending: true });
  if (!questions) return null;

  const questionIds = questions.map((q) => q.id);
  const { data: options } = await supabase
    .from("options")
    .select("id, question_id, order_index, option_text")
    .in("question_id", questionIds.length > 0 ? questionIds : [""])
    .order("order_index", { ascending: true });

  // Ownership of questionIds is already proven by the RLS-gated reads
  // above, so the admin client may safely read the otherwise-unreadable
  // answer keys for exactly these question ids.
  const admin = createAdminClient();
  const { data: keys } = await admin
    .from("question_answer_keys")
    .select("question_id, correct_option_id")
    .in("question_id", questionIds.length > 0 ? questionIds : [""]);

  const correctOptionIdByQuestionId = new Map(
    (keys ?? []).map((k) => [k.question_id, k.correct_option_id]),
  );

  return {
    quizId: quiz.id,
    title: quiz.title,
    questions: questions.map((q) => {
      const questionOptions = (options ?? []).filter(
        (o) => o.question_id === q.id,
      );
      const correctOptionId = correctOptionIdByQuestionId.get(q.id);
      return {
        tempId: q.id,
        questionText: q.question_text,
        timeLimitSeconds: q.time_limit_seconds,
        options: questionOptions.map((o) => ({
          tempId: o.id,
          optionText: o.option_text,
        })),
        correctOptionTempId:
          questionOptions.find((o) => o.id === correctOptionId)?.id ?? "",
      };
    }),
  };
}
