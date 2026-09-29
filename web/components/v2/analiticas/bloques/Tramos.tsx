'use client';

// LO QUE AÑADE EL COACH: EL CUMPLIMIENTO POR TRAMO (A8) — prescrito frente a
// hecho, serie a serie, con la carga de cada tramo y su peldaño. Se elige una
// sesión a la izquierda; otra más, para compararlas (dos sesiones o dos tests
// del mismo protocolo): su curva de pulso va encima, a trazos.
//
// Lee dos detalles del servidor (`../detalle`): el cumplimiento de la ventana
// (las sesiones del plan y el veredicto de cada tramo) y el de cada sesión (lo
// pedido, lo hecho, la carga por tramo y la traza). Mientras sus rutas no
// existen, el bloque lo dice; si solo falta el de sesión, pinta el veredicto de
// cada tramo sin carga ni curva.

import { useEffect, useMemo, useState } from 'react';
import type { VentanaClave } from '@fahybrid/shared/domain/analytics/ventana';
import { Button } from '@/components/v2/ui';
import { cn } from '@/lib/utils';
import { horasYMin } from '@/lib/formato';
import { fechaLegible } from '../formato';
import { LineaTiempo } from '../graficos';
import type { DetalleCumplimientoConsumo, DetalleSesionConsumo, FilaSesionConsumo, FuenteDetalle, Resultado } from '../detalle';
import { huecoPendiente, type Hueco } from '../huecos';
import { PIEL_PANEL as P } from '../piel';
import { AnclaChip, HuecoLinea, PuntoFamilia, TablaPanel, Tarjeta, type ManejarAccion } from '../piezas';
import { ESTADO_SESION, VEREDICTO_TRAMO, cifraBase, detalleSesion, familiaDeSesion, resumenTramos, tramosLeidos, type TramoLeido } from '../sesiones';

const PREGUNTA = 'Prescrito frente a hecho, serie a serie, con la carga de cada tramo y su peldaño. Elige una sesión; otra más para compararlas.';
const LISTA_MAX = 8;

function useSesion(fuente: FuenteDetalle, executionId: string | null): Resultado<DetalleSesionConsumo> | null {
  const [r, setR] = useState<{ id: string; res: Resultado<DetalleSesionConsumo> } | null>(null);
  useEffect(() => {
    if (!executionId) return;
    let vivo = true;
    void fuente.sesion(executionId).then((res) => {
      if (vivo) setR({ id: executionId, res });
    });
    return () => {
      vivo = false;
    };
  }, [fuente, executionId]);
  return executionId && r?.id === executionId ? r.res : null;
}

function pulsoDe(d: DetalleSesionConsumo | null): Array<{ t: number; v: number }> {
  const p = d?.traza.pulso;
  if (!p) return [];
  return p.offsets_s.map((t, i) => ({ t, v: p.values[i]! })).filter((x) => Number.isFinite(x.v));
}

function claseVeredicto(t: TramoLeido): string {
  if (t.veredicto === 'dentro') return 'text-v2-ok';
  if (t.veredicto === 'por_encima' || t.veredicto === 'por_debajo') return 'text-v2-warn';
  return 'text-v2-faint';
}

export function Tramos({
  cumplimiento,
  fuente,
  ventana,
  seleccion,
  onSeleccion,
  hoy,
  manejar,
  anchoInicial,
  className,
}: {
  className?: string;
  cumplimiento: Resultado<DetalleCumplimientoConsumo> | null;
  fuente: FuenteDetalle;
  ventana: VentanaClave;
  /** La sesión abierta (assignment_id): la elige también una fila de «Semana a semana». */
  seleccion: string | null;
  onSeleccion: (assignmentId: string) => void;
  hoy: string;
  manejar: ManejarAccion;
  anchoInicial: number;
}) {
  const [comparada, setComparada] = useState<string | null>(null);
  const sesiones = useMemo(() => (cumplimiento?.estado === 'ok' ? cumplimiento.datos.sesiones.filter((s) => s.hecha && s.execution_id) : []), [cumplimiento]);
  const a = sesiones.find((s) => s.assignment_id === seleccion) ?? sesiones[0] ?? null;
  const b = comparada && comparada !== a?.assignment_id ? (sesiones.find((s) => s.assignment_id === comparada) ?? null) : null;
  const detA = useSesion(fuente, a?.execution_id ?? null);
  const detB = useSesion(fuente, b?.execution_id ?? null);

  let hueco: Hueco | null = null;
  if (cumplimiento == null) hueco = { tipo: 'poco', titulo: 'Cargando', cuerpo: 'Leyendo las sesiones del plan de esta ventana…' };
  else if (cumplimiento.estado === 'pendiente') hueco = { ...huecoPendiente('semanas'), cuerpo: 'El cumplimiento tramo a tramo llega en la siguiente entrega del panel.' };
  else if (cumplimiento.estado === 'error') hueco = { tipo: 'vacio', titulo: 'No se ha podido leer', cuerpo: 'El cumplimiento de esta ventana no ha cargado. Prueba a recargar la página.' };
  else if (sesiones.length === 0) hueco = { tipo: 'vacio', titulo: 'Sin sesiones del plan hechas en esta ventana', cuerpo: 'Cuando haga sesiones de su plan, aquí verás cada tramo frente a lo que pedías.', accion: 'plan' };

  const sesA = detA?.estado === 'ok' ? detA.datos : null;
  const sesB = detB?.estado === 'ok' ? detB.datos : null;
  const tramos = a ? tramosLeidos(a, sesA) : [];
  const pulsoA = pulsoDe(sesA);
  const pulsoB = pulsoDe(sesB);
  const duracion = Math.max(pulsoA[pulsoA.length - 1]?.t ?? 0, pulsoB[pulsoB.length - 1]?.t ?? 0);
  const duracionA = sesA ? sesA.tramos.reduce((s, t) => s + (t.segundos ?? 0), 0) : 0;

  return (
    <Tarjeta id="tramos" titulo="Cumplimiento por tramo" pregunta={PREGUNTA} hueco={hueco} manejar={manejar} className={className}>
      {a ? (
        <div className="mt-1 grid gap-6 @4xl:grid-cols-12">
          <div className="min-w-0 @4xl:col-span-4">
            <TablaPanel<FilaSesionConsumo>
              etiqueta="Sesiones con tramo a tramo"
              columnas={[
                { id: 'f', cabecera: 'Fecha', celda: (s) => fechaLegible(s.dia, hoy), ancho: '64px', movil: 'detalle' },
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
                { id: 'h', cabecera: 'Hecho', celda: (s) => cifraBase(s.hecho, s.unidad), alinear: 'derecha', ancho: '64px', movil: 'valor' },
                {
                  id: 'c',
                  cabecera: '',
                  celda: (s) =>
                    s.assignment_id === a.assignment_id ? null : (
                      <Button
                        size="sm"
                        variant={comparada === s.assignment_id ? 'secondary' : 'ghost'}
                        aria-pressed={comparada === s.assignment_id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setComparada(comparada === s.assignment_id ? null : s.assignment_id);
                        }}
                      >
                        {comparada === s.assignment_id ? 'Comparando' : 'Comparar'}
                      </Button>
                    ),
                  alinear: 'derecha',
                  ancho: '112px',
                  movil: 'detalle',
                },
              ]}
              filas={sesiones.slice(0, LISTA_MAX)}
              clave={(s) => s.assignment_id}
              seleccionada={a.assignment_id}
              onFila={(s) => onSeleccion(s.assignment_id)}
            />
            {sesiones.length > LISTA_MAX ? <p className="mt-2 t-meta text-v2-faint">Las {LISTA_MAX} últimas de {sesiones.length} hechas en la ventana ({ventana === 'todo' ? 'toda la historia' : 'cambia la ventana para ver otras'}).</p> : null}
          </div>

          <div className="flex min-w-0 flex-col gap-4 @4xl:col-span-8">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="t-title-sm text-v2-fg">{a.titulo ?? 'Sesión del plan'}</span>
              <span className="t-meta text-v2-muted">
                {[fechaLegible(a.dia, hoy), sesA?.formato ?? null, duracionA > 0 ? horasYMin(duracionA) : null, ESTADO_SESION[a.estado]].filter(Boolean).join(' · ')}
              </span>
              <span className="inline-flex items-center gap-2 t-meta text-v2-muted sm:ml-auto">
                {detalleSesion(a)}
                {a.ancla ? <AnclaChip ancla={a.ancla} /> : null}
              </span>
            </div>
            {resumenTramos(a) ? <p className="t-body-sm text-v2-fg">{resumenTramos(a)}</p> : null}
            {tramos.length > 0 ? (
              <TablaPanel<TramoLeido>
                etiqueta="Tramo a tramo"
                columnas={[
                  { id: 'n', cabecera: '#', celda: (t) => t.n, ancho: '28px', movil: 'oculta' },
                  { id: 't', cabecera: 'Tramo', celda: (t) => <span className={cn(!t.trabajo && 'text-v2-muted')}>{t.nombre}</span>, ancho: 'minmax(0, 1.1fr)', movil: 'principal' },
                  { id: 'p', cabecera: 'Pedido', celda: (t) => <span className="text-v2-muted">{t.pedido ?? 'sin plan'}</span>, ancho: 'minmax(0, 1.2fr)', movil: 'detalle' },
                  { id: 'h', cabecera: 'Hecho', celda: (t) => <span>{t.hecho ?? <span className="text-v2-faint">sin dato</span>}</span>, ancho: 'minmax(0, 1.3fr)', movil: 'detalle' },
                  {
                    id: 'v',
                    cabecera: 'Veredicto',
                    celda: (t) => <span className={claseVeredicto(t)}>{t.veredicto ? (t.veredicto === 'sin_dato' && t.motivo ? t.motivo : VEREDICTO_TRAMO[t.veredicto]) : 'sin plan'}</span>,
                    ancho: '150px',
                    movil: 'valor',
                  },
                  ...(sesA
                    ? [
                        {
                          id: 'k',
                          cabecera: 'Carga',
                          celda: (t: TramoLeido) => (
                            <span className={cn(t.carga?.tss == null && 'text-v2-faint')}>
                              {t.carga?.tss != null ? Math.round(t.carga.tss) : '?'}
                              <span className="text-v2-faint"> {t.carga?.peldano ?? 'no se sabe'}</span>
                            </span>
                          ),
                          alinear: 'derecha' as const,
                          ancho: '104px',
                          movil: 'detalle' as const,
                        },
                      ]
                    : []),
                ]}
                filas={tramos}
                clave={(t) => t.id}
              />
            ) : (
              <p className="t-body-sm text-v2-muted">Esta sesión no se grabó tramo a tramo: cuenta como hecha, sin veredicto por tramo.</p>
            )}
            {detA?.estado === 'pendiente' ? (
              <HuecoLinea hueco={{ tipo: 'pendiente', titulo: 'Sin carga ni curva por tramo', cuerpo: 'La carga de cada tramo y la curva de pulso llegan con el detalle de la sesión, en la siguiente entrega.' }} />
            ) : null}
            {pulsoA.length > 1 || pulsoB.length > 1 ? (
              <div className="flex flex-col gap-1">
                <span className="t-label text-v2-faint">Pulso a lo largo de la sesión{b ? ` · ${a.titulo ?? 'esta'} frente a ${b.titulo ?? 'la comparada'}` : ''}</span>
                {pulsoA.length > 1 ? (
                  <LineaTiempo
                    piel={P}
                    alto={180}
                    duracion={duracion}
                    etiqueta="Pulso a lo largo de la sesión"
                    curva={{ puntos: pulsoA, formato: (v) => String(Math.round(v)), color: P.tinta }}
                    segunda={pulsoB.length > 1 ? { puntos: pulsoB, etiqueta: b?.titulo ?? 'La comparada' } : null}
                    anchoInicial={anchoInicial}
                  />
                ) : (
                  <p className="t-body-sm text-v2-muted">Esta sesión no tiene pulso{pulsoB.length > 1 ? '; la comparada sí' : ''}.</p>
                )}
              </div>
            ) : null}
            {b ? (
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-ctl border border-v2-border px-3 py-2">
                <span className="t-body-sm font-medium text-v2-fg">Comparada: {b.titulo ?? 'sesión del plan'}</span>
                <span className="t-meta text-v2-muted">{[fechaLegible(b.dia, hoy), detalleSesion(b), resumenTramos(b)].filter(Boolean).join(' · ')}</span>
                <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setComparada(null)}>
                  Quitar
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </Tarjeta>
  );
}
