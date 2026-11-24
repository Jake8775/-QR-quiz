import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Pre-game-start only (spec section 6: "게임 시작 전에만 가능한 기능: 잠금
// 강제 해제...").
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ roomId: string; groupId: string; slotId: string }> },
) {
  const { roomId, groupId, slotId } = await params;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

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
      { error: "게임이 시작된 뒤에는 잠금을 해제할 수 없습니다" },
      { status: 409 },
    );
  }

  // Ownership of groupId (and transitively slotId) is proven via this
  // RLS-gated read before any admin-client write below.
  const { data: group } = await supabase
    .from("groups")
    .select("id")
    .eq("id", groupId)
    .eq("run_id", run.id)
    .maybeSingle();
  if (!group) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: slot } = await admin
    .from("group_question_slots")
    .select("id")
    .eq("id", slotId)
    .eq("group_id", groupId)
    .maybeSingle();
  if (!slot) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  await admin.from("group_question_locks").delete().eq("slot_id", slotId);

  return NextResponse.json({ ok: true });
}
