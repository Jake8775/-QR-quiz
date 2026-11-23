const ITEMS = [
  { icon: "🛡️", label: "ISO 26262" },
  { icon: "⚙️", label: "ISO 21448" },
  { icon: "✅", label: "SOTIF" },
  { icon: "⚠️", label: "HARA" },
  { icon: "🔎", label: "FMEA" },
  { icon: "📋", label: "ASIL" },
];

// Deterministic pseudo-random generator (mulberry32) seeded with a fixed
// constant -- gives scattered, non-grid placement that is stable across
// re-renders (Math.random() would reshuffle tiles on every render).
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TILE_COUNT = 34;
const rand = mulberry32(20262611);

// Scatter tiles across a loose 7x5 cell grid, then jitter each one off its
// cell's center so edges don't line up -- reads as randomly strewn rather
// than tiled, while still spreading evenly across the whole area.
const COLS = 7;
const ROWS = 5;
const TILES = Array.from({ length: TILE_COUNT }, (_, i) => {
  const col = i % COLS;
  const row = Math.floor(i / COLS) % ROWS;
  const cellW = 100 / COLS;
  const cellH = 100 / ROWS;
  const jitterX = (rand() - 0.5) * cellW * 0.7;
  const jitterY = (rand() - 0.5) * cellH * 0.7;

  return {
    ...ITEMS[Math.floor(rand() * ITEMS.length)],
    left: col * cellW + cellW / 2 + jitterX,
    top: row * cellH + cellH / 2 + jitterY,
    rotation: (rand() - 0.5) * 50,
    scale: 0.7 + rand() * 0.7,
    opacity: 0.35 + rand() * 0.45,
  };
});

// Decorative only -- sits behind a solid white content card (see callers),
// so this never competes with readability of the actual question/options.
export function SafetyBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden opacity-20 select-none"
    >
      {TILES.map((t, i) => (
        <div
          key={i}
          className="absolute flex flex-col items-center gap-1 text-zinc-500"
          style={{
            left: `${t.left}%`,
            top: `${t.top}%`,
            transform: `translate(-50%, -50%) rotate(${t.rotation}deg) scale(${t.scale})`,
            opacity: t.opacity,
          }}
        >
          <span className="text-xl sm:text-2xl">{t.icon}</span>
          <span className="text-[10px] font-semibold tracking-wide sm:text-xs">
            {t.label}
          </span>
        </div>
      ))}
    </div>
  );
}
