"use client";

import { useEffect, useRef, useState } from "react";

type FloatingReaction = {
  id: string;
  emoji: string;
  left: number;
  duration: number;
};

type ReactionsResponse = {
  reactions: { seq: number; emoji: string; nickname: string }[];
  latestSeq: number;
};

export function ReactionOverlay({ roomId }: { roomId: string }) {
  const [floating, setFloating] = useState<FloatingReaction[]>([]);
  // Cursor into the reactions stream -- a ref (not state) because the poll
  // loop reads/writes it every tick without needing a re-render.
  const lastSeqRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const since = lastSeqRef.current ?? 0;
        const res = await fetch(
          `/api/admin/rooms/${roomId}/reactions?since=${since}`,
        );
        if (!res.ok) return;
        const json = (await res.json()) as ReactionsResponse;
        if (cancelled) return;

        // First poll after mount only syncs the cursor -- it never floats
        // a backlog of past reactions all at once.
        const isFirstPoll = lastSeqRef.current === null;
        lastSeqRef.current = json.latestSeq;
        if (isFirstPoll) return;

        if (json.reactions.length > 0) {
          setFloating((prev) => [
            ...prev,
            ...json.reactions.map((r) => ({
              id: `${r.seq}`,
              emoji: r.emoji,
              left: 10 + Math.random() * 80,
              duration: 2.5 + Math.random() * 1.5,
            })),
          ]);
        }
      } catch {
        // Transient network error -- next poll tick will retry.
      }
    }

    poll();
    const interval = setInterval(poll, 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [roomId]);

  function remove(id: string) {
    setFloating((prev) => prev.filter((f) => f.id !== id));
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {floating.map((f) => (
        <span
          key={f.id}
          onAnimationEnd={() => remove(f.id)}
          className="absolute bottom-0 text-5xl"
          style={{
            left: `${f.left}%`,
            animation: `reaction-float ${f.duration}s ease-out forwards`,
          }}
        >
          {f.emoji}
        </span>
      ))}
    </div>
  );
}
