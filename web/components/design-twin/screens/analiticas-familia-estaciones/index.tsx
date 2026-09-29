'use client';

// ANALÍTICAS · ESTACIONES Y WOD — el «¿mejoro?» de lo que no es correr ni
// ergo ni fuerza (A9, §3): el mejor por estación (ejercicio + dosis + carga),
// el historial de los WOD de referencia y de las simulaciones, los parciales
// de la última carrera oficial y, con la carrera objetivo, el hueco por tramo
// entero (los 17). Es el detalle que TrainingPeaks no puede dar: nace de que
// las estaciones están tipadas.

import { useEffect, useMemo, useState } from 'react';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { TRAMO_CARRERA_NOMBRE, type Ventana } from '../../kit-analiticas/contrato';
import { detalleEstacionesDe } from '../../kit-analiticas/casos/detalles';
import { nombreDe, panelDe, type EscenarioPortada } from '../../kit-analiticas/casos/atletas';
import { BloqueCarrera, useEstados } from '../../kit-analiticas/bloques';
import { fechaLegible, formatearDelta, reloj } from '../../kit-analiticas/fmt';
import { Lineas } from '../../kit-analiticas/graficos';
import { BarrasSimples } from '../../kit-analiticas/graficos-sesion';
import { METODO_DEFECTO } from '../../kit-analiticas/metodo';
import { PantallaAnaliticas, Seccion } from '../../kit-analiticas/pantalla';
import { Celda, Cuerpo, Etiqueta, HuecoBloque, Nota, Numeral, Rejilla, Sello, Superficie } from '../../kit-analiticas/piezas';
import { CabeceraFamilia, SujetoVacio, Tabla } from '../../kit-analiticas/piezas-detalle';
import { MARGEN } from '../../kit-dia/tokens';
import { LIENZO } from '../../kit-iphone-vivo/tokens';
import { useMedidaLienzo } from '../../kit-iphone-vivo/piezas';
import { DATO_FILA, PIEL_IPHONE as P, colorFamilia } from '../../kit-analiticas/tokens';

export const meta: TwinMeta = {
  id: 'analiticas-familia-estaciones',
  titulo: 'Analíticas · Estaciones y WOD',
  zona: 'Marcas y tests',
  estado: 'propuesta',
  actualizado: '2026-09-29',
  descripcion:
    'El detalle de las estaciones y los WOD: el mejor por estación (ejercicio + dosis + carga) con su ancla, el historial de las simulaciones y los WOD de referencia del coach, los parciales de la última carrera oficial y el hueco por tramo entero contra el objetivo. Lo que TrainingPeaks no puede dar porque no tiene los entrenos tipados.',
  fuentes: [],
  enApp: 'Hoy las estaciones son marcas sueltas y la carrera es una pantalla aparte con un índice de 0 a 100. Esto las junta sobre el contrato único, con el mismo mecanismo de mejora que las demás familias.',
  dispositivo: 'iphone',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  { id: 'lleno', titulo: '① Marta · ocho estaciones, simulaciones y una oficial', descripcion: 'Mejor por estación con su fecha y su ancla (dos estimadas desde la simulación), la simulación completa bajando de 1:21 a 1:14, la media simulación y el AMRAP del coach, los parciales de HYROX Barcelona (marzo) y el hueco por tramo entero contra el objetivo de Madrid.' },
  { id: 'mixto', titulo: '② Pau · tres estaciones, sin WOD', descripcion: 'POCO DATO: solo tres estaciones con marca (el resto «sin marca», con la invitación), ninguna simulación ni carrera oficial, y la previsión parcial (11 de 17) que no inventa un tiempo.' },
  { id: 'viejo', titulo: '③ Lucía · marcas de agosto', descripcion: 'DATO VIEJO: estaciones y simulación de agosto; sin carrera oficial; la previsión de Valencia sin objetivo.' },
  { id: 'vacio', titulo: '④ Sin estaciones todavía', descripcion: 'VACÍO: la familia entera con su salida.' },
];

export function Screen({ escenario, onLog }: TwinScreenProps) {
  const base = escenario as EscenarioPortada;
  const metodo = METODO_DEFECTO;
  const [ventana, setVentana] = useState<Ventana>(metodo.ventana_por_defecto);
  const d = useMemo(() => detalleEstacionesDe(base, ventana), [base, ventana]);
  const p = useMemo(() => panelDe(base, ventana, metodo), [base, ventana, metodo]);
  const estados = useEstados(p, metodo);
  const { ref, lienzo } = useMedidaLienzo();
  const ancho = (lienzo.ancho || LIENZO.ancho) - 2 * MARGEN;
  const hoy = '2026-09-29';

  useEffect(() => {
    onLog(d ? `${nombreDe(base)} · ${d.estaciones.filter((e) => e.mejor_s != null).length} de 8 estaciones · ${d.wods.length} WOD · oficial: ${d.oficial ? d.oficial.nombre_es : 'ninguna'}` : 'Sin estaciones: vacío');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d]);

  const atras = { texto: 'Analíticas', onTap: () => onLog('← Analíticas') };
  if (!d) {
    return (
      <div ref={ref} style={{ position: 'absolute', inset: 0 }}>
        <PantallaAnaliticas
          titulo="Estaciones y WOD"
          ventana={ventana}
          onVentana={setVentana}
          atras={atras}
          sujeto={<SujetoVacio familia="estaciones" etiqueta="Estaciones y WOD" titulo="Sin estaciones todavía" cuerpo="Con el primer circuito aparecen aquí tu mejor por estación (con la carga que llevabas), tus simulaciones y, con una carrera objetivo, cuánto te falta en cada tramo." salida={{ texto: 'Hacer un circuito de estaciones', onTap: () => onLog('Salida → circuito') }} />}
        >
          {null}
        </PantallaAnaliticas>
      </div>
    );
  }

  const sled = d.estaciones.find((e) => e.estacion === 'sled_push') ?? d.estaciones.find((e) => e.mejor_s != null)!;
  const viejo = sled.fecha != null && sled.fecha < '2026-09-15';
  const cabecera = (
    <CabeceraFamilia
      familia="estaciones"
      etiqueta={`${TRAMO_CARRERA_NOMBRE[sled.estacion]} · ${sled.dosis_es}${sled.carga_es ? ` · ${sled.carga_es}` : ''}`}
      valor={sled.mejor_s}
      unidad="segundos"
      comparacion={sled.mejor_s != null && sled.anterior_s != null ? { contra: 'periodo_anterior', valor: sled.anterior_s, delta: sled.mejor_s - sled.anterior_s, delta_pct: null, significativo: Math.abs(sled.mejor_s - sled.anterior_s) >= metodo.umbrales_cambio.estacion_s, etiqueta_es: 'vs tu anterior mejor' } : null}
      ancla={sled.ancla}
      nota={viejo && sled.fecha ? `Última marca ${fechaLegible(sled.fecha, hoy)} · nada desde entonces` : sled.fecha ? `Tu mejor, ${fechaLegible(sled.fecha, hoy)}` : null}
    />
  );

  return (
    <div ref={ref} style={{ position: 'absolute', inset: 0 }}>
      <PantallaAnaliticas titulo="Estaciones y WOD" ventana={ventana} onVentana={(v) => { setVentana(v); onLog(`Ventana → ${v}`); }} atras={atras} sujeto={cabecera}>
        <Seccion titulo="Mejor por estación" pregunta={`Las ocho del HYROX · ${d.estaciones.filter((e) => e.mejor_s != null).length} con marca`}>
          <Tabla
            etiqueta="Mejor por estación"
            columnas={[
              { id: 'e', cabecera: 'Estación', celda: (x) => <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}><span>{TRAMO_CARRERA_NOMBRE[x.estacion]}</span><Etiqueta>{x.dosis_es}{x.carga_es ? ` · ${x.carga_es}` : ''}</Etiqueta></span> },
              { id: 'm', cabecera: 'Mejor', celda: (x) => (x.mejor_s == null ? <span style={{ color: P.tinta2 }}>sin marca</span> : <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}><span>{reloj(x.mejor_s)}</span>{x.anterior_s != null ? <Etiqueta>{formatearDelta(x.mejor_s - x.anterior_s, 'segundos')} vs antes</Etiqueta> : null}</span>), alinear: 'derecha', ancho: '96px' },
              { id: 'f', cabecera: 'Cuándo', celda: (x) => (x.fecha ? <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>{x.nuevo ? <Sello texto="Nuevo" /> : null}<Etiqueta>{fechaLegible(x.fecha, hoy)}{x.ancla === 'estimada' ? ' · estimado' : ''}</Etiqueta></span> : ''), alinear: 'derecha', ancho: '92px' },
            ]}
            filas={d.estaciones}
            clave={(x) => x.estacion}
          />
          <Nota>«Estimado» = sale del parcial de una simulación, no de una estación hecha sola contra el reloj.</Nota>
        </Seccion>

        <Seccion titulo="Simulaciones y WOD de referencia" pregunta={d.wods.length ? 'Abajo es mejor en tiempo; arriba, en rondas' : 'Los WOD que tu coach repite para medirte'}>
          {d.wods.length === 0 ? (
            <HuecoBloque estado="vacio" titulo="Sin WOD de referencia" cuerpo="Cuando tu coach te ponga una simulación o un WOD de referencia, aquí se queda su historial: es la marca que más se parece a la carrera." salida={{ tipo: 'espera', texto: 'Lo pone tu coach en el plan' }} />
          ) : (
            d.wods.map((w) => (
              <Superficie key={w.id} estilo={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <Cuerpo fuerte estilo={{ flex: '1 1 auto', minWidth: 0 }}>
                    {w.nombre_es}
                  </Cuerpo>
                  {w.ultimo ? (
                    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flex: '0 0 auto' }}>
                      <Numeral texto={w.unidad === 'segundos' ? reloj(w.ultimo.valor) : `${w.ultimo.valor} reps`} cuerpo={DATO_FILA} />
                      <Etiqueta>{fechaLegible(w.ultimo.fecha, hoy)}</Etiqueta>
                    </span>
                  ) : null}
                </div>
                {w.serie.filter((q) => q.v != null).length > 1 ? (
                  <Lineas piel={P} alto={140} series={[{ id: w.id, etiqueta: w.nombre_es, puntos: w.serie, color: colorFamilia(P, 'wod'), formato: (v) => (w.unidad === 'segundos' ? reloj(v) : `${Math.round(v)} reps`), rotuloFinal: true }]} formatoY={(v) => (w.unidad === 'segundos' ? reloj(v) : String(Math.round(v)))} invertido={w.unidad === 'segundos'} leyenda={false} escalaTiempo={w.unidad === 'segundos'} />
                ) : (
                  <Nota>Una sola marca: con la segunda se dibuja la tendencia.</Nota>
                )}
              </Superficie>
            ))
          )}
        </Seccion>

        <Seccion titulo="Tu última carrera oficial" pregunta={d.oficial ? `${d.oficial.nombre_es} · ${fechaLegible(d.oficial.fecha, hoy)} · ${reloj(d.oficial.total_s)}` : 'Los parciales oficiales, tramo a tramo'}>
          {d.oficial ? (
            <>
              <Rejilla>
                <Celda etiqueta="Tiempo oficial" valor={d.oficial.total_s} unidad="segundos" nota={`${d.oficial.tramos.filter((t) => t.tramo.startsWith('run')).reduce((s, t) => s + t.s, 0) > 0 ? `correr ${reloj(d.oficial.tramos.filter((t) => t.tramo.startsWith('run')).reduce((s, t) => s + t.s, 0))} · estaciones ${reloj(d.oficial.tramos.filter((t) => !t.tramo.startsWith('run') && t.tramo !== 'roxzone').reduce((s, t) => s + t.s, 0))} · Roxzone ${reloj(d.oficial.tramos.find((t) => t.tramo === 'roxzone')?.s ?? 0)}` : ''}`} aLoAncho />
              </Rejilla>
              <Superficie>
                <BarrasSimples piel={P} filas={d.oficial.tramos.map((t) => ({ id: t.tramo, etiqueta: TRAMO_CARRERA_NOMBRE[t.tramo], valor: t.s, color: t.tramo.startsWith('run') ? colorFamilia(P, 'correr') : t.tramo === 'roxzone' ? P.tinta2 : colorFamilia(P, 'estaciones') }))} formato={(v) => reloj(v)} anchoInicial={ancho - 32} altoFila={28} />
              </Superficie>
            </>
          ) : (
            <HuecoBloque estado="vacio" titulo="Sin carrera oficial todavía" cuerpo="Cuando hagas un HYROX, sus parciales oficiales se importan y se quedan aquí: son la mejor previsión que existe." salida={{ tipo: 'accion', texto: 'Importar una carrera', onTap: () => onLog('Salida → importar carrera') }} />
          )}
        </Seccion>

        <BloqueCarrera p={p} metodo={metodo} estados={estados} onLog={onLog} ancho={ancho} todosLosTramos />
      </PantallaAnaliticas>
    </div>
  );
}
