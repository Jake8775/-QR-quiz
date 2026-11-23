import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { NicknameForm } from "./_components/NicknameForm";
import { WaitingRoom } from "./_components/WaitingRoom";

const PARTICIPANT_COOKIE = "qz_participant";

export default async function RoomPage({
  params,
}: {
  params: Promise<{ joinCode: string }>;
}) {
  const { joinCode } = await params;
  const admin = createAdminClient();

  const { data: room } = await admin
    .from("rooms")
    .select("active_run_id, quizzes(title)")
    .eq("public_join_code", joinCode)
    .maybeSingle();

  if (!room || !room.active_run_id) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4">
        <p className="text-sm text-zinc-500">존재하지 않는 방입니다.</p>
      </div>
    );
  }

  const quiz = Array.isArray(room.quizzes) ? room.quizzes[0] : room.quizzes;
  const quizTitle = quiz?.title ?? "";

  const cookieStore = await cookies();
  const sessionId = cookieStore.get(PARTICIPANT_COOKIE)?.value;

  if (sessionId) {
    // A session cookie is only ever meaningful in combination with the
    // run it's checked against -- re-derive the run from the URL's
    // joinCode and cross-check, never trust the cookie value alone.
    const { data: participant } = await admin
      .from("participants")
      .select("nickname")
      .eq("participant_session_id", sessionId)
      .eq("run_id", room.active_run_id)
      .maybeSingle();

    if (participant) {
      return (
        <WaitingRoom
          joinCode={joinCode}
          quizTitle={quizTitle}
          nickname={participant.nickname}
        />
      );
    }
  }

  return <NicknameForm joinCode={joinCode} quizTitle={quizTitle} />;
}
