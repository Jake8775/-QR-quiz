import "server-only";
import { createClient } from "@/lib/supabase/server";
import { generateJoinCode } from "@/lib/joinCode";

export type ActionResult<T = undefined> =
  | ({ success: true } & (T extends undefined ? object : T))
  | { success: false; error: string };

// Shared by every mode's room-creation action (NORMAL/GROUP/TEAM/SOLO):
// generate a join code (retrying on collision), insert the room, insert
// its first quiz_run (always run_number 1, status LOBBY), then point
// rooms.active_run_id at it. What differs per mode -- authoring content,
// group/slot creation -- stays in each mode's own action file; this is
// only the part that was identical across all of them.
export async function createRoomAndRun(
  supabase: Awaited<ReturnType<typeof createClient>>,
  params: { ownerId: string; quizId: string },
): Promise<
  | { room: { id: string }; run: { id: string }; joinCode: string }
  | { error: string }
> {
  let joinCode = "";
  let room: { id: string } | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    joinCode = generateJoinCode();
    const { data: insertedRoom, error } = await supabase
      .from("rooms")
      .insert({ owner_id: params.ownerId, quiz_id: params.quizId, public_join_code: joinCode })
      .select("id")
      .single();
    if (!error && insertedRoom) {
      room = insertedRoom;
      break;
    }
    if (error && error.code !== "23505") {
      return { error: "방 생성에 실패했습니다" };
    }
  }
  if (!room) {
    return { error: "방 코드 생성에 실패했습니다. 다시 시도해주세요" };
  }

  const { data: run, error: runError } = await supabase
    .from("quiz_runs")
    .insert({ room_id: room.id, run_number: 1, status: "LOBBY" })
    .select("id")
    .single();
  if (runError || !run) {
    return { error: "회차 생성에 실패했습니다" };
  }

  const { error: updateRoomError } = await supabase
    .from("rooms")
    .update({ active_run_id: run.id })
    .eq("id", room.id);
  if (updateRoomError) {
    return { error: "방 활성 회차 설정에 실패했습니다" };
  }

  return { room, run, joinCode };
}
