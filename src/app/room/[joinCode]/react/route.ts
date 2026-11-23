import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { reactionEmojiSchema } from "@/lib/reactions";

const PARTICIPANT_COOKIE = "qz_participant";
const MIN_INTERVAL_MS = 350;

// Lives under /room/[joinCode]/react (not /api/room/...) -- same cookie
// path-scope requirement as heartbeat/route.ts and answer/route.ts.
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
  const parsed = reactionEmojiSchema.safeParse(body?.emoji);
  if (!parsed.success) {
    return NextResponse.json({ error: "잘못된 요청입니다" }, { status: 400 });
  }
  const emoji = parsed.data;

  const admin = createAdminClient();

  const { data: room } = await admin
    .from("rooms")
    .select("active_run_id")
    .eq("public_join_code", joinCode)
    .maybeSingle();
  if (!room || !room.active_run_id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // The cookie's session id is only ever meaningful in combination with the
  // run it's being checked against -- never trust it alone.
  const { data: participant } = await admin
    .from("participants")
    .select("id, last_reaction_at")
    .eq("participant_session_id", sessionId)
    .eq("run_id", room.active_run_id)
    .maybeSingle();
  if (!participant) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (participant.last_reaction_at) {
    const elapsed = Date.now() - new Date(participant.last_reaction_at).getTime();
    if (elapsed < MIN_INTERVAL_MS) {
      return NextResponse.json(
        { error: "너무 빠르게 보내고 있습니다" },
        { status: 429 },
      );
    }
  }

  const now = new Date().toISOString();

  const { error: insertError } = await admin.from("reactions").insert({
    run_id: room.active_run_id,
    participant_id: participant.id,
    emoji,
  });
  if (insertError) {
    return NextResponse.json(
      { error: "전송에 실패했습니다" },
      { status: 500 },
    );
  }

  await admin
    .from("participants")
    .update({ last_reaction_at: now })
    .eq("id", participant.id);

  return NextResponse.json({ ok: true });
}
