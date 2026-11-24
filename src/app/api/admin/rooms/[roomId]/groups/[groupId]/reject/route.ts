import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const rejectSchema = z.object({
  groupComment: z.string().trim().min(1, "조 전체 코멘트는 필수입니다").max(1000),
  slotComments: z
    .array(
      z.object({
        slotId: z.string().uuid(),
        comment: z.string().trim().max(500),
      }),
    )
    .optional(),
});

// SUBMITTED -> DRAFTING or CONFIRMED -> DRAFTING. Mandatory group comment
// (spec R4), optional per-slot comments.
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
  const parsed = rejectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다" },
      { status: 400 },
    );
  }
  const { groupComment, slotComments } = parsed.data;

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
  if (group.status !== "SUBMITTED" && group.status !== "CONFIRMED") {
    return NextResponse.json(
      { error: "제출됐거나 확정된 조만 반려할 수 있습니다" },
      { status: 409 },
    );
  }

  const admin = createAdminClient();

  if (slotComments && slotComments.length > 0) {
    // Ownership of each slotId is checked per-write (group_id must match)
    // rather than trusting the client-supplied slotId alone.
    for (const sc of slotComments) {
      await admin
        .from("group_question_slots")
        .update({ presenter_comment: sc.comment || null })
        .eq("id", sc.slotId)
        .eq("group_id", groupId);
    }
  }

  const fromStatus = group.status;
  const { data: updated, error: updateError } = await admin
    .from("groups")
    .update({ status: "DRAFTING", status_version: group.status_version + 1 })
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
    from_status: fromStatus,
    to_status: "DRAFTING",
    comment: groupComment,
  });

  return NextResponse.json({ ok: true });
}
