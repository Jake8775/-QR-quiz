import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const ONLINE_THRESHOLD_MS = 30_000;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // RLS (owner_all on rooms, owner_select on quiz_runs/participants via the
  // rooms join) already scopes every query below to this user's own rooms,
  // so a non-owner's request simply yields no rows rather than needing a
  // manual ownership check here.
  const { data: room } = await supabase
    .from("rooms")
    .select("id, active_run_id")
    .eq("id", roomId)
    .maybeSingle();
  if (!room || !room.active_run_id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { data: run } = await supabase
    .from("quiz_runs")
    .select("id, status, current_question_index")
    .eq("id", room.active_run_id)
    .maybeSingle();
  if (!run) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { data: participants } = await supabase
    .from("participants")
    .select("id, nickname, joined_at, last_seen_at")
    .eq("run_id", room.active_run_id)
    .order("joined_at", { ascending: true });

  const now = Date.now();
  const participantsWithStatus = (participants ?? []).map((p) => ({
    id: p.id,
    nickname: p.nickname,
    online: now - new Date(p.last_seen_at).getTime() < ONLINE_THRESHOLD_MS,
  }));

  const { count: totalQuestions } = await supabase
    .from("run_questions")
    .select("id", { count: "exact", head: true })
    .eq("run_id", run.id);

  const base = {
    status: run.status,
    currentQuestionIndex: run.current_question_index,
    totalQuestions: totalQuestions ?? 0,
    participants: participantsWithStatus,
    count: participantsWithStatus.length,
  };

  if (run.status === "LOBBY" || run.status === "FINISHED") {
    if (run.status === "FINISHED") {
      const leaderboard = await buildLeaderboard(supabase, run.id);
      return NextResponse.json({ ...base, leaderboard });
    }
    return NextResponse.json(base);
  }

  const { data: currentQuestion } = await supabase
    .from("run_questions")
    .select("id, question_text, time_limit_seconds")
    .eq("run_id", run.id)
    .eq("order_index", run.current_question_index)
    .maybeSingle();
  if (!currentQuestion) {
    return NextResponse.json(base);
  }

  const { data: options } = await supabase
    .from("run_options")
    .select("id, option_text, order_index")
    .eq("run_question_id", currentQuestion.id)
    .order("order_index", { ascending: true });

  const { data: state } = await supabase
    .from("run_question_states")
    .select("opened_at, closes_at, closed_at")
    .eq("run_id", run.id)
    .eq("run_question_id", currentQuestion.id)
    .maybeSingle();

  const { count: submittedCount } = await supabase
    .from("answers")
    .select("id", { count: "exact", head: true })
    .eq("run_question_id", currentQuestion.id);

  if (run.status === "QUESTION_OPEN") {
    return NextResponse.json({
      ...base,
      question: {
        id: currentQuestion.id,
        text: currentQuestion.question_text,
        options: (options ?? []).map((o) => ({
          id: o.id,
          text: o.option_text,
        })),
        closesAt: state?.closes_at ?? null,
      },
      submittedCount: submittedCount ?? 0,
    });
  }

  // run_answer_keys has zero RLS policies for any role, including the
  // owning presenter -- only the service-role client can read it.
  // Ownership of currentQuestion was already proven via the RLS read above.
  const admin = createAdminClient();
  const { data: answerKey } = await admin
    .from("run_answer_keys")
    .select("correct_option_id")
    .eq("run_question_id", currentQuestion.id)
    .maybeSingle();

  const { data: roundAnswers } = await supabase
    .from("answers")
    .select("is_correct")
    .eq("run_question_id", currentQuestion.id);
  const correctCount = (roundAnswers ?? []).filter((a) => a.is_correct).length;

  const leaderboard = await buildLeaderboard(supabase, run.id);

  return NextResponse.json({
    ...base,
    question: {
      id: currentQuestion.id,
      text: currentQuestion.question_text,
      options: (options ?? []).map((o) => ({ id: o.id, text: o.option_text })),
      correctOptionId: answerKey?.correct_option_id ?? null,
    },
    correctCount,
    submittedCount: submittedCount ?? 0,
    leaderboard,
  });
}

async function buildLeaderboard(
  supabase: Awaited<ReturnType<typeof createClient>>,
  runId: string,
) {
  const { data: participants } = await supabase
    .from("participants")
    .select("id, nickname")
    .eq("run_id", runId);
  const { data: answers } = await supabase
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
