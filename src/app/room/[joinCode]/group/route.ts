import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

const PARTICIPANT_COOKIE = "qz_participant";

// Lives under /room/[joinCode]/group (not /api/room/...) -- same cookie
// path-scope requirement as heartbeat/route.ts.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ joinCode: string }> },
) {
  const { joinCode } = await params;
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

  // Group list is intentionally thin -- name + member count only. The PIN
  // is never selected here; groups has zero participant-facing RLS grant
  // for it, and even reading through the admin client we simply never
  // name that column in this query.
  const { data: groups } = await admin
    .from("groups")
    .select("id, name")
    .eq("run_id", room.active_run_id)
    .order("name", { ascending: true });

  const { data: members } = await admin
    .from("participants")
    .select("group_id")
    .eq("run_id", room.active_run_id)
    .not("group_id", "is", null);

  const memberCountByGroupId = new Map<string, number>();
  for (const m of members ?? []) {
    if (!m.group_id) continue;
    memberCountByGroupId.set(m.group_id, (memberCountByGroupId.get(m.group_id) ?? 0) + 1);
  }

  return NextResponse.json({
    groups: (groups ?? []).map((g) => ({
      id: g.id,
      name: g.name,
      memberCount: memberCountByGroupId.get(g.id) ?? 0,
    })),
  });
}
