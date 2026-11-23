const ITEMS = [
  { icon: "🛡️", label: "ISO 26262" },
  { icon: "⚙️", label: "ISO 21448" },
  { icon: "✅", label: "SOTIF" },
  { icon: "⚠️", label: "HARA" },
  { icon: "🔎", label: "FMEA" },
  { icon: "📋", label: "ASIL" },
];

const ROTATIONS = ["-rotate-6", "rotate-3", "rotate-0", "-rotate-3", "rotate-6"];

const TILES = Array.from({ length: 60 }, (_, i) => ({
  ...ITEMS[i % ITEMS.length],
  rotation: ROTATIONS[i % ROTATIONS.length],
}));

// Decorative only -- sits behind a solid white content card (see callers),
// so this never competes with readability of the actual question/options.
export function SafetyBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden opacity-20 select-none"
    >
      <div className="grid grid-cols-3 gap-4 p-4 sm:grid-cols-5">
        {TILES.map((t, i) => (
          <div
            key={i}
            className={`flex flex-col items-center justify-center gap-1 text-zinc-500 ${t.rotation}`}
          >
            <span className="text-xl sm:text-2xl">{t.icon}</span>
            <span className="text-[10px] font-semibold tracking-wide sm:text-xs">
              {t.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
