'use client';

import { useState, useEffect } from 'react';

/**
 * Grid of tiles that light up sporadically (random delays, no wave).
 * Renders only after mount to avoid hydration mismatch from animation styles.
 */
const TILE = '8vmin';  // bigger tiles = fewer squares
const COLS = 28;
const ROWS = 14;
const DURATION = 72;

// Random delay per cell so no correlation – sporadic lighting
function delayForCell(row: number, col: number): number {
  const u = ((row * 2654435761) ^ (col * 2246822519)) >>> 0;
  return (u / 4294967296) * DURATION;
}

// Rainbow: red, orange, yellow, green, blue, indigo, violet
const TILE_COLORS = [
  '239, 68, 68',    // red
  '249, 115, 22',   // orange
  '234, 179, 8',    // yellow
  '34, 197, 94',    // green
  '59, 130, 246',   // blue
  '99, 102, 241',   // indigo
  '139, 92, 246',   // violet
] as const;

function hashCell(row: number, col: number): number {
  return ((row * 2654435761) ^ (col * 2246822519)) >>> 0;
}

function colorForCell(row: number, col: number): string {
  return TILE_COLORS[hashCell(row, col) % TILE_COLORS.length];
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
          className="grid gap-px"
          style={{
            gridTemplateColumns: `repeat(${COLS}, ${TILE})`,
            gridTemplateRows: `repeat(${ROWS}, ${TILE})`,
          }}
        >
          {Array.from({ length: ROWS }, (_, row) =>
            Array.from({ length: COLS }, (_, col) => {
              const delay = delayForCell(row, col);
              const rgb = colorForCell(row, col);
              return (
                <div
                  key={`${row}-${col}`}
                  className="relative overflow-visible rounded-none"
                  style={{
                    ['--tile-rgb' as string]: rgb,
                    opacity: 0.03,
                    animation: `tile-pulse ${DURATION}s cubic-bezier(0.4, 0, 0.2, 1) infinite`,
                    animationDelay: `${delay}s`,
                  }}
                >
                  {/* 1. Ripple (below) – expanding gradient, opacity capped below square */}
                  <div
                    className="pointer-events-none absolute inset-0 rounded-full opacity-0"
                    style={{
                      ['--tile-rgb' as string]: rgb,
                      background: `radial-gradient(circle at center, rgba(${rgb}, 0.55) 0%, rgba(${rgb}, 0.28) 30%, rgba(${rgb}, 0.12) 50%, rgba(${rgb}, 0.04) 70%, transparent 85%)`,
                      transformOrigin: 'center',
                      animation: `tile-ripple ${DURATION}s cubic-bezier(0.3, 0, 0.15, 1) infinite`,
                      animationDelay: `${delay}s`,
                    }}
                  />
                  {/* 2. Glow (below square) – box-shadow only, same timing as pulse, never pierces */}
                  <div
                    className="pointer-events-none absolute inset-0 rounded-none"
                    style={{
                      ['--tile-rgb' as string]: rgb,
                      animation: `tile-glow ${DURATION}s cubic-bezier(0.4, 0, 0.2, 1) infinite`,
                      animationDelay: `${delay}s`,
                    }}
                  />
                  {/* 3. Square lights up – gradient “lit from within” neon */}
                  <div
                    className="pointer-events-none absolute inset-0 rounded-none opacity-0"
                    style={{
                      background: `radial-gradient(ellipse 75% 75% at 50% 50%, rgba(${rgb}, 1) 0%, rgba(${rgb}, 0.92) 40%, rgba(${rgb}, 0.75) 100%)`,
                      animation: `tile-lit ${DURATION}s cubic-bezier(0.4, 0, 0.2, 1) infinite`,
                      animationDelay: `${delay}s`,
                    }}
                  />
                  {/* 4. Noise – clean neon when lit */}
                  <div
                    className="pointer-events-none absolute inset-0 rounded-none opacity-0"
                    style={{
                      backgroundImage: NOISE_DATA_URL,
                      animation: `tile-pulse-noise ${DURATION}s cubic-bezier(0.4, 0, 0.2, 1) infinite`,
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
