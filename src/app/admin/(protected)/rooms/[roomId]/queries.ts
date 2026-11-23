import { createClient } from "@/lib/supabase/server";

export async function getRoomForPresenter(roomId: string) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data: room } = await supabase
    .from("rooms")
    .select("id, public_join_code, active_run_id, quizzes(title)")
    .eq("id", roomId)
    .maybeSingle();
  if (!room) return null;

  const quiz = Array.isArray(room.quizzes) ? room.quizzes[0] : room.quizzes;

  return {
    id: room.id,
    publicJoinCode: room.public_join_code,
    activeRunId: room.active_run_id,
    quizTitle: quiz?.title ?? "",
  };
}
