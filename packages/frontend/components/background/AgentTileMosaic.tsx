'use client';

import { useState, useEffect, useMemo } from 'react';

/**
 * Grid of tiles in a Matrix / post-punk / post-web spirit.
 * Each cell shows a vertical stream of random characters (digital rain)
 * with a sporadic green pulse. No rainbow – monochrome green/black/cyan.
 */
const TILE = '8vmin';
const COLS = 28;
const ROWS = 14;
const DURATION = 72;

// Matrix-style character set: digits, latin, katakana, symbols
const MATRIX_CHARS =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
  'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ' +
  'ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵ' +
  '!@#$%&*+=[]';

const CHARS_PER_COLUMN = 6;
const RAIN_COLUMNS_PER_TILE = 3;

function hashCell(row: number, col: number): number {
  return ((row * 2654435761) ^ (col * 2246822519)) >>> 0;
}

function delayForCell(row: number, col: number): number {
  return (hashCell(row, col) / 4294967296) * DURATION;
}

/** Per-character phase so each character changes at a different tick */
function charPhase(row: number, col: number, colIdx: number, index: number): number {
  return ((hashCell(row, col) + colIdx * 1000 + index * 31) >>> 0) % 97;
}

/** Character for (row, col, index); seed is derived from global tick + per-char phase */
function charFor(row: number, col: number, colIdx: number, index: number, tick: number): string {
  const phase = charPhase(row, col, colIdx, index);
  const seed = Math.floor((tick + phase) / 4);
  const h = (hashCell(row, col) + colIdx * 1000 + index * 31 + seed * 2654435789) >>> 0;
  return MATRIX_CHARS[h % MATRIX_CHARS.length];
}

/** Rain fall duration – big speed range: very fast to very slow */
function rainDurationForCell(row: number, col: number, columnIndex: number): number {
  const base = hashCell(row, col);
  const spread = 0.33 * 4294967296;
  const h = (base + columnIndex * spread) >>> 0;
  const u = h / 4294967296;
  return 3 + u * 10; // 3s – 13s
}

/** Vivid burning white-green neon for lit tiles */
const MATRIX_RGB_DIM = '120, 220, 160';
const MATRIX_RGB_BRIGHT = '200, 255, 220';
const MATRIX_RGB_LEAD = '230, 255, 240';

/** Instagram/Lovable-style gradient: coral → pink → purple → blue (0–1) */
const GRADIENT_STOPS: [number, number, number, number][] = [
  [240, 148, 51, 0],      // #f09433
  [225, 48, 108, 0.33],   // #e1306c
  [131, 58, 180, 0.66],   // #833ab4
  [64, 93, 230, 1],       // #405de6
];

function gradientRgb(t: number): { r: number; g: number; b: number } {
  let i = 0;
  while (i < GRADIENT_STOPS.length - 1 && t > GRADIENT_STOPS[i + 1][3]) i++;
  const [r0, g0, b0, s0] = GRADIENT_STOPS[i];
  const [r1, g1, b1, s1] = GRADIENT_STOPS[Math.min(i + 1, GRADIENT_STOPS.length - 1)];
  const u = s1 > s0 ? (t - s0) / (s1 - s0) : 0;
  return {
    r: Math.round(r0 + (r1 - r0) * u),
    g: Math.round(g0 + (g1 - g0) * u),
    b: Math.round(b0 + (b1 - b0) * u),
  };
}

export default function AgentTileMosaic() {
  const [mounted, setMounted] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 280 + Math.random() * 180);
    return () => clearInterval(interval);
  }, [mounted]);

  const cells = useMemo(() => {
    return Array.from({ length: ROWS }, (_, row) =>
      Array.from({ length: COLS }, (_, col) => {
        const delay = delayForCell(row, col);
        return { row, col, delay };
      })
    );
  }, []);

  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 overflow-visible"
      aria-hidden
    >
      {mounted && (
        <div
          className="grid gap-px overflow-visible"
          style={{
            gridTemplateColumns: `repeat(${COLS}, ${TILE})`,
            gridTemplateRows: `repeat(${ROWS}, ${TILE})`,
          }}
        >
          {cells.flatMap((rowCells) =>
            rowCells.map(({ row, col, delay }) => (
              <div
                key={`${row}-${col}`}
                className="relative overflow-visible rounded-none"
                style={{
                  ['--tile-rgb' as string]: MATRIX_RGB_DIM,
                  ['--tile-rgb-bright' as string]: MATRIX_RGB_BRIGHT,
                  ['--tile-rgb-lead' as string]: MATRIX_RGB_LEAD,
                }}
              >
                {/* Expanding ring pulse – visible ring that grows past the square */}
                <div
                  className="pointer-events-none absolute inset-0 z-0 rounded-full opacity-0"
                  style={{
                    background: `radial-gradient(circle at center, transparent 0%, transparent 25%, rgba(${MATRIX_RGB_BRIGHT}, 0.35) 45%, rgba(${MATRIX_RGB_BRIGHT}, 0.15) 55%, transparent 72%)`,
                    transformOrigin: 'center',
                    animation: `matrix-ripple ${DURATION}s cubic-bezier(0.3, 0, 0.15, 1) infinite`,
                    animationDelay: `${delay}s`,
                  }}
                />
                {/* Glow – outside overflow-hidden so box-shadow can bloom past the square; explicit none when idle */}
                <div
                  className="pointer-events-none absolute inset-0 z-2 rounded-none"
                  style={{
                    boxShadow: 'none',
                    willChange: 'box-shadow',
                    animation: `matrix-tile-glow ${DURATION}s cubic-bezier(0.4, 0, 0.2, 1) infinite`,
                    animationDelay: `${delay}s`,
                    animationFillMode: 'both',
                  }}
                />
                {/* Clipped area: base + rain + lit (no glow here so shadow isn't clipped) */}
                <div className="absolute inset-0 z-5 overflow-hidden rounded-none">
                  {/* Idle = near-black; no green tint so “off” is obvious */}
                  <div
                    className="pointer-events-none absolute inset-0 z-0 rounded-none"
                    style={{
                      background: 'linear-gradient(180deg, #030403 0%, #050706 100%)',
                    }}
                  />
                  {/* Digital rain: 3 columns per tile, brightens in sync with pulse */}
                  <div
                    className="pointer-events-none absolute inset-0 z-10 flex flex-row items-stretch overflow-hidden matrix-rain-container"
                    style={{
                      fontFamily: 'ui-monospace, monospace',
                      animation: `matrix-rain-brighten ${DURATION}s cubic-bezier(0.4, 0, 0.2, 1) infinite, matrix-rain-opacity ${DURATION}s cubic-bezier(0.4, 0, 0.2, 1) infinite`,
                      animationDelay: `${delay}s, ${delay}s`,
                      animationFillMode: 'both, both',
                    }}
                  >
                    {Array.from({ length: RAIN_COLUMNS_PER_TILE }, (_, colIdx) => {
                      const rainDuration = rainDurationForCell(row, col, colIdx);
                      const columnChars = Array.from(
                        { length: CHARS_PER_COLUMN },
                        (_, i) => charFor(row, col, colIdx, i, tick)
                      );
                      const phase = (hashCell(row, col) + colIdx * 0.33 * 4294967296) / 4294967296;
                      return (
                        <div
                          key={colIdx}
                          className="matrix-rain-column min-w-0 flex flex-1 flex-col items-center justify-start"
                          style={{
                            animation: `matrix-rain-fall ${rainDuration}s linear infinite`,
                            animationDelay: `${(phase * rainDuration) % rainDuration}s`,
                          }}
                        >
                          {[...columnChars, ...columnChars].map((c, i) => {
                            const isLead = i % CHARS_PER_COLUMN === 0;
                            const t = col / Math.max(COLS - 1, 1);
                            const { r, g, b } = gradientRgb(t);
                            const opacity = isLead ? 0.62 : 0.38;
                            const glowOpacity = isLead ? 0.55 : 0.35;
                            return (
                              <span
                                key={i}
                                className="matrix-rain-char"
                                style={{
                                  color: `rgba(${r}, ${g}, ${b}, ${opacity})`,
                                  textShadow: `0 0 6px rgba(${r}, ${g}, ${b}, ${glowOpacity}), 0 0 12px rgba(${r}, ${g}, ${b}, ${glowOpacity * 0.5})`,
                                }}
                              >
                                {c}
                              </span>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                  {/* “Lit” fill – max luminosity, retro neon when pulse hits */}
                  <div
                    className="pointer-events-none absolute inset-0 z-5 rounded-none opacity-0 matrix-tile-lit-layer"
                    style={{
                      background: `radial-gradient(ellipse 70% 70% at 50% 50%, rgba(${MATRIX_RGB_LEAD}, 0.98) 0%, rgba(${MATRIX_RGB_BRIGHT}, 0.92) 35%, rgba(${MATRIX_RGB_BRIGHT}, 0.6) 65%, rgba(${MATRIX_RGB_DIM}, 0.25) 100%)`,
                      animation: `matrix-tile-lit ${DURATION}s cubic-bezier(0.4, 0, 0.2, 1) infinite`,
                      animationDelay: `${delay}s`,
                    }}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
