"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";

export function JoinQr({
  joinUrl,
  size = 380,
}: {
  joinUrl: string;
  size?: number;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — ignore.
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-zinc-200 bg-white p-8">
      <QRCodeSVG value={joinUrl} size={size} />
      <div className="flex items-center gap-3">
        <code className="rounded bg-zinc-100 px-3 py-2 text-lg">{joinUrl}</code>
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-md border border-zinc-300 px-4 py-2 text-base text-zinc-700 hover:bg-zinc-100"
        >
          {copied ? "복사됨" : "복사"}
        </button>
      </div>
    </div>
  );
}
