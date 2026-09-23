import 'server-only';

// Lectura/escritura de `coaches.level_axis_label` (mig 0223). NULL = defecto
// del producto (`shared/domain/coach/level-axis.ts`). Siempre por coach_id de
// la sesión.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  DEFAULT_LEVEL_AXIS_LABEL,
  effectiveLevelAxisLabel,
  normalizeLevelAxisLabel,
} from '@fahybrid/shared/domain/coach/level-axis';

export interface LevelAxisSetting {
  /** Lo que guardó el coach; null = usa el defecto. */
  level_axis_label: string | null;
  /** Lo que se pinta. */
  effective_label: string;
  default_label: string;
}

function toSetting(stored: string | null): LevelAxisSetting {
  return {
    level_axis_label: stored,
    effective_label: effectiveLevelAxisLabel(stored),
    default_label: DEFAULT_LEVEL_AXIS_LABEL,
  };
}

export async function getLevelAxisSetting(
  coach_id: bigint | number,
  client: Sql = defaultSql,
): Promise<LevelAxisSetting> {
  const rows = await client<Array<{ label: string | null }>>`
    select level_axis_label as label from coaches where id = ${Number(coach_id)} limit 1
  `;
  return toSetting(rows[0]?.label ?? null);
}

export async function setLevelAxisLabel(
  coach_id: bigint | number,
  raw: string | null,
  client: Sql = defaultSql,
): Promise<LevelAxisSetting> {
  const value = normalizeLevelAxisLabel(raw);
  await client`
    update coaches set level_axis_label = ${value}, updated_at = now() where id = ${Number(coach_id)}
  `;
  return toSetting(value);
}
