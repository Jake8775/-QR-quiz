"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";

export function JoinQr({ joinUrl }: { joinUrl: string }) {
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
    <div className="flex flex-col items-center gap-3 rounded-lg border border-zinc-200 bg-white p-6">
      <QRCodeSVG value={joinUrl} size={220} />
      <div className="flex items-center gap-2">
        <code className="rounded bg-zinc-100 px-2 py-1 text-sm">{joinUrl}</code>
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-md border border-zinc-300 px-3 py-1 text-sm text-zinc-700 hover:bg-zinc-100"
        >
          {copied ? "복사됨" : "복사"}
        </button>
      </div>
    </div>
  );
}
