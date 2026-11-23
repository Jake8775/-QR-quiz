import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

const PARTICIPANT_COOKIE = "qz_participant";

// Lives under /room/[joinCode]/heartbeat (not /api/room/...) so this
// request path falls within the qz_participant cookie's `path:
// /room/{joinCode}` scope -- a route outside that path prefix never
// receives the cookie at all, which is what caused a silent 401 when this
// previously lived under /api/room/[joinCode]/heartbeat.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ joinCode: string }> },
) {
  const { joinCode } = await params;
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(PARTICIPANT_COOKIE)?.value;
  if (!sessionId) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: room } = await admin
    .from("rooms")
    .select("active_run_id")
    .eq("public_join_code", joinCode)
    .maybeSingle();
  if (!room || !room.active_run_id) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  // The cookie's session id is only ever meaningful in combination with the
  // run it's being checked against -- never trust it alone.
  const { data: participant } = await admin
    .from("participants")
    .select("id")
    .eq("participant_session_id", sessionId)
    .eq("run_id", room.active_run_id)
    .maybeSingle();
  if (!participant) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  await admin
    .from("participants")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", participant.id);

  return NextResponse.json({ ok: true });
}
