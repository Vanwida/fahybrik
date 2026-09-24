// Datos inventados para la referencia del sistema (/ajustes/sistema). Deterministas
// (misma semilla → mismas filas), sin nombres reales ni de ningún club.

import type { StatusTone } from '@/components/v2/ui';

export interface DemoAthlete {
  id: string;
  name: string;
  level: string;
  status: { tone: StatusTone; label: string };
  week: 'visible' | 'oculta' | 'sin_plan';
  readiness: number | null;
  trend: (number | null)[];
  adherence: number | null;
  last: string;
  lastDays: number | null;
  next: string;
  raceDays: number | null;
}

const FIRST = ['Lucía', 'Pau', 'Irene', 'Jordi', 'Nerea', 'Àlex', 'Marta', 'Óscar', 'Carla', 'Iker', 'Laia', 'Rubén', 'Aina', 'Hugo', 'Noa', 'Dani', 'Elena', 'Gerard', 'Sara', 'Unai'];
const LAST = ['Ferrer', 'Soler', 'Vidal', 'Castro', 'Ruiz', 'Puig', 'Navarro', 'Serra', 'Molina', 'Roca', 'Gil', 'Prats', 'Méndez', 'Costa', 'Vega', 'Sanz'];
const STATUS: { tone: StatusTone; label: string }[] = [
  { tone: 'ok', label: 'Al día' },
  { tone: 'ok', label: 'Al día' },
  { tone: 'ok', label: 'Al día' },
  { tone: 'ok', label: 'Al día' },
  { tone: 'warn', label: '2 sin hacer (7 d)' },
  { tone: 'danger', label: 'Readiness baja · 3 d' },
  { tone: 'info', label: 'Por responder · 19 h' },
  { tone: 'warn', label: 'Semana oculta' },
  { tone: 'neutral', label: 'Pausado' },
  { tone: 'info', label: 'Alta pendiente' },
];
const NEXT = ['jue · Z2 45′', 'jue · Fuerza A', 'vie · Series 400', 'vie · WOD', 'sáb · Umbral', '—'];

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export function demoAthletes(n = 320): DemoAthlete[] {
  const r = rng(7);
  return Array.from({ length: n }, (_, i) => {
    const status = STATUS[Math.floor(r() * STATUS.length)];
    const base = 50 + Math.round(r() * 35);
    const noData = r() < 0.08;
    const trend = Array.from({ length: 14 }, (_, d) =>
      noData || r() < 0.06 ? null : Math.max(20, Math.min(98, base + Math.round((r() - 0.5) * 18) - (status.tone === 'danger' ? d * 2 : 0))),
    );
    const readiness = noData ? null : (trend.filter((v) => v != null).at(-1) ?? null);
    const lastDays = r() < 0.1 ? null : Math.floor(r() * 6);
    const raceDays = r() < 0.35 ? 5 + Math.floor(r() * 80) : null;
    return {
      id: `a${i + 1}`,
      name: `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`,
      level: `N${1 + Math.floor(r() * 5)}`,
      status,
      week: status.label === 'Semana oculta' ? 'oculta' : status.label === 'Alta pendiente' ? 'sin_plan' : 'visible',
      readiness,
      trend,
      adherence: status.label === 'Alta pendiente' ? null : Math.round((0.4 + r() * 0.6) * 100),
      last: lastDays == null ? '—' : lastDays === 0 ? 'hoy' : lastDays === 1 ? 'ayer' : `hace ${lastDays} d`,
      lastDays,
      next: NEXT[Math.floor(r() * NEXT.length)],
      raceDays,
    };
  });
}

/** Rango de un status para ordenar «peor primero». */
export function statusRank(tone: StatusTone): number {
  return { danger: 0, warn: 1, info: 2, neutral: 3, ok: 4 }[tone];
}
