'use client';

// LO QUE LA GRÁFICA DE ZONAS TIENE QUE PODER DECIR CUANDO NO SABE.
//
// Una gráfica levantada sobre un umbral que nadie midió, o sobre entrenos que
// llegaron sin pulso, se dibuja igual de bonita que una buena: la diferencia
// sólo existe si la pantalla la dice. Aquí viven las cuatro piezas que la dicen
// —el aviso del umbral, la leyenda, el resumen de cobertura y la línea de
// confianza— más las frases sueltas del panel.
//
// Aparte del panel porque son la MITAD honesta de la pantalla y se leen solas:
// mezcladas con el mando de la ventana y el estado del marcado, ninguna de las
// dos cosas se encontraba.

import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import {
  formatDuration,
  formatWeekLong,
  missingWeeksPhrase,
  ZONE_PART_COLOR_VAR,
  ZONE_PART_KEYS,
  ZONE_PART_LABEL,
} from '@/lib/zones/chart';
import { HR_ANCHOR_LABEL } from '@fahybrid/shared/domain/methodology';
import type { WeeklyZonesPayload } from '@/lib/zones/weekly';

// ── Los avisos ────────────────────────────────────────────────────────────────

/**
 * El vacío con salida: qué falta, qué se está usando en su lugar y qué puede
 * hacer el coach ahora mismo. La ruta del test es Rendimiento → Fuerza, donde
 * vive el panel de tests y su «Programar test».
 */
export function AvisoUmbral({
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
          href={`/atletas/${athleteId}?tab=rendimiento&vista=fuerza`}
          className="v2-focus inline-flex w-fit items-center gap-1 text-xs font-semibold text-[color:var(--v2-fg)] underline underline-offset-2"
        >
          <MIcon name="event_available" size={14} />
          Programar el test de umbral
        </Link>
      </div>
    </div>
  );
}

export function ErrorConReintento({ message, onRetry }: { message: string; onRetry: () => void }) {
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

export function Leyenda() {
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

export function Resumen({
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
export function LineaDeConfianza({ meta }: { meta: WeeklyZonesPayload['meta'] | null }) {
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

export function sinDatosTexto(meta: WeeklyZonesPayload['meta'] | null): string {
  if (meta?.anchor == null) {
    return 'Todavía no hay tiempo en zonas: sin umbral no hay nada que repartir.';
  }
  return 'Todavía no hay tiempo en zonas en esta ventana. Aparecerá en cuanto lleguen entrenos con pulso.';
}

export function resumenGrafica(weeks: number): string {
  return `Tiempo semanal en zonas de frecuencia cardiaca, ${weeks} semanas`;
}

/** Hoy, en la fecha LOCAL del coach: es el calendario que tiene delante. */
export function todayIso(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}
