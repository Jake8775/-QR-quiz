import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// CONFIRMED -> SUBMITTED only (presenter wants to edit, then re-confirm
// without rejecting back to the members).
export async function POST(
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
      { error: "게임이 시작된 뒤에는 조 상태를 바꿀 수 없습니다" },
      { status: 409 },
    );
  }

  const { data: group } = await supabase
    .from("groups")
    .select("id, status, status_version")
    .eq("id", groupId)
    .eq("run_id", run.id)
    .maybeSingle();
  if (!group) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (group.status !== "CONFIRMED") {
    return NextResponse.json(
      { error: "확정된 조만 확정 해제할 수 있습니다" },
      { status: 409 },
    );
  }

  const admin = createAdminClient();
  const { data: updated, error: updateError } = await admin
    .from("groups")
    .update({ status: "SUBMITTED", status_version: group.status_version + 1 })
    .eq("id", groupId)
    .eq("status_version", group.status_version)
    .select("id")
    .maybeSingle();
  if (updateError || !updated) {
    return NextResponse.json(
      { error: "다른 요청과 충돌했습니다. 다시 시도해주세요" },
      { status: 409 },
    );
  }

  await admin.from("group_status_history").insert({
    group_id: groupId,
    actor: "PRESENTER",
    from_status: "CONFIRMED",
    to_status: "SUBMITTED",
  });

  return NextResponse.json({ ok: true });
}
