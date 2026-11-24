import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const moveMemberSchema = z.object({
  participantId: z.string().uuid(),
  toGroupId: z.string().uuid(),
});

// Pre-game-start only (spec section 6/9: presenter may move a member to
// another group before the game starts; participants cannot change
// their own group). `groupId` in the URL is the member's CURRENT group,
// used only to validate the request's own consistency.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ roomId: string; groupId: string }> },
) {
  const { roomId, groupId } = await params;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = moveMemberSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "잘못된 요청입니다" }, { status: 400 });
  }
  const { participantId, toGroupId } = parsed.data;

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
    .select("id, status")
    .eq("id", room.active_run_id)
    .maybeSingle();
  if (!run) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (run.status !== "LOBBY") {
    return NextResponse.json(
      { error: "게임이 시작된 뒤에는 조원을 이동할 수 없습니다" },
      { status: 409 },
    );
  }

  // Both groups must belong to this run -- proven via the RLS-gated
  // client before the admin-client write below.
  const { data: groups } = await supabase
    .from("groups")
    .select("id")
    .eq("run_id", run.id)
    .in("id", [groupId, toGroupId]);
  if (!groups || groups.length !== 2) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: participant } = await admin
    .from("participants")
    .select("id, group_id")
    .eq("id", participantId)
    .eq("run_id", run.id)
    .maybeSingle();
  if (!participant || participant.group_id !== groupId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { error: updateError } = await admin
    .from("participants")
    .update({ group_id: toGroupId })
    .eq("id", participantId);
  if (updateError) {
    return NextResponse.json({ error: "조원 이동에 실패했습니다" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
