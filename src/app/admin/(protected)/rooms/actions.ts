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
