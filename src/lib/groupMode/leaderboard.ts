import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { MemberSnapshotEntry } from "@/lib/groupMode/slotDraft";

export type GroupAwareLeaderboardRow = {
  participantId: string;
  nickname: string;
  totalPoints: number;
  correctCount: number;
  answeredQuestions: number;
};

export type GroupScoreRow = {
  groupId: string;
  name: string;
  averageScore: number;
  members: { nickname: string; totalPoints: number }[];
};

// R2: a participant's actual scoring-target question count is every OTHER
// group's K questions, not the run's total closed-question count (which is
// what the normal-mode buildLeaderboard in run-status/route.ts reports,
// correctly, since there's only one "group" there). Excluding each
// participant's own source_group_id from the closed-question count gives
// exactly (groupCount-1)*K once the run finishes, and the right
// in-progress fraction before that.
export async function buildGroupAwareLeaderboard(
  supabase: Awaited<ReturnType<typeof createClient>>,
  runId: string,
): Promise<GroupAwareLeaderboardRow[]> {
  const { data: participants } = await supabase
    .from("participants")
    .select("id, nickname, group_id")
    .eq("run_id", runId);
  const { data: answers } = await supabase
    .from("answers")
    .select("participant_id, awarded_points, is_correct")
    .eq("run_id", runId);
  const { data: runQuestions } = await supabase
    .from("run_questions")
    .select("id, source_group_id")
    .eq("run_id", runId);
  const { data: closedStates } = await supabase
    .from("run_question_states")
    .select("run_question_id")
    .eq("run_id", runId)
    .not("closed_at", "is", null);

  const sourceGroupByQuestionId = new Map<string, string | null>();
  for (const q of runQuestions ?? []) {
    sourceGroupByQuestionId.set(q.id, q.source_group_id);
  }
  const closedQuestionIds = (closedStates ?? []).map((s) => s.run_question_id);

  const totals = new Map<string, number>();
  const correctCounts = new Map<string, number>();
  for (const p of participants ?? []) {
    totals.set(p.id, 0);
    correctCounts.set(p.id, 0);
  }
  for (const a of answers ?? []) {
    totals.set(a.participant_id, (totals.get(a.participant_id) ?? 0) + a.awarded_points);
    if (a.is_correct) {
      correctCounts.set(a.participant_id, (correctCounts.get(a.participant_id) ?? 0) + 1);
    }
  }

  return (participants ?? [])
    .map((p) => {
      let answeredQuestions = 0;
      for (const qid of closedQuestionIds) {
        if (sourceGroupByQuestionId.get(qid) !== p.group_id) answeredQuestions++;
      }
      return {
        participantId: p.id,
        nickname: p.nickname,
        totalPoints: totals.get(p.id) ?? 0,
        correctCount: correctCounts.get(p.id) ?? 0,
        answeredQuestions,
      };
    })
    .sort((a, b) => b.totalPoints - a.totalPoints);
}

// R6: a group's score is the average of its game-start member snapshot's
// individual totals -- fixed membership, so a member disconnecting
// mid-game can't shrink the average's denominator.
export async function buildGroupScores(
  supabase: Awaited<ReturnType<typeof createClient>>,
  runId: string,
): Promise<GroupScoreRow[]> {
  const { data: groups } = await supabase
    .from("groups")
    .select("id, name, member_snapshot, created_at")
    .eq("run_id", runId)
    .order("created_at", { ascending: true });
  const { data: answers } = await supabase
    .from("answers")
    .select("participant_id, awarded_points")
    .eq("run_id", runId);

  const totals = new Map<string, number>();
  for (const a of answers ?? []) {
    totals.set(a.participant_id, (totals.get(a.participant_id) ?? 0) + a.awarded_points);
  }

  return (groups ?? [])
    .map((g) => {
      const snapshot = (g.member_snapshot ?? []) as MemberSnapshotEntry[];
      const members = snapshot.map((m) => ({
        nickname: m.nickname,
        totalPoints: totals.get(m.participantId) ?? 0,
      }));
      const averageScore =
        members.length > 0
          ? members.reduce((sum, m) => sum + m.totalPoints, 0) / members.length
          : 0;
      return { groupId: g.id, name: g.name, averageScore, members };
    })
    .sort((a, b) => b.averageScore - a.averageScore);
}
