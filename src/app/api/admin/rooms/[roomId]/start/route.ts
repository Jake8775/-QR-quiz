import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { openQuestion } from "@/lib/runEngine/openQuestion";
import {
  startGroupModeRun,
  startSoloModeRun,
  snapshotGroupMembership,
} from "@/lib/groupMode/startRun";

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

  // RLS (owner_all on rooms/quiz_runs) scopes this to the caller's own
  // rooms, so a non-owner's request simply yields no rows.
  const { data: room } = await supabase
    .from("rooms")
    .select("id, active_run_id, quizzes(mode)")
    .eq("id", roomId)
    .maybeSingle();
  if (!room || !room.active_run_id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { data: run } = await supabase
    .from("quiz_runs")
    .select("id, status, state_version")
    .eq("id", room.active_run_id)
    .maybeSingle();
  if (!run) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (run.status !== "LOBBY") {
    return NextResponse.json(
      { error: "퀴즈가 이미 시작되었습니다" },
      { status: 409 },
    );
  }

  const quiz = Array.isArray(room.quizzes) ? room.quizzes[0] : room.quizzes;
  if (quiz?.mode === "GROUP") {
    const result = await startGroupModeRun(supabase, run.id);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true });
  }
  if (quiz?.mode === "SOLO") {
    const result = await startSoloModeRun(supabase, run.id);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true });
  }

  const { data: firstQuestion } = await supabase
    .from("run_questions")
    .select("id, time_limit_seconds")
    .eq("run_id", run.id)
    .order("order_index", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!firstQuestion) {
    return NextResponse.json(
      { error: "문제가 없는 퀴즈입니다" },
      { status: 409 },
    );
  }

  // run_questions/run_question_states only grant the owner SELECT, so the
  // actual state transition must go through the service-role client --
  // ownership was already proven by the RLS reads above.
  const admin = createAdminClient();

  // TEAM mode: run_questions already exist (the presenter authored them
  // directly at room-creation time, like NORMAL) -- no flattening
  // needed, just a one-time membership snapshot so buildGroupScores can
  // compute each team's average once the run finishes. NORMAL mode has
  // no `groups` rows at all, so this is a no-op there.
  if (quiz?.mode === "TEAM") {
    await snapshotGroupMembership(admin, run.id);
  }

  const openError = await openQuestion(admin, {
    runId: run.id,
    runQuestionId: firstQuestion.id,
    timeLimitSeconds: firstQuestion.time_limit_seconds,
    currentQuestionIndex: 0,
    stateVersion: run.state_version,
  });
  if (openError) {
    return NextResponse.json({ error: openError.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
