import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeAwardedPoints } from "@/lib/scoring";

const PARTICIPANT_COOKIE = "qz_participant";

const submitAnswerSchema = z.object({
  runQuestionId: z.string().uuid(),
  selectedOptionId: z.string().uuid(),
});

// Lives under /room/[joinCode]/answer (not /api/room/...) -- same cookie
// path-scope requirement as heartbeat/route.ts.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ joinCode: string }> },
) {
  const { joinCode } = await params;
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(PARTICIPANT_COOKIE)?.value;
  if (!sessionId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = submitAnswerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "잘못된 요청입니다" }, { status: 400 });
  }
  const { runQuestionId, selectedOptionId } = parsed.data;

  const admin = createAdminClient();

  const { data: room } = await admin
    .from("rooms")
    .select("active_run_id")
    .eq("public_join_code", joinCode)
    .maybeSingle();
  if (!room || !room.active_run_id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { data: run } = await admin
    .from("quiz_runs")
    .select("id, status, current_question_index")
    .eq("id", room.active_run_id)
    .maybeSingle();
  if (!run) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // The cookie's session id is only ever meaningful in combination with the
  // run it's being checked against -- never trust it alone.
  const { data: participant } = await admin
    .from("participants")
    .select("id, group_id")
    .eq("participant_session_id", sessionId)
    .eq("run_id", run.id)
    .maybeSingle();
  if (!participant) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (run.status !== "QUESTION_OPEN") {
    return NextResponse.json(
      { error: "지금은 답변을 제출할 수 없습니다" },
      { status: 409 },
    );
  }

  const { data: currentQuestion } = await admin
    .from("run_questions")
    .select("id, time_limit_seconds, source_group_id")
    .eq("run_id", run.id)
    .eq("order_index", run.current_question_index)
    .maybeSingle();
  if (!currentQuestion || currentQuestion.id !== runQuestionId) {
    return NextResponse.json(
      { error: "이미 지난 문제입니다" },
      { status: 409 },
    );
  }

  // Group mode spectator gate: a participant never answers their own
  // group's question (R2/8-4). source_group_id is null for every
  // normal-mode run_questions row, so this is a complete no-op there.
  if (currentQuestion.source_group_id && currentQuestion.source_group_id === participant.group_id) {
    return NextResponse.json(
      { error: "자신의 조가 출제한 문제에는 응답할 수 없습니다" },
      { status: 403 },
    );
  }

  const { data: option } = await admin
    .from("run_options")
    .select("id")
    .eq("id", selectedOptionId)
    .eq("run_question_id", currentQuestion.id)
    .maybeSingle();
  if (!option) {
    return NextResponse.json(
      { error: "잘못된 보기입니다" },
      { status: 400 },
    );
  }

  const { data: state } = await admin
    .from("run_question_states")
    .select("opened_at, closes_at")
    .eq("run_id", run.id)
    .eq("run_question_id", currentQuestion.id)
    .maybeSingle();
  if (!state || !state.opened_at) {
    return NextResponse.json(
      { error: "아직 시작되지 않은 문제입니다" },
      { status: 409 },
    );
  }

  const now = new Date();
  // The deadline is enforced using server time -- the client's clock (used
  // only to render a countdown) is never trusted for this check.
  if (state.closes_at && now.getTime() > new Date(state.closes_at).getTime()) {
    return NextResponse.json(
      { error: "제한 시간이 지났습니다" },
      { status: 409 },
    );
  }

  const { data: answerKey } = await admin
    .from("run_answer_keys")
    .select("correct_option_id")
    .eq("run_question_id", currentQuestion.id)
    .maybeSingle();

  const isCorrect = answerKey?.correct_option_id === selectedOptionId;
  const awardedPoints = isCorrect
    ? computeAwardedPoints(
        now,
        new Date(state.opened_at),
        currentQuestion.time_limit_seconds,
      )
    : 0;

  const { error: insertError } = await admin.from("answers").insert({
    run_id: run.id,
    participant_id: participant.id,
    run_question_id: currentQuestion.id,
    selected_option_id: selectedOptionId,
    submitted_at: now.toISOString(),
    is_correct: isCorrect,
    awarded_points: awardedPoints,
  });
  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json(
        { error: "이미 답변을 제출했습니다" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "답변 제출에 실패했습니다" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, isCorrect, awardedPoints });
}
