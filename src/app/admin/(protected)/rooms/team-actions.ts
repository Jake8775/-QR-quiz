"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateGroupPin } from "@/lib/groupMode/pin";
import { teamRoomCreateSchema, type TeamRoomCreateInput } from "@/lib/validation/team";
import {
  createRoomAndRun,
  loadQuizSnapshotData,
  writeRunSnapshot,
  type ActionResult,
} from "./room-creation";

// TEAM mode's quiz content (title/questions/options/answer keys) is
// authored through the exact same pipeline as NORMAL mode now
// (QuizEditor + saveQuizAction, see quizzes/new-team/page.tsx) -- a
// presenter saves a TEAM quiz once, then can call this action to create
// as many rooms from it as they like, each with its own team count,
// exactly like NORMAL's createRoomAction. The only TEAM-specific work
// here is creating the teams (already CONFIRMED -- there is nothing for
// members to author or for the presenter to review, so the existing
// LOBBY/start machinery treats them as already approved).
export async function createTeamRoomAction(
  input: TeamRoomCreateInput,
): Promise<ActionResult<{ roomId: string }>> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    return { success: false, error: "로그인이 필요합니다" };
  }

  const parsed = teamRoomCreateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다",
    };
  }
  const { quizId, groupCount } = parsed.data;

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id")
    .eq("id", quizId)
    .eq("owner_id", user.id)
    .eq("mode", "TEAM")
    .maybeSingle();
  if (!quiz) {
    return { success: false, error: "퀴즈를 찾을 수 없습니다" };
  }

  const admin = createAdminClient();
  const snapshotLoad = await loadQuizSnapshotData(supabase, admin, quizId);
  if ("error" in snapshotLoad) {
    return { success: false, error: snapshotLoad.error };
  }

  const created = await createRoomAndRun(supabase, { ownerId: user.id, quizId });
  if ("error" in created) {
    return { success: false, error: created.error };
  }
  const { room, run, joinCode } = created;

  const writeResult = await writeRunSnapshot(admin, run.id, snapshotLoad.data);
  if (writeResult.error) {
    return { success: false, error: writeResult.error };
  }

  // Teams are created CONFIRMED and with zero group_question_slots --
  // there is no member-authored content to review, so this room is
  // start-ready as soon as the presenter likes (GroupModeLobbyDashboard's
  // "모든 조 확정" gate is already satisfied).
  for (let i = 1; i <= groupCount; i++) {
    let pin = "";
    let groupCreated = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      pin = generateGroupPin();
      if (pin === joinCode) continue;
      const { error } = await admin
        .from("groups")
        .insert({ run_id: run.id, name: `${i}조`, pin, status: "CONFIRMED" });
      if (!error) {
        groupCreated = true;
        break;
      }
      if (error.code !== "23505") {
        return { success: false, error: "조 생성에 실패했습니다" };
      }
    }
    if (!groupCreated) {
      return { success: false, error: "조 PIN 생성에 실패했습니다. 다시 시도해주세요" };
    }
  }

  revalidatePath("/admin");
  return { success: true, roomId: room.id };
}
