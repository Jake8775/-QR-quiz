"use client";

import { useState } from "react";
import { REACTION_EMOJIS } from "@/lib/reactions";

const LOCAL_COOLDOWN_MS = 350;

export function ReactionBar({ joinCode }: { joinCode: string }) {
  const [cooling, setCooling] = useState<Set<string>>(new Set());

  function send(emoji: string) {
    if (cooling.has(emoji)) return;
    setCooling((prev) => new Set(prev).add(emoji));
    setTimeout(() => {
      setCooling((prev) => {
        const next = new Set(prev);
        next.delete(emoji);
        return next;
      });
    }, LOCAL_COOLDOWN_MS);

    fetch(`/room/${joinCode}/react`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emoji }),
    }).catch(() => {
      // Transient network error -- the tap is simply dropped, no retry UI.
    });
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center gap-2 bg-white/80 px-4 py-3 backdrop-blur-sm">
      {REACTION_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => send(emoji)}
          disabled={cooling.has(emoji)}
          className="rounded-full border border-zinc-200 bg-white px-3 py-2 text-2xl shadow-sm transition active:scale-90 disabled:opacity-50"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
