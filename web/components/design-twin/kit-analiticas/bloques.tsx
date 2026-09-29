'use client';

// LOS OCHO BLOQUES DE LA PORTADA (iPhone) — cada uno responde su pregunta
// (§3) desde el contrato, con sus cuatro estados resueltos (A10) y las piezas
// del kit. La portada los apila; los detalles reutilizan varios (el de
// carrera entero en el detalle de estaciones, el de semanas filtrado en cada
// familia). Ningún bloque escribe prosa: la del hueco viene de `huecos.ts`.

import { useState, type ReactNode } from 'react';
import { FAMILIA_GRANDE, FAMILIA_GRANDE_NOMBRE, type Bloque, type EstadoBloque, type LecturaPanel, type PanelAnaliticas } from './contrato';
import { cubosCarga, cubosZonas, estadosDe, huecosTop, lectura, leyendaFamilias, leyendaZonas, partesPolarizacion, resumenSesiones, tramosEnOrden, tramosSinDato, valorDe } from './derivados';
import { enDias, fechaLegible, formatear, formatearDelta, horas, reloj } from './fmt';
import { BarraReparto, BarrasHueco, Chispa, Columnas, Divergente, Lineas } from './graficos';
import { textoHueco } from './huecos';
import { seriesForma } from './derivados';
import { agrupacionDe } from './derivados';
import type { MetodoAnaliticas } from './metodo';
import { BotonAccion, Celda, Cuerpo, Delta, Etiqueta, FilaProgreso, FilaRecord, FilaSesion, HuecoBloque, Lista, Nota, Numeral, Rejilla, Seccion, Segmento, Superficie } from './piezas';
import { PIEL_IPHONE as P, TA } from './tokens';

export interface BloqueProps {
  p: PanelAnaliticas;
  metodo: MetodoAnaliticas;
  estados: Record<Bloque, EstadoBloque>;
  onLog: (l: string) => void;
  /** Ancho útil del lienzo, para decidir cuántas columnas caben. */
  ancho: number;
}

export function useEstados(p: PanelAnaliticas, metodo: MetodoAnaliticas): Record<Bloque, EstadoBloque> {
  return estadosDe(p, metodo);
}

function Hueco({ bloque, estado, lecturas, p, metodo, onLog, ultimoDato = null }: { bloque: Bloque; estado: Exclude<EstadoBloque, 'lleno'>; lecturas: readonly LecturaPanel[]; p: PanelAnaliticas; metodo: MetodoAnaliticas; onLog: (l: string) => void; ultimoDato?: string | null }) {
  const t = textoHueco(bloque, estado, lecturas, p.atleta.hoy, metodo, ultimoDato);
  const salida = t.salida.tipo === 'accion' ? { ...t.salida, onTap: () => onLog(`Salida → ${t.salida.texto}`) } : t.salida;
  return <HuecoBloque estado={estado} titulo={t.titulo} cuerpo={t.cuerpo} salida={salida} plazo={t.plazo} />;
}

// ---------------------------------------------------------------------------
// 2 · Forma y fatiga
// ---------------------------------------------------------------------------

export function BloqueForma({ p, metodo, estados, onLog }: BloqueProps) {
  const estado = estados.forma;
  const { series, marcas } = seriesForma(p, P, (v) => String(Math.round(v)));
  const frescura = lectura(p.forma.lecturas, 'forma.frescura');
  const subida = lectura(p.forma.lecturas, 'forma.subida');
  const cobertura = lectura(p.forma.lecturas, 'forma.cobertura');
  const fatiga = lectura(p.forma.lecturas, 'forma.fatiga');
  const v = p.forma.veredicto;
  return (
    <Seccion titulo="Forma y fatiga" pregunta="¿Gano forma o me paso? ¿Llego fresco?" onAbrir={() => onLog('→ Forma y fatiga (detalle)')}>
      {estado !== 'lleno' ? <Hueco bloque="forma" estado={estado} lecturas={p.forma.lecturas} p={p} metodo={metodo} onLog={onLog} /> : null}
      {estado === 'poco' && fatiga?.dato ? (
        <Rejilla>
          <Celda etiqueta="Fatiga (7 días)" valor={fatiga.dato.valor} unidad="tss" comparacion={fatiga.dato.comparacion} ancla={fatiga.procedencia.ancla} aLoAncho />
        </Rejilla>
      ) : null}
      {series.length >= 2 ? (
        <Superficie estilo={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Lineas piel={P} alto={190} series={series} marcas={marcas} formatoY={(x) => String(Math.round(x))} desdeCero />
          {frescura?.serie ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Etiqueta>Frescura · forma menos fatiga</Etiqueta>
              <Divergente piel={P} alto={92} puntos={frescura.serie.hecho} proyeccion={frescura.serie.proyeccion} marcas={marcas} formato={(x) => (x > 0 ? `+${Math.round(x)}` : String(Math.round(x)))} />
            </div>
          ) : null}
        </Superficie>
      ) : null}
      {v ? (
        <Cuerpo fuerte={v.clase !== 'sin-veredicto'} tono={v.clase === 'sin-veredicto' ? P.tinta2 : P.tinta}>
          {v.frase_es}
          {v.retirado_es ? ` ${v.retirado_es}` : ''}
        </Cuerpo>
      ) : null}
      {estado === 'lleno' && (subida?.dato || cobertura?.dato) ? (
        <Rejilla>
          {subida?.dato ? <Celda etiqueta="Subida de forma" valor={subida.dato.valor} unidad="tss_semana" comparacion={subida.dato.comparacion} nota="por semana" /> : null}
          {cobertura?.dato ? <Celda etiqueta="Carga calculada" valor={cobertura.dato.valor} unidad="pct" nota={cobertura.cobertura.estimada_pct ? `${Math.round(cobertura.cobertura.estimada_pct)} % con umbral estimado` : 'todo medido o declarado'} /> : null}
        </Rejilla>
      ) : null}
    </Seccion>
  );
}

// ---------------------------------------------------------------------------
// 3 · Semana a semana
// ---------------------------------------------------------------------------

export function BloqueSemanas({ p, metodo, estados, onLog, ancho, familia }: BloqueProps & { familia?: string }) {
  const estado = estados.semanas;
  const [modo, setModo] = useState<'carga' | 'horas'>('carga');
  const lecturas = familia ? p.semanas.lecturas.filter((l) => FAMILIA_GRANDE[l.familia === 'todas' ? 'correr' : l.familia] === familia) : p.semanas.lecturas;
  const panel = familia ? { ...p, semanas: { ...p.semanas, lecturas } } : p;
  const n = lecturas[0]?.serie?.hecho.length ?? 0;
  const agrupar = agrupacionDe(n, ancho - 60);
  const cubos = cubosCarga(panel, modo, P, agrupar);
  const leyenda = leyendaFamilias(panel, P);
  const r = resumenSesiones(p.semanas.sesiones);
  const sesiones = familia ? p.semanas.sesiones.filter((s) => FAMILIA_GRANDE[s.familia] === familia) : p.semanas.sesiones;
  return (
    <Seccion
      titulo="Semana a semana"
      pregunta="¿Hago lo que toca?"
      onAbrir={() => onLog('→ Semana a semana (detalle)')}
      accesorio={estado !== 'vacio' ? <Segmento items={[{ id: 'carga', texto: 'Carga' }, { id: 'horas', texto: 'Horas' }]} valor={modo} onCambio={(m) => { setModo(m); onLog(`Semana a semana → ${m}`); }} etiqueta="Carga u horas" /> : undefined}
    >
      {estado !== 'lleno' ? <Hueco bloque="semanas" estado={estado} lecturas={p.semanas.lecturas} p={p} metodo={metodo} onLog={onLog} /> : null}
      {cubos.length > 0 ? (
        <Superficie>
          <Columnas piel={P} alto={200} cubos={cubos} leyenda={leyenda} formatoY={modo === 'carga' ? (v) => String(Math.round(v)) : (v) => `${Math.round(v / 3600)} h`} etiquetaPlan="Plan" divisor={modo === 'carga' ? 1 : 3600} />
          {agrupar > 1 ? <Nota>Cada columna suma {agrupar} semanas: a este ancho una por semana no se lee.</Nota> : null}
        </Superficie>
      ) : null}
      {sesiones.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Cuerpo fuerte>
            {r.hechas} de {r.total} sesiones hechas · {r.dentro} dentro de lo pedido
            {r.sinPlan ? ` · ${r.sinPlan} sin plan` : ''}
          </Cuerpo>
          <Etiqueta>Las últimas {Math.min(5, sesiones.length)} · toca una para verla tramo a tramo</Etiqueta>
          <Lista>
            {sesiones.slice(0, 5).map((s) => (
              <FilaSesion key={s.id} s={s} hoy={p.atleta.hoy} onAbrir={() => onLog(`→ Sesión ${s.titulo_es} (${s.fecha})`)} />
            ))}
          </Lista>
        </div>
      ) : null}
    </Seccion>
  );
}

// ---------------------------------------------------------------------------
// 4 · Intensidad
// ---------------------------------------------------------------------------

export function BloqueIntensidad({ p, metodo, estados, onLog, ancho }: BloqueProps) {
  const estado = estados.intensidad;
  const n = p.intensidad.lecturas[0]?.serie?.hecho.length ?? 0;
  const agrupar = agrupacionDe(n, ancho - 60);
  const cubos = cubosZonas(p, P, agrupar);
  const partes = partesPolarizacion(p, P);
  const objetivo = p.intensidad.polarizacion?.objetivo?.find((o) => o.code === 'baja');
  const zonasEstimadas = p.intensidad.lecturas.some((l) => l.estado === 'medida' && l.procedencia.ancla === 'estimada');
  return (
    <Seccion titulo="Intensidad" pregunta="¿Entreno a la intensidad que toca?" onAbrir={() => onLog('→ Intensidad (detalle)')}>
      {estado !== 'lleno' ? <Hueco bloque="intensidad" estado={estado} lecturas={p.intensidad.lecturas} p={p} metodo={metodo} onLog={onLog} /> : null}
      {cubos.length > 0 ? (
        <Superficie>
          <Columnas piel={P} alto={190} cubos={cubos} leyenda={leyendaZonas(p, P)} formatoY={(v) => `${Math.round(v / 3600)} h`} divisor={3600} />
        </Superficie>
      ) : null}
      {partes.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Etiqueta>Reparto · {horas(p.intensidad.polarizacion!.total)} con pulso</Etiqueta>
          <BarraReparto piel={P} partes={partes} objetivo={objetivo ? { pct: objetivo.pct, etiqueta: `tu coach pide ${objetivo.pct} % suave` } : null} />
        </div>
      ) : null}
      {zonasEstimadas ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Nota>Zonas estimadas desde tu pulso máximo declarado: con el test de zonas pasan a medidas y la carga sube de fiabilidad.</Nota>
          <BotonAccion texto="Hacer el test de zonas" secundario onTap={() => onLog('Salida → Hacer el test de zonas')} />
        </div>
      ) : null}
    </Seccion>
  );
}

// ---------------------------------------------------------------------------
// 5 · Progreso: una fila por familia
// ---------------------------------------------------------------------------

export function BloqueProgreso({ p, metodo, estados, onLog }: BloqueProps) {
  const estado = estados.progreso;
  return (
    <Seccion titulo="Progreso" pregunta="¿Mejoro? Una marca por familia">
      {estado === 'vacio' || estado === 'viejo' ? <Hueco bloque="progreso" estado={estado} lecturas={p.progreso} p={p} metodo={metodo} onLog={onLog} /> : null}
      {p.progreso.length > 0 ? (
        <Lista>
          {p.progreso.map((l) => {
            const f = l.familia === 'todas' ? 'correr' : l.familia;
            const nota =
              l.estado === 'sin_dato'
                ? l.cobertura.falta?.por === 'ocasion'
                  ? `Sin ${FAMILIA_GRANDE_NOMBRE[FAMILIA_GRANDE[f]].toLowerCase() === 'ergo' ? l.titulo_es.toLowerCase() : FAMILIA_GRANDE_NOMBRE[FAMILIA_GRANDE[f]].toLowerCase()} en tu plan · si lo haces, aquí sale`
                  : `Todavía nada · con la primera sesión sale tu ${l.titulo_es.toLowerCase()}`
                : l.cobertura.muestras < metodo.muestras_minimas
                  ? `${l.cobertura.muestras} de ${metodo.muestras_minimas} sesiones para la tendencia`
                  : null;
            return (
              <FilaProgreso
                key={l.id}
                familia={f}
                metrica={l.titulo_es}
                valor={l.dato?.valor ?? null}
                unidad={l.dato?.unidad ?? 'segundos'}
                comparacion={l.dato?.comparacion ?? null}
                tendencia={l.serie?.hecho ?? null}
                nota={nota}
                onAbrir={l.estado === 'medida' ? () => onLog(`→ Detalle de ${l.familia}`) : undefined}
              />
            );
          })}
        </Lista>
      ) : null}
    </Seccion>
  );
}

// ---------------------------------------------------------------------------
// 6 · Récords
// ---------------------------------------------------------------------------

export function BloqueRecords({ p, metodo, estados, onLog, max = 5 }: BloqueProps & { max?: number }) {
  const estado = estados.records;
  const nuevos = p.records.filter((r) => r.nuevo).length;
  return (
    <Seccion
      titulo="Récords"
      pregunta={p.records.length ? `${p.records.length} marcas${nuevos ? ` · ${nuevos} nueva${nuevos > 1 ? 's' : ''} en esta ventana` : ''}` : '¿Qué marcas tengo?'}
      onAbrir={p.records.length > max ? () => onLog('→ Todos los récords') : undefined}
    >
      {estado !== 'lleno' ? <Hueco bloque="records" estado={estado} lecturas={[]} p={p} metodo={metodo} onLog={onLog} ultimoDato={p.records.length ? p.records.map((r) => r.fecha).reduce((a, b) => (a > b ? a : b)) : null} /> : null}
      {p.records.length > 0 ? (
        <Lista>
          {p.records.slice(0, max).map((r) => (
            <FilaRecord key={r.id} r={r} hoy={p.atleta.hoy} />
          ))}
        </Lista>
      ) : null}
    </Seccion>
  );
}

// ---------------------------------------------------------------------------
// 7 · Carrera
// ---------------------------------------------------------------------------

export function BloqueCarrera({ p, metodo, estados, onLog, ancho, todosLosTramos = false }: BloqueProps & { todosLosTramos?: boolean }) {
  const estado = estados.carrera;
  const c = p.carrera;
  const titulo = c ? `${c.nombre_es} · ${fechaLegible(c.fecha, p.atleta.hoy)} · ${enDias(c.dias)}` : 'Carrera';
  return (
    <Seccion titulo="Carrera" pregunta={c ? titulo : '¿Llego a mi carrera?'} onAbrir={c ? () => onLog('→ Carrera (los 17 tramos)') : undefined}>
      {estado !== 'lleno' && (estado !== 'poco' || !c) ? <Hueco bloque="carrera" estado={estado} lecturas={[]} p={p} metodo={metodo} onLog={onLog} ultimoDato={p.records.length ? p.records.map((r) => r.fecha).reduce((a, b) => (a > b ? a : b)) : null} /> : null}
      {c && c.previsto_s == null ? (
        <HuecoBloque
          estado="poco"
          titulo={`Previsión parcial: ${c.cobertura.con_dato} de ${c.cobertura.de} tramos`}
          cuerpo={`Sin marca de ${tramosSinDato(c).slice(0, 3).join(', ')}${tramosSinDato(c).length > 3 ? ` y ${tramosSinDato(c).length - 3} más` : ''}. Una simulación los rellena todos de golpe.`}
          salida={{ tipo: 'accion', texto: 'Hacer una simulación', onTap: () => onLog('Salida → Hacer una simulación') }}
        />
      ) : null}
      {c && c.previsto_s != null ? (
        <>
          <Rejilla>
            <Celda
              etiqueta="Tiempo previsto"
              valor={c.previsto_s}
              unidad="segundos"
              comparacion={c.objetivo_s != null && c.hueco_s != null ? { contra: 'objetivo', valor: c.objetivo_s, delta: c.hueco_s, delta_pct: null, significativo: Math.abs(c.hueco_s) >= metodo.umbrales_cambio.prevision_carrera_s, etiqueta_es: `objetivo ${reloj(c.objetivo_s)}` } : null}
              nota={c.objetivo_s == null ? 'sin objetivo de tiempo' : undefined}
              pie={
                c.tendencia.length > 1 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <Etiqueta>cómo se ha movido la previsión en la ventana (abajo es mejor)</Etiqueta>
                    <Chispa piel={P} puntos={c.tendencia} ancho={ancho - 68} alto={40} />
                  </div>
                ) : undefined
              }
              aLoAncho
            />
          </Rejilla>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Etiqueta>{todosLosTramos ? 'Hueco por tramo · positivo = te falta' : 'Donde más te falta · frente a tu objetivo por tramo'}</Etiqueta>
            {c.hueco_s != null ? (
              <BarrasHueco piel={P} filas={(todosLosTramos ? tramosEnOrden(c) : huecosTop(c, 3)).map((f) => ({ ...f, color: (f.valor ?? 0) > 0 ? P.tinta2 : P.tinta }))} formato={(v) => formatearDelta(v, 'segundos')} />
            ) : (
              <Nota>Pon un objetivo de tiempo a tu carrera y verás cuánto te falta en cada tramo.</Nota>
            )}
          </div>
          <Nota>
            {c.cobertura.con_dato} de {c.cobertura.de} tramos con marca propia
            {c.tramos.some((t) => t.ancla === 'estimada') ? ' · los estimados salen de tu última simulación' : ''}.
          </Nota>
        </>
      ) : null}
    </Seccion>
  );
}

// ---------------------------------------------------------------------------
// 8 · Recuperación
// ---------------------------------------------------------------------------

export function BloqueRecuperacion({ p, metodo, estados, onLog }: BloqueProps) {
  const estado = estados.recuperacion;
  const conDato = p.recuperacion.filter((l) => l.estado === 'medida' && l.dato);
  return (
    <Seccion titulo="Recuperación" pregunta="¿Asimilo? Contra tu basal">
      {estado !== 'lleno' ? <Hueco bloque="recuperacion" estado={estado} lecturas={p.recuperacion} p={p} metodo={metodo} onLog={onLog} /> : null}
      {conDato.length > 0 ? (
        <Rejilla>
          {conDato.map((l, i) => (
            <Celda
              key={l.id}
              etiqueta={l.titulo_es}
              valor={l.dato!.valor}
              unidad={l.dato!.unidad}
              comparacion={l.dato!.comparacion}
              aLoAncho={conDato.length % 2 === 1 && i === conDato.length - 1}
              pie={l.serie ? <Chispa piel={P} puntos={l.serie.hecho} banda={l.serie.banda} ancho={conDato.length % 2 === 1 && i === conDato.length - 1 ? 200 : 120} /> : undefined}
            />
          ))}
        </Rejilla>
      ) : null}
      {conDato.length > 0 ? <Nota>Media de las últimas {metodo.reciente_dias} noches contra tu basal de {metodo.ventana_basal_dias} días. La banda gris de cada gráfica es tu basal.</Nota> : null}
    </Seccion>
  );
}

// ---------------------------------------------------------------------------
// El bloque como tarjeta suelta (para la variante por pastillas)
// ---------------------------------------------------------------------------

export function CeldaClave({ l, hoy }: { l: LecturaPanel; hoy: string }) {
  if (!l.dato) return null;
  return (
    <Superficie estilo={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Etiqueta>{l.titulo_es}</Etiqueta>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <Numeral texto={formatear(l.dato.valor, l.dato.unidad)} cuerpo={TA.dato.cuerpo} />
        {l.dato.comparacion ? <Delta comparacion={l.dato.comparacion} unidad={l.dato.unidad} /> : null}
      </span>
      {l.cobertura.ultimo_dato ? <Etiqueta>última marca {fechaLegible(l.cobertura.ultimo_dato, hoy)}</Etiqueta> : null}
    </Superficie>
  );
}

export function valorEstado(p: PanelAnaliticas, id: string): number | null {
  return valorDe(p.estado.lecturas, id);
}

export function Bloques({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
