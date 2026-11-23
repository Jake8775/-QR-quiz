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

  // RLS (owner_all on rooms/quiz_runs) scopes this to the caller's own
  // rooms, so a non-owner's request simply yields no rows.
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
  const now = new Date();
  const closesAt = new Date(
    now.getTime() + firstQuestion.time_limit_seconds * 1000,
  );

  const { error: stateError } = await admin.from("run_question_states").insert({
    run_id: run.id,
    run_question_id: firstQuestion.id,
    opened_at: now.toISOString(),
    closes_at: closesAt.toISOString(),
  });
  if (stateError) {
    return NextResponse.json(
      { error: "문제 시작에 실패했습니다" },
      { status: 500 },
    );
  }

  const { error: runError } = await admin
    .from("quiz_runs")
    .update({
      status: "QUESTION_OPEN",
      current_question_index: 0,
      started_at: now.toISOString(),
      state_version: run.state_version + 1,
    })
    .eq("id", run.id);
  if (runError) {
    return NextResponse.json(
      { error: "퀴즈 시작에 실패했습니다" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
