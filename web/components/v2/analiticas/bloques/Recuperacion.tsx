'use client';

// ¿ASIMILA? — variabilidad, pulso en reposo y sueño contra UNA basal (la de su
// método): lo reciente, su normal, la palabra del servidor y la tendencia de
// la ventana con su normal dibujada. El readiness de hoy va en la cabecera.

import type { CoachAnalyticsMethod } from '@fahybrid/shared/domain/analytics/metodo';
import type { Lectura } from '@fahybrid/shared/domain/analytics/lectura';
import { cn } from '@/lib/utils';
import { formatear, formatearDelta, esCero } from '../formato';
import { Chispa } from '../graficos';
import { huecoPendiente, huecoRecuperacion, type Legado } from '../huecos';
import { claseTono, falta, lectura, unidadDe } from '../lecturas';
import { PIEL_PANEL as P } from '../piel';
import { Cifra, DeltaPanel, Tarjeta, type ManejarAccion } from '../piezas';
import { palabraCoach } from '../voz';

const SENALES = ['recuperacion.variabilidad', 'recuperacion.pulso_reposo', 'recuperacion.sueno'] as const;

function Senal({ l, comparar }: { l: Lectura; comparar: boolean }) {
  if (l.estado !== 'medida' || !l.dato) {
    const f = falta(l);
    const nota = f?.por === 'historia' ? `formando su normal: ${f.llevas} de ${f.hacen} noches` : 'sin noches recientes';
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <span className="t-label text-v2-faint">{l.titulo_es}</span>
        <span className="t-body-sm text-v2-muted">{nota}</span>
      </div>
    );
  }
  const u = unidadDe(l);
  const ref = l.dato.referencia;
  const basal = l.serie?.referencias?.find((r) => r.code === 'basal')?.valor ?? ref?.valor ?? null;
  return (
    <div className="flex items-start justify-between gap-3">
      <Cifra etiqueta={l.titulo_es} valor={l.dato.valor} unidad={u}>
        {ref ? (
          <span className="flex flex-wrap items-baseline gap-x-1.5 t-meta t-tnum">
            <span className={cn(esCero(ref.delta, u) ? 'text-v2-muted' : 'text-v2-fg')}>{esCero(ref.delta, u) ? 'igual' : formatearDelta(ref.delta, u)}</span>
            <span className="text-v2-faint">vs su normal {formatear(ref.valor, u)}</span>
          </span>
        ) : null}
        {l.veredicto ? <span className={cn('t-meta', claseTono(l.veredicto.tono === 'bien' ? null : l.veredicto.tono))}>{palabraCoach(l)}</span> : null}
        {comparar && l.comparacion && l.comparacion.anterior != null ? (
          <DeltaPanel l={{ veredicto: null, comparacion: l.comparacion }} comparacion={l.comparacion} etiqueta={`antes ${formatear(l.comparacion.anterior, u)}`} />
        ) : null}
      </Cifra>
      {l.serie ? <Chispa piel={P} puntos={l.serie.puntos} referencia={basal} ancho={120} alto={36} etiqueta={`${l.titulo_es} en la ventana`} /> : null}
    </div>
  );
}

export function Recuperacion({
  recuperacion,
  metodo,
  comparar,
  pendiente,
  legado,
  manejar,
  className,
}: {
  recuperacion: readonly Lectura[];
  metodo: Pick<CoachAnalyticsMethod, 'basal_dias' | 'basal_excluir_dias'>;
  comparar: boolean;
  pendiente: boolean;
  /** Dónde sigue el cálculo anterior mientras este bloque no se sirve. */
  legado?: Legado | null;
  manejar: ManejarAccion;
  className?: string;
}) {
  const pregunta = '¿Asimila? Contra su normal';
  if (pendiente) return <Tarjeta id="recuperacion" titulo="Recuperación" pregunta={pregunta} hueco={huecoPendiente('recuperacion', legado)} className={className} />;
  const hueco = huecoRecuperacion(recuperacion);
  const senales = SENALES.map((id) => lectura(recuperacion, id)).filter((l): l is Lectura => l != null);
  const hayAlguna = senales.some((l) => l.estado === 'medida');
  return (
    <Tarjeta id="recuperacion" titulo="Recuperación" pregunta={pregunta} hueco={hueco} manejar={manejar} className={className}>
      {hayAlguna ? (
        <div className="mt-1 grid gap-4 @2xl:grid-cols-3 @2xl:gap-6 @4xl:grid-cols-1 @4xl:gap-4">
          {senales.map((l) => (
            <Senal key={l.id} l={l} comparar={comparar} />
          ))}
        </div>
      ) : null}
      {hayAlguna ? (
        <p className="mt-4 t-meta text-v2-faint">
          Media de los últimos 7 días contra su normal: la media de hace {metodo.basal_dias} a hace {metodo.basal_excluir_dias + 1} días (la línea a trazos).
        </p>
      ) : null}
    </Tarjeta>
  );
}
