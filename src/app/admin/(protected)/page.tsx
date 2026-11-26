import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadQuizListForOwner } from "./queries";
import { QuizListGrid } from "./_components/QuizListGrid";
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

  const quizzes = await loadQuizListForOwner();

  return (
    <div className="relative min-h-screen overflow-hidden">
      <SafetyBackdrop />
      <div className="relative mx-auto max-w-6xl px-4 py-8">
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
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/quizzes/new"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
          >
            개인전
          </Link>
          <Link
            href="/admin/quizzes/new-team"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
          >
            팀전
          </Link>
          <Link
            href="/admin/rooms/new-solo"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
          >
            개인별 출제전
          </Link>
          <Link
            href="/admin/rooms/new-group"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
          >
            조별 출제전
          </Link>
        </div>
      </div>

      <QuizListGrid quizzes={quizzes} />
      </div>
    </div>
  );
}
