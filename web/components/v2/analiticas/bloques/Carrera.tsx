'use client';

// ¿LLEGA A SU CARRERA? — el tiempo previsto (con su banda), el objetivo y el
// hueco (positivo = le falta), cómo se ha movido la previsión (abajo es mejor)
// y el hueco tramo a tramo contra el reparto del objetivo. Una previsión
// parcial NO es un tiempo: se dice qué tramos faltan (DECISIONS 29-09, §2).

import type { Lectura } from '@fahybrid/shared/domain/analytics/lectura';
import { KPI, KPIRow } from '@/components/v2/ui';
import { reloj } from '@/lib/formato';
import { entero, enDias, fechaLegible, formatearDelta } from '../formato';
import { BarrasHueco, Lineas } from '../graficos';
import { tramosCarrera } from '../derivados';
import { huecoCarrera, huecoPendiente } from '../huecos';
import { lectura, medida, rangoDe } from '../lecturas';
import { PIEL_PANEL as P } from '../piel';
import { Tarjeta, type ManejarAccion } from '../piezas';

export function Carrera({
  carrera,
  hoy,
  fechaCarrera,
  pendiente,
  manejar,
  className,
  anchoInicial,
}: {
  carrera: readonly Lectura[];
  hoy: string;
  /** La fecha de la carrera objetivo (la de la ficha): la lectura trae su nombre y los días, no el día. */
  fechaCarrera: string | null;
  pendiente: boolean;
  /** Dónde sigue el cálculo anterior mientras este bloque no se sirve. */
  manejar: ManejarAccion;
  className?: string;
  anchoInicial: number;
}) {
  if (pendiente) return <Tarjeta id="carrera" titulo="Carrera" pregunta="¿Llega a su carrera?" hueco={huecoPendiente('carrera')} className={className} />;
  const objetivo = medida(carrera, 'carrera.objetivo');
  const prevision = medida(carrera, 'carrera.prevision');
  const disposicion = lectura(carrera, 'carrera.disposicion');
  const hueco = huecoCarrera(carrera);
  const tramos = tramosCarrera(carrera);
  const hayHueco = tramos.some((t) => t.valor != null);
  const pregunta = objetivo
    ? `${objetivo.titulo_es}${fechaCarrera ? ` · ${fechaLegible(fechaCarrera, hoy)}` : ''} · ${enDias(Math.round(objetivo.dato.valor))}${hayHueco ? ' · hueco por tramo contra su objetivo (positivo = le falta)' : ''}`
    : '¿Llega a su carrera?';
  const rango = rangoDe(prevision);
  const ref = prevision?.dato.referencia ?? null;
  const conMarca = tramos.filter((t) => t.nota !== 'sin marca').length;

  return (
    <Tarjeta id="carrera" titulo="Carrera" pregunta={pregunta} hueco={hueco} manejar={manejar} className={className}>
      {prevision ? (
        <div className="mt-1 grid gap-6 @4xl:grid-cols-12">
          <div className="flex min-w-0 flex-col gap-4 @4xl:col-span-5">
            <KPIRow>
              <KPI
                label="Tiempo previsto"
                value={reloj(prevision.dato.valor)}
                size="xl"
                caption={[`${conMarca} de ${tramos.length} tramos con marca propia`, rango ? `entre ${reloj(rango.bajo)} y ${reloj(rango.alto)}` : null].filter(Boolean).join(' · ')}
              />
              <KPI
                label="Objetivo"
                value={ref ? reloj(ref.valor) : null}
                caption={ref ? undefined : 'sin objetivo de tiempo'}
                delta={ref ? { value: formatearDelta(ref.delta, 'segundos'), direction: ref.delta > 0 ? 'up' : ref.delta < 0 ? 'down' : 'flat', good: ref.delta <= 0 } : undefined}
              />
              {disposicion?.estado === 'medida' && disposicion.dato ? <KPI label="Disposición para competir" value={entero(disposicion.dato.valor)} caption="un índice para priorizar, no una medida" /> : null}
            </KPIRow>
            {prevision.serie && prevision.serie.puntos.filter((p) => p.v != null).length > 1 ? (
              <div className="flex flex-col gap-1">
                <span className="t-label text-v2-faint">Cómo se ha movido la previsión (abajo es mejor)</span>
                <Lineas
                  piel={P}
                  alto={130}
                  series={[{ id: 'prevision', etiqueta: 'Previsión', puntos: prevision.serie.puntos, color: P.tinta, formato: (v) => reloj(v), rotuloFinal: true }]}
                  referencias={ref ? [{ valor: ref.valor, etiqueta: `objetivo ${reloj(ref.valor)}` }] : []}
                  formatoY={(v) => reloj(v)}
                  invertido
                  escalaTiempo
                  leyenda={false}
                  anchoInicial={Math.min(anchoInicial, 520)}
                />
              </div>
            ) : null}
          </div>
          <div className="min-w-0 @4xl:col-span-7">
            {hayHueco ? (
              <BarrasHueco
                piel={P}
                filas={tramos.map((t) => ({ id: t.id, etiqueta: t.etiqueta, valor: t.valor, nota: t.nota, color: (t.valor ?? 0) > 0 ? P.aviso : P.ok }))}
                formato={(v) => formatearDelta(v, 'segundos')}
                anchoInicial={anchoInicial}
                altoFila={24}
                anchoEtiqueta={150}
              />
            ) : (
              <p className="t-body-sm text-v2-muted">Sin objetivo de tiempo no hay hueco por tramo: el atleta lo pone al elegir su carrera.</p>
            )}
          </div>
        </div>
      ) : null}
    </Tarjeta>
  );
}
