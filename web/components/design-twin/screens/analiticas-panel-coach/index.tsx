'use client';

// LA PESTAÑA RENDIMIENTO DEL COACH, REHECHA — el mismo contrato que la
// portada del atleta, más ancho (2–3 columnas), con los tokens v2 del panel y
// lo que añade el coach (§3): la tabla de cumplimiento por tramo, comparar
// periodos, comparar dos sesiones o tests, y el acceso a su método.
//
// Dispositivo «escritorio» del doble (1440 y 1280): esta propuesta pinta con
// los primitivos reales del panel (`components/v2/ui`) dentro de `.v2-root`,
// así lo que se ve es el producto real con su tema, no una maqueta aparte.
// A1: `panelDe(escenario, ventana)` es la misma función que llama el iPhone.

import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, GripVertical, Plus, Settings2 } from 'lucide-react';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { Button, Card, KPI, KPIRow, SegmentedControl, Tabs, Tag } from '@/components/v2/ui';
import { cn } from '@/lib/utils';
import { CUMPLIMIENTO_PALABRA, FAMILIA_NOMBRE, TRAMO_CARRERA_NOMBRE, VENTANAS, VENTANA_ETIQUETA, type Ventana } from '../../kit-analiticas/contrato';
import { ESCENARIOS_PORTADA, nombreDe, panelDe, type EscenarioPortada } from '../../kit-analiticas/casos/atletas';
import { ESCENARIOS_SESION, sesionDe, type EscenarioSesion } from '../../kit-analiticas/casos/sesiones';
import { agrupacionDe, cubosCarga, cubosZonas, estadosDe, lectura, leyendaFamilias, leyendaZonas, partesPolarizacion, resumenSesiones, seriesForma, tramosEnOrden, tramosSinDato } from '../../kit-analiticas/derivados';
import { enDias, fechaLegible, formatear, formatearDelta, horas, reloj } from '../../kit-analiticas/fmt';
import { BarraReparto, BarrasHueco, Chispa, Columnas, Divergente, Lineas } from '../../kit-analiticas/graficos';
import { LineaTiempo } from '../../kit-analiticas/graficos-sesion';
import { textoHueco } from '../../kit-analiticas/huecos';
import { METODO_DEFECTO, PELDANO_NOMBRE } from '../../kit-analiticas/metodo';
import { AnclaPanel, CabeceraTarjeta, CifraPanel, DeltaPanel, HuecoPanel, PuntoFamiliaPanel, TablaPanel } from '../../kit-analiticas/panel-piezas';
import { PIEL_PANEL as P, colorFamilia } from '../../kit-analiticas/tokens';
import { useAncho } from '../../kit-analiticas/graficos';

export const meta: TwinMeta = {
  id: 'analiticas-panel-coach',
  titulo: 'Panel del coach · Rendimiento, rehecha',
  zona: 'Marcas y tests',
  estado: 'propuesta',
  actualizado: '2026-09-29',
  descripcion:
    'La pestaña Rendimiento de la ficha del atleta como panel denso de 12 columnas con el MISMO contrato que la portada del iPhone: Estado, Forma y fatiga con proyección, Semana a semana, Intensidad, Progreso, Récords, Carrera y Recuperación — y lo que añade el coach: cumplimiento por tramo, comparar periodos, comparar sesiones o tests y el acceso a su método. Con los tokens v2 y a 1440 y 1280.',
  fuentes: [],
  enApp:
    'Hoy la pestaña (RendimientoView) apila Zonas y tests · Running · Fuerza · Fisiología · Carreras con su propio cálculo de carga a 42/7 fijos (LoadBlock/PmcChart) y sin la ventana del atleta. Esto la sustituye entera leyendo `GET /api/coach/athletes/[id]/analytics/panel`, el mismo JSON que el iPhone.',
  dispositivo: 'escritorio',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  { id: 'lleno', titulo: '① Marta · todo lleno, a 39 días de Madrid', descripcion: 'Los ocho bloques con dato en tres columnas: Forma y fatiga grande con la proyección, Semana a semana con la lista de sesiones, Intensidad por zonas y reparto, Progreso con una fila por familia, Récords, Carrera con el hueco de los 17 tramos, Recuperación. Abajo, lo del coach: el cumplimiento por tramo de una sesión elegida y comparar dos sesiones. Cambia el ancho (1440 · 1280) y el tema en el panel.' },
  { id: 'comparar-periodos', titulo: '② Comparar periodos · esta ventana frente a la anterior', descripcion: 'El conmutador «Comparar con el periodo anterior» añade a Progreso la columna del periodo anterior y a Semana a semana la media de la ventana anterior como línea de referencia. El delta ya estaba (A3); esto lo pone al lado del número.' },
  { id: 'comparar-sesiones', titulo: '③ Comparar sesiones · el 4 × 1000 contra el remo 5 × 500', descripcion: 'Dos sesiones elegidas a la vez: la tabla de tramos de una y la curva de pulso de la otra encima, a trazos. Vale para dos tests del mismo protocolo (el 2000 m de junio contra el de septiembre).' },
  { id: 'mixto', titulo: '④ Pau · anclas mezcladas, previsión parcial', descripcion: 'Correr medido, ergo declarado, fuerza por esfuerzo, sin reloj: los chips de ancla en cada cifra, el veredicto con el % estimado y Carrera con 11 de 17 tramos sin inventar un tiempo.' },
  { id: 'poco', titulo: '⑤ Jordi · tres semanas', descripcion: 'POCO DATO en el panel: cada tarjeta con su línea de hueco y su salida, sin sermón.' },
  { id: 'viejo', titulo: '⑥ Lucía · parada 23 días', descripcion: 'DATO VIEJO: la raya ámbar en cada tarjeta dice desde cuándo, y lo que hay se sigue viendo.' },
  { id: 'vacio', titulo: '⑦ Recién dado de alta', descripcion: 'VACÍO: la ficha de un atleta nuevo. Cada tarjeta con lo que la llena.' },
  { id: 'variante-configurable', titulo: 'VARIANTE §11.3 · gráficos que el coach arrastra y configura (TrainingPeaks)', descripcion: 'La alternativa a los bloques fijos: cada tarjeta con asa para arrastrar, «Añadir gráfico» y «Guardar disposición». Gana libertad; pierde que el coach vea lo mismo que el atleta y que las 100 fichas se lean igual. Para decidir Alex.' },
];

const ANCHO_INICIAL = 1392;

function escenarioBase(id: string): EscenarioPortada {
  return (ESCENARIOS_PORTADA as readonly string[]).includes(id) ? (id as EscenarioPortada) : 'lleno';
}

export function Screen({ escenario, appearance, onLog }: TwinScreenProps) {
  const base = escenarioBase(escenario);
  const metodo = METODO_DEFECTO;
  const [ventana, setVentana] = useState<Ventana>(metodo.ventana_por_defecto);
  const [comparar, setComparar] = useState(escenario === 'comparar-periodos');
  const [modoSemanas, setModoSemanas] = useState<'carga' | 'horas'>('carga');
  const [sesionA, setSesionA] = useState<EscenarioSesion>('cinta-4x1000');
  const [sesionB, setSesionB] = useState<EscenarioSesion | null>(escenario === 'comparar-sesiones' ? 'remo-5x500' : null);
  const configurable = escenario === 'variante-configurable';
  const p = useMemo(() => panelDe(base, ventana, metodo), [base, ventana, metodo]);
  const pAnterior = useMemo(() => (comparar ? panelDe(base, ventana, metodo) : null), [base, ventana, metodo, comparar]);
  const estados = estadosDe(p, metodo);
  const hoy = p.atleta.hoy;
  const { ref, ancho } = useAncho<HTMLDivElement>(ANCHO_INICIAL);
  const sA = useMemo(() => sesionDe(sesionA, metodo), [sesionA, metodo]);
  const sB = useMemo(() => (sesionB ? sesionDe(sesionB, metodo) : null), [sesionB, metodo]);

  useEffect(() => {
    onLog(`${p.atleta.nombre} · ventana ${p.ventana.ventana} · ${Object.entries(estados).map(([b, e]) => `${b}=${e}`).join(' · ')}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p]);

  const { series, marcas } = seriesForma(p, P, (v) => String(Math.round(v)));
  const frescura = lectura(p.forma.lecturas, 'forma.frescura');
  const subida = lectura(p.forma.lecturas, 'forma.subida');
  const cobertura = lectura(p.forma.lecturas, 'forma.cobertura');
  const disposicion = lectura(p.estado.lecturas, 'estado.disposicion');
  const anchoCol = (span: number) => Math.max(200, ((ancho - 16 * 11) / 12) * span + 16 * (span - 1) - 32);
  const cubosSemanas = cubosCarga(p, modoSemanas, P, agrupacionDe(p.semanas.lecturas[0]?.serie?.hecho.length ?? 0, anchoCol(7) - 60, 18));
  const cubosZ = cubosZonas(p, P, agrupacionDe(p.intensidad.lecturas[0]?.serie?.hecho.length ?? 0, anchoCol(5) - 60, 18));
  const r = resumenSesiones(p.semanas.sesiones);
  const hueco = (bloque: Parameters<typeof textoHueco>[0], lecturas: Parameters<typeof textoHueco>[2], ultimoDato: string | null = null) => {
    const e = estados[bloque];
    if (e === 'lleno') return null;
    const t = textoHueco(bloque, e, lecturas, hoy, metodo, ultimoDato);
    return <HuecoPanel estado={e} titulo={t.titulo} cuerpo={t.plazo ? `${t.cuerpo} ${t.plazo.llevas} de ${t.plazo.hacen} semanas.` : t.cuerpo} accion={t.salida.tipo === 'accion' ? t.salida.texto : null} onAccion={() => onLog(`Salida → ${t.salida.texto}`)} />;
  };
  const mediaAnterior = comparar && pAnterior ? Math.round(p.semanas.lecturas.filter((l) => l.id.startsWith('semanas.carga.')).reduce((s, l) => s + (l.dato?.comparacion?.valor ?? 0), 0) / Math.max(1, cubosSemanas.length)) : null;
  const ultimoRecord = p.records.length ? p.records.map((x) => x.fecha).reduce((a, b) => (a > b ? a : b)) : null;

  return (
    <div className="v2-root twin-scroll" data-theme={appearance} style={{ position: 'absolute', inset: 0, overflowY: 'auto', background: 'var(--v2-bg)', color: 'var(--v2-fg)', fontFamily: 'var(--v2-font-sans)' }}>
      <div ref={ref} className="mx-auto flex w-full max-w-[var(--v2-container)] flex-col gap-4 px-6 py-5">
        {/* La cabecera de la ficha (el cockpit): quién es y el Estado, el mismo que el atleta. */}
        <header className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex size-10 items-center justify-center rounded-full bg-v2-surface-2 t-title-sm text-v2-fg">{nombreDe(base).slice(0, 1)}</span>
            <div>
              <h1 className="t-title text-v2-fg">{nombreDe(base)}{base === 'vacio' ? ' (nuevo)' : ''}</h1>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 t-meta text-v2-muted">
                <Tag>HYROX</Tag>
                {p.atleta.carrera ? <span>{p.atleta.carrera.nombre_es} · {fechaLegible(p.atleta.carrera.fecha, hoy)}</span> : <span>sin carrera objetivo</span>}
              </div>
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-x-5 gap-y-2">
            <div className="flex items-baseline gap-2">
              <span className="t-label text-v2-faint">Hoy</span>
              <span className={cn('t-title-sm', p.estado.palabra_es ? 'text-v2-fg' : 'text-v2-muted')}>{p.estado.palabra_es ?? 'Sin carga todavía'}</span>
            </div>
            {(['estado.forma', 'estado.fatiga', 'estado.frescura'] as const).map((id) => {
              const l = lectura(p.estado.lecturas, id);
              return l?.dato ? (
                <div key={id} className="flex items-baseline gap-1.5">
                  <span className="t-label text-v2-faint">{l.titulo_es}</span>
                  <span className="t-title-sm t-tnum text-v2-fg">{id === 'estado.frescura' && l.dato.valor > 0 ? '+' : ''}{Math.round(l.dato.valor)}</span>
                </div>
              ) : null;
            })}
            {disposicion?.dato ? (
              <div className="flex items-baseline gap-1.5">
                <span className="t-label text-v2-faint">Disposición</span>
                <span className="t-title-sm t-tnum text-v2-fg">{Math.round(disposicion.dato.valor)}</span>
                <span className="t-meta text-v2-muted">{disposicion.procedencia.explica_es}</span>
              </div>
            ) : null}
          </div>
        </header>

        <Tabs items={[{ value: 'plan', label: 'Plan' }, { value: 'rendimiento', label: 'Rendimiento' }, { value: 'perfil', label: 'Perfil' }]} value="rendimiento" onValueChange={(v) => onLog(`Pestaña → ${v}`)} aria-label="Secciones del atleta" />

        {/* La fila de filtros: UNA ventana para todo (A4), comparar, el método. */}
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl aria-label="Periodo" items={VENTANAS.map((v) => ({ value: v, label: VENTANA_ETIQUETA[v] }))} value={ventana} onValueChange={(v) => { setVentana(v); onLog(`Ventana → ${v}`); }} />
          <span className="t-meta text-v2-faint t-tnum">{fechaLegible(p.ventana.desde, hoy)} → {fechaLegible(p.ventana.hasta, hoy)} · anterior {fechaLegible(p.ventana.anterior.desde, hoy)} → {fechaLegible(p.ventana.anterior.hasta, hoy)}</span>
          <Button size="sm" variant={comparar ? 'secondary' : 'ghost'} onClick={() => { setComparar((c) => !c); onLog(`Comparar con el periodo anterior → ${!comparar}`); }}>
            {comparar ? 'Comparando con el periodo anterior' : 'Comparar con el periodo anterior'}
          </Button>
          <div className="ml-auto flex items-center gap-2">
            {configurable ? (
              <>
                <Button size="sm" variant="ghost" icon={Plus} onClick={() => onLog('Añadir gráfico')}>Añadir gráfico</Button>
                <Button size="sm" variant="secondary" onClick={() => onLog('Guardar disposición')}>Guardar disposición</Button>
              </>
            ) : null}
            <Button size="sm" variant="ghost" icon={Settings2} onClick={() => onLog('→ Ajustes › Método (analíticas)')}>Método: 42/7 · frescura · cumplimiento</Button>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-4">
          {/* 2 · Forma y fatiga */}
          <Card className="col-span-8">
            <CabeceraTarjeta titulo="Forma y fatiga" pregunta="¿Gana forma o se pasa? ¿Llega fresca? Proyección con la carga planificada hasta la carrera" arrastrable={configurable} accion={configurable ? <GripVertical aria-hidden className="size-4 text-v2-faint" /> : null} />
            {hueco('forma', p.forma.lecturas)}
            {series.length >= 2 ? (
              <div className="mt-3 flex flex-col gap-3">
                <Lineas piel={P} alto={250} series={series} marcas={marcas} formatoY={(x) => String(Math.round(x))} desdeCero anchoInicial={anchoCol(8)} />
                {frescura?.serie ? (
                  <div className="flex flex-col gap-1">
                    <span className="t-label text-v2-faint">Frescura · forma menos fatiga</span>
                    <Divergente piel={P} alto={84} puntos={frescura.serie.hecho} proyeccion={frescura.serie.proyeccion} marcas={marcas} formato={(x) => (x > 0 ? `+${Math.round(x)}` : String(Math.round(x)))} anchoInicial={anchoCol(8)} />
                  </div>
                ) : null}
              </div>
            ) : null}
            {p.forma.veredicto ? <p className={cn('mt-3 t-body', p.forma.veredicto.clase === 'sin-veredicto' ? 'text-v2-muted' : 'text-v2-fg')}>{p.forma.veredicto.frase_es}{p.forma.veredicto.retirado_es ? ` ${p.forma.veredicto.retirado_es}` : ''}</p> : null}
            {subida?.dato || cobertura?.dato ? (
              <KPIRow className="mt-3">
                {subida?.dato ? <KPI label="Subida de forma" value={subida.dato.valor.toFixed(1).replace('.', ',')} unit="por semana" caption={`tu coach avisa a partir de ${metodo.ramp_alert_tss_per_week}`} /> : null}
                {cobertura?.dato ? <KPI label="Carga calculada" value={`${Math.round(cobertura.dato.valor)} %`} caption={cobertura.cobertura.estimada_pct ? `${Math.round(cobertura.cobertura.estimada_pct)} % con umbral estimado` : 'todo medido o declarado'} /> : null}
                <KPI label="Sesiones en la ventana" value={r.total || null} caption={`${r.hechas} hechas · ${r.dentro} dentro de lo pedido`} />
              </KPIRow>
            ) : null}
          </Card>

          {/* 8 · Recuperación */}
          <Card className="col-span-4">
            <CabeceraTarjeta titulo="Recuperación" pregunta="¿Asimila? Contra su basal" arrastrable={configurable} />
            {hueco('recuperacion', p.recuperacion)}
            <div className="mt-3 flex flex-col gap-4">
              {p.recuperacion.filter((l) => l.estado === 'medida' && l.dato).map((l) => (
                <div key={l.id} className="flex items-start justify-between gap-3">
                  <CifraPanel etiqueta={l.titulo_es} valor={l.dato!.valor} unidad={l.dato!.unidad} comparacion={l.dato!.comparacion} tamano="l" />
                  {l.serie ? <Chispa piel={P} puntos={l.serie.hecho} banda={l.serie.banda} ancho={120} alto={36} /> : null}
                </div>
              ))}
            </div>
            {p.recuperacion.some((l) => l.estado === 'medida') ? <p className="mt-4 t-meta text-v2-faint">Media de las últimas {metodo.reciente_dias} noches contra la basal de {metodo.ventana_basal_dias} días (la banda gris).</p> : null}
          </Card>

          {/* 3 · Semana a semana */}
          <Card className="col-span-7">
            <CabeceraTarjeta titulo="Semana a semana" pregunta="¿Hace lo que toca? Plan (contorno) frente a hecho, por familia" arrastrable={configurable} accion={<SegmentedControl aria-label="Carga u horas" size="sm" items={[{ value: 'carga', label: 'Carga' }, { value: 'horas', label: 'Horas' }]} value={modoSemanas} onValueChange={setModoSemanas} />} />
            {hueco('semanas', p.semanas.lecturas)}
            {cubosSemanas.length > 0 ? (
              <div className="mt-3">
                <Columnas piel={P} alto={230} cubos={cubosSemanas} leyenda={leyendaFamilias(p, P)} formatoY={modoSemanas === 'carga' ? (v) => String(Math.round(v)) : (v) => `${Math.round(v / 3600)} h`} divisor={modoSemanas === 'carga' ? 1 : 3600} anchoInicial={anchoCol(7)} objetivo={mediaAnterior != null && modoSemanas === 'carga' ? { valor: mediaAnterior, etiqueta: `media del periodo anterior · ${mediaAnterior}` } : null} />
              </div>
            ) : null}
            {p.semanas.sesiones.length > 0 ? (
              <div className="mt-4">
                <TablaPanel
                  etiqueta="Sesiones de la ventana"
                  columnas={[
                    { id: 'f', cabecera: 'Fecha', celda: (s) => fechaLegible(s.fecha, hoy), ancho: '80px' },
                    { id: 't', cabecera: 'Sesión', celda: (s) => <span className="inline-flex items-center gap-2"><PuntoFamiliaPanel familia={s.familia} />{s.titulo_es}</span> },
                    { id: 'c', cabecera: 'Cumplimiento', celda: (s) => <span className={cn(s.cumplimiento === 'dentro' ? 'text-v2-fg' : 'text-v2-muted')}>{CUMPLIMIENTO_PALABRA[s.cumplimiento]}{s.detalle_es ? <span className="text-v2-faint"> · {s.detalle_es}</span> : null}</span> },
                    { id: 'p', cabecera: 'Plan', celda: (s) => (s.plan_tss != null ? Math.round(s.plan_tss) : '—'), alinear: 'derecha', ancho: '56px' },
                    { id: 'h', cabecera: 'Hecho', celda: (s) => (s.hecho_tss != null ? Math.round(s.hecho_tss) : '—'), alinear: 'derecha', ancho: '56px' },
                    { id: 'a', cabecera: 'Ancla', celda: (s) => (s.ancla ? <AnclaPanel ancla={s.ancla} /> : ''), alinear: 'derecha', ancho: '92px' },
                  ]}
                  filas={p.semanas.sesiones.slice(0, 6)}
                  clave={(s) => s.id}
                  onFila={(s) => onLog(`→ Sesión ${s.titulo_es} (${s.fecha}) tramo a tramo`)}
                />
                <p className="mt-2 t-meta text-v2-faint">{r.hechas} de {r.total} sesiones hechas en la ventana · {r.dentro} dentro de lo pedido{r.sinPlan ? ` · ${r.sinPlan} sin plan` : ''} · las 6 últimas arriba; una fila abre el tramo a tramo.</p>
              </div>
            ) : null}
          </Card>

          {/* 4 · Intensidad */}
          <Card className="col-span-5">
            <CabeceraTarjeta titulo="Intensidad" pregunta="¿Entrena a la intensidad que toca? Tiempo en zonas y reparto" arrastrable={configurable} />
            {hueco('intensidad', p.intensidad.lecturas)}
            {cubosZ.length > 0 ? (
              <div className="mt-3">
                <Columnas piel={P} alto={230} cubos={cubosZ} leyenda={leyendaZonas(p, P)} formatoY={(v) => `${Math.round(v / 3600)} h`} divisor={3600} anchoInicial={anchoCol(5)} />
              </div>
            ) : null}
            {p.intensidad.polarizacion ? (
              <div className="mt-4 flex flex-col gap-2">
                <span className="t-label text-v2-faint">Reparto · {horas(p.intensidad.polarizacion.total)} con pulso</span>
                <BarraReparto piel={P} partes={partesPolarizacion(p, P)} objetivo={{ pct: metodo.polarizacion.objetivo.baja, etiqueta: `pides ${metodo.polarizacion.objetivo.baja} % suave` }} alto={16} />
              </div>
            ) : null}
            {p.intensidad.lecturas.some((l) => l.estado === 'medida' && l.procedencia.ancla === 'estimada') ? <p className="mt-3 t-meta text-v2-warn">Zonas estimadas desde el pulso máximo declarado: pídele el test de zonas.</p> : null}
          </Card>

          {/* 5 · Progreso */}
          <Card className="col-span-7">
            <CabeceraTarjeta titulo="Progreso" pregunta={comparar ? 'Una marca por familia · esta ventana frente a la anterior' : 'Una marca por familia · ¿mejora?'} arrastrable={configurable} />
            {estados.progreso === 'vacio' || estados.progreso === 'viejo' ? hueco('progreso', p.progreso) : null}
            {p.progreso.length > 0 ? (
              <div className="mt-3">
                <TablaPanel
                  etiqueta="Progreso por familia"
                  columnas={[
                    { id: 'f', cabecera: 'Familia', celda: (l) => <span className="inline-flex items-center gap-2"><PuntoFamiliaPanel familia={l.familia === 'todas' ? 'correr' : l.familia} /><span className="font-medium">{FAMILIA_NOMBRE[l.familia === 'todas' ? 'correr' : l.familia]}</span></span>, ancho: '110px' },
                    { id: 'm', cabecera: 'Marca', celda: (l) => <span className="text-v2-muted">{l.titulo_es}</span> },
                    ...(comparar ? [{ id: 'ant', cabecera: 'Periodo anterior', celda: (l: (typeof p.progreso)[number]) => (l.dato?.comparacion ? formatear(l.dato.comparacion.valor, l.dato.unidad) : '—'), alinear: 'derecha' as const, ancho: '120px' }] : []),
                    { id: 'v', cabecera: 'Ahora', celda: (l) => (l.dato ? <span className="font-medium">{formatear(l.dato.valor, l.dato.unidad)}</span> : <span className="text-v2-faint">{l.cobertura.falta?.por === 'ocasion' ? 'no en su plan' : 'todavía nada'}</span>), alinear: 'derecha', ancho: '110px' },
                    { id: 'd', cabecera: 'Cambio', celda: (l) => (l.dato?.comparacion ? <DeltaPanel comparacion={l.dato.comparacion} unidad={l.dato.unidad} compacto /> : <span className="text-v2-faint">{l.dato ? `${l.cobertura.muestras} de ${metodo.muestras_minimas} sesiones` : ''}</span>), alinear: 'derecha', ancho: '110px' },
                    { id: 'a', cabecera: 'Ancla', celda: (l) => (l.dato ? <AnclaPanel ancla={l.procedencia.ancla} /> : ''), alinear: 'derecha', ancho: '92px' },
                    { id: 's', cabecera: 'Tendencia', celda: (l) => (l.serie && l.serie.hecho.filter((q) => q.v != null).length > 1 ? <Chispa piel={P} puntos={l.serie.hecho} color={colorFamilia(P, l.familia === 'todas' ? 'correr' : l.familia)} ancho={96} alto={28} /> : ''), alinear: 'derecha', ancho: '104px' },
                  ]}
                  filas={p.progreso}
                  clave={(l) => l.id}
                  onFila={(l) => onLog(`→ Detalle de ${l.familia}`)}
                />
              </div>
            ) : null}
          </Card>

          {/* 6 · Récords */}
          <Card className="col-span-5">
            <CabeceraTarjeta titulo="Récords" pregunta={p.records.length ? `${p.records.length} marcas · ${p.records.filter((x) => x.nuevo).length} nuevas en la ventana` : '¿Qué marcas tiene?'} arrastrable={configurable} />
            {hueco('records', [], ultimoRecord)}
            {p.records.length > 0 ? (
              <div className="mt-3">
                <TablaPanel
                  etiqueta="Récords"
                  columnas={[
                    { id: 'p', cabecera: 'Prueba', celda: (x) => <span className="inline-flex items-center gap-2"><PuntoFamiliaPanel familia={x.familia} />{x.prueba_es}</span> },
                    { id: 'v', cabecera: 'Marca', celda: (x) => <span className="font-medium">{formatear(x.valor, x.unidad)}</span>, alinear: 'derecha', ancho: '88px' },
                    { id: 'f', cabecera: 'Cuándo', celda: (x) => <span className="inline-flex items-center justify-end gap-2">{x.nuevo ? <Tag>Nuevo</Tag> : null}<span className="text-v2-muted">{fechaLegible(x.fecha, hoy)}</span></span>, alinear: 'derecha', ancho: '120px' },
                  ]}
                  filas={p.records.slice(0, 8)}
                  clave={(x) => x.id}
                />
              </div>
            ) : null}
          </Card>

          {/* 7 · Carrera */}
          <Card className="col-span-12">
            <CabeceraTarjeta titulo="Carrera" pregunta={p.carrera ? `${p.carrera.nombre_es} · ${fechaLegible(p.carrera.fecha, hoy)} · ${enDias(p.carrera.dias)} · hueco por tramo contra el objetivo (positivo = le falta)` : '¿Llega a su carrera?'} arrastrable={configurable} />
            {estados.carrera === 'vacio' || estados.carrera === 'viejo' ? hueco('carrera', [], ultimoRecord) : null}
            {p.carrera && p.carrera.previsto_s == null ? <HuecoPanel estado="poco" titulo={`Previsión parcial: ${p.carrera.cobertura.con_dato} de ${p.carrera.cobertura.de} tramos`} cuerpo={`Sin marca de ${tramosSinDato(p.carrera).join(', ')}.`} accion="Programar una simulación" onAccion={() => onLog('→ Programar una simulación')} /> : null}
            {p.carrera && p.carrera.previsto_s != null ? (
              <div className="mt-3 grid grid-cols-12 gap-6">
                <div className="col-span-4 flex flex-col gap-4">
                  <KPIRow>
                    <KPI label="Tiempo previsto" value={reloj(p.carrera.previsto_s)} size="xl" caption={`${p.carrera.cobertura.con_dato} de ${p.carrera.cobertura.de} tramos con marca propia`} />
                    <KPI label="Objetivo" value={p.carrera.objetivo_s != null ? reloj(p.carrera.objetivo_s) : null} caption={p.carrera.objetivo_s == null ? 'sin objetivo de tiempo' : undefined} delta={p.carrera.hueco_s != null ? { value: formatearDelta(p.carrera.hueco_s, 'segundos'), direction: p.carrera.hueco_s > 0 ? 'up' : 'down', good: p.carrera.hueco_s <= 0 } : undefined} />
                  </KPIRow>
                  {p.carrera.tendencia.length > 1 ? (
                    <div className="flex flex-col gap-1">
                      <span className="t-label text-v2-faint">Cómo se ha movido la previsión (abajo es mejor)</span>
                      <Lineas piel={P} alto={120} series={[{ id: 'prev', etiqueta: 'Previsión', puntos: p.carrera.tendencia, color: P.tinta, formato: (v) => reloj(v), rotuloFinal: true }]} formatoY={(v) => reloj(v)} invertido leyenda={false} anchoInicial={anchoCol(4)} escalaTiempo />
                    </div>
                  ) : null}
                </div>
                <div className="col-span-8">
                  {p.carrera.hueco_s != null ? (
                    <BarrasHueco piel={P} filas={tramosEnOrden(p.carrera).map((f) => ({ ...f, color: (f.valor ?? 0) > 0 ? 'var(--v2-warn)' : 'var(--v2-ok)' }))} formato={(v) => formatearDelta(v, 'segundos')} anchoInicial={anchoCol(8)} altoFila={24} anchoEtiqueta={150} />
                  ) : (
                    <p className="t-body-sm text-v2-muted">Sin objetivo de tiempo no hay hueco por tramo. Ponle uno en Carreras.</p>
                  )}
                </div>
              </div>
            ) : null}
          </Card>

          {/* Lo del coach: cumplimiento por tramo */}
          <Card className="col-span-12">
            <CabeceraTarjeta titulo="Cumplimiento por tramo" pregunta="Prescrito frente a hecho, serie a serie, con la carga de cada tramo y su peldaño (A8). Elige una sesión a la izquierda; otra más para compararlas." arrastrable={configurable} />
            <div className="mt-3 grid grid-cols-12 gap-6">
              <div className="col-span-4">
                <TablaPanel
                  etiqueta="Sesiones con tramo a tramo"
                  columnas={[
                    { id: 'f', cabecera: 'Fecha', celda: (id) => fechaLegible(sesionDe(id, metodo).fecha, hoy), ancho: '72px' },
                    { id: 't', cabecera: 'Sesión', celda: (id) => { const s = sesionDe(id, metodo); return <span className="inline-flex items-center gap-2"><PuntoFamiliaPanel familia={s.familia} />{s.titulo_es}</span>; } },
                    { id: 'c', cabecera: 'Carga', celda: (id) => { const s = sesionDe(id, metodo); return s.carga.tss != null ? Math.round(s.carga.tss) : '?'; }, alinear: 'derecha', ancho: '56px' },
                    { id: 'b', cabecera: '', celda: (id) => <Button size="sm" variant={sesionB === id ? 'secondary' : 'ghost'} onClick={(e) => { e.stopPropagation(); setSesionB(sesionB === id ? null : id); onLog(`Comparar con → ${id}`); }}>{sesionB === id ? 'Comparando' : 'Comparar'}</Button>, alinear: 'derecha', ancho: '110px' },
                  ]}
                  filas={[...ESCENARIOS_SESION]}
                  clave={(id) => id}
                  seleccionada={sesionA}
                  onFila={(id) => { setSesionA(id); onLog(`Sesión → ${id}`); }}
                />
              </div>
              <div className="col-span-8 flex flex-col gap-4">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="t-title-sm text-v2-fg">{sA.titulo_es}</span>
                  <span className="t-meta text-v2-muted">{fechaLegible(sA.fecha, hoy)} · {sA.formato_es} · {horas(sA.duracion_s)} · {sA.origen_es}</span>
                  <span className="ml-auto inline-flex items-center gap-2 t-meta text-v2-muted">carga <span className="t-tnum font-medium text-v2-fg">{sA.carga.tss != null ? Math.round(sA.carga.tss) : 'no se sabe'}</span>{sA.carga.plan_tss != null ? ` de ${sA.carga.plan_tss}` : ''}{sA.carga.peldano ? ` · por ${PELDANO_NOMBRE[sA.carga.peldano]}` : ''}{sA.carga.ancla ? <AnclaPanel ancla={sA.carga.ancla} /> : null}</span>
                </div>
                {sA.cumplimiento ? <p className="t-body-sm text-v2-fg">{sA.cumplimiento.resumen_es}</p> : <p className="t-body-sm text-v2-muted">{sA.nota_es}</p>}
                <TablaPanel
                  etiqueta="Tramo a tramo"
                  columnas={[
                    { id: 'n', cabecera: '#', celda: (t) => t.n, ancho: '32px' },
                    { id: 't', cabecera: 'Tramo', celda: (t) => <span className={cn(t.rol !== 'trabajo' && 'text-v2-muted')}>{t.nombre_es}</span>, ancho: '190px' },
                    { id: 'p', cabecera: 'Pedido', celda: (t) => (t.prescrito ? <span className="text-v2-muted">{t.prescrito.medida_es}{t.prescrito.objetivo_es ? ` a ${t.prescrito.objetivo_es}` : ''}</span> : <span className="text-v2-faint">sin plan</span>) },
                    { id: 'h', cabecera: 'Hecho', celda: (t) => <span>{t.hecho.medida_es !== t.prescrito?.medida_es ? `${t.hecho.medida_es} · ` : ''}{t.hecho.valor_es}{t.hecho.extra_es ? <span className="text-v2-faint"> · {t.hecho.extra_es}</span> : null}</span> },
                    { id: 'c', cabecera: 'Veredicto', celda: (t) => (t.prescrito ? <span className={cn(t.cumplimiento === 'dentro' ? 'text-v2-ok' : t.cumplimiento === 'sin-plan' ? 'text-v2-faint' : 'text-v2-warn')}>{CUMPLIMIENTO_PALABRA[t.cumplimiento]}</span> : ''), ancho: '150px' },
                    { id: 'k', cabecera: 'Carga', celda: (t) => <span className={cn(t.carga.tss == null && 'text-v2-faint')}>{t.carga.tss != null ? Math.round(t.carga.tss) : '?'}<span className="text-v2-faint"> {t.carga.peldano ? PELDANO_NOMBRE[t.carga.peldano] : 'no se sabe'}</span></span>, alinear: 'derecha', ancho: '110px' },
                  ]}
                  filas={sA.tramos}
                  clave={(t) => String(t.n)}
                />
                {sA.curvas.pulso || sB?.curvas.pulso ? (
                  <div className="flex flex-col gap-1">
                    <span className="t-label text-v2-faint">Pulso a lo largo de la sesión{sB ? ` · ${sA.titulo_es} frente a ${sB.titulo_es}` : ''}</span>
                    {sA.curvas.pulso ? (
                      <LineaTiempo piel={P} alto={180} duracion={Math.max(sA.duracion_s, sB?.duracion_s ?? 0)} etiqueta="Pulso" curva={{ puntos: sA.curvas.pulso.puntos, formato: (v) => `${Math.round(v)}`, color: P.tinta }} segunda={sB?.curvas.pulso ? { puntos: sB.curvas.pulso.puntos, etiqueta: sB.titulo_es } : null} anchoInicial={anchoCol(8)} />
                    ) : (
                      <p className="t-body-sm text-v2-muted">Esta sesión no tiene pulso{sB?.curvas.pulso ? `; la comparada (${sB.titulo_es}) sí` : ''}.</p>
                    )}
                  </div>
                ) : null}
                {sB ? (
                  <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-ctl border border-v2-border px-3 py-2">
                    <span className="t-body-sm font-medium text-v2-fg">Comparada: {sB.titulo_es}</span>
                    <span className="t-meta text-v2-muted">{fechaLegible(sB.fecha, hoy)} · carga {sB.carga.tss != null ? Math.round(sB.carga.tss) : 'no se sabe'} · {sB.cumplimiento ? sB.cumplimiento.resumen_es : 'sin plan'}</span>
                    <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSesionB(null)}>Quitar</Button>
                  </div>
                ) : null}
              </div>
            </div>
          </Card>

          {configurable ? (
            <button type="button" onClick={() => onLog('Añadir gráfico')} className="col-span-4 flex min-h-32 items-center justify-center gap-2 rounded-panel border border-dashed border-v2-border-strong t-body-sm text-v2-muted hover:bg-v2-hover">
              <Plus aria-hidden className="size-4" /> Añadir gráfico
            </button>
          ) : null}
        </div>

        <p className="t-meta text-v2-faint">
          El mismo JSON que el atleta ve en su iPhone (`/api/coach/athletes/[id]/analytics/panel?ventana=`). Los días de forma y fatiga, las bandas, las tolerancias por tramo y el reparto de la carrera son tu método: se editan en Ajustes › Método <ExternalLink aria-hidden className="inline size-3" />. Los nombres de las estaciones son los del recorrido oficial ({TRAMO_CARRERA_NOMBRE.run1} … {TRAMO_CARRERA_NOMBRE.roxzone}).
        </p>
      </div>
    </div>
  );
}
