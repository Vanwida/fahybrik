import { z } from 'zod';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { buildAnalyticsSection, isSectionKey, resolvePeriod } from '@/lib/athlete/analytics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/athlete/analytics/sections/[section]?period=7d|month|year|custom&from=&to=
//
// One ANALYTICS section (running | ergo | strength | hyrox | recovery) for the
// authenticated athlete, windowed by PERIOD. Every aggregate carries an honesty
// tag (availability) and, when tappable, a DrillRef whose `count` is the real
// number of source rows — pass that DrillRef to /analytics/drilldown to open the
// list. Snake_case (iOS Codable contract). Honest nulls everywhere: a metric we
// can't measure yet is null with its tag, never a fabricated number.
const periodSchema = z.enum(['7d', 'month', 'year', 'custom']);
const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
// Ergo-only scope: which erg the section is built for (default 'row'). Ignored by
// every other section.
const ergSchema = z.enum(['row', 'ski', 'bike']);

export async function GET(request: Request, ctx: { params: Promise<{ section: string }> }) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  const { section } = await ctx.params;
  if (!isSectionKey(section)) {
    return jsonError('not_found', 'Sección de analíticas desconocida', 404);
  }

  const url = new URL(request.url);
  const periodKey = periodSchema.safeParse(url.searchParams.get('period') ?? 'month');
  if (!periodKey.success) {
    return jsonError('bad_request', 'period inválido (7d|month|year|custom)', 400);
  }
  let from: string | null = null;
  let to: string | null = null;
  if (periodKey.data === 'custom') {
    const f = daySchema.safeParse(url.searchParams.get('from'));
    const t = daySchema.safeParse(url.searchParams.get('to'));
    if (!f.success || !t.success) {
      return jsonError('bad_request', 'custom requiere from/to en formato YYYY-MM-DD', 400);
    }
    if (f.data > t.data) {
      return jsonError('bad_request', 'from debe ser <= to', 400);
    }
    from = f.data;
    to = t.data;
  }

  const period = resolvePeriod({ key: periodKey.data, from, to });
  // Optional erg scope for the ergo section (default 'row' inside the builder).
  const ergParsed = ergSchema.safeParse(url.searchParams.get('erg'));
  const erg = ergParsed.success ? ergParsed.data : undefined;
  const result = await buildAnalyticsSection({ athlete_id: auth.athlete_id, section, period, erg });
  return jsonOk(result);
}
