// Pegatina de series = recorte del recap. Los mismos números, no otra historia.
//
// Card 132, corte 25-ago: el recap enseña la tanda serie a serie; la pegatina
// es ESE recorte (los parciales). Cabe en una esquina. No es un cartel a
// pantalla completa. Sin marca. Sin pegatina del día. Sin Meta.

import type { Recap, RecapBlock } from './recap';

export const STICKER_COLUMNS_FROM = 6;
export const STICKER_ANCHO = 700;
export const STICKER_ALTO_MAX = 700;

export type RecapSplit = {
  index: number;
  duration_s: number | null;
  distance_m: number | null;
  pace_s_per_km: number | null;
  is_best: boolean;
  position: number;
};

export type RecapSeries = {
  label: string;
  pauta: string | null;
  splits: RecapSplit[];
  columns: number;
};

export type RecapLayoutPiece =
  | { form: 'series'; series: RecapSeries }
  | { form: 'block'; block: RecapBlock };

function seriesKey(block: RecapBlock): string | null {
  if (block.kind !== 'run') return null;
  const distance = block.distance_m;
  if (distance == null || !Number.isFinite(distance) || distance <= 0) return null;
  return `run:${Math.round(distance)}`;
}

function pautaDe(distanceM: number | null): string | null {
  if (distanceM == null || distanceM <= 0) return null;
  const metros = Math.round(distanceM);
  if (metros >= 1000 && metros % 1000 === 0) return `${metros / 1000} km`;
  return `${metros} m`;
}

function labelDe(blocks: RecapBlock[]): string {
  const labels = blocks.map((b) => b.label.trim()).filter(Boolean);
  const first = labels[0];
  if (first && labels.every((l) => l === first)) return first;
  return first || 'Series';
}

function splitsDe(blocks: RecapBlock[]): RecapSplit[] {
  const durations = blocks
    .map((b) => b.duration_s)
    .filter((s): s is number => s != null && s > 0);
  const best = durations.length > 2 ? Math.min(...durations) : null;

  return blocks.map((b, i) => ({
    index: i + 1,
    duration_s: b.duration_s,
    distance_m: b.distance_m,
    pace_s_per_km: b.pace_s_per_km,
    is_best: best != null && b.duration_s === best,
    position: b.position,
  }));
}

function seriesDe(blocks: RecapBlock[]): RecapSeries {
  const first = blocks[0];
  const distance = first?.distance_m ?? null;
  const uniform = blocks.every((b) => b.distance_m === distance);
  return {
    label: labelDe(blocks),
    pauta: uniform ? pautaDe(distance) : null,
    splits: splitsDe(blocks),
    columns: blocks.length >= STICKER_COLUMNS_FROM ? 2 : 1,
  };
}

export function projectRecapLayout(recap: Recap): RecapLayoutPiece[] {
  const pieces: RecapLayoutPiece[] = [];
  let i = 0;
  const blocks = recap.blocks;

  while (i < blocks.length) {
    const head = blocks[i]!;
    const key = seriesKey(head);
    if (key == null) {
      pieces.push({ form: 'block', block: head });
      i += 1;
      continue;
    }

    let end = i + 1;
    while (end < blocks.length && seriesKey(blocks[end]!) === key) end += 1;
    const run = blocks.slice(i, end);
    if (run.length >= 2) {
      pieces.push({ form: 'series', series: seriesDe(run) });
    } else {
      pieces.push({ form: 'block', block: head });
    }
    i = end;
  }

  return pieces;
}

export function projectSeriesSticker(recap: Recap): RecapSeries | null {
  const series = projectRecapLayout(recap).find((p) => p.form === 'series');
  return series?.form === 'series' ? series.series : null;
}

export function stickerSplitNumbers(series: RecapSeries): Array<{
  duration_s: number | null;
  pace_s_per_km: number | null;
}> {
  return series.splits.map((s) => ({
    duration_s: s.duration_s,
    pace_s_per_km: s.pace_s_per_km,
  }));
}
