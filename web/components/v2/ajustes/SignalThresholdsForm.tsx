'use client';

// Los días de espera de los avisos de lo que el coach publica (mig 0161).
//
// El motor decide QUÉ reclama (una pregunta sin responder, una tarea vencida, un
// protocolo sin abrir) y eso es mecanismo, no se toca. Lo que se edita aquí es
// CUÁNTO esperamos antes de darle la lata: método suyo, y por eso es dato con un
// valor por defecto (CLAUDE.md, HARD RULE Nº0). Esta tarjeta es su único sitio.
//
// Carga sola contra GET /api/coach/signal-thresholds en vez de recibir los datos
// desde el servidor, como hace <PushCard> al lado: así una tabla que aún no
// existe en un entorno, o un fallo de red, se queda dentro de esta tarjeta con su
// reintento y no se lleva por delante el resto de Ajustes.
//
// Guardar reemplaza el conjunto entero (PUT), que es la semántica de la tabla:
// no hay parche por campo, así que el editor y el motor nunca discrepan sobre
// cuáles son «los del coach».

import { useEffect, useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { Card } from '@/components/v2/Card';
import { Stepper } from '@/components/v2/controls/Stepper';
import { ajustesButtonPrimary, ajustesButtonSecondary } from './controls';
import {
  COACH_SIGNAL_THRESHOLD_MAX_DAYS,
  COACH_SIGNAL_THRESHOLD_MIN_DAYS,
  COACH_SIGNAL_THRESHOLD_KEYS,
  DEFAULT_COACH_SIGNAL_THRESHOLDS,
  type CoachSignalThresholds,
} from '@fahybrid/shared/domain/coach/signal-thresholds';
import {
  coachSignalThresholdsPutSchema,
  type CoachSignalThresholdsResponse,
} from '@fahybrid/shared/schema/coach-signal-thresholds';
import { cn } from '@/lib/utils';

const ENDPOINT = '/api/coach/signal-thresholds';

interface Copy {
  /** Cómo se llama la señal en la tarjeta de Hoy, para que se reconozca. */
  title: string;
  help: string;
  /** Nombre accesible del control: lleva la unidad, que a la vista va aparte. */
  ariaLabel: string;
}

// Un `Record` y no una lista suelta: si mañana el dominio añade un cuarto umbral,
// esto deja de compilar hasta que alguien le escriba su copy. El orden de pintado
// sale de COACH_SIGNAL_THRESHOLD_KEYS, que es el del dominio.
const COPY: Record<keyof CoachSignalThresholds, Copy> = {
  communication_question_unanswered_days: {
    title: 'Pregunta sin responder',
    help: 'Lo que esperamos a que el atleta conteste antes de que la pregunta te aparezca en Hoy. Cuenta desde que la publicas, no desde que la abre.',
    ariaLabel: 'Días sin respuesta antes de avisarte de una pregunta',
  },
  communication_task_overdue_critical_days: {
    title: 'Tarea vencida',
    help: 'Una tarea sin hacer te aparece en Hoy al día siguiente de su fecha. Aquí eliges con cuánto retraso deja de ser un despiste y te la marcamos como urgente.',
    ariaLabel: 'Días de retraso para marcar una tarea vencida como urgente',
  },
  communication_protocol_unopened_days: {
    title: 'Protocolo sin abrir',
    help: 'Cuánto antes de la carrera o del test quieres enterarte de que el atleta todavía no ha abierto su protocolo.',
    ariaLabel: 'Días antes del evento para avisarte de un protocolo sin abrir',
  },
};

type Estado =
  | { fase: 'cargando' }
  | { fase: 'error' }
  | {
      fase: 'listo';
      /** Lo último que hay en el servidor: la referencia de «sin guardar». */
      saved: CoachSignalThresholds;
      values: CoachSignalThresholds;
      /** false = todavía se están sirviendo los del sistema. */
      isCustom: boolean;
    };

function pickValues(res: CoachSignalThresholdsResponse): CoachSignalThresholds {
  return {
    communication_question_unanswered_days: res.communication_question_unanswered_days,
    communication_task_overdue_critical_days: res.communication_task_overdue_critical_days,
    communication_protocol_unopened_days: res.communication_protocol_unopened_days,
  };
}

function sameValues(a: CoachSignalThresholds, b: CoachSignalThresholds): boolean {
  return COACH_SIGNAL_THRESHOLD_KEYS.every((key) => a[key] === b[key]);
}

/** Una carga entera, contada como el estado al que lleva. No toca React. */
async function fetchThresholds(): Promise<Estado> {
  try {
    const res = await fetch(ENDPOINT);
    if (!res.ok) return { fase: 'error' };
    const data = (await res.json()) as CoachSignalThresholdsResponse;
    const values = pickValues(data);
    return { fase: 'listo', saved: values, values, isCustom: data.is_custom };
  } catch {
    return { fase: 'error' };
  }
}

export function SignalThresholdsForm() {
  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  // Reintentar = volver a pedir. Se cuenta con un número en vez de llamar a la
  // carga a mano porque así el efecto es el ÚNICO que pide, y el estado ya nace
  // en «cargando»: dentro del efecto no hay ningún `setState` síncrono, solo el
  // de después del `await` (mismo esqueleto que <PushCard>, aquí al lado).
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next = await fetchThresholds();
      if (!cancelled) setEstado(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [recarga]);

  const retry = () => {
    setEstado({ fase: 'cargando' });
    setError(null);
    setOk(false);
    setRecarga((n) => n + 1);
  };

  const set = (key: keyof CoachSignalThresholds, next: number) => {
    setOk(false);
    setEstado((prev) =>
      prev.fase === 'listo' ? { ...prev, values: { ...prev.values, [key]: next } } : prev,
    );
  };

  const restore = () => {
    setOk(false);
    setEstado((prev) =>
      prev.fase === 'listo' ? { ...prev, values: { ...DEFAULT_COACH_SIGNAL_THRESHOLDS } } : prev,
    );
  };

  const save = async () => {
    if (estado.fase !== 'listo') return;
    // El paso de rosca ya deja los tres dentro de rango, así que esto no debería
    // saltar nunca; se valida igual con el MISMO esquema que usa el servidor para
    // que un cambio de límites no pueda dejar aquí una pantalla que manda basura.
    const parsed = coachSignalThresholdsPutSchema.safeParse(estado.values);
    if (!parsed.success) {
      setError(
        `Los días tienen que estar entre ${COACH_SIGNAL_THRESHOLD_MIN_DAYS} y ${COACH_SIGNAL_THRESHOLD_MAX_DAYS}.`,
      );
      return;
    }

    setSaving(true);
    setError(null);
    setOk(false);
    try {
      const res = await fetch(ENDPOINT, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error?.message ?? 'No se pudieron guardar los cambios.');
        return;
      }
      const saved = pickValues(data as CoachSignalThresholdsResponse);
      setEstado({
        fase: 'listo',
        saved,
        values: saved,
        isCustom: (data as CoachSignalThresholdsResponse).is_custom,
      });
      setOk(true);
    } catch {
      setError('No se pudieron guardar los cambios · Reintenta.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <h2 className="v2-micro mb-2">Avisos de lo que publicas</h2>

      {estado.fase === 'cargando' ? <Cargando /> : null}
      {estado.fase === 'error' ? <NoCarga onRetry={retry} /> : null}

      {estado.fase === 'listo' ? (
        <Card className="flex flex-col gap-4 p-4 sm:p-5">
          <p className="text-label leading-relaxed text-[color:var(--v2-muted)]">
            Cuando publicas una pregunta, una tarea o un protocolo y el atleta lo deja sin cerrar,
            te aparece en Hoy. Tú decides cuánto esperamos antes de avisarte.
            {estado.isCustom ? null : ' Ahora mismo usas los días que trae el sistema.'}
          </p>

          <div className="flex flex-col divide-y divide-[color:var(--v2-border)]">
            {COACH_SIGNAL_THRESHOLD_KEYS.map((key) => (
              <Umbral
                key={key}
                copy={COPY[key]}
                value={estado.values[key]}
                fallback={DEFAULT_COACH_SIGNAL_THRESHOLDS[key]}
                onChange={(next) => set(key, next)}
              />
            ))}
          </div>

          <div className="flex flex-col items-start gap-3 border-t border-[color:var(--v2-border)] pt-4 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={restore}
              disabled={saving || sameValues(estado.values, DEFAULT_COACH_SIGNAL_THRESHOLDS)}
              className={ajustesButtonSecondary}
            >
              <MIcon name="restart_alt" size={16} aria-hidden />
              Restaurar los valores por defecto
            </button>

            <div className="min-h-[1.25rem] text-xs sm:ml-auto" aria-live="polite">
              {error ? (
                <span className="text-[color:var(--v2-danger)]">{error}</span>
              ) : ok ? (
                <span className="inline-flex items-center gap-1 text-[color:var(--v2-ok)]">
                  <MIcon name="check_circle" size={14} aria-hidden />
                  Guardado
                </span>
              ) : sameValues(estado.values, estado.saved) ? null : (
                <span className="text-[color:var(--v2-muted)]">Cambios sin guardar</span>
              )}
            </div>

            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || sameValues(estado.values, estado.saved)}
              className={ajustesButtonPrimary}
            >
              {saving ? (
                <>
                  <MIcon name="progress_activity" size={16} className="animate-spin" aria-hidden />
                  Guardando…
                </>
              ) : (
                'Guardar cambios'
              )}
            </button>
          </div>
        </Card>
      ) : null}
    </section>
  );
}

/** Una fila: qué señal es, qué significa el número y el número. */
function Umbral({
  copy,
  value,
  fallback,
  onChange,
}: {
  copy: Copy;
  value: number;
  /** El que trae el sistema, para que se vea de qué se está separando. */
  fallback: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-sm font-semibold text-[color:var(--v2-fg)]">{copy.title}</span>
        <p className="text-label leading-relaxed text-[color:var(--v2-muted)]">{copy.help}</p>
      </div>

      <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
        <div className="flex items-center gap-2">
          {/* La unidad va en el nombre accesible del control (`ariaLabel`), porque
              el «días» de al lado es solo la palabra a la vista. */}
          <Stepper
            value={value}
            onChange={onChange}
            min={COACH_SIGNAL_THRESHOLD_MIN_DAYS}
            max={COACH_SIGNAL_THRESHOLD_MAX_DAYS}
            size="sm"
            ariaLabel={copy.ariaLabel}
          />
          <span className="text-sm text-[color:var(--v2-muted)]" aria-hidden>
            días
          </span>
        </div>
        <span className="text-label text-[color:var(--v2-faint)]">Por defecto: {fallback}</span>
      </div>
    </div>
  );
}

function Cargando() {
  return (
    <Card className="flex flex-col gap-5 p-4 sm:p-5" role="status" aria-busy="true">
      <span className="sr-only">Cargando tus avisos…</span>
      {COACH_SIGNAL_THRESHOLD_KEYS.map((key) => (
        <div key={key} className="flex items-start justify-between gap-6">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Bar className="h-4 w-[min(180px,50%)]" />
            <Bar className="h-3 w-full" />
          </div>
          <Bar className="h-9 w-[104px] shrink-0" />
        </div>
      ))}
    </Card>
  );
}

function NoCarga({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="flex flex-col items-start gap-3 p-4 sm:p-5">
      <p role="alert" className="text-sm text-[color:var(--v2-fg)]">
        No hemos podido cargar tus avisos. Tus días siguen guardados, es esta pantalla la que no
        los ve.
      </p>
      <button type="button" onClick={onRetry} className={ajustesButtonSecondary}>
        <MIcon name="refresh" size={16} aria-hidden />
        Reintentar
      </button>
    </Card>
  );
}

function Bar({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'animate-pulse rounded-[var(--v2-r-m)] bg-[color:var(--v2-surface-2)] motion-reduce:animate-none',
        className,
      )}
    />
  );
}
