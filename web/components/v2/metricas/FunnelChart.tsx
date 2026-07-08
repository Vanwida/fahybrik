// The funnel column (#20): the six real stages of the ingest funnel with a bar
// per stage (width = share of the cohort), the per-stage conversion from the
// previous stage, and the drop connectors that name where — and how many — people
// leave, including the side-exits (descartados / no-show / se lo piensan).
//
// VISITAS (top of funnel) is now real: cookieless, PII-free web visits (see
// lib/analytics/visits.ts). Two honest states — a number "desde {fecha}" once data
// exists, or a "recogiendo datos desde hoy" placeholder while the table is empty.

import { Panel } from '@/components/v2/atleta-detalle/parts';
import { Pill } from '@/components/v2';
import {
  FUNNEL_STAGE_KEYS,
  type FunnelSnapshot,
  type FunnelStageKey,
  type FunnelConversions,
} from '@/lib/dashboard/coach/metrics';
import { formatCount, formatPct, formatIsoDayShort } from './format';

type Fill = 'base' | 'accent' | 'ok';

const STAGE_META: Record<FunnelStageKey, { name: string; def: string; fill: Fill }> = {
  iniciado: { name: 'Onboarding iniciado', def: 'dejan su email', fill: 'base' },
  completado: { name: 'Onboarding completado', def: 'formulario entero', fill: 'accent' },
  cita: { name: 'Cita reservada', def: 'videollamada agendada', fill: 'accent' },
  llamada: { name: 'Llamada realizada', def: 'parte registrado', fill: 'accent' },
  alta_enviada: { name: 'Alta enviada', def: 'invitación a la app', fill: 'accent' },
  convertido: { name: 'Se dan de alta', def: 'atleta activo en la app', fill: 'ok' },
};

// Conversion shown UNDER each stage count = conversion from the previous stage.
const CONV_KEY: Record<FunnelStageKey, keyof FunnelConversions | null> = {
  iniciado: null,
  completado: 'completado',
  cita: 'cita',
  llamada: 'llamada',
  alta_enviada: 'alta_enviada',
  convertido: 'convertido',
};

type SideExitKey = 'descartados' | 'no_show' | 'pensandoselo';

// Drop connector shown ABOVE each stage (the gap from the previous stage).
const DROP_META: Partial<Record<FunnelStageKey, { reason: string; sideExit?: SideExitKey }>> = {
  completado: { reason: 'no terminan el formulario' },
  cita: { reason: 'no reservan llamada', sideExit: 'descartados' },
  llamada: { reason: 'no se presentan / cancelan', sideExit: 'no_show' },
  alta_enviada: { reason: 'no reciben alta', sideExit: 'pensandoselo' },
  convertido: { reason: 'no canjean la invitación' },
};

const SIDE_EXIT_LABEL: Record<SideExitKey, string> = {
  descartados: 'descartados',
  no_show: 'no-show',
  pensandoselo: 'se lo piensan',
};

const FILL_STYLE: Record<Fill, string> = {
  base: 'linear-gradient(90deg, var(--v2-fg), color-mix(in srgb, var(--v2-fg) 62%, var(--v2-surface-2)))',
  accent:
    'linear-gradient(90deg, var(--v2-accent), color-mix(in srgb, var(--v2-accent) 62%, var(--v2-surface-2)))',
  ok: 'linear-gradient(90deg, var(--v2-ok), color-mix(in srgb, var(--v2-ok) 62%, var(--v2-surface-2)))',
};

const ROW_COLS = 'grid grid-cols-[1fr] gap-2 sm:grid-cols-[minmax(120px,190px)_1fr] sm:gap-4';

function StageRow({
  keyName,
  count,
  base,
  conv,
}: {
  keyName: FunnelStageKey;
  count: number;
  base: number;
  conv: number | null;
}) {
  const meta = STAGE_META[keyName];
  const width = base > 0 ? Math.min(100, (count / base) * 100) : 0;
  return (
    <div className={`${ROW_COLS} items-center py-1`}>
      <div className="flex items-baseline gap-2 sm:flex-col sm:items-start sm:gap-0.5">
        <span className="text-[13.5px] font-semibold leading-tight text-[color:var(--v2-fg)]">
          {meta.name}
        </span>
        <span className="text-[10.5px] text-[color:var(--v2-faint)]">{meta.def}</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="relative h-8 flex-1 overflow-hidden rounded-[var(--v2-r-s)] bg-[color:var(--v2-surface-2)]">
          <div
            className="h-full rounded-[var(--v2-r-s)] transition-[width] duration-500"
            style={{ width: `${width}%`, background: FILL_STYLE[meta.fill] }}
          />
        </div>
        <div className="min-w-[58px] text-right">
          <span className="v2-num block text-[18px] font-extrabold leading-none text-[color:var(--v2-fg)]">
            {formatCount(count)}
          </span>
          <span className="v2-num mt-0.5 block text-[10.5px] font-semibold text-[color:var(--v2-faint)]">
            {CONV_KEY[keyName] ? formatPct(conv) : 'base'}
          </span>
        </div>
      </div>
    </div>
  );
}

function DropRow({
  reason,
  lost,
  dropPct,
  sideExitLabel,
  sideExitCount,
}: {
  reason: string;
  lost: number;
  dropPct: number | null;
  sideExitLabel?: string;
  sideExitCount?: number;
}) {
  return (
    <div className={ROW_COLS}>
      <div className="hidden sm:block" />
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-l border-[color:var(--v2-border-strong)] pl-3">
        <span className="text-[11px] font-semibold text-[color:var(--v2-muted)]">
          <span className="v2-num text-[color:var(--v2-danger)]">
            −{dropPct == null ? '—' : formatPct(dropPct)}
          </span>{' '}
          · <span className="v2-num">{formatCount(lost)}</span> {reason}
        </span>
        {sideExitLabel && sideExitCount ? (
          <span className="rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-2 py-0.5 text-[10.5px] font-semibold text-[color:var(--v2-faint)]">
            <span className="v2-num">{formatCount(sideExitCount)}</span> {sideExitLabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}

// Top-of-funnel visits row. Two honest states:
//   • has data → real "views" number + "{n} únicos" sub-figure + "desde {fecha}" disclaimer.
//   • no data  → dashed placeholder, "recogiendo datos desde hoy" (NOT "pendiente").
function VisitasRow({ visitas }: { visitas: FunnelSnapshot['visitas'] }) {
  if (!visitas) {
    return (
      <div className={`${ROW_COLS} items-center py-1`}>
        <div className="flex items-baseline gap-2 sm:flex-col sm:items-start sm:gap-0.5">
          <span className="text-[13.5px] font-semibold leading-tight text-[color:var(--v2-muted)]">
            Visitas web
          </span>
          <span className="text-[10.5px] text-[color:var(--v2-faint)]">landing fahybrid.com</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-8 flex-1 rounded-[var(--v2-r-s)] border border-dashed border-[color:var(--v2-border)]" />
          <div className="min-w-[58px] text-right text-[10px] font-semibold uppercase leading-tight tracking-wide text-[color:var(--v2-faint)]">
            recogiendo
            <br />
            datos hoy
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className={`${ROW_COLS} items-center py-1`}>
      <div className="flex items-baseline gap-2 sm:flex-col sm:items-start sm:gap-0.5">
        <span className="text-[13.5px] font-semibold leading-tight text-[color:var(--v2-fg)]">
          Visitas web
        </span>
        <span className="text-[10.5px] text-[color:var(--v2-faint)]">
          {visitas.since_date ? `desde ${formatIsoDayShort(visitas.since_date)}` : 'landing fahybrid.com'}
        </span>
      </div>
      <div className="flex items-center gap-3">
        {/* Visits are the base of the funnel → full-width bar. */}
        <div className="relative h-8 flex-1 overflow-hidden rounded-[var(--v2-r-s)] bg-[color:var(--v2-surface-2)]">
          <div className="h-full w-full rounded-[var(--v2-r-s)]" style={{ background: FILL_STYLE.base }} />
        </div>
        <div className="min-w-[58px] text-right">
          <span className="v2-num block text-[18px] font-extrabold leading-none text-[color:var(--v2-fg)]">
            {formatCount(visitas.views)}
          </span>
          <span className="v2-num mt-0.5 block text-[10.5px] font-semibold text-[color:var(--v2-faint)]">
            {formatCount(visitas.visitors)} únicos
          </span>
        </div>
      </div>
    </div>
  );
}

export function FunnelChart({ snapshot }: { snapshot: FunnelSnapshot }) {
  const { stages, conversions, side_exits, visitas } = snapshot;
  const base = stages.iniciado;

  return (
    <Panel
      title="El funnel · dónde se cae"
      action={
        <Pill tone="neutral" variant="outline" className="hidden sm:inline-flex">
          % = conversión desde la etapa anterior
        </Pill>
      }
    >
      <div className="flex flex-col">
        <VisitasRow visitas={visitas} />

        {/* visita → onboarding drop, ONLY when honest: visits must cover the onboardings
            (they don't when visits were instrumented after leads already existed). */}
        {visitas && visitas.views > 0 && visitas.views >= base ? (
          <DropRow
            reason="no inician el onboarding"
            lost={Math.max(0, visitas.views - base)}
            dropPct={(visitas.views - base) / visitas.views}
          />
        ) : null}

        {FUNNEL_STAGE_KEYS.map((key, i) => {
          const drop = DROP_META[key];
          const prevKey = i > 0 ? FUNNEL_STAGE_KEYS[i - 1] : null;
          const prev = prevKey ? stages[prevKey] : 0;
          const cur = stages[key];
          const lost = Math.max(0, prev - cur);
          const dropPct = prev > 0 ? (prev - cur) / prev : null;
          const convKey = CONV_KEY[key];
          return (
            <div key={key}>
              {drop ? (
                <DropRow
                  reason={drop.reason}
                  lost={lost}
                  dropPct={dropPct}
                  sideExitLabel={drop.sideExit ? SIDE_EXIT_LABEL[drop.sideExit] : undefined}
                  sideExitCount={drop.sideExit ? side_exits[drop.sideExit] : undefined}
                />
              ) : null}
              <StageRow
                keyName={key}
                count={cur}
                base={base}
                conv={convKey ? conversions[convKey] : null}
              />
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
