import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { QuizListActions } from "./_components/QuizListActions";

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
    .select("id, title, created_at, updated_at, questions(count)")
    .eq("owner_id", userData.user!.id)
    .order("updated_at", { ascending: false });

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
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
        <Link
          href="/admin/quizzes/new"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
        >
          퀴즈 생성
        </Link>
      </div>

      {!quizzes || quizzes.length === 0 ? (
        <p className="text-sm text-zinc-500">아직 만든 퀴즈가 없습니다.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {quizzes.map((quiz) => (
            <div
              key={quiz.id}
              className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3"
            >
              <div>
                <p className="font-medium text-zinc-900">{quiz.title}</p>
                <p className="text-xs text-zinc-500">
                  문제 {quiz.questions?.[0]?.count ?? 0}개
                </p>
              </div>
              <QuizListActions quizId={quiz.id} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
