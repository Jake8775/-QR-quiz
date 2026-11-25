import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { QuizListActions } from "./_components/QuizListActions";
import { GroupModeQuizRowActions } from "./_components/GroupModeQuizRowActions";
import { SafetyBackdrop } from "@/components/SafetyBackdrop";

async function logout() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}

export default async function AdminHomePage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  const { data: quizzes } = await supabase
    .from("quizzes")
    .select("id, title, mode, created_at, updated_at, questions(count), rooms(id)")
    .eq("owner_id", userData.user!.id)
    .order("updated_at", { ascending: false });

  return (
    <div className="relative min-h-screen overflow-hidden">
      <SafetyBackdrop />
      <div className="relative mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm text-zinc-500">로그인됨</p>
          <p className="text-sm font-medium text-zinc-900">
            {userData.user?.email}
          </p>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100"
          >
            로그아웃
          </button>
        </form>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-zinc-900">내 퀴즈</h1>
        <div className="flex gap-2">
          <Link
            href="/admin/quizzes/new"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
          >
            퀴즈 생성
          </Link>
          <Link
            href="/admin/rooms/new-group"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
          >
            조별모드 방 만들기
          </Link>
        </div>
      </div>

      {!quizzes || quizzes.length === 0 ? (
        <p className="text-sm text-zinc-500">아직 만든 퀴즈가 없습니다.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {quizzes.map((quiz) => {
            const roomId = Array.isArray(quiz.rooms) ? quiz.rooms[0]?.id : undefined;
            return (
              <div
                key={quiz.id}
                className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-zinc-900">{quiz.title}</p>
                    {quiz.mode === "GROUP" && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                        조별
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500">
                    {quiz.mode === "GROUP"
                      ? "조원 작성 문제"
                      : `문제 ${quiz.questions?.[0]?.count ?? 0}개`}
                  </p>
                </div>
                {quiz.mode === "GROUP" ? (
                  <GroupModeQuizRowActions quizId={quiz.id} roomId={roomId} />
                ) : (
                  <QuizListActions quizId={quiz.id} />
                )}
              </div>
            );
          })}
        </div>
      )}
      </div>
    </div>
  );
}
