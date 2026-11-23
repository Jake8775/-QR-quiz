import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

const PARTICIPANT_COOKIE = "qz_participant";

// Lives under /room/[joinCode]/state (not /api/room/...) -- same cookie
// path-scope requirement as heartbeat/route.ts.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ joinCode: string }> },
) {
  const { joinCode } = await params;
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(PARTICIPANT_COOKIE)?.value;
  if (!sessionId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

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
    .select("id")
    .eq("participant_session_id", sessionId)
    .eq("run_id", run.id)
    .maybeSingle();
  if (!participant) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (run.status === "LOBBY") {
    return NextResponse.json({ status: "LOBBY" });
  }

  const { data: currentQuestion } = await admin
    .from("run_questions")
    .select("id, question_text, time_limit_seconds")
    .eq("run_id", run.id)
    .eq("order_index", run.current_question_index)
    .maybeSingle();
  if (!currentQuestion) {
    return NextResponse.json({ status: run.status });
  }

  const { data: options } = await admin
    .from("run_options")
    .select("id, option_text, order_index")
    .eq("run_question_id", currentQuestion.id)
    .order("order_index", { ascending: true });

  const { data: myAnswer } = await admin
    .from("answers")
    .select("selected_option_id, is_correct, awarded_points")
    .eq("run_question_id", currentQuestion.id)
    .eq("participant_id", participant.id)
    .maybeSingle();

  if (run.status === "QUESTION_OPEN") {
    const { data: state } = await admin
      .from("run_question_states")
      .select("closes_at")
      .eq("run_id", run.id)
      .eq("run_question_id", currentQuestion.id)
      .maybeSingle();

    return NextResponse.json({
      status: "QUESTION_OPEN",
      question: {
        id: currentQuestion.id,
        text: currentQuestion.question_text,
        options: (options ?? []).map((o) => ({ id: o.id, text: o.option_text })),
        closesAt: state?.closes_at ?? null,
      },
      hasSubmitted: !!myAnswer,
    });
  }

  // LEADERBOARD / FINISHED: reveal the correct option + this round's and
  // overall results.
  const { data: answerKey } = await admin
    .from("run_answer_keys")
    .select("correct_option_id")
    .eq("run_question_id", currentQuestion.id)
    .maybeSingle();

  const leaderboard = await buildLeaderboard(admin, run.id);
  const myRank = leaderboard.findIndex(
    (row) => row.participantId === participant.id,
  );

  return NextResponse.json({
    status: run.status,
    question: {
      id: currentQuestion.id,
      text: currentQuestion.question_text,
      options: (options ?? []).map((o) => ({ id: o.id, text: o.option_text })),
      correctOptionId: answerKey?.correct_option_id ?? null,
    },
    myResult: myAnswer
      ? {
          selectedOptionId: myAnswer.selected_option_id,
          isCorrect: myAnswer.is_correct,
          awardedPoints: myAnswer.awarded_points,
        }
      : null,
    leaderboard,
    myRank: myRank === -1 ? null : myRank + 1,
  });
}

async function buildLeaderboard(
  admin: ReturnType<typeof createAdminClient>,
  runId: string,
) {
  const { data: participants } = await admin
    .from("participants")
    .select("id, nickname")
    .eq("run_id", runId);
  const { data: answers } = await admin
    .from("answers")
    .select("participant_id, awarded_points")
    .eq("run_id", runId);

  const totals = new Map<string, number>();
  for (const p of participants ?? []) totals.set(p.id, 0);
  for (const a of answers ?? []) {
    totals.set(a.participant_id, (totals.get(a.participant_id) ?? 0) + a.awarded_points);
  }

  return (participants ?? [])
    .map((p) => ({
      participantId: p.id,
      nickname: p.nickname,
      totalPoints: totals.get(p.id) ?? 0,
    }))
    .sort((a, b) => b.totalPoints - a.totalPoints);
}
