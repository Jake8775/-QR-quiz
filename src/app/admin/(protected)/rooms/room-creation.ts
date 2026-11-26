import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateJoinCode } from "@/lib/joinCode";

export type ActionResult<T = undefined> =
  | ({ success: true } & (T extends undefined ? object : T))
  | { success: false; error: string };

// Shared by every mode's room-creation action (NORMAL/GROUP/TEAM/SOLO):
// generate a join code (retrying on collision), insert the room, insert
// its first quiz_run (always run_number 1, status LOBBY), then point
// rooms.active_run_id at it. What differs per mode -- authoring content,
// group/slot creation -- stays in each mode's own action file; this is
// only the part that was identical across all of them.
export async function createRoomAndRun(
  supabase: Awaited<ReturnType<typeof createClient>>,
  params: { ownerId: string; quizId: string },
): Promise<
  | { room: { id: string }; run: { id: string }; joinCode: string }
  | { error: string }
> {
  let joinCode = "";
  let room: { id: string } | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    joinCode = generateJoinCode();
    const { data: insertedRoom, error } = await supabase
      .from("rooms")
      .insert({ owner_id: params.ownerId, quiz_id: params.quizId, public_join_code: joinCode })
      .select("id")
      .single();
    if (!error && insertedRoom) {
      room = insertedRoom;
      break;
    }
    if (error && error.code !== "23505") {
      return { error: "방 생성에 실패했습니다" };
    }
  }
  if (!room) {
    return { error: "방 코드 생성에 실패했습니다. 다시 시도해주세요" };
  }

  const { data: run, error: runError } = await supabase
    .from("quiz_runs")
    .insert({ room_id: room.id, run_number: 1, status: "LOBBY" })
    .select("id")
    .single();
  if (runError || !run) {
    return { error: "회차 생성에 실패했습니다" };
  }

  const { error: updateRoomError } = await supabase
    .from("rooms")
    .update({ active_run_id: run.id })
    .eq("id", room.id);
  if (updateRoomError) {
    return { error: "방 활성 회차 설정에 실패했습니다" };
  }

  return { room, run, joinCode };
}

type QuizSnapshotData = {
  questions: { id: string; order_index: number; question_text: string; time_limit_seconds: number }[];
  options: { id: string; question_id: string; order_index: number; option_text: string }[];
  answerKeys: { question_id: string; correct_option_id: string }[];
};

// Loads and validates a presenter-authored quiz's content *before* a room
// is created for it (NORMAL's createRoomAction, TEAM's
// createTeamRoomAction) -- keeping this ahead of createRoomAndRun means a
// quiz that fails validation (no questions, missing answer key) never
// leaves behind an orphaned empty room. GROUP/SOLO don't use this: their
// content doesn't exist yet at room-creation time (members author it
// later), so they flatten into run_questions at game-start instead (see
// src/lib/groupMode/startRun.ts).
export async function loadQuizSnapshotData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  admin: ReturnType<typeof createAdminClient>,
  quizId: string,
): Promise<{ data: QuizSnapshotData } | { error: string }> {
  const { data: questions, error: qError } = await supabase
    .from("questions")
    .select("id, order_index, question_text, time_limit_seconds")
    .eq("quiz_id", quizId)
    .order("order_index", { ascending: true });
  if (qError || !questions) {
    return { error: "문제를 불러오지 못했습니다" };
  }
  if (questions.length === 0) {
    return { error: "문제가 없는 퀴즈로는 방을 만들 수 없습니다" };
  }

  const questionIds = questions.map((q) => q.id);
  const { data: options, error: oError } = await supabase
    .from("options")
    .select("id, question_id, order_index, option_text")
    .in("question_id", questionIds)
    .order("order_index", { ascending: true });
  if (oError) {
    return { error: "보기를 불러오지 못했습니다" };
  }

  // Ownership of questionIds is already proven by the RLS-gated reads
  // above, so the admin client may safely read the otherwise-unreadable
  // answer keys for exactly these question ids.
  const { data: answerKeys, error: keyError } = await admin
    .from("question_answer_keys")
    .select("question_id, correct_option_id")
    .in("question_id", questionIds);
  if (keyError) {
    return { error: "정답을 불러오지 못했습니다" };
  }

  // Defensive completeness check: every question must have exactly one
  // answer key before a room can be created. The quiz editor's save flow
  // already enforces this, so this guards only against data drift.
  const keyedQuestionIds = new Set((answerKeys ?? []).map((k) => k.question_id));
  const missingAnswerKey = questions.some((q) => !keyedQuestionIds.has(q.id));
  if (missingAnswerKey) {
    return {
      error:
        "이 퀴즈에 정답이 설정되지 않은 문제가 있어 방을 만들 수 없습니다. 퀴즈 편집 화면에서 모든 문제에 정답을 지정해주세요.",
    };
  }

  return { data: { questions, options: options ?? [], answerKeys: answerKeys ?? [] } };
}

// Writes a previously-loaded quiz snapshot into a newly-created run's
// run_questions/run_options/run_answer_keys. run_questions/run_options
// only have owner-SELECT RLS policies (not owner-INSERT), so this must
// go through the admin client regardless of ownership already proven
// when the snapshot was loaded.
export async function writeRunSnapshot(
  admin: ReturnType<typeof createAdminClient>,
  runId: string,
  snapshot: QuizSnapshotData,
): Promise<{ error: string } | { error?: undefined }> {
  const questionIdMap = new Map<string, string>();
  for (const q of snapshot.questions) {
    const { data: insertedRunQuestion, error } = await admin
      .from("run_questions")
      .insert({
        run_id: runId,
        source_question_id: q.id,
        order_index: q.order_index,
        question_text: q.question_text,
        time_limit_seconds: q.time_limit_seconds,
      })
      .select("id")
      .single();
    if (error || !insertedRunQuestion) {
      return { error: "문제 정보를 복사하지 못했습니다" };
    }
    questionIdMap.set(q.id, insertedRunQuestion.id);
  }

  const optionIdMap = new Map<string, string>();
  for (const o of snapshot.options) {
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
      return { error: "보기 정보를 복사하지 못했습니다" };
    }
    optionIdMap.set(o.id, insertedRunOption.id);
  }

  for (const key of snapshot.answerKeys) {
    const newQuestionId = questionIdMap.get(key.question_id);
    const newOptionId = optionIdMap.get(key.correct_option_id);
    if (!newQuestionId || !newOptionId) continue;
    const { error } = await admin.from("run_answer_keys").insert({
      run_question_id: newQuestionId,
      correct_option_id: newOptionId,
    });
    if (error) {
      return { error: "정답 정보를 복사하지 못했습니다" };
    }
  }

  return {};
}
