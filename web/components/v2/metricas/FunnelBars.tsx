// El embudo: una barra por etapa (ancho = parte de la cohorte que llega) y, entre
// etapa y etapa, cuántos se quedan y por qué. Una sola serie en tinta neutra:
// el color no aporta nada que no diga ya la etiqueta. Pasar por encima de una
// barra da el número exacto y su conversión desde la etapa anterior.

import type { FunnelSnapshot, FunnelStageKey } from '@/lib/dashboard/coach/metrics';
import { formatCount, formatIsoDayShort, formatPct } from './format';

// El orden de las etapas (el mismo que FUNNEL_STAGE_KEYS del loader, que es de
// servidor: aquí solo se importan sus tipos). El Record de abajo obliga a que
// estén todas.
const STAGE_ORDER = ['iniciado', 'completado', 'cita', 'llamada', 'alta_enviada', 'convertido'] as const satisfies readonly FunnelStageKey[];

const STAGE: Record<FunnelStageKey, { name: string; def: string }> = {
  iniciado: { name: 'Empiezan el formulario', def: 'dejan su correo' },
  completado: { name: 'Lo terminan', def: 'formulario entero' },
  cita: { name: 'Reservan llamada', def: 'con hora en tu agenda' },
  llamada: { name: 'Hacen la llamada', def: 'con parte registrado' },
  alta_enviada: { name: 'Reciben la invitación', def: 'convertidos en atleta' },
  convertido: { name: 'Ya entrenan', def: 'canjearon la invitación' },
};

const DROP: Partial<Record<FunnelStageKey, { reason: string; side?: 'descartados' | 'no_show' | 'pensandoselo'; sideLabel?: string }>> = {
  completado: { reason: 'no terminan el formulario' },
  cita: { reason: 'no reservan llamada', side: 'descartados', sideLabel: 'descartados' },
  llamada: { reason: 'no llegan a la llamada', side: 'no_show', sideLabel: 'no vinieron' },
  alta_enviada: { reason: 'no reciben invitación', side: 'pensandoselo', sideLabel: 'se lo piensan' },
  convertido: { reason: 'no canjean la invitación' },
};

const GRID = 'grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[minmax(150px,200px)_1fr_96px] sm:items-center';

function Bar({ label, def, count, width, sub }: { label: string; def: string; count: number | string; width: number; sub: string }) {
  return (
    <div className={`${GRID} py-1.5`}>
      <div className="flex items-baseline gap-2 sm:flex-col sm:gap-0">
        <span className="t-body font-medium text-v2-fg">{label}</span>
        <span className="t-meta text-v2-faint">{def}</span>
      </div>
      <div className="group relative h-6 rounded-[4px] bg-v2-surface-2" title={`${label}: ${count} · ${sub}`}>
        <div
          className="h-full rounded-[4px] bg-v2-muted transition-[width] duration-500 group-hover:bg-v2-fg"
          style={{ width: `${Math.max(width > 0 ? 1 : 0, width)}%` }}
        />
      </div>
      <div className="flex items-baseline gap-2 sm:flex-col sm:items-end sm:gap-0">
        <span className="t-title-sm text-v2-fg t-tnum">{count}</span>
        <span className="t-meta text-v2-faint t-tnum">{sub}</span>
      </div>
    </div>
  );
}

function Drop({ lost, pct, reason, side }: { lost: number; pct: number | null; reason: string; side?: string }) {
  return (
    <div className={GRID}>
      <span className="hidden sm:block" />
      <span className="border-l border-v2-border-strong py-0.5 pl-3 t-body-sm text-v2-muted">
        <span className="t-tnum text-v2-fg">−{pct == null ? '—' : formatPct(pct)}</span> · {formatCount(lost)} {reason}
        {side ? <span className="text-v2-faint"> ({side})</span> : null}
      </span>
      <span className="hidden sm:block" />
    </div>
  );
}

export function FunnelBars({ snapshot }: { snapshot: FunnelSnapshot }) {
  const { stages, conversions, side_exits, visitas } = snapshot;
  const base = stages.iniciado;
  return (
    <div className="flex flex-col">
      {visitas ? (
        <>
          <Bar
            label="Visitan tu web"
            def={visitas.since_date ? `desde el ${formatIsoDayShort(visitas.since_date)}` : 'tu página pública'}
            count={formatCount(visitas.views)}
            width={100}
            sub={`${formatCount(visitas.visitors)} personas`}
          />
          {visitas.views >= base && visitas.views > 0 ? (
            <Drop lost={visitas.views - base} pct={(visitas.views - base) / visitas.views} reason="no empiezan el formulario" />
          ) : null}
        </>
      ) : (
        <div className={`${GRID} py-1.5`}>
          <div className="flex flex-col">
            <span className="t-body font-medium text-v2-muted">Visitan tu web</span>
          </div>
          <span className="t-body-sm text-v2-faint">Sin página pública conectada: el embudo empieza en el formulario.</span>
          <span className="hidden sm:block" />
        </div>
      )}
      {STAGE_ORDER.map((key, i) => {
        const prev = i > 0 ? stages[STAGE_ORDER[i - 1]!] : 0;
        const cur = stages[key];
        const drop = DROP[key];
        const conv = key === 'iniciado' ? null : conversions[key as Exclude<FunnelStageKey, 'iniciado'>];
        return (
          <div key={key}>
            {drop && prev > 0 ? (
              <Drop
                lost={Math.max(0, prev - cur)}
                pct={(prev - cur) / prev}
                reason={drop.reason}
                side={drop.side && side_exits[drop.side] ? `${drop.sideLabel}: ${formatCount(side_exits[drop.side])}` : undefined}
              />
            ) : null}
            <Bar
              label={STAGE[key].name}
              def={STAGE[key].def}
              count={formatCount(cur)}
              width={base > 0 ? (cur / base) * 100 : 0}
              sub={key === 'iniciado' ? 'la cohorte' : `${formatPct(conv)} de la anterior`}
            />
          </div>
        );
      })}
    </div>
  );
}
