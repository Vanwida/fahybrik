'use client';

// ¿HACE LO QUE TOCA? — semana a semana, lo planificado (contorno) frente a lo
// hecho (relleno, apilado por familia), en carga o en horas; los totales de la
// ventana contra el periodo anterior; y, cuando el cumplimiento se sirve, las
// últimas sesiones del plan con su cumplimiento (una fila abre el tramo a tramo).

import { useState } from 'react';
import type { VentanaResuelta } from '@fahybrid/shared/domain/analytics/ventana';
import type { Lectura } from '@fahybrid/shared/domain/analytics/lectura';
import { SegmentedControl } from '@/components/v2/ui';
import { cn } from '@/lib/utils';
import { esDecimal } from '@/lib/formato';
import { agrupacionDe } from '../escala';
import { entero, fechaLegible } from '../formato';
import { Columnas } from '../graficos';
import { cubosSemanas, leyendaSemanas, mediaAnteriorPorSemana } from '../derivados';
import type { DetalleCumplimientoConsumo, FilaSesionConsumo, Resultado } from '../detalle';
import { huecoPendiente, huecoSemanas } from '../huecos';
import { medida } from '../lecturas';
import { PIEL_PANEL as P } from '../piel';
import { AnclaChip, DeltaPanel, PuntoFamilia, TablaPanel, Tarjeta, type ManejarAccion } from '../piezas';
import { detalleSesion, cifraBase, ESTADO_SESION, familiaDeSesion } from '../sesiones';

type Modo = 'carga' | 'horas';

/** Los totales de la ventana contra el periodo anterior: carga, horas y entrenos. */
function Totales({ semanas, comparar }: { semanas: readonly Lectura[]; comparar: boolean }) {
  const filas: Array<{ id: string; etiqueta: string; texto: string; l: ReturnType<typeof medida> }> = [];
  const carga = medida(semanas, 'semanas.carga');
  const horas = medida(semanas, 'semanas.horas');
  const sesiones = medida(semanas, 'semanas.sesiones');
  if (carga) filas.push({ id: 'carga', etiqueta: 'Carga', texto: entero(carga.dato.valor), l: carga });
  if (horas) filas.push({ id: 'horas', etiqueta: 'Horas', texto: `${esDecimal(horas.dato.valor, 1)} h`, l: horas });
  if (sesiones) filas.push({ id: 'sesiones', etiqueta: 'Entrenos', texto: String(Math.round(sesiones.dato.valor)), l: sesiones });
  if (filas.length === 0) return null;
  return (
    <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
      {filas.map((f) => (
        <div key={f.id} className="flex items-baseline gap-2">
          <dt className="t-label text-v2-faint">{f.etiqueta}</dt>
          <dd className="flex flex-wrap items-baseline gap-x-2">
            <span className="t-body font-medium t-tnum text-v2-fg">{f.texto}</span>
            {f.l?.comparacion && f.l.comparacion.anterior != null ? (
              <DeltaPanel l={f.l} comparacion={f.l.comparacion} etiqueta={comparar ? `antes ${f.id === 'horas' ? `${esDecimal(f.l.comparacion.anterior, 1)} h` : entero(f.l.comparacion.anterior)}` : 'vs periodo anterior'} />
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function TablaSesiones({ sesiones, hoy, onSesion }: { sesiones: FilaSesionConsumo[]; hoy: string; onSesion: (s: FilaSesionConsumo) => void }) {
  const hechas = sesiones.filter((s) => s.hecha).length;
  const dentro = sesiones.filter((s) => s.estado === 'cumplida').length;
  const ultimas = sesiones.slice(0, 6);
  return (
    <div className="mt-4">
      <TablaPanel
        etiqueta="Últimas sesiones del plan"
        columnas={[
          { id: 'f', cabecera: 'Fecha', celda: (s) => fechaLegible(s.dia, hoy), ancho: '72px', movil: 'detalle' },
          {
            id: 't',
            cabecera: 'Sesión',
            celda: (s) => {
              const f = familiaDeSesion(s);
              return (
                <span className="inline-flex min-w-0 items-center gap-2">
                  {f ? <PuntoFamilia familia={f} /> : null}
                  <span className="truncate">{s.titulo ?? 'Sesión del plan'}</span>
                </span>
              );
            },
            movil: 'principal',
          },
          {
            id: 'c',
            cabecera: 'Cumplimiento',
            celda: (s) => (
              <span className={cn(s.estado === 'cumplida' ? 'text-v2-fg' : s.estado === 'no_hecha' || s.estado === 'fuera' ? 'text-v2-warn' : 'text-v2-muted')}>
                {ESTADO_SESION[s.estado]}
                {detalleSesion(s) ? <span className="text-v2-faint"> · {detalleSesion(s)}</span> : null}
              </span>
            ),
            movil: 'detalle',
          },
          { id: 'p', cabecera: 'Plan', celda: (s) => cifraBase(s.plan, s.unidad), alinear: 'derecha', ancho: '64px', movil: 'oculta' },
          { id: 'h', cabecera: 'Hecho', celda: (s) => (s.hecha ? cifraBase(s.hecho, s.unidad) : '·'), alinear: 'derecha', ancho: '64px', movil: 'valor' },
          { id: 'a', cabecera: 'Ancla', celda: (s) => (s.ancla ? <AnclaChip ancla={s.ancla} /> : null), alinear: 'derecha', ancho: '92px', movil: 'detalle' },
        ]}
        filas={ultimas}
        clave={(s) => s.assignment_id}
        onFila={(s) => onSesion(s)}
      />
      <p className="mt-2 t-meta text-v2-faint">
        {hechas} de {sesiones.length} sesiones del plan hechas en la ventana · {dentro} dentro de lo pedido · las {ultimas.length} últimas arriba; una fila abre el tramo a tramo.
      </p>
    </div>
  );
}

export function Semanas({
  semanas,
  ventana,
  comparar,
  pendiente,
  cumplimiento,
  onSesion,
  manejar,
  className,
  anchoInicial,
}: {
  semanas: readonly Lectura[];
  ventana: VentanaResuelta;
  comparar: boolean;
  pendiente: boolean;
  /** Dónde sigue el cálculo anterior mientras este bloque no se sirve. */
  cumplimiento: Resultado<DetalleCumplimientoConsumo> | null;
  onSesion: (s: FilaSesionConsumo) => void;
  manejar: ManejarAccion;
  className?: string;
  anchoInicial: number;
}) {
  const [modo, setModo] = useState<Modo>('carga');
  const pregunta = '¿Hace lo que toca? Plan (contorno) frente a hecho, por familia';
  if (pendiente) return <Tarjeta id="semanas" titulo="Semana a semana" pregunta={pregunta} hueco={huecoPendiente('semanas')} className={className} />;

  const hueco = huecoSemanas(semanas);
  const total = medida(semanas, modo === 'carga' ? 'semanas.carga' : 'semanas.horas');
  const agrupar = agrupacionDe(total?.serie?.puntos.length ?? 0, anchoInicial - 60, 18);
  const cubos = hueco ? [] : cubosSemanas(semanas, modo, P, agrupar, ventana.hasta);
  const media = comparar && ventana.anterior ? mediaAnteriorPorSemana(semanas, modo, ventana.anterior.dias, agrupar) : null;
  const formatoY = modo === 'carga' ? (v: number) => String(Math.round(v)) : (v: number) => `${esDecimal(v, v >= 10 || Number.isInteger(v) ? 0 : 1)} h`;
  const etiquetaMedia = media != null ? `media del periodo anterior · ${modo === 'carga' ? Math.round(media) : `${esDecimal(media, 1)} h`}` : null;
  const sesiones = cumplimiento?.estado === 'ok' ? cumplimiento.datos.sesiones : null;

  return (
    <Tarjeta
      id="semanas"
      titulo="Semana a semana"
      pregunta={pregunta}
      hueco={hueco}
      manejar={manejar}
      className={className}
      accion={
        hueco ? null : (
          <SegmentedControl
            aria-label="Carga u horas"
            size="sm"
            items={[
              { value: 'carga', label: 'Carga' },
              { value: 'horas', label: 'Horas' },
            ]}
            value={modo}
            onValueChange={setModo}
          />
        )
      }
    >
      {cubos.length > 0 ? (
        <Columnas
          piel={P}
          alto={230}
          cubos={cubos}
          leyenda={leyendaSemanas(cubos)}
          formatoY={formatoY}
          anchoInicial={anchoInicial}
          objetivo={media != null && etiquetaMedia ? { valor: media, etiqueta: etiquetaMedia } : null}
          tituloCubo={(t) => (agrupar > 1 ? `${agrupar} semanas desde el ${fechaLegible(t, ventana.hasta)}` : `Semana del ${fechaLegible(t, ventana.hasta)}`)}
        />
      ) : null}
      {!hueco ? <Totales semanas={semanas} comparar={comparar} /> : null}
      {!hueco && sesiones && sesiones.length > 0 ? <TablaSesiones sesiones={sesiones} hoy={ventana.hasta} onSesion={onSesion} /> : null}
    </Tarjeta>
  );
}
