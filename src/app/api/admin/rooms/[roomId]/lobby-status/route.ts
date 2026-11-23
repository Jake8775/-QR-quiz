import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
    .select("id, active_run_id")
    .eq("id", roomId)
    .maybeSingle();
  if (!room || !room.active_run_id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { data: run } = await supabase
    .from("quiz_runs")
    .select("status")
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

  return NextResponse.json({
    participants: participantsWithStatus,
    count: participantsWithStatus.length,
    quizRunStatus: run.status,
  });
}
