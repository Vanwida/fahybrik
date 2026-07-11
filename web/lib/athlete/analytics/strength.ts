// ANALYTICS · Section 3 — FUERZA. Two data sources, both honest:
//   1. athlete_strength_maxes (mig 0076) — the VERSIONED 1RM TESTS (this file).
//   2. set_executions (mig 0088) — the PER-SET WORK actually logged, read via
//      strength-work.ts (volume / progression / adherence / effort).
// Cards, in order:
//   • 1RM por lift            — current 1RM per lift + delta + progression (drill)
//   • volumen / progresión / … — the per-set work half (strength-work.ts)
//   • lifts que mueven tu HYROX — the HYROX-relevant lifts, honest "—" when untested
//
// Honest: an untested lift shows "—" (an invitation to test), never a fake zero;
// an unlogged work half shows a gate, never fabricated volume.

import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  type AnalyticsCard,
  type AnalyticsSection,
  type CardSeriesPoint,
  type ResolvedPeriod,
  card,
  num,
} from './core';
import { buildStrengthWorkCards } from './strength-work';

const MIN_BAR = 0.4;

// HYROX-relevant lifts + their ES label and the station they transfer to. Order
// = display order. Canonical 1RM benchmark slugs (shared/domain/coach/benchmark-slugs).
const LIFTS: ReadonlyArray<{ slug: string; label: string; transfer: string }> = [
  { slug: 'back_squat_1rm', label: 'Sentadilla trasera', transfer: 'sled push / wall balls' },
  { slug: 'deadlift_1rm', label: 'Peso muerto', transfer: 'sled pull / farmer carry' },
  { slug: 'bench_press_1rm', label: 'Press banca', transfer: 'empuje superior' },
  { slug: 'ohp_1rm', label: 'Press militar', transfer: 'wall balls' },
  { slug: 'clean_1rm', label: 'Clean', transfer: 'potencia / sandbag' },
];

interface MaxRow {
  exercise_slug: string;
  one_rm_kg: string;
  version: number;
  recorded_on: string;
}

function kg(v: number): string {
  return Number.isInteger(v) ? `${v}` : v.toFixed(1).replace('.', ',');
}

export async function buildStrengthSection(
  args: { athlete_id: number | bigint; period: ResolvedPeriod },
  client: Sql = defaultSql,
): Promise<AnalyticsSection> {
  const athleteId = Number(args.athlete_id);
  const { period } = args;

  // Full versioned history per lift (asc) — drives current value + delta + trend.
  const rows = await client<MaxRow[]>`
    select exercise_slug, one_rm_kg::text as one_rm_kg, version,
           to_char(recorded_at, 'YYYY-MM-DD') as recorded_on
    from athlete_strength_maxes
    where athlete_id = ${athleteId}
    order by exercise_slug asc, version asc
  `;

  const byLift = new Map<string, MaxRow[]>();
  for (const r of rows) {
    const list = byLift.get(r.exercise_slug) ?? [];
    list.push(r);
    byLift.set(r.exercise_slug, list);
  }

  const cards: AnalyticsCard[] = [];

  // Pick a hero lift: the one with the most history (best progression to show),
  // tie-broken by LIFTS order. Null when the athlete has no maxes at all.
  const tested = LIFTS.filter((l) => (byLift.get(l.slug)?.length ?? 0) > 0);
  const hero = tested.slice().sort((a, b) => (byLift.get(b.slug)!.length - byLift.get(a.slug)!.length))[0] ?? null;

  if (hero) {
    const hist = byLift.get(hero.slug)!;
    const current = num(hist[hist.length - 1]!.one_rm_kg);
    const prev = hist.length >= 2 ? num(hist[hist.length - 2]!.one_rm_kg) : null;
    const delta = prev != null ? current - prev : null;
    const max = Math.max(1, ...hist.map((h) => num(h.one_rm_kg)));
    const series: CardSeriesPoint[] = hist.map((h, i) => ({
      id: `${h.exercise_slug}-v${h.version}`,
      height: Math.max(MIN_BAR, Math.min(1, num(h.one_rm_kg) / max)),
      display: `${kg(num(h.one_rm_kg))} kg`,
      current: i === hist.length - 1,
      label: h.recorded_on,
    }));
    cards.push(
      card({
        id: 'one_rm_hero',
        title_es: `1RM · ${hero.label.toLowerCase()}`,
        availability: 'needs_logging',
        availability_note: hist.length >= 2 ? null : 'Un solo test: registra más para ver la progresión.',
        primary: {
          value: kg(current),
          unit: 'kg',
          side: delta != null ? { value: `${delta >= 0 ? '+' : ''}${kg(delta)}`, label: 'vs test ant.' } : null,
        },
        series,
        drill: { kind: 'strength.lift', params: { slug: hero.slug }, count: hist.length, label_es: `${hist.length} tests · fecha · método` },
      }),
    );
  } else {
    cards.push(
      card({
        id: 'one_rm_hero',
        title_es: '1RM · fuerza',
        availability: 'needs_logging',
        availability_note: 'Registra un test de fuerza (1RM) para empezar tu progresión.',
      }),
    );
  }

  // ── CARDS: the per-set WORK half (volume / progression / adherence / effort) ─
  const work = await buildStrengthWorkCards(client, athleteId, period);
  cards.push(...work.cards);

  // ── CARD: lifts que mueven tu HYROX (honest "—" for untested) ──────────────
  cards.push(
    card({
      id: 'hyrox_lifts',
      title_es: 'Lifts que mueven tu HYROX',
      availability: tested.length ? 'needs_logging' : 'needs_logging',
      rows: LIFTS.map((l) => {
        const hist = byLift.get(l.slug);
        const cur = hist ? num(hist[hist.length - 1]!.one_rm_kg) : null;
        return {
          id: l.slug,
          label: `${l.label} → ${l.transfer}`,
          value: cur != null ? `${kg(cur)} kg` : '—',
          sub: cur == null ? 'sin registrar' : null,
          accent: l.slug === (hero?.slug ?? ''),
          drill: hist ? { kind: 'strength.lift', params: { slug: l.slug }, count: hist.length, label_es: `${hist.length} tests` } : null,
        };
      }),
      meaning_es: 'Vacíos honestos: invitan a testear, no muestran ceros falsos.',
    }),
  );

  // Section-level tag: 'real' once there is logged work OR a tested 1RM; else the
  // honest "needs_logging" so the tab header invites the first entry.
  const availability = work.hasData || rows.length > 0 ? 'real' : 'needs_logging';
  return { section: 'strength', title_es: 'Fuerza', availability, period, cards };
}
