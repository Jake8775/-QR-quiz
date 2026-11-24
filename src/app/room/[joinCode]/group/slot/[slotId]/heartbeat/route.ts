import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

const PARTICIPANT_COOKIE = "qz_participant";
const LOCK_TTL_MS = 45_000;

// Lives under /room/[joinCode]/group/slot/[slotId]/heartbeat -- same cookie
// path-scope requirement as every other participant-facing route. Refreshes
// a held lock's TTL every 15s (client-side interval), matching the
// existing participant heartbeat/route.ts's cadence and pattern.
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

  const admin = createAdminClient();

  const { data: room } = await admin
    .from("rooms")
    .select("active_run_id")
    .eq("public_join_code", joinCode)
    .maybeSingle();
  if (!room || !room.active_run_id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { data: participant } = await admin
    .from("participants")
    .select("id")
    .eq("participant_session_id", sessionId)
    .eq("run_id", room.active_run_id)
    .maybeSingle();
  if (!participant) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const now = new Date();
  const { data: updated, error } = await admin
    .from("group_question_locks")
    .update({
      heartbeat_at: now.toISOString(),
      expires_at: new Date(now.getTime() + LOCK_TTL_MS).toISOString(),
    })
    .eq("slot_id", slotId)
    .eq("holder_participant_id", participant.id)
    .gte("expires_at", now.toISOString())
    .select("lock_version, expires_at")
    .maybeSingle();

  if (error || !updated) {
    // Lock already expired or was stolen/force-released -- the client
    // must re-acquire. This is purely informational; the editor's
    // in-progress text is never cleared based on this response.
    return NextResponse.json({ error: "잠금이 만료되었습니다" }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    lockVersion: updated.lock_version,
    expiresAt: updated.expires_at,
  });
}
