// v2 · ALTAS · QUEUE — la cola de atletas que esperan revisión del alta. Cada
// fila lleva al alta de su atleta (/atletas/[id]/intake).
//
// COMPOSICIÓN (§6.1 · §6.2): es una Lista, y una Lista sin elementos ES un Vacío
// — así que la pantalla declara `llena` cuando hay cola y `centra` cuando no, en
// vez de apilar tres tarjetas arriba y dejar 508 px muertos debajo (el 56 % del
// viewport, que era el peor caso medido del dashboard).
//
// JERARQUÍA (§9.2): «lo que decide la acción es lo más grande». Aquí el dato que
// decide es CUÁNTO LLEVA ESPERANDO — y estaba a 11 px en azul tranquilo, igual
// para el que llegó ayer que para el que lleva 115 días. Ahora la espera manda:
// pesa como dato y su tono sube por tramos.

'use client';

import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { AthleteAvatar } from '@/components/v2/AthleteAvatar';
import { EmptyState } from '@/components/v2/EmptyState';
import { PageFrame, FillPanel } from '@/components/v2/PageFrame';
import type { PendingAlta } from '@/lib/coach/pending-alta';
import {
  altaRowHint,
  altaStartStance,
  altasLeadAllowsAntesDeArrancar,
  altasQueueLead,
} from '@fahybrid/shared/domain/coach/alta-stance';
import { cn } from '@/lib/utils';

/** MÉTODO DEL COACH, no mecanismo: a partir de cuántos días una alta sin revisar
 *  deja de ser normal y empieza a ser un problema. Otro entrenador lo pondría en
 *  otro sitio (§ HARD RULE Nº0), así que nace como DEFECTO EDITABLE con nombre
 *  propio — no como un número suelto dentro de un `if`. Cuando el coach tenga
 *  ajustes de bandeja, estos dos valores son lo que se lee de su fila. */
export const ESPERA_ALTA_DEFECTOS = {
  /** A partir de aquí la espera se avisa (ámbar). */
  avisa_dias: 3,
  /** A partir de aquí la espera es un problema (rojo). */
  urge_dias: 7,
} as const;

type Urgencia = 'reciente' | 'avisa' | 'urge';

function urgenciaDe(hours: number): Urgencia {
  const dias = hours / 24;
  if (dias >= ESPERA_ALTA_DEFECTOS.urge_dias) return 'urge';
  if (dias >= ESPERA_ALTA_DEFECTOS.avisa_dias) return 'avisa';
  return 'reciente';
}

/** La espera partida en CIFRA + UNIDAD, para que el layout pinte cada una a su
 *  peso (el dato pesa más que su etiqueta, §4). */
function esperaPartida(hours: number): { cifra: string; unidad: string } {
  if (hours < 1) return { cifra: '<1', unidad: 'h esperando' };
  if (hours < 24) return { cifra: String(hours), unidad: 'h esperando' };
  const dias = Math.floor(hours / 24);
  return { cifra: String(dias), unidad: dias === 1 ? 'día esperando' : 'días esperando' };
}

const TONO_URGENCIA: Record<Urgencia, string> = {
  reciente: 'var(--v2-muted)',
  avisa: 'var(--v2-warn)',
  urge: 'var(--v2-danger)',
};

/** Fecha del evento objetivo «12 oct 2026», o null. */
function eventDateLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
    .format(d)
    .replace(/\.$/, '');
}

export function AltasQueue({ pending }: { pending: PendingAlta[] }) {
  // ── Vacío: la Lista se degrada a Vacío y se CENTRA, con su salida (§5) ─────
  if (pending.length === 0) {
    return (
      <PageFrame altura="centra">
        <EmptyState
          icon="how_to_reg"
          title="No hay altas pendientes"
          description="Cuando un atleta nuevo complete su onboarding aparecerá aquí para que revises su alta y le asignes su primer plan."
          className="max-w-md"
          action={
            <Link
              href="/atletas"
              className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border)] px-3.5 text-body font-semibold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]"
            >
              Ver el roster
              <MIcon name="arrow_forward" size={16} />
            </Link>
          }
        />
      </PageFrame>
    );
  }

  // El que más lleva esperando manda el titular: es el que decide si esto urge.
  const masEspera = pending.reduce((max, a) => Math.max(max, a.hours_since_onboarded), 0);
  const urgenciaCola = urgenciaDe(masEspera);
  const lead = altasQueueLead({
    allows_antes_de_arrancar: altasLeadAllowsAntesDeArrancar(
      pending.map((a) => altaStartStance(a.life)),
    ),
    urgencia: urgenciaCola,
  });

  return (
    <PageFrame
      altura="llena"
      head={
        <div className="mx-auto flex w-full max-w-[var(--v2-container)] flex-col gap-1.5">
          <h1 className="v2-display text-3xl sm:text-4xl">
            <span className="text-[color:var(--v2-fg)]">Altas</span>
            <span className="text-[color:var(--v2-muted)]"> · {pending.length}</span>
          </h1>
          <p className="text-body text-[color:var(--v2-muted)]">
            {lead.stem}
            {lead.shows_oldest_wait ? (
              <>
                {' '}
                La más antigua lleva{' '}
                <span className="v2-num font-semibold" style={{ color: TONO_URGENCIA[urgenciaCola] }}>
                  {esperaPartida(masEspera).cifra} {esperaPartida(masEspera).unidad.replace(' esperando', '')}
                </span>
                .
              </>
            ) : null}
          </p>
        </div>
      }
      bodyClassName="pb-4 sm:pb-6"
    >
      <div className="mx-auto flex min-h-0 w-full max-w-[var(--v2-container)] flex-1 flex-col">
        <FillPanel
          bodyClassName="divide-y divide-[color:var(--v2-border)]"
          foot={
            <div className="flex items-center justify-between border-t border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 py-2">
              <span className="text-label text-[color:var(--v2-muted)]">
                <span className="v2-num font-semibold text-[color:var(--v2-fg)]">
                  {pending.length}
                </span>{' '}
                {pending.length === 1 ? 'alta esperando' : 'altas esperando'}
              </span>
              <Link
                href="/atletas"
                className="v2-focus inline-flex items-center gap-1 text-label font-semibold text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]"
              >
                Ver el roster
                <MIcon name="arrow_forward" size={13} />
              </Link>
            </div>
          }
        >
          {pending.map((a, i) => (
            <AltaRow key={a.athlete_id} alta={a} index={i} />
          ))}
        </FillPanel>
      </div>
    </PageFrame>
  );
}

function AltaRow({ alta, index }: { alta: PendingAlta; index: number }) {
  const eventDate = eventDateLabel(alta.a_event_iso);
  const urgencia = urgenciaDe(alta.hours_since_onboarded);
  const espera = esperaPartida(alta.hours_since_onboarded);
  const tono = TONO_URGENCIA[urgencia];
  const rastro = altaRowHint(alta.life);

  return (
    <Link
      href={`/atletas/${alta.athlete_id}/intake`}
      className={cn(
        'v2-focus v2-stagger group flex items-center gap-3 px-3 py-2.5 transition-colors',
        'hover:bg-[color:var(--v2-elevated)]',
      )}
      style={{
        ['--v2-stagger-i' as string]: index,
        boxShadow: urgencia === 'reciente' ? undefined : `inset 3px 0 0 0 ${tono}`,
      }}
    >
      <AthleteAvatar name={alta.full_name} size="md" />

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-reading font-semibold text-[color:var(--v2-fg)]">
          {alta.full_name}
        </span>
        <span className="flex min-w-0 items-center gap-1 text-label text-[color:var(--v2-muted)]">
          {rastro ? (
            <>
              <MIcon name="history" size={12} className="shrink-0" />
              <span className="truncate">
                {rastro}
                {alta.a_event_name
                  ? ` · ${alta.a_event_name}${eventDate ? ` · ${eventDate}` : ''}`
                  : ''}
              </span>
            </>
          ) : alta.a_event_name ? (
            <>
              <MIcon name="flag" size={12} className="shrink-0" />
              <span className="truncate">
                {alta.a_event_name}
                {eventDate ? ` · ${eventDate}` : ''}
              </span>
            </>
          ) : (
            <>
              <MIcon
                name="error"
                size={12}
                className="shrink-0 text-[color:var(--v2-warn)]"
              />
              <span className="truncate">Sin evento objetivo</span>
            </>
          )}
        </span>
      </div>

      {/* La espera — EL dato que decide. Cifra a peso de dato, unidad debajo.
          Vive en TODOS los anchos: es la única razón por la que se abre esta
          pantalla, así que no se esconde en móvil (§9.3). */}
      <div className="flex shrink-0 flex-col items-end leading-none">
        <span className="v2-num text-data font-bold" style={{ color: tono }}>
          {espera.cifra}
        </span>
        <span className="text-label" style={{ color: tono }}>
          {espera.unidad}
        </span>
      </div>

      <span className="inline-flex shrink-0 items-center gap-1 text-body font-semibold text-[color:var(--v2-accent-text)]">
        <span className="hidden sm:inline">Revisar alta</span>
        <MIcon
          name="arrow_forward"
          size={15}
          className="transition-transform group-hover:translate-x-0.5"
        />
      </span>
    </Link>
  );
}
