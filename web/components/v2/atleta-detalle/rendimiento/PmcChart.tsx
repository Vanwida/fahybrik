'use client';

// Curva de carga (PMC): fitness (CTL) y fatiga (ATL) en la misma escala (carga
// diaria), y la forma (TSB = fitness − fatiga) aparte, en su propio gráfico
// (otra magnitud: nunca dos ejes en uno). Tinta neutra; la fatiga va a trazos
// para que se distinga sin color. Pasando el ratón: el día y los tres valores.

import { useState } from 'react';
import type { LoadView } from '@/lib/dashboard/v2/ficha-rendimiento';
import { shortDate } from '@/components/v2/shared/format';

const W = 1000;
const H = 150;
const H_TSB = 56;
const PAD = { l: 32, r: 8, t: 8, b: 4 };

function r(n: number): string {
  return String(Math.round(n));
}
function signed(n: number): string {
  const v = Math.round(n);
  return v < 0 ? `−${Math.abs(v)}` : `+${v}`;
}

export function PmcChart({ load }: { load: LoadView }) {
  const [hover, setHover] = useState<number | null>(null);
  const s = load.series;
  if (s.length < 2) return null;
  const maxY = Math.max(1, ...s.map((p) => Math.max(p.ctl, p.atl)));
  const niceMax = Math.ceil(maxY / 10) * 10;
  const x = (i: number) => PAD.l + (i * (W - PAD.l - PAD.r)) / (s.length - 1);
  const y = (v: number) => PAD.t + (1 - v / niceMax) * (H - PAD.t - PAD.b);
  const line = (key: 'ctl' | 'atl') => s.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join('');
  const tsbMax = Math.max(1, ...s.map((p) => Math.abs(p.tsb)));
  const ty = (v: number) => H_TSB / 2 - (v / tsbMax) * (H_TSB / 2 - 2);
  const barW = Math.max(1, (W - PAD.l - PAD.r) / s.length - 1);
  const h = hover != null ? s[hover] : null;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((rel - PAD.l) / (W - PAD.l - PAD.r)) * (s.length - 1));
    setHover(Math.max(0, Math.min(s.length - 1, i)));
  };

  return (
    <figure className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 t-meta text-v2-muted">
        <span className="inline-flex items-center gap-1.5">
          <svg width="16" height="4" aria-hidden>
            <line x1="0" y1="2" x2="16" y2="2" stroke="var(--v2-fg)" strokeWidth="2" />
          </svg>
          Fitness (CTL)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="16" height="4" aria-hidden>
            <line x1="0" y1="2" x2="16" y2="2" stroke="var(--v2-muted)" strokeWidth="2" strokeDasharray="4 3" />
          </svg>
          Fatiga (ATL)
        </span>
        <span className="ml-auto t-tnum text-v2-faint">
          {h ? `${shortDate(h.date)} · fitness ${r(h.ctl)} · fatiga ${r(h.atl)} · forma ${signed(h.tsb)}` : `últimos ${s.length} días`}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full overflow-visible"
        role="img"
        aria-label={`Fitness ${r(load.ctl)} y fatiga ${r(load.atl)} en los últimos ${s.length} días`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(niceMax * f)} y2={y(niceMax * f)} stroke="var(--v2-border)" strokeWidth="1" />
            <text x={PAD.l - 6} y={y(niceMax * f) + 4} textAnchor="end" fontSize="11" fill="var(--v2-faint)">
              {r(niceMax * f)}
            </text>
          </g>
        ))}
        <path d={line('atl')} fill="none" stroke="var(--v2-muted)" strokeWidth="2" strokeDasharray="4 3" strokeLinejoin="round" />
        <path d={line('ctl')} fill="none" stroke="var(--v2-fg)" strokeWidth="2" strokeLinejoin="round" />
        {h && hover != null ? (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="var(--v2-border-strong)" strokeWidth="1" />
            <circle cx={x(hover)} cy={y(h.ctl)} r="4" fill="var(--v2-fg)" stroke="var(--v2-surface)" strokeWidth="2" />
            <circle cx={x(hover)} cy={y(h.atl)} r="4" fill="var(--v2-muted)" stroke="var(--v2-surface)" strokeWidth="2" />
          </g>
        ) : null}
      </svg>
      <div className="flex items-center justify-between t-meta text-v2-muted">
        <span>Forma (TSB = fitness − fatiga)</span>
        <span className="t-tnum text-v2-faint">hoy {signed(load.tsb)}</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H_TSB}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Forma de hoy ${signed(load.tsb)}`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <line x1={PAD.l} x2={W - PAD.r} y1={H_TSB / 2} y2={H_TSB / 2} stroke="var(--v2-border-strong)" strokeWidth="1" />
        {s.map((p, i) => {
          const top = Math.min(ty(p.tsb), H_TSB / 2);
          const height = Math.max(1, Math.abs(ty(p.tsb) - H_TSB / 2));
          return (
            <rect
              key={p.date}
              x={x(i) - barW / 2}
              y={top}
              width={barW}
              height={height}
              rx="1"
              fill={hover === i ? 'var(--v2-fg)' : 'var(--v2-muted)'}
              opacity={hover === i ? 1 : 0.55}
            />
          );
        })}
      </svg>
    </figure>
  );
}
