'use client';

// LA SESIÓN EN PROFUNDIDAD — cómo lee el coach la carrera de un atleta.
//
// El cuerpo lleva la carrera (sujeto, curva, troceado) y el resto de la sesión;
// el carril lleva el contexto: lo que dijo el atleta y lo que escribió el coach.
// A 1080 el carril baja debajo y a 720 se apila, porque el coach abre esto en el
// móvil tanto como en el escritorio.

import { MIcon } from '@/components/ui/MIcon';
import { Pill } from '@/components/v2/Pill';
import { Link } from '@/i18n/navigation';
import { ItemPrescritoHecho } from '@/components/v2/sesion/ItemPrescritoHecho';
import type { RunComplianceVerdict } from '@fahybrid/shared/domain/adherence';
import type { CoachSessionDetail } from '@/lib/dashboard/coach/athlete-session-adapter';
import type { SegmentActual } from '@/lib/dashboard/coach/session-actuals';
import { CarreraSesion } from './CarreraSesion';
import { leerCarrera } from './lectura';

const ESTADO: Record<CoachSessionDetail['status'], { label: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' }> = {
  completed: { label: 'Completada', tone: 'ok' },
  partial: { label: 'Parcial', tone: 'warn' },
  scheduled: { label: 'Pendiente', tone: 'warn' },
  missed: { label: 'Perdida', tone: 'danger' },
  skipped: { label: 'Saltada', tone: 'neutral' },
};

const DIFICULTAD: Record<NonNullable<CoachSessionDetail['execution']>['perceived_difficulty'] & string, string> = {
  too_easy: 'Más fácil de lo normal',
  as_expected: 'Como esperaba',
  too_hard: 'Más duro de lo normal',
};

/** Una tarjeta del carril. Si no tiene contenido, no existe: nunca una caja
 *  vacía con un título encima. */
function Tarjeta({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-4">
      <span className="v2-micro">{titulo}</span>
      {children}
    </div>
  );
}

function Cita({ children }: { children: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 py-2.5">
      <MIcon name="format_quote" size={15} className="mt-0.5 shrink-0 text-[color:var(--v2-accent)]" />
      <p className="text-xs leading-relaxed text-[color:var(--v2-fg)]">{children}</p>
    </div>
  );
}

export function SesionScreen({
  detail,
  athleteName,
  backHref,
}: {
  detail: CoachSessionDetail;
  /** Para el enlace de vuelta: el coach no piensa en ids. */
  athleteName: string;
  backHref: string;
}) {
  const lectura = leerCarrera(detail);
  const estado = ESTADO[detail.status];
  const titulo = detail.display_title ?? detail.workout?.name ?? detail.template_name ?? 'Entreno';

  // Lo real, casado con la línea que lo pidió.
  const porItem = new Map<string, SegmentActual[]>();
  const sinAsociar: SegmentActual[] = [];
  for (const a of detail.segment_actuals) {
    if (!a.item_uid) {
      sinAsociar.push(a);
      continue;
    }
    const list = porItem.get(a.item_uid) ?? [];
    list.push(a);
    porItem.set(a.item_uid, list);
  }
  for (const list of porItem.values()) list.sort((x, y) => x.position - y.position);

  const veredictoPorLap = new Map<string, RunComplianceVerdict>();
  for (const t of detail.run_compliance.tramos) {
    if (t.position != null) veredictoPorLap.set(`${t.item_uid}#${t.position}`, t.verdict);
  }

  // Las líneas de carrera ya las cuenta la lectura de arriba, tramo a tramo.
  const uidsDeCarrera = new Set(lectura?.itemUids ?? []);

  const dicho = [
    detail.execution?.rpe != null ? `Esfuerzo ${detail.execution.rpe}` : null,
    detail.execution?.perceived_difficulty ? DIFICULTAD[detail.execution.perceived_difficulty] : null,
  ].filter((p): p is string => p != null);
  const hayCarril = dicho.length > 0 || !!detail.execution?.athlete_notes || !!detail.coach_notes;

  return (
    <div className="mx-auto flex w-full max-w-[var(--v2-container)] flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Link
          href={backHref}
          className="v2-focus inline-flex w-fit items-center gap-1 rounded-[var(--v2-r-s)] text-xs font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
        >
          <MIcon name="arrow_back" size={15} />
          {athleteName}
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <h1 className="v2-display text-2xl sm:text-[26px]">{titulo}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={estado.tone} variant="soft">
              {estado.label}
            </Pill>
            <span className="v2-num text-xs text-[color:var(--v2-muted)]">{detail.iso_date}</span>
            {detail.execution?.duration_min != null ? (
              <span className="v2-num text-xs text-[color:var(--v2-muted)]">
                {detail.execution.duration_min} min
              </span>
            ) : null}
            {detail.execution?.score_label ? (
              <span className="v2-num text-xs font-medium text-[color:var(--v2-fg)]">
                {detail.execution.score_label}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div
        className={
          hayCarril
            ? 'grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]'
            : 'grid grid-cols-1 gap-5'
        }
      >
        <div className="flex min-w-0 flex-col gap-6">
          {lectura ? (
            <CarreraSesion lectura={lectura} compliance={detail.run_compliance} trace={detail.execution?.trace ?? null} />
          ) : null}

          {/* El resto de la sesión: lo que no fue correr, prescrito al lado de
              hecho, exactamente como ya se lee en el cajón. */}
          {detail.workout && detail.workout.blocks.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h3 className="v2-micro">{lectura ? 'El resto de la sesión' : 'La sesión'}</h3>
              <div className="flex flex-col gap-1.5">
                {detail.workout.blocks.flatMap((block) =>
                  block.items
                    .filter((item) => !uidsDeCarrera.has(item.uid))
                    .map((item) => (
                      <ItemPrescritoHecho
                        key={item.uid}
                        item={item}
                        actuals={porItem.get(item.uid) ?? []}
                        verdictByLap={veredictoPorLap}
                      />
                    )),
                )}
              </div>
            </section>
          ) : null}

          {sinAsociar.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h3 className="v2-micro">Tramos registrados sin asociar</h3>
              <p className="text-xs leading-relaxed text-[color:var(--v2-muted)]">
                {sinAsociar.length} {sinAsociar.length === 1 ? 'tramo llegó' : 'tramos llegaron'} sin la línea que los
                pidió, así que no se pueden juzgar contra nada. Están en el detalle del cajón.
              </p>
            </section>
          ) : null}
        </div>

        {hayCarril ? (
          <div className="flex flex-col gap-3">
            {dicho.length > 0 || detail.execution?.athlete_notes ? (
              <Tarjeta titulo="Lo que dijo el atleta">
                {dicho.length > 0 ? (
                  <p className="text-sm font-semibold leading-snug text-[color:var(--v2-fg)]">{dicho.join(' · ')}</p>
                ) : null}
                {detail.execution?.athlete_notes ? <Cita>{detail.execution.athlete_notes}</Cita> : null}
              </Tarjeta>
            ) : null}

            {detail.coach_notes ? (
              <Tarjeta titulo="Tu nota de este día">
                <Cita>{detail.coach_notes}</Cita>
              </Tarjeta>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
