import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

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
    .select("id, status, current_question_index, state_version")
    .eq("id", room.active_run_id)
    .maybeSingle();
  if (!run) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (run.status !== "LEADERBOARD") {
    return NextResponse.json(
      { error: "지금은 다음 문제로 넘어갈 수 없습니다" },
      { status: 409 },
    );
  }

  const { count: totalQuestions } = await supabase
    .from("run_questions")
    .select("id", { count: "exact", head: true })
    .eq("run_id", run.id);

  const admin = createAdminClient();
  const nextIndex = run.current_question_index + 1;

  if (totalQuestions !== null && nextIndex >= totalQuestions) {
    const { error: finishError } = await admin
      .from("quiz_runs")
      .update({
        status: "FINISHED",
        finished_at: new Date().toISOString(),
        state_version: run.state_version + 1,
      })
      .eq("id", run.id);
    if (finishError) {
      return NextResponse.json(
        { error: "퀴즈 종료에 실패했습니다" },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, finished: true });
  }

  const { data: nextQuestion } = await supabase
    .from("run_questions")
    .select("id, time_limit_seconds")
    .eq("run_id", run.id)
    .eq("order_index", nextIndex)
    .maybeSingle();
  if (!nextQuestion) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const now = new Date();
  const closesAt = new Date(
    now.getTime() + nextQuestion.time_limit_seconds * 1000,
  );

  const { error: stateError } = await admin.from("run_question_states").insert({
    run_id: run.id,
    run_question_id: nextQuestion.id,
    opened_at: now.toISOString(),
    closes_at: closesAt.toISOString(),
  });
  if (stateError) {
    return NextResponse.json(
      { error: "다음 문제 시작에 실패했습니다" },
      { status: 500 },
    );
  }

  const { error: runError } = await admin
    .from("quiz_runs")
    .update({
      status: "QUESTION_OPEN",
      current_question_index: nextIndex,
      state_version: run.state_version + 1,
    })
    .eq("id", run.id);
  if (runError) {
    return NextResponse.json(
      { error: "다음 문제 시작에 실패했습니다" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, finished: false });
}
