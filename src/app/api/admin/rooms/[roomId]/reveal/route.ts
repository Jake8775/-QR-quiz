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
  if (run.status !== "QUESTION_OPEN") {
    return NextResponse.json(
      { error: "지금은 결과를 공개할 수 없습니다" },
      { status: 409 },
    );
  }

  const { data: currentQuestion } = await supabase
    .from("run_questions")
    .select("id")
    .eq("run_id", run.id)
    .eq("order_index", run.current_question_index)
    .maybeSingle();
  if (!currentQuestion) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { error: stateError } = await admin
    .from("run_question_states")
    .update({ closed_at: now })
    .eq("run_id", run.id)
    .eq("run_question_id", currentQuestion.id);
  if (stateError) {
    return NextResponse.json(
      { error: "결과 공개에 실패했습니다" },
      { status: 500 },
    );
  }

  const { error: runError } = await admin
    .from("quiz_runs")
    .update({
      status: "LEADERBOARD",
      state_version: run.state_version + 1,
    })
    .eq("id", run.id);
  if (runError) {
    return NextResponse.json(
      { error: "결과 공개에 실패했습니다" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
