"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SafetyBackdrop } from "@/components/SafetyBackdrop";

type Group = { id: string; name: string; memberCount: number };

export function GroupJoinFlow({
  joinCode,
  quizTitle,
}: {
  joinCode: string;
  quizTitle: string;
}) {
  const router = useRouter();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [retryAfterMs, setRetryAfterMs] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/room/${joinCode}/group`);
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setGroups(json.groups ?? []);
      } catch {
        // Transient network error -- the user can retry by re-selecting.
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [joinCode]);

  useEffect(() => {
    if (retryAfterMs === null || retryAfterMs <= 0) return;
    const interval = setInterval(() => {
      setRetryAfterMs((ms) => (ms !== null ? Math.max(0, ms - 1000) : null));
    }, 1000);
    return () => clearInterval(interval);
  }, [retryAfterMs]);

  async function handleSubmitPin(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedGroup || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/room/${joinCode}/group/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: selectedGroup.id, pin }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "입장에 실패했습니다");
        setRetryAfterMs(typeof json.retryAfterMs === "number" ? json.retryAfterMs : null);
        return;
      }
      router.refresh();
    } catch {
      setError("네트워크 오류가 발생했습니다");
    } finally {
      setSubmitting(false);
    }
  }

  const locked = retryAfterMs !== null && retryAfterMs > 0;

  if (!selectedGroup) {
    return (
      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-zinc-50 px-4">
        <SafetyBackdrop />
        <div className="relative w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
          <p className="mb-1 text-sm text-zinc-500">{quizTitle}</p>
          <h1 className="mb-6 text-xl font-semibold text-zinc-900">
            소속 조를 선택해주세요
          </h1>
          {groups === null ? (
            <p className="text-sm text-zinc-400">불러오는 중...</p>
          ) : (
            <div className="flex flex-col gap-2">
              {groups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setSelectedGroup(g)}
                  className="flex items-center justify-between rounded-md border border-zinc-300 px-3 py-2 text-left text-sm hover:bg-zinc-100"
                >
                  <span className="font-medium text-zinc-900">{g.name}</span>
                  <span className="text-zinc-400">{g.memberCount}명</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-zinc-50 px-4">
      <SafetyBackdrop />
      <div className="relative w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
        <p className="mb-1 text-sm text-zinc-500">{quizTitle}</p>
        <h1 className="mb-1 text-xl font-semibold text-zinc-900">
          {selectedGroup.name} PIN 입력
        </h1>
        <button
          type="button"
          onClick={() => {
            setSelectedGroup(null);
            setError(null);
            setRetryAfterMs(null);
          }}
          className="mb-6 text-sm text-zinc-500 underline"
        >
          조 다시 선택
        </button>

        <form onSubmit={handleSubmitPin} className="flex flex-col gap-4">
          <input
            type="text"
            inputMode="numeric"
            required
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="4자리 PIN"
            disabled={locked}
            className="rounded-md border border-zinc-300 px-3 py-2 text-center text-lg tracking-widest outline-none focus:border-zinc-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={submitting || locked || pin.length !== 4}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? "확인 중..." : "입장하기"}
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {locked && retryAfterMs !== null && (
            <p className="text-sm text-zinc-500">
              {Math.ceil(retryAfterMs / 1000)}초 후 다시 시도할 수 있습니다
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
