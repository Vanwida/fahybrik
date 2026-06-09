'use client';

// SessionMetaBar — los "tags" del entreno propio dentro del drawer de sesión
// (spec §3a: formato / fase ATR / nivel / grupo como tags opcionales editables
// en el propio drawer; muere el wizard de 6 campos). Render compacto bajo el
// header del SessionDrawer vía `header_extra`.

import type { TemplateFormat } from '@fahybrid/shared/schema/_primitives';
import type { MethodologyGroup } from '@fahybrid/shared/schema/methodology-groups';
import { ATR_PHASE_LABEL, ATR_PHASE_ORDER } from '@/lib/dashboard/constants/atr-phases';
import { formatLabel } from '@/lib/dashboard/constants/week-day-part-presets';
import type { TemplateMeta } from '@/lib/dashboard/programming/template-session';
import { SESSION_LEVEL_LABELS } from './library-items';

const TEMPLATE_FORMATS: TemplateFormat[] = [
  'strength_block',
  'hyrox_sim',
  'intervals',
  'circuit',
  'amrap',
  'emom',
  'for_time',
  'tempo',
];

const SELECT_CLASS =
  'focus-ring w-full rounded-[var(--r-s)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-2 py-1.5 text-xs text-[color:var(--fg)] outline-none focus:border-[color:var(--accent)]';

export function SessionMetaBar({
  meta,
  methodologyGroups,
  onChange,
}: {
  meta: TemplateMeta;
  methodologyGroups: MethodologyGroup[];
  onChange: (patch: Partial<TemplateMeta>) => void;
}) {
  const sortedGroups = [...methodologyGroups].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="grid grid-cols-2 gap-2 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-container-lowest)] px-5 py-3 sm:grid-cols-4">
      <label className="block min-w-0">
        <span className="micro-label">Formato</span>
        <select
          value={meta.format}
          onChange={(e) => onChange({ format: e.target.value as TemplateFormat })}
          className={SELECT_CLASS}
          aria-label="Formato de la sesión"
        >
          {TEMPLATE_FORMATS.map((f) => (
            <option key={f} value={f}>
              {formatLabel(f)}
            </option>
          ))}
        </select>
      </label>

      <label className="block min-w-0">
        <span className="micro-label">Fase ATR</span>
        <select
          value={meta.target_block}
          onChange={(e) =>
            onChange({ target_block: e.target.value as TemplateMeta['target_block'] })
          }
          className={SELECT_CLASS}
          aria-label="Fase ATR de la sesión"
        >
          <option value="any">Sin fase</option>
          {ATR_PHASE_ORDER.map((key) => (
            <option key={key} value={key}>
              {ATR_PHASE_LABEL[key]} ({key})
            </option>
          ))}
        </select>
      </label>

      <label className="block min-w-0">
        <span className="micro-label">Nivel</span>
        <select
          value={meta.target_level ?? ''}
          onChange={(e) =>
            onChange({ target_level: e.target.value ? Number(e.target.value) : null })
          }
          className={SELECT_CLASS}
          aria-label="Nivel de la sesión"
        >
          <option value="">Sin nivel</option>
          {Object.entries(SESSION_LEVEL_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="block min-w-0">
        <span className="micro-label">Grupo</span>
        <select
          value={meta.methodology_group_id ?? ''}
          onChange={(e) =>
            onChange({
              methodology_group_id: e.target.value ? Number(e.target.value) : null,
            })
          }
          className={SELECT_CLASS}
          aria-label="Grupo metodológico de la sesión"
        >
          <option value="">Sin grupo</option>
          {sortedGroups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name_es}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
