import type { TemplateSegmentPreview } from '@/lib/dashboard/templates/types';

function readNumber(params: Record<string, unknown>, key: string): number | null {
  const v = params[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function formatSegmentLine(segment: TemplateSegmentPreview): string {
  const p = segment.params_json;
  const sets = readNumber(p, 'sets');
  const reps = readNumber(p, 'reps');
  const distance = readNumber(p, 'distance_meters');
  const pct = readNumber(p, 'load_pct');

  const parts: string[] = [];
  if (sets != null && reps != null) parts.push(`${sets}×${reps}`);
  else if (sets != null) parts.push(`${sets} series`);
  if (distance != null) parts.push(`${distance}m`);
  if (pct != null) parts.push(`@${pct}%`);

  return parts.length > 0 ? parts.join(' ') : segment.exercise_name;
}

export function formatTemplatePreview(segments: TemplateSegmentPreview[], max = 2): string[] {
  return segments.slice(0, max).map((s) => {
    const line = formatSegmentLine(s);
    return line === s.exercise_name ? s.exercise_name : `${s.exercise_name} · ${line}`;
  });
}
