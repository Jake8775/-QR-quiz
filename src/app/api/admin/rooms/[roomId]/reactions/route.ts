import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const MAX_REACTIONS_PER_POLL = 50;

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

  const { searchParams } = new URL(request.url);
  const since = Number(searchParams.get("since") ?? "0");

  // RLS (owner_all on rooms) already scopes this to the caller's own rooms.
  const { data: room } = await supabase
    .from("rooms")
    .select("id, active_run_id")
    .eq("id", roomId)
    .maybeSingle();
  if (!room || !room.active_run_id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { data: rows } = await supabase
    .from("reactions")
    .select("seq, emoji, participants(nickname)")
    .eq("run_id", room.active_run_id)
    .gt("seq", Number.isFinite(since) ? since : 0)
    .order("seq", { ascending: true })
    .limit(MAX_REACTIONS_PER_POLL);

  const reactions = (rows ?? []).map((r) => {
    const participant = Array.isArray(r.participants)
      ? r.participants[0]
      : r.participants;
    return {
      seq: r.seq,
      emoji: r.emoji,
      nickname: participant?.nickname ?? "",
    };
  });

  const latestSeq =
    reactions.length > 0
      ? reactions[reactions.length - 1].seq
      : Number.isFinite(since)
        ? since
        : 0;

  return NextResponse.json({ reactions, latestSeq });
}
