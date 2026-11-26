"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createRoomAndRun,
  loadQuizSnapshotData,
  writeRunSnapshot,
  type ActionResult,
} from "./room-creation";

export async function createRoomAction(
  quizId: string,
): Promise<ActionResult<{ roomId: string }>> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    return { success: false, error: "로그인이 필요합니다" };
  }

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id")
    .eq("id", quizId)
    .eq("owner_id", user.id)
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
  const { room, run } = created;

  const writeResult = await writeRunSnapshot(admin, run.id, snapshotLoad.data);
  if (writeResult.error) {
    return { success: false, error: writeResult.error };
  }

  revalidatePath("/admin");
  return { success: true, roomId: room.id };
}

// Deletes rooms (not the quiz they belong to) -- every downstream table
// (quiz_runs, run_questions/run_options/run_answer_keys, participants,
// answers, and for GROUP/SOLO: groups and everything under it) is
// `on delete cascade` from `rooms`/`quiz_runs`/`groups`, so deleting the
// `rooms` row is enough to clean up all of a room's game history. `rooms`
// has an owner_all RLS policy, so `.eq("owner_id", user.id)` is both the
// ownership check and the actual scoping of the delete.
export async function deleteRoomsAction(
  roomIds: string[],
): Promise<ActionResult<{ deletedCount: number }>> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    return { success: false, error: "로그인이 필요합니다" };
  }
  if (roomIds.length === 0) {
    return { success: true, deletedCount: 0 };
  }

  const { data: deleted, error } = await supabase
    .from("rooms")
    .delete()
    .in("id", roomIds)
    .eq("owner_id", user.id)
    .select("id");
  if (error) {
    return { success: false, error: "방 삭제에 실패했습니다" };
  }

  revalidatePath("/admin");
  return { success: true, deletedCount: deleted?.length ?? 0 };
}
