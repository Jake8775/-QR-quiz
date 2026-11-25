import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-zinc-50 px-4">
      <h1 className="text-2xl font-semibold text-zinc-900">QR 퀴즈</h1>
      <Link
        href="/admin/login"
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
      >
        진행자 로그인
      </Link>
    </div>
  );
}
