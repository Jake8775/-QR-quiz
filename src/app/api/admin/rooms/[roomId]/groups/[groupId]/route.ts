import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Deletes an empty (0-member) group, pre-game-start only, and only if
// at least 2 groups would remain afterward (spec section 1/6/10).
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ roomId: string; groupId: string }> },
) {
  const { roomId, groupId } = await params;
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
      { error: "게임이 시작된 뒤에는 조를 삭제할 수 없습니다" },
      { status: 409 },
    );
  }

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

  const { count: memberCount } = await admin
    .from("participants")
    .select("id", { count: "exact", head: true })
    .eq("group_id", groupId);
  if ((memberCount ?? 0) > 0) {
    return NextResponse.json(
      { error: "조원이 있는 조는 삭제할 수 없습니다" },
      { status: 409 },
    );
  }

  const { count: totalGroups } = await admin
    .from("groups")
    .select("id", { count: "exact", head: true })
    .eq("run_id", run.id);
  if ((totalGroups ?? 0) <= 2) {
    return NextResponse.json(
      { error: "최소 2개 조는 남아있어야 합니다" },
      { status: 409 },
    );
  }

  const { error: deleteError } = await admin.from("groups").delete().eq("id", groupId);
  if (deleteError) {
    return NextResponse.json({ error: "조 삭제에 실패했습니다" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
