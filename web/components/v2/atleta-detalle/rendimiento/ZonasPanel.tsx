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

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { SegmentedControl } from '@/components/v2/SegmentedControl';
import { ChipGroup } from '@/components/v2/controls/ChipGroup';
import { Panel } from '../parts';
import { SinDatos } from './ui';
import { ZonasChart } from './ZonasChart';
import { ZonasTabla } from './ZonasTabla';
import {
  buildWeekCells,
  DEFAULT_ZONE_WINDOW,
  formatDuration,
  formatWeekLong,
  missingWeeksPhrase,
  planBands,
  ZONE_MODALITY_LABEL,
  ZONE_MODALITY_ORDER,
  ZONE_PART_COLOR_VAR,
  ZONE_PART_KEYS,
  ZONE_PART_LABEL,
  ZONE_WINDOWS,
  zoneTotals,
  zoneWindowWeeks,
  type ZoneWindowKey,
} from '@/lib/zones/chart';
import { HR_ANCHOR_LABEL } from '@fahybrid/shared/domain/methodology';
import type { SegmentModality } from '@/lib/sync/ingest-execution-segments';
import type { WeeklyZonesPayload } from '@/lib/zones/weekly';

type ModalityFilter = SegmentModality | 'all';

/**
 * A partir de aquí «casi todo el tiempo llega sin pulso» deja de ser un detalle y
 * pasa a ser lo que explica la gráfica entera, así que se dice en palabras.
 */
const SIN_PULSO_AVISO = 0.6;

const MODALITY_OPTIONS: ReadonlyArray<{ value: ModalityFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  ...ZONE_MODALITY_ORDER.map((m) => ({ value: m as ModalityFilter, label: ZONE_MODALITY_LABEL[m] })),
];

const WINDOW_OPTIONS = ZONE_WINDOWS.map((w) => ({ value: w.value, label: w.label }));

export function ZonasPanel({ athleteId }: { athleteId: string }) {
  const [windowKey, setWindowKey] = useState<ZoneWindowKey>(DEFAULT_ZONE_WINDOW);
  const [modality, setModality] = useState<ModalityFilter>('all');
  const [showTable, setShowTable] = useState(false);
  const [attempt, setAttempt] = useState(0);

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

  return (
    <Panel
      title="Tiempo en zonas"
      action={
        hasData ? (
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            aria-expanded={showTable}
            className="v2-focus inline-flex items-center gap-1 rounded-[var(--v2-r-s)] px-1.5 py-0.5 text-label font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
          >
            <MIcon name={showTable ? 'bar_chart' : 'table_rows'} size={14} />
            {showTable ? 'Ver la gráfica' : 'Ver la tabla'}
          </button>
        ) : null
      }
    >
      <div className="flex flex-col gap-4">
        <Controles
          windowKey={windowKey}
          onWindow={setWindowKey}
          modality={modality}
          onModality={setModality}
        />

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
                <ZonasChart cells={cells} bands={bands} ariaLabel={resumenGrafica(cells.length)} />
              </div>
            )}

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
    </Panel>
  );
}

// ── Los mandos ────────────────────────────────────────────────────────────────

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

// ── Los avisos ────────────────────────────────────────────────────────────────

/**
 * El vacío con salida: qué falta, qué se está usando en su lugar y qué puede
 * hacer el coach ahora mismo. La ruta del test es la pestaña Perfil de esta misma
 * ficha, donde vive el panel de tests y su «Programar test».
 */
function AvisoUmbral({
  athleteId,
  meta,
}: {
  athleteId: string;
  meta: WeeklyZonesPayload['meta'] | null;
}) {
  if (!meta) return null;
  const anchor = meta.anchor;
  if (anchor != null && anchor.confidence !== 'estimated') return null;

  const falta = anchor == null;
  return (
    <div
      className={
        falta
          ? 'flex items-start gap-2.5 rounded-[var(--v2-r-m)] border border-[color:var(--v2-warn)] bg-[color:var(--v2-warn-soft)] p-3'
          : 'flex items-start gap-2.5 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-3'
      }
    >
      <MIcon
        name={falta ? 'warning' : 'help'}
        size={17}
        className={
          falta ? 'mt-0.5 shrink-0 text-[color:var(--v2-warn)]' : 'mt-0.5 shrink-0 text-[color:var(--v2-faint)]'
        }
      />
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-xs text-[color:var(--v2-fg)]">
          {falta
            ? 'No tiene umbral de frecuencia cardiaca. Sin ese número no hay zonas en las que repartir el tiempo, así que lo medido sale como «sin zona».'
            : `Sus zonas salen de un umbral estimado de ${anchor.lthr_bpm} ppm, no de uno medido. Vale para entrenar, pero un test lo clava.`}
        </span>
        <Link
          href={`/atletas/${athleteId}?tab=perfil`}
          className="v2-focus inline-flex w-fit items-center gap-1 text-xs font-semibold text-[color:var(--v2-fg)] underline underline-offset-2"
        >
          <MIcon name="event_available" size={14} />
          Programar el test de umbral
        </Link>
      </div>
    </div>
  );
}

function ErrorConReintento({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[var(--v2-r-m)] border border-[color:var(--v2-danger)] bg-[color:var(--v2-danger-soft)] p-3">
      <span className="text-xs font-medium text-[color:var(--v2-danger)]">{message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="v2-focus inline-flex h-7 shrink-0 items-center gap-1 rounded-[var(--v2-r-s)] border border-[color:var(--v2-danger)] px-2.5 text-label font-semibold text-[color:var(--v2-danger)]"
      >
        <MIcon name="refresh" size={13} />
        Reintentar
      </button>
    </div>
  );
}

// ── Leyenda, resumen y confianza ──────────────────────────────────────────────

function Leyenda() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
      {ZONE_PART_KEYS.map((key) => (
        <li key={key} className="flex items-center gap-1.5 text-label text-[color:var(--v2-muted)]">
          <span
            aria-hidden
            className="h-2.5 w-2.5 shrink-0 rounded-[var(--v2-r-3xs)]"
            style={
              key === 'no_hr'
                ? {
                    background:
                      'repeating-linear-gradient(45deg, var(--v2-faint) 0 2px, var(--v2-surface-2) 2px 5px)',
                  }
                : { background: `var(${ZONE_PART_COLOR_VAR[key]})` }
            }
          />
          {ZONE_PART_LABEL[key]}
        </li>
      ))}
    </ul>
  );
}

function Resumen({
  desde,
  hasta,
  weeksWithData,
  weeksWithoutData,
  total,
}: {
  desde: string | null;
  hasta: string | null;
  weeksWithData: number;
  weeksWithoutData: number;
  total: number;
}) {
  const faltan = missingWeeksPhrase(weeksWithoutData);
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[color:var(--v2-muted)]">
      {desde && hasta ? (
        <span>
          Del {formatWeekLong(desde)} al {formatWeekLong(hasta)}
        </span>
      ) : null}
      <span aria-hidden className="text-[color:var(--v2-faint)]">
        ·
      </span>
      <span>
        <span className="v2-num font-semibold text-[color:var(--v2-fg)]">{formatDuration(total)}</span>{' '}
        en {weeksWithData} {weeksWithData === 1 ? 'semana' : 'semanas'} con dato
      </span>
      {faltan ? (
        <>
          <span aria-hidden className="text-[color:var(--v2-faint)]">
            ·
          </span>
          <span className="text-[color:var(--v2-faint)]">{faltan}</span>
        </>
      ) : null}
    </p>
  );
}

/**
 * Con qué se computó lo que se está enseñando. Sale siempre que haya algo que
 * decir, incluso sin barras: saber que el ancla es una estimación es tan dato
 * como las barras mismas.
 */
function LineaDeConfianza({ meta }: { meta: WeeklyZonesPayload['meta'] | null }) {
  const usados = (meta?.computed_with ?? []).filter((c) => c.anchor != null);
  if (usados.length === 0) return null;
  return (
    <p className="border-t border-[color:var(--v2-border)] pt-3 text-label text-[color:var(--v2-faint)]">
      Calculado con{' '}
      {usados.map((c, i) => (
        <span key={`${c.anchor}-${c.lthr_bpm}`}>
          {i > 0 ? ' y con ' : ''}
          <span className="v2-num">{c.lthr_bpm} ppm</span>
          {c.anchor ? ` (${HR_ANCHOR_LABEL[c.anchor].toLowerCase()})` : ''}
        </span>
      ))}
      {usados.length > 1 ? '. Cambió por el camino porque el ancla del atleta cambió.' : '.'}
    </p>
  );
}

// ── Palabras sueltas ──────────────────────────────────────────────────────────

function sinDatosTexto(meta: WeeklyZonesPayload['meta'] | null): string {
  if (meta?.anchor == null) {
    return 'Todavía no hay tiempo en zonas: sin umbral no hay nada que repartir.';
  }
  return 'Todavía no hay tiempo en zonas en esta ventana. Aparecerá en cuanto lleguen entrenos con pulso.';
}

function resumenGrafica(weeks: number): string {
  return `Tiempo semanal en zonas de frecuencia cardiaca, ${weeks} semanas`;
}

/** Hoy, en la fecha LOCAL del coach: es el calendario que tiene delante. */
function todayIso(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}
