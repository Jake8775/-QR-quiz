import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";

// Shared tail of "open a question" -- used by normal mode's start route
// and group mode's startGroupModeRun (src/lib/groupMode/startRun.ts) so
// there's exactly one implementation of "how a question opens," even
// though there are two callers. Pure extraction, no behavior change from
// what start/route.ts already did inline.
export async function openQuestion(
  admin: ReturnType<typeof createAdminClient>,
  params: {
    runId: string;
    runQuestionId: string;
    timeLimitSeconds: number;
    currentQuestionIndex: number;
    stateVersion: number;
    startedAt?: string;
  },
): Promise<{ error: string } | null> {
  const now = new Date();
  const closesAt = new Date(now.getTime() + params.timeLimitSeconds * 1000);

  const { error: stateError } = await admin.from("run_question_states").insert({
    run_id: params.runId,
    run_question_id: params.runQuestionId,
    opened_at: now.toISOString(),
    closes_at: closesAt.toISOString(),
  });
  if (stateError) {
    return { error: "문제 시작에 실패했습니다" };
  }

  const { error: runError } = await admin
    .from("quiz_runs")
    .update({
      status: "QUESTION_OPEN",
      current_question_index: params.currentQuestionIndex,
      started_at: params.startedAt ?? now.toISOString(),
      state_version: params.stateVersion + 1,
    })
    .eq("id", params.runId);
  if (runError) {
    return { error: "퀴즈 시작에 실패했습니다" };
  }

  return null;
}
