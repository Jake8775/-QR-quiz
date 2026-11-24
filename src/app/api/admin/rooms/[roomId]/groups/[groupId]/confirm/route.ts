import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// SUBMITTED -> CONFIRMED only. Version-checked to serialize rapid-click
// races (spec section 5/10).
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

  // RLS (owner_all on rooms, owner_select on groups via the rooms join)
  // scopes this to the caller's own rooms -- a non-owner's request
  // simply yields no rows.
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
  if (group.status !== "SUBMITTED") {
    return NextResponse.json(
      { error: "제출된 조만 확정할 수 있습니다" },
      { status: 409 },
    );
  }

  // groups' owner policy is owner_select only (not owner_all), so the
  // actual status write goes through the admin client -- ownership was
  // already proven by the RLS-gated reads above.
  const admin = createAdminClient();
  const { data: updated, error: updateError } = await admin
    .from("groups")
    .update({ status: "CONFIRMED", status_version: group.status_version + 1 })
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
    from_status: "SUBMITTED",
    to_status: "CONFIRMED",
  });

  return NextResponse.json({ ok: true });
}
