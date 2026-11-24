import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

const PARTICIPANT_COOKIE = "qz_participant";
const LOCK_TTL_MS = 45_000;

async function resolveParticipantAndSlot(
  joinCode: string,
  slotId: string,
  sessionId: string,
) {
  const admin = createAdminClient();

  const { data: room } = await admin
    .from("rooms")
    .select("active_run_id")
    .eq("public_join_code", joinCode)
    .maybeSingle();
  if (!room || !room.active_run_id) return { error: "not found" as const, status: 404 };

  const { data: participant } = await admin
    .from("participants")
    .select("id, group_id")
    .eq("participant_session_id", sessionId)
    .eq("run_id", room.active_run_id)
    .maybeSingle();
  if (!participant || !participant.group_id) {
    return { error: "not found" as const, status: 404 };
  }

  // The slot must belong to the caller's own group -- never trust the
  // slotId in the URL alone.
  const { data: slot } = await admin
    .from("group_question_slots")
    .select("id, group_id")
    .eq("id", slotId)
    .eq("group_id", participant.group_id)
    .maybeSingle();
  if (!slot) return { error: "not found" as const, status: 404 };

  const { data: group } = await admin
    .from("groups")
    .select("status")
    .eq("id", participant.group_id)
    .maybeSingle();
  if (!group) return { error: "not found" as const, status: 404 };

  return { admin, participant, slot, group };
}

// Lives under /room/[joinCode]/group/slot/[slotId]/lock -- same cookie
// path-scope requirement as every other participant-facing route.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ joinCode: string; slotId: string }> },
) {
  const { joinCode, slotId } = await params;
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(PARTICIPANT_COOKIE)?.value;
  if (!sessionId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const resolved = await resolveParticipantAndSlot(joinCode, slotId, sessionId);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const { admin, participant, group } = resolved;

  if (group.status !== "DRAFTING") {
    return NextResponse.json(
      { error: "지금은 문제를 편집할 수 없습니다" },
      { status: 409 },
    );
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + LOCK_TTL_MS);

  // delete-expired-then-insert-on-conflict: the unique(slot_id) constraint
  // is what makes "exactly one concurrent acquirer succeeds" hold under a
  // race -- two simultaneous requests both run the delete (idempotent, no
  // conflict) then both attempt insert; Postgres serializes the
  // conflicting inserts and only one succeeds.
  await admin
    .from("group_question_locks")
    .delete()
    .eq("slot_id", slotId)
    .lt("expires_at", now.toISOString());

  const { data: inserted, error: insertError } = await admin
    .from("group_question_locks")
    .insert({
      slot_id: slotId,
      holder_participant_id: participant.id,
      acquired_at: now.toISOString(),
      heartbeat_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      lock_version: 1,
    })
    .select("lock_version, expires_at")
    .single();

  if (!insertError && inserted) {
    return NextResponse.json({
      ok: true,
      lockVersion: inserted.lock_version,
      expiresAt: inserted.expires_at,
    });
  }

  // Someone else already holds a live lock -- report who.
  const { data: existingLock } = await admin
    .from("group_question_locks")
    .select("holder_participant_id, expires_at")
    .eq("slot_id", slotId)
    .maybeSingle();
  if (existingLock) {
    const { data: holder } = await admin
      .from("participants")
      .select("nickname")
      .eq("id", existingLock.holder_participant_id)
      .maybeSingle();
    return NextResponse.json(
      {
        error: "다른 조원이 편집 중입니다",
        holderNickname: holder?.nickname ?? null,
        expiresAt: existingLock.expires_at,
      },
      { status: 409 },
    );
  }

  return NextResponse.json({ error: "잠금 획득에 실패했습니다" }, { status: 500 });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ joinCode: string; slotId: string }> },
) {
  const { joinCode, slotId } = await params;
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(PARTICIPANT_COOKIE)?.value;
  if (!sessionId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const resolved = await resolveParticipantAndSlot(joinCode, slotId, sessionId);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const { admin, participant } = resolved;

  await admin
    .from("group_question_locks")
    .delete()
    .eq("slot_id", slotId)
    .eq("holder_participant_id", participant.id);

  return NextResponse.json({ ok: true });
}
