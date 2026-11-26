"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  groupModeSetupSchema,
  type GroupModeSetupInput,
} from "@/lib/validation/groupMode";
import { createGroupModeRoomAction } from "../../group-actions";

export function GroupRoomSetupForm() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [groupCount, setGroupCount] = useState(4);
  const [questionsPerGroup, setQuestionsPerGroup] = useState(3);
  const [timeLimitSeconds, setTimeLimitSeconds] = useState(30);
  const [optionsCount, setOptionsCount] = useState(4);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (saving) return;
    setError(null);

    const input: GroupModeSetupInput = {
      topic,
      groupCount,
      questionsPerGroup,
      timeLimitSeconds,
      optionsCount,
    };
    const clientCheck = groupModeSetupSchema.safeParse(input);
    if (!clientCheck.success) {
      setError(clientCheck.error.issues[0]?.message ?? "입력값을 확인해주세요");
      return;
    }

    setSaving(true);
    const result = await createGroupModeRoomAction(input);
    setSaving(false);

    if (!result.success) {
      setError(result.error);
      return;
    }
    router.push(`/admin/rooms/${result.roomId}`);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-lg font-semibold text-zinc-900">
        조별모드 방 만들기
      </h1>

      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-zinc-700">문제 주제</span>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="예: 우리 팀 소개"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-zinc-700">조 개수</span>
          <input
            type="number"
            min={2}
            max={20}
            value={groupCount}
            onChange={(e) => setGroupCount(Number(e.target.value))}
            className="w-24 rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-zinc-700">조별 문제 수</span>
          <input
            type="number"
            min={1}
            max={50}
            value={questionsPerGroup}
            onChange={(e) => setQuestionsPerGroup(Number(e.target.value))}
            className="w-24 rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-zinc-700">문제당 제한 시간(초)</span>
          <input
            type="number"
            min={5}
            max={300}
            value={timeLimitSeconds}
            onChange={(e) => setTimeLimitSeconds(Number(e.target.value))}
            className="w-24 rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-zinc-700">보기 개수 (몇지선다)</span>
          <input
            type="number"
            min={2}
            max={6}
            value={optionsCount}
            onChange={(e) => setOptionsCount(Number(e.target.value))}
            className="w-24 rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
          />
          <span className="text-xs text-zinc-400">
            모든 참가자가 이 개수로 통일해서 문제를 작성합니다
          </span>
        </label>
      </div>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={saving}
        className="mt-6 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
      >
        {saving ? "생성 중..." : "방 생성"}
      </button>
    </div>
  );
}
