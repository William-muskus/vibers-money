'use client';

import { useState, useEffect } from 'react';

/**
 * Grid of tiles that light up sporadically. Delays are randomised by (row,col)
 * so there is zero correlation along any direction – no motion, no wave.
 * Renders only after mount to avoid hydration mismatch from animation styles.
 */
const COLS = 32;
const ROWS = 20;
const DURATION = 8; // longer cycle so brief pulse ≈ 5% of tiles lit at once

// 2D hash: XOR of row-hash and col-hash so no correlation along rows or columns – no motion
function delayForCell(row: number, col: number): number {
  const u = ((row * 2654435761) ^ (col * 2246822519)) >>> 0;
  return (u / 4294967296) * DURATION;
}

const NOISE_DATA_URL =
  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

export default function AgentTileMosaic() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      aria-hidden
    >
      {mounted && (
        <div
          className="grid h-full w-full gap-px"
          style={{
            gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${ROWS}, minmax(0, 1fr))`,
          }}
        >
          {Array.from({ length: ROWS }, (_, row) =>
            Array.from({ length: COLS }, (_, col) => {
              const delay = delayForCell(row, col);
              return (
                <div
                  key={`${row}-${col}`}
                  className="relative rounded-[2px] bg-white/4 opacity-[0.06]"
                  style={{
                    animation: `tile-pulse ${DURATION}s ease-in-out infinite`,
                    animationDelay: `${delay}s`,
                  }}
                >
                  <div
                    className="pointer-events-none absolute inset-0 rounded-[2px] opacity-0"
                    style={{
                      backgroundImage: NOISE_DATA_URL,
                      animation: `tile-pulse-noise ${DURATION}s ease-in-out infinite`,
                      animationDelay: `${delay}s`,
                    }}
                  />
                </div>
              );
            }),
          )}
        </div>
      )}
    </div>
  );
}
