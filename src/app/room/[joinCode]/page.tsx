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
  // GROUP and TEAM both put participants through the group+PIN picker
  // (TEAM's teams are pre-created/CONFIRMED, so there's nothing to author
  // afterward). GROUP and SOLO both route a DRAFTING group into the
  // authoring workspace -- SOLO's own 1-person group is created directly
  // at join time (see joinRoomAction), so no PIN step is needed first.
  // NORMAL has neither flag set, so both branches below stay
  // unreachable for it exactly as before.
  const usesGroupJoinFlow = quiz?.mode === "GROUP" || quiz?.mode === "TEAM";
  const usesWorkspace = quiz?.mode === "GROUP" || quiz?.mode === "SOLO";

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
      if (usesGroupJoinFlow && !participant.group_id) {
        return <GroupJoinFlow joinCode={joinCode} quizTitle={quizTitle} />;
      }
      const group = Array.isArray(participant.groups)
        ? participant.groups[0]
        : participant.groups;
      if (usesWorkspace && group?.status === "DRAFTING") {
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
