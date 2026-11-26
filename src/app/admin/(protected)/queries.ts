import { createClient } from "@/lib/supabase/server";
import type { QuizMode, QuizRunStatus } from "@/types/database.types";

export type RoomSummary = {
  id: string;
  joinCode: string;
  createdAt: string;
  status: QuizRunStatus | null;
  participantCount: number;
  // A room is "reusable" (safe to delete without losing anything) only
  // while it's still LOBBY and nobody has joined yet. Anything past that
  // -- a question has been asked, or a participant is sitting in the
  // lobby -- counts as game history: deleting it is destructive.
  hasActivity: boolean;
};

export type QuizListItem = {
  id: string;
  title: string;
  mode: QuizMode;
  questionCount: number;
  rooms: RoomSummary[];
};

// Every room a quiz has (there is no 1:1 constraint between quizzes and
// rooms -- TEAM/NORMAL quizzes are explicitly reusable across many
// rooms, see createRoomAction/createTeamRoomAction), each with enough
// status info for the list screen to tell "empty, reusable" rooms apart
// from rooms that already have game history.
export async function loadQuizListForOwner(): Promise<QuizListItem[]> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return [];

  // rooms<->quiz_runs has two FKs (quiz_runs.room_id, and
  // rooms.active_run_id pointing back) -- PostgREST can't guess which
  // one to embed through, so the relationship to walk must be named
  // explicitly (quiz_runs_room_id_fkey, i.e. "quiz_runs belonging to
  // this room", not "the run this room currently has active").
  const { data: quizzes } = await supabase
    .from("quizzes")
    .select(
      `id, title, mode, questions(count),
       rooms(id, public_join_code, created_at,
         quiz_runs!quiz_runs_room_id_fkey(status, participants(count)))`,
    )
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false });

  const items = (quizzes ?? []).map((quiz) => {
    const allRooms: RoomSummary[] = (quiz.rooms ?? []).map((room) => {
      // Exactly one quiz_run exists per room in this codebase (run_number
      // is always 1, nothing ever creates a second one for the same
      // room) -- so the embedded array is really just that single run.
      const run = Array.isArray(room.quiz_runs) ? room.quiz_runs[0] : room.quiz_runs;
      const status = run?.status ?? null;
      const participantCount = Array.isArray(run?.participants)
        ? run.participants[0]?.count ?? 0
        : 0;
      return {
        id: room.id,
        joinCode: room.public_join_code,
        createdAt: room.created_at,
        status,
        participantCount,
        hasActivity: status !== "LOBBY" || participantCount > 0,
      };
    });
    // A room nobody has ever opened -- still LOBBY, zero participants --
    // is a throwaway: matching every live quiz tool's own convention,
    // only sessions someone actually joined (or that got played) are
    // worth keeping around. Rooms the presenter is actively sitting in
    // right now aren't lost by this filter since joining is what counts,
    // not reaching QUESTION_OPEN -- so a lobby with people in it stays.
    const rooms = allRooms.filter((r) => r.hasActivity);
    return {
      id: quiz.id,
      title: quiz.title,
      mode: quiz.mode,
      questionCount: quiz.questions?.[0]?.count ?? 0,
      rooms,
    };
  });

  // GROUP/SOLO quizzes are created together with their one room (see
  // createGroupModeRoomAction/createSoloModeRoomAction) -- there's no
  // reuse concept for them (unlike NORMAL/TEAM), so once that room is
  // filtered out above for having no activity, the quiz card itself is
  // just an empty shell and gets dropped too.
  return items.filter((item) => {
    if (item.mode === "GROUP" || item.mode === "SOLO") {
      return item.rooms.length > 0;
    }
    return true;
  });
}
