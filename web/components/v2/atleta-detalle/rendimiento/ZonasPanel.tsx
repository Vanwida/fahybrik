'use client';

// TIEMPO EN ZONAS — el panel entero de la ficha: los mandos, la gráfica, la
// leyenda y, sobre todo, las frases que dicen qué se está mirando de verdad.
//
// LA PANTALLA TIENE QUE PODER DECIR QUE NO SABE. Una gráfica de zonas levantada
// sobre un umbral que nadie midió, o sobre entrenos que llegaron sin pulso, se
// dibuja igual de bonita que una buena: la diferencia sólo existe si la pantalla
// la dice. Por eso aquí hay tres avisos y una línea de confianza, y por eso las
// semanas sin dato se cuentan en voz alta en vez de desaparecer.
//
// El reparto lo hace el motor (`lib/zones/weekly.ts`), la aritmética del dibujo
// la hace `lib/zones/chart.ts`, y esto sólo pide, elige y rotula.

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { SegmentedControl } from '@/components/v2/SegmentedControl';
import { ChipGroup } from '@/components/v2/controls/ChipGroup';
import { Panel } from '../parts';
import { SinDatos } from './ui';
import {
  AvisoUmbral,
  ErrorConReintento,
  Leyenda,
  LineaDeConfianza,
  Resumen,
  resumenGrafica,
  sinDatosTexto,
  todayIso,
} from './ZonasAvisos';
import { ZonasChart } from './ZonasChart';
import { ZonasComparar } from './ZonasComparar';
import { BarraDeMarcado, ZonasMarcas } from './ZonasMarcas';
import { ZonasTabla } from './ZonasTabla';
import {
  buildWeekCells,
  DEFAULT_ZONE_WINDOW,
  planBands,
  rangeBands,
  ZONE_MODALITY_LABEL,
  ZONE_MODALITY_ORDER,
  ZONE_WINDOWS,
  zoneTotals,
  zoneWindowWeeks,
  type ZoneWindowKey,
} from '@/lib/zones/chart';
import { GRAFICA_MAX_WEEKS } from '@fahybrid/shared/domain/zone-chart';
import { notaDeComparativa, notaDeFeedback, nuevoRango } from '@/lib/dashboard/v2/zonas-feedback';
import type { Borrador, RangoBorrador } from '@/lib/dashboard/v2/del-coach-borrador';
import type { SegmentModality } from '@fahybrid/shared/domain/segment-modality';
import type { WeeklyZonesPayload } from '@/lib/zones/weekly';

type ModalityFilter = SegmentModality | 'all';

/**
 * A partir de aquí «casi todo el tiempo llega sin pulso» deja de ser un detalle y
 * pasa a ser lo que explica la gráfica entera, así que se dice en palabras.
 */
const SIN_PULSO_AVISO = 0.6;

/**
 * El compositor entra SÓLO cuando el coach pulsa «Dar feedback». Arrastra el
 * formulario de los cinco tipos, la biblioteca y el móvil de la previa con los
 * tokens de la app del atleta: cargarlo con la pestaña de Rendimiento sería
 * pagar todo eso para mirar una gráfica.
 */
const Compositor = dynamic(
  () => import('../del-coach/Compositor').then((m) => m.Compositor),
  { ssr: false },
);

const MODALITY_OPTIONS: ReadonlyArray<{ value: ModalityFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  ...ZONE_MODALITY_ORDER.map((m) => ({ value: m as ModalityFilter, label: ZONE_MODALITY_LABEL[m] })),
];

const WINDOW_OPTIONS = ZONE_WINDOWS.map((w) => ({ value: w.value, label: w.label }));

export function ZonasPanel({
  athleteId,
  athleteName,
  coachName,
}: {
  athleteId: string;
  athleteName: string;
  /** El nombre con el que el atleta ve firmados los comunicados (el del club). */
  coachName: string;
}) {
  const router = useRouter();
  const [windowKey, setWindowKey] = useState<ZoneWindowKey>(DEFAULT_ZONE_WINDOW);
  const [modality, setModality] = useState<ModalityFilter>('all');
  const [showTable, setShowTable] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // ── Marcar y dar feedback ──────────────────────────────────────────────────
  // Las marcas viven aquí y no en el compositor porque se dibujan SOBRE esta
  // gráfica: el coach señala mirando el dato, y sólo después decide si eso se
  // convierte en una nota. Al abrir el compositor se COPIAN, así que seguir
  // marcando después no toca lo que está a punto de publicarse.
  const [marcando, setMarcando] = useState(false);
  const [desde, setDesde] = useState<string | null>(null);
  const [rangos, setRangos] = useState<RangoBorrador[]>([]);
  // La nota premontada que abre el compositor. Null = cerrado. Se guarda ENTERA
  // y no un interruptor porque hay dos puertas —la gráfica marcada y la
  // comparativa— y cada una monta una nota distinta.
  const [componiendo, setComponiendo] = useState<Borrador | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // El mando de comparar arranca cerrado: la pregunta de esta pantalla es «cómo
  // ha entrenado», y «antes contra ahora» es la segunda, no la primera.
  const [comparando, setComparando] = useState(false);

  // Qué se está pidiendo ahora mismo. «Cargando» se DEDUCE de comparar esto con
  // lo último que llegó, en vez de encenderlo a mano al empezar cada petición:
  // así una respuesta que se cruza con otra no puede dejar la pantalla girando,
  // y la gráfica anterior se queda a la vista (atenuada) mientras llega la nueva.
  const requestKey = `${athleteId}|${windowKey}|${modality}|${attempt}`;
  // La ventana viaja CON los datos: el eje sólo se estira cuando llega la
  // respuesta. Leerlo del control mientras carga enseñaría medio año de huecos
  // durante un instante, y un hueco falso es exactamente lo que esta pantalla no
  // se puede permitir.
  const [loaded, setLoaded] = useState<{
    key: string;
    zones: WeeklyZonesPayload;
    windowWeeks: number;
  } | null>(null);
  const [failed, setFailed] = useState<{ key: string; message: string } | null>(null);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    const ac = new AbortController();
    const weeks = zoneWindowWeeks(windowKey);
    const qs = new URLSearchParams({ weeks: String(weeks) });
    if (modality !== 'all') qs.set('modality', modality);

    void (async () => {
      try {
        const res = await fetch(`/api/coach/athletes/${athleteId}/zones/weekly?${qs}`, {
          signal: ac.signal,
        });
        const body = (await res.json().catch(() => null)) as
          | { zones?: WeeklyZonesPayload; error?: { message?: string } }
          | null;
        if (ac.signal.aborted) return;
        if (!res.ok || !body?.zones) {
          setFailed({
            key: requestKey,
            message: body?.error?.message ?? 'No se pudo cargar el tiempo en zonas.',
          });
          return;
        }
        setLoaded({ key: requestKey, zones: body.zones, windowWeeks: weeks });
      } catch {
        if (ac.signal.aborted) return;
        setFailed({ key: requestKey, message: 'No se pudo cargar el tiempo en zonas.' });
      }
    })();

    return () => ac.abort();
  }, [athleteId, windowKey, modality, requestKey]);

  const payload = loaded?.zones ?? null;
  const loadError = failed?.key === requestKey ? failed.message : null;
  const loading = loaded?.key !== requestKey && loadError == null;

  const windowWeeks = loaded?.windowWeeks ?? zoneWindowWeeks(windowKey);
  const cells = useMemo(
    () => buildWeekCells({ weeks: payload?.weeks ?? [], windowWeeks, todayIso: todayIso() }),
    [payload, windowWeeks],
  );
  const bands = useMemo(() => planBands(cells, payload?.plan_segments ?? []), [cells, payload]);
  const totals = useMemo(() => zoneTotals(cells), [cells]);

  const meta = payload?.meta ?? null;
  const hasData = totals.weeksWithData > 0;
  const marcas = useMemo(() => rangeBands(cells, rangos), [cells, rangos]);

  const elegirSemana = useCallback((week: string) => {
    setDesde((inicio) => {
      if (inicio === null) return week;
      setRangos((prev) => [...prev, nuevoRango(inicio, week)]);
      return null;
    });
  }, []);

  const cambiarRango = useCallback((key: string, patch: Partial<RangoBorrador>) => {
    setRangos((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }, []);

  const quitarRango = useCallback((key: string) => {
    setRangos((prev) => prev.filter((r) => r.key !== key));
  }, []);

  // La ventana que se congela en la nota es la que el coach TIENE DELANTE: los
  // lunes del eje que está mirando, no «26 semanas hacia atrás desde hoy». Si el
  // eje se estiró para no dejarse fuera una semana con dato, la nota enseña esa
  // misma gráfica y no una recortada.
  //
  // Se corta por el TECHO de lo que se puede firmar y por el final, no por el
  // principio: el eje de la ficha puede estirarse hacia atrás sin límite (lo hace
  // cuando hay dato anterior al arranque nominal) y una nota no puede llevar más
  // de un año y pico. Recortando lo más viejo, lo que se publica sigue acabando
  // donde acaba lo que él está mirando.
  const delEje = cells.slice(-GRAFICA_MAX_WEEKS);
  const ventana = {
    week_start: delEje[0]?.week_start ?? '',
    weeks: delEje.length,
    modality: modality === 'all' ? null : modality,
  };

  return (
    <Panel
      title="Tiempo en zonas"
      action={
        <div className="flex items-center gap-3">
          <BotonDePanel
            icon="compare_arrows"
            activo={comparando}
            onClick={() => setComparando((v) => !v)}
          >
            {comparando ? 'Cerrar la comparación' : 'Comparar'}
          </BotonDePanel>
          {hasData ? (
            <BotonDePanel
              icon={showTable ? 'bar_chart' : 'table_rows'}
              activo={showTable}
              onClick={() => setShowTable((v) => !v)}
            >
              {showTable ? 'Ver la gráfica' : 'Ver la tabla'}
            </BotonDePanel>
          ) : null}
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Controles
          windowKey={windowKey}
          onWindow={setWindowKey}
          modality={modality}
          onModality={setModality}
        />

        {comparando ? (
          <ZonasComparar
            athleteId={athleteId}
            onDarFeedback={(periodos) => setComponiendo(notaDeComparativa(periodos))}
          />
        ) : null}

        {aviso ? (
          <div
            role="status"
            className="flex items-center gap-2 rounded-[var(--v2-r-s)] border border-[color:var(--v2-ok)] bg-[color:var(--v2-ok-soft)] px-3 py-2"
          >
            <MIcon name="check_circle" size={16} className="text-[color:var(--v2-ok)]" />
            <span className="flex-1 text-label font-medium text-[color:var(--v2-fg)]">{aviso}</span>
            <button
              type="button"
              onClick={() => setAviso(null)}
              aria-label="Descartar el aviso"
              className="v2-focus inline-flex h-6 w-6 items-center justify-center rounded-[var(--v2-r-s)] text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]"
            >
              <MIcon name="close" size={14} />
            </button>
          </div>
        ) : null}

        {loading && payload == null ? (
          <div className="flex items-center gap-2 py-8 text-xs text-[color:var(--v2-faint)]">
            <MIcon name="progress_activity" size={16} className="animate-spin" />
            Cargando el tiempo en zonas…
          </div>
        ) : loadError ? (
          <ErrorConReintento message={loadError} onRetry={retry} />
        ) : (
          <>
            <AvisoUmbral athleteId={athleteId} meta={meta} />

            {!hasData ? (
              <SinDatos text={sinDatosTexto(meta)} />
            ) : showTable ? (
              <ZonasTabla cells={cells} />
            ) : (
              <div
                className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}
                aria-busy={loading}
              >
                <ZonasChart
                  cells={cells}
                  bands={bands}
                  ranges={marcas}
                  ariaLabel={resumenGrafica(cells.length)}
                  marcando={marcando}
                  desde={desde}
                  onElegirSemana={elegirSemana}
                />
              </div>
            )}

            {hasData && !showTable ? (
              <>
                <BarraDeMarcado
                  marcando={marcando}
                  desde={desde}
                  rangos={rangos.length}
                  onMarcar={() => {
                    setMarcando((v) => !v);
                    setDesde(null);
                  }}
                  onDarFeedback={() => setComponiendo(notaDeFeedback({ ...ventana, rangos }))}
                />
                <ZonasMarcas rangos={rangos} onCambiar={cambiarRango} onQuitar={quitarRango} />
              </>
            ) : null}

            {hasData ? (
              <>
                {!showTable ? <Leyenda /> : null}
                <Resumen
                  desde={cells[0]?.week_start ?? null}
                  hasta={cells[cells.length - 1]?.week_start ?? null}
                  weeksWithData={totals.weeksWithData}
                  weeksWithoutData={totals.weeksWithoutData}
                  total={totals.total}
                />
                {totals.sinZonaShare >= SIN_PULSO_AVISO ? (
                  <p className="text-xs text-[color:var(--v2-muted)]">
                    La mayor parte del tiempo medido llega sin pulso. Sin banda en el pecho ni reloj
                    no hay pulso que repartir, así que ese tiempo se queda en «sin zona».
                  </p>
                ) : null}
              </>
            ) : null}

            <LineaDeConfianza meta={meta} />
          </>
        )}
      </div>

      {componiendo ? (
        <Compositor
          modo="publicar"
          destinatarios={[{ athlete_id: athleteId, full_name: athleteName }]}
          coachName={coachName}
          // Ya montada por la puerta desde la que se entró: la gráfica del periodo
          // con sus marcas, o los dos periodos enfrentados. Y en las dos, un
          // capítulo en blanco para lo que el coach quiera explicar.
          partida={{ b: componiendo, id: null }}
          onCerrar={() => setComponiendo(null)}
          onHecho={(mensaje) => {
            setComponiendo(null);
            // Las marcas ya viven dentro de la nota publicada: dejarlas encima de
            // la gráfica invitaría a mandar la misma dos veces.
            setRangos([]);
            setMarcando(false);
            setDesde(null);
            setAviso(mensaje);
            // La pestaña «Del coach» de esta misma ficha tiene que enseñarla.
            router.refresh();
          }}
        />
      ) : null}
    </Panel>
  );
}

// ── Los mandos ────────────────────────────────────────────────────────────────

/** Un mando de la cabecera del panel. Los dos son el mismo botón (mirar de otra
 *  forma lo que ya está a la vista), así que son un solo componente. */
function BotonDePanel({
  icon,
  activo,
  onClick,
  children,
}: {
  icon: string;
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={activo}
      className={`v2-focus inline-flex items-center gap-1 rounded-[var(--v2-r-s)] px-1.5 py-0.5 text-label font-semibold transition-colors hover:text-[color:var(--v2-fg)] ${
        activo ? 'text-[color:var(--v2-fg)]' : 'text-[color:var(--v2-muted)]'
      }`}
    >
      <MIcon name={icon} size={14} />
      {children}
    </button>
  );
}

function Controles({
  windowKey,
  onWindow,
  modality,
  onModality,
}: {
  windowKey: ZoneWindowKey;
  onWindow: (next: ZoneWindowKey) => void;
  modality: ModalityFilter;
  onModality: (next: ModalityFilter) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <SegmentedControl
        options={WINDOW_OPTIONS}
        value={windowKey}
        onChange={onWindow}
        size="sm"
        ariaLabel="Cuánto tiempo se enseña"
      />
      <ChipGroup
        options={MODALITY_OPTIONS}
        value={modality}
        onChange={onModality}
        ariaLabel="Tipo de entreno"
        mono={false}
      />
    </div>
  );
}
