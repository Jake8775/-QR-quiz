import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

const PARTICIPANT_COOKIE = "qz_participant";
const MAX_PIN_ATTEMPTS = 5;
const LOCKOUT_MS = 60_000;

const joinGroupSchema = z.object({
  groupId: z.string().uuid(),
  pin: z.string().trim().length(4),
});

// Lives under /room/[joinCode]/group/join -- same cookie path-scope
// requirement as every other participant-facing route.
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
  const parsed = joinGroupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "잘못된 요청입니다" }, { status: 400 });
  }
  const { groupId, pin } = parsed.data;

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
    .select("id, status")
    .eq("id", room.active_run_id)
    .maybeSingle();
  if (!run) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Late joins are rejected exactly like normal mode (D2) -- a participant
  // who already joined the room before the game started may still pick a
  // group, but once the run has left LOBBY there is nothing left to pick.
  if (run.status !== "LOBBY") {
    return NextResponse.json(
      { error: "이미 시작된 퀴즈에는 입장할 수 없습니다" },
      { status: 409 },
    );
  }

  const { data: participant } = await admin
    .from("participants")
    .select("id, group_id, pin_attempt_count, pin_locked_until")
    .eq("participant_session_id", sessionId)
    .eq("run_id", run.id)
    .maybeSingle();
  if (!participant) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (participant.group_id) {
    return NextResponse.json(
      { error: "이미 조에 참여했습니다" },
      { status: 409 },
    );
  }

  if (
    participant.pin_locked_until &&
    new Date(participant.pin_locked_until).getTime() > Date.now()
  ) {
    const retryAfterMs =
      new Date(participant.pin_locked_until).getTime() - Date.now();
    return NextResponse.json(
      {
        error: "PIN을 너무 많이 틀렸습니다. 잠시 후 다시 시도해주세요",
        retryAfterMs,
      },
      { status: 429 },
    );
  }

  const { data: group } = await admin
    .from("groups")
    .select("id, pin")
    .eq("id", groupId)
    .eq("run_id", run.id)
    .maybeSingle();
  if (!group) {
    return NextResponse.json({ error: "조를 찾을 수 없습니다" }, { status: 404 });
  }

  if (group.pin !== pin) {
    const nextAttemptCount = participant.pin_attempt_count + 1;
    const lockedOut = nextAttemptCount >= MAX_PIN_ATTEMPTS;
    await admin
      .from("participants")
      .update({
        pin_attempt_count: lockedOut ? 0 : nextAttemptCount,
        pin_locked_until: lockedOut
          ? new Date(Date.now() + LOCKOUT_MS).toISOString()
          : null,
      })
      .eq("id", participant.id);

    if (lockedOut) {
      return NextResponse.json(
        {
          error: "PIN을 너무 많이 틀렸습니다. 잠시 후 다시 시도해주세요",
          retryAfterMs: LOCKOUT_MS,
        },
        { status: 429 },
      );
    }
    return NextResponse.json(
      {
        error: "PIN이 올바르지 않습니다",
        attemptsRemaining: MAX_PIN_ATTEMPTS - nextAttemptCount,
      },
      { status: 403 },
    );
  }

  const { error: updateError } = await admin
    .from("participants")
    .update({ group_id: group.id, pin_attempt_count: 0, pin_locked_until: null })
    .eq("id", participant.id);
  if (updateError) {
    return NextResponse.json(
      { error: "조 입장에 실패했습니다" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
