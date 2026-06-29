// ANALYTICS — public entry. Dispatches a section build + re-exports the
// drill-down builder, period resolver and wire types so the routes import from
// ONE place.

import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import type { AnalyticsSection, ResolvedPeriod, SectionKey } from './core';
import { buildRunningSection } from './running';
import { buildErgoSection } from './ergo';
import { buildStrengthSection } from './strength';
import { buildHyroxSection } from './hyrox';
import { buildRecoverySection } from './recovery';

export const SECTION_KEYS: readonly SectionKey[] = ['running', 'ergo', 'strength', 'hyrox', 'recovery'];

export function isSectionKey(v: string): v is SectionKey {
  return (SECTION_KEYS as readonly string[]).includes(v);
}

export async function buildAnalyticsSection(
  args: { athlete_id: number | bigint; section: SectionKey; period: ResolvedPeriod },
  client: Sql = defaultSql,
): Promise<AnalyticsSection> {
  const a = { athlete_id: args.athlete_id, period: args.period };
  switch (args.section) {
    case 'running':
      return buildRunningSection(a, client);
    case 'ergo':
      return buildErgoSection(a, client);
    case 'strength':
      return buildStrengthSection(a, client);
    case 'hyrox':
      return buildHyroxSection(a, client);
    case 'recovery':
      return buildRecoverySection(a, client);
  }
}

export { buildDrillDown } from './drilldown';
export { resolvePeriod } from './core';
export type {
  AnalyticsSection,
  AnalyticsCard,
  DrillDownResult,
  ResolvedPeriod,
  Availability,
  SectionKey,
} from './core';
