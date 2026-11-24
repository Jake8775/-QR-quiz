import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { NicknameForm } from "./_components/NicknameForm";
import { WaitingRoom } from "./_components/WaitingRoom";
import { GroupJoinFlow } from "./_components/GroupJoinFlow";
import { GroupWorkspace } from "./_components/GroupWorkspace";

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
    .select("active_run_id, quizzes(title, mode)")
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
  const isGroupMode = quiz?.mode === "GROUP";

  const cookieStore = await cookies();
  const sessionId = cookieStore.get(PARTICIPANT_COOKIE)?.value;

  if (sessionId) {
    // A session cookie is only ever meaningful in combination with the
    // run it's checked against -- re-derive the run from the URL's
    // joinCode and cross-check, never trust the cookie value alone.
    const { data: participant } = await admin
      .from("participants")
      .select("nickname, group_id, groups(status)")
      .eq("participant_session_id", sessionId)
      .eq("run_id", room.active_run_id)
      .maybeSingle();

    if (participant) {
      // Group mode inserts two extra steps between nickname join and the
      // waiting room: pick a group + enter its PIN, then write questions
      // in the group workspace until the group is submitted/confirmed.
      // Normal mode never has group_id set (it stays permanently null),
      // so both branches are unreachable for every normal-mode participant.
      if (isGroupMode && !participant.group_id) {
        return <GroupJoinFlow joinCode={joinCode} quizTitle={quizTitle} />;
      }
      const group = Array.isArray(participant.groups)
        ? participant.groups[0]
        : participant.groups;
      if (isGroupMode && group?.status === "DRAFTING") {
        return <GroupWorkspace joinCode={joinCode} />;
      }
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
