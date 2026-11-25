import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { memberNicknames } from "@/lib/groupMode/slotDraft";
import { buildGroupAwareLeaderboard, buildGroupScores } from "@/lib/groupMode/leaderboard";

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
    .select("id, active_run_id, quizzes(mode)")
    .eq("id", roomId)
    .maybeSingle();
  if (!room || !room.active_run_id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const quiz = Array.isArray(room.quizzes) ? room.quizzes[0] : room.quizzes;
  const mode = quiz?.mode ?? "NORMAL";

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
    mode,
    currentQuestionIndex: run.current_question_index,
    totalQuestions: totalQuestions ?? 0,
    participants: participantsWithStatus,
    count: participantsWithStatus.length,
  };

  // GROUP/SOLO both need the per-group-excluded answeredQuestions count
  // (R2 -- a participant never answers their own group's/their own
  // questions). TEAM needs the group-average scores but not that
  // correction, since every team participant answers every question.
  const usesGroupAwareLeaderboard = mode === "GROUP" || mode === "SOLO";
  const usesGroupScores = mode === "GROUP" || mode === "TEAM";

  if (run.status === "LOBBY" || run.status === "FINISHED") {
    if (run.status === "FINISHED") {
      const leaderboard = usesGroupAwareLeaderboard
        ? await buildGroupAwareLeaderboard(supabase, run.id)
        : await buildLeaderboard(supabase, run.id);
      const groupScores = usesGroupScores ? await buildGroupScores(supabase, run.id) : undefined;
      return NextResponse.json({ ...base, leaderboard, groupScores });
    }
    return NextResponse.json(base);
  }

  const { data: currentQuestion } = await supabase
    .from("run_questions")
    .select("id, question_text, time_limit_seconds, source_group_id")
    .eq("run_id", run.id)
    .eq("order_index", run.current_question_index)
    .maybeSingle();
  if (!currentQuestion) {
    return NextResponse.json(base);
  }

  // Group mode: every progression screen always shows who authored the
  // current question (8-3). source_group_id is null for every
  // normal-mode row, so this stays undefined there.
  let authoringGroup: { name: string; members: string[] } | undefined;
  if (currentQuestion.source_group_id) {
    const { data: authorGroup } = await supabase
      .from("groups")
      .select("name, member_snapshot")
      .eq("id", currentQuestion.source_group_id)
      .maybeSingle();
    if (authorGroup) {
      authoringGroup = {
        name: authorGroup.name,
        members: memberNicknames(authorGroup.member_snapshot),
      };
    }
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
        timeLimitSeconds: currentQuestion.time_limit_seconds,
      },
      submittedCount: submittedCount ?? 0,
      authoringGroup,
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
    .select("selected_option_id, is_correct")
    .eq("run_question_id", currentQuestion.id);
  const correctCount = (roundAnswers ?? []).filter((a) => a.is_correct).length;

  if (run.status === "REVEALED") {
    const counts = new Map<string, number>();
    for (const a of roundAnswers ?? []) {
      counts.set(a.selected_option_id, (counts.get(a.selected_option_id) ?? 0) + 1);
    }

    return NextResponse.json({
      ...base,
      question: {
        id: currentQuestion.id,
        text: currentQuestion.question_text,
        options: (options ?? []).map((o) => ({
          id: o.id,
          text: o.option_text,
          count: counts.get(o.id) ?? 0,
        })),
        correctOptionId: answerKey?.correct_option_id ?? null,
      },
      correctCount,
      submittedCount: submittedCount ?? 0,
      authoringGroup,
    });
  }

  const leaderboard = usesGroupAwareLeaderboard
    ? await buildGroupAwareLeaderboard(supabase, run.id)
    : await buildLeaderboard(supabase, run.id);
  const groupScores = usesGroupScores ? await buildGroupScores(supabase, run.id) : undefined;

  // D3: on a group's LAST question's result screen, announce which
  // group is up next -- this is the only point where "next group" can
  // be shown without touching quiz_runs.status or run timing, since the
  // next run_questions row's source_group_id is already knowable here by
  // just reading ahead one order_index.
  let nextAuthoringGroup: { name: string; members: string[] } | undefined;
  if (currentQuestion.source_group_id) {
    const { data: nextQuestion } = await supabase
      .from("run_questions")
      .select("source_group_id")
      .eq("run_id", run.id)
      .eq("order_index", run.current_question_index + 1)
      .maybeSingle();
    if (nextQuestion && nextQuestion.source_group_id !== currentQuestion.source_group_id) {
      const { data: nextGroup } = await supabase
        .from("groups")
        .select("name, member_snapshot")
        .eq("id", nextQuestion.source_group_id)
        .maybeSingle();
      if (nextGroup) {
        nextAuthoringGroup = {
          name: nextGroup.name,
          members: memberNicknames(nextGroup.member_snapshot),
        };
      }
    }
  }

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
    groupScores,
    authoringGroup,
    nextAuthoringGroup,
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
    .select("participant_id, awarded_points, is_correct")
    .eq("run_id", runId);
  const { count: answeredQuestions } = await supabase
    .from("run_question_states")
    .select("id", { count: "exact", head: true })
    .eq("run_id", runId)
    .not("closed_at", "is", null);

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
    .map((p) => ({
      participantId: p.id,
      nickname: p.nickname,
      totalPoints: totals.get(p.id) ?? 0,
      correctCount: correctCounts.get(p.id) ?? 0,
      answeredQuestions: answeredQuestions ?? 0,
    }))
    .sort((a, b) => b.totalPoints - a.totalPoints);
}
