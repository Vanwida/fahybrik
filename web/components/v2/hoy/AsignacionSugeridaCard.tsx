'use client';

// AsignacionSugeridaCard — qué le falta a un atleta clasificado, y por qué no
// puedo dárselo con un clic. Se renderiza en la tira horizontal sobre las 4 calles.
//
// LOS DOS EJES VIAJAN SEPARADOS (shared/domain/coach/hoy-asignacion):
//
//   · TITULAR  = eje A, el atleta. «Terminó «Acumulación» el 26 de julio.» /
//     «Todavía no tiene ningún bloque.» Es un hecho sobre él y no depende de lo
//     que el coach tenga montado.
//   · MOTIVO   = eje B, la receta de su celda (nivel × días). Solo explica por
//     qué no cabe la propuesta de un clic. Se marca como «Tu método» para que no
//     se lea como algo del atleta.
//
// Antes solo existía el segundo y hacía de titular: Marc (bloque de biblioteca
// terminado el 26 jul) y Guillem (que nunca tuvo ninguno) salían los dos con
// «No hay secuencia para N3·5d» y un único botón a periodización. Ver
// docs/coach-ux-recorrido.html, hallazgo «Método vs atleta».
//
// Dos formas (card.kind):
//   · 'ok'      → la receta resuelve. Propuesta de un clic, con el titular del
//                 atleta encima para saber si repone o estrena. Acciones:
//                   - Asignar    → POST /api/coach/athletes/{id}/assign-sequence
//                   - Ver atleta → /atletas/{id}
//   · 'blocked' → la receta no resuelve. El titular NO cambia: sigue siendo del
//                 atleta. Y salen las puertas que correspondan, nunca una sola
//                 haciéndose pasar por la otra:
//                   - Reponer bloque → modal de biblioteca (arreglo del ATLETA)
//                   - Editar días    → su ficha (dato del ATLETA)
//                   - Crear receta   → periodización (arreglo del MÉTODO)

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AthleteAvatar } from '@/components/v2/AthleteAvatar';
import { LevelBadge } from '@/components/v2/LevelBadge';
import { MIcon } from '@/components/ui/MIcon';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import type { V2AsignacionSugeridaCard } from '@/lib/dashboard/v2/hoy-lanes';
import { DecisionStrip } from '@/components/v2/hoy/DecisionStrip';
import { ReponerBloqueModal } from '@/components/v2/hoy/ReponerBloqueModal';
import { upcomingMondayIso } from '@/lib/dashboard/v2/upcoming-monday';
import {
  RECETA_LISTA,
  puertasAsignacion,
  textoAsignacion,
  type AccionAsignacion,
  type EstadoProgramaAtleta,
} from '@fahybrid/shared/domain/coach/hoy-asignacion';

// ── Shared button styling (matches NivelSugeridoCard) ───────────────────────────

const BTN_BASE =
  'v2-focus inline-flex h-7 items-center gap-1 rounded-[var(--v2-r-pill)] px-2.5 text-label font-semibold transition-colors';

const BTN_GHOST =
  'border border-[color:var(--v2-border)] text-[color:var(--v2-muted)] hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]';

/** Icono por acción. La del atleta y la del método no se parecen a propósito. */
const ACCION_ICON: Record<AccionAsignacion, string> = {
  reponer_bloque: 'playlist_add',
  editar_dias: 'edit_calendar',
  crear_receta: 'build',
};

// ── Identidad + titular (compartidos por las dos formas) ────────────────────────

function CardHead({
  athleteName,
  levelName,
  programa,
}: {
  athleteName: string;
  levelName: string;
  programa: EstadoProgramaAtleta;
}) {
  const texto = textoAsignacion({ programa, receta: RECETA_LISTA });
  return (
    <>
      <div className="flex items-center gap-2.5">
        <AthleteAvatar name={athleteName} size="md" />
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate text-sm font-semibold text-[color:var(--v2-fg)]">
            {athleteName}
          </span>
          <LevelBadge level={levelName} />
        </div>
      </div>

      {/* Eje A — el hecho del atleta. Lo primero que se lee. */}
      <p className="mt-1.5 text-xs leading-snug font-medium text-[color:var(--v2-fg)]">
        {texto.titular}
      </p>
      {texto.hueco ? (
        <p className="mt-0.5 text-label text-[color:var(--v2-muted)]">{texto.hueco}</p>
      ) : null}
    </>
  );
}

// ── 'ok' proposal card ──────────────────────────────────────────────────────────

function ProposalCard({
  card,
  onAssigned,
}: {
  card: Extract<V2AsignacionSugeridaCard, { kind: 'ok' }>;
  /** Called after a successful POST so the parent can remove the card. */
  onAssigned: (athleteId: number) => void;
}) {
  const router = useRouter();
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // #4 — start date is a real choice here too, not just on assign-month/
  // personalize. Defaults to the SAME next-Monday the server would pick on its
  // own (assignSequenceInputSchema.start_date is optional), so leaving it alone
  // reproduces the historical one-click behaviour exactly.
  const [startDate, setStartDate] = useState(upcomingMondayIso());

  async function handleAssign() {
    if (assigning) return;
    setAssigning(true);
    setError(null);
    try {
      const res = await fetch(`/api/coach/athletes/${card.athlete_id}/assign-sequence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start_date: startDate }),
      });
      if (res.ok) {
        onAssigned(card.athlete_id);
        return;
      }
      // Surface the server's message rather than silently swallowing a failure.
      const body = (await res.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      setError(body?.error?.message ?? 'No se pudo asignar. Inténtalo de nuevo.');
    } catch {
      setError('No se pudo asignar. Inténtalo de nuevo.');
    } finally {
      setAssigning(false);
    }
  }

  const weeksLabel = `${card.first_microciclo_weeks} ${
    card.first_microciclo_weeks === 1 ? 'semana' : 'semanas'
  }`;

  return (
    <div className="w-64 shrink-0 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-2.5">
      <CardHead
        athleteName={card.athlete_name}
        levelName={card.level_name}
        programa={card.programa}
      />

      {/* Proposal line: Nivel N2 · 4 días → empezar con «microciclo» (N semanas) */}
      <p className="mt-1.5 text-xs leading-snug text-[color:var(--v2-muted)]">
        Nivel{' '}
        <span className="font-semibold text-[color:var(--v2-fg)]">{card.level_name}</span> ·{' '}
        <span className="v2-num">{card.days_per_week}</span> días → empezar con{' '}
        <span className="font-semibold text-[color:var(--v2-fg)]">
          «{card.first_microciclo_name}»
        </span>{' '}
        <span className="text-[color:var(--v2-faint)]">({weeksLabel})</span>
      </p>

      {/* #4 — compact, always-editable start date (defaults to next Monday, the
          same default the server picks with no body at all). */}
      <label className="mt-1.5 flex items-center gap-1.5 text-label text-[color:var(--v2-muted)]">
        <MIcon name="event" size={13} className="shrink-0" />
        Empieza
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="v2-focus v2-num h-6 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-1.5 text-label text-[color:var(--v2-fg)]"
        />
      </label>

      {error ? (
        <p className="mt-1.5 text-label font-medium text-[color:var(--v2-danger)]">{error}</p>
      ) : null}

      {/* Actions */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={handleAssign}
          disabled={assigning}
          className={cn(
            BTN_BASE,
            'bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)] hover:bg-[color:var(--v2-accent-press)] disabled:opacity-50',
          )}
        >
          <MIcon name="play_arrow" size={15} />
          {assigning ? 'Asignando…' : 'Asignar'}
        </button>
        <button
          type="button"
          onClick={() => router.push(`/atletas/${card.athlete_id}`)}
          className={cn(BTN_BASE, BTN_GHOST)}
        >
          Ver atleta
          <MIcon name="arrow_forward" size={15} />
        </button>
      </div>
    </div>
  );
}

// ── 'blocked' card ──────────────────────────────────────────────────────────────

function BlockedCard({
  card,
  onAssigned,
}: {
  card: Extract<V2AsignacionSugeridaCard, { kind: 'blocked' }>;
  onAssigned: (athleteId: number) => void;
}) {
  const [reponiendo, setReponiendo] = useState(false);
  // Repuesto el bloque, el atleta deja de tener hueco y el servidor ya no
  // devolvería esta tarjeta. Se retira al cerrar el modal, no al confirmar: el
  // modal vive dentro de la tarjeta y retirarla antes se llevaría por delante su
  // pantalla de «queda en borrador».
  const [repuesto, setRepuesto] = useState(false);
  const texto = textoAsignacion({ programa: card.programa, receta: card.receta });
  const puertas = puertasAsignacion({ programa: card.programa, receta: card.receta });

  return (
    <div className="w-64 shrink-0 rounded-[var(--v2-r-m)] border border-[color:var(--v2-warn)] bg-[color:var(--v2-surface)] p-2.5">
      <CardHead
        athleteName={card.athlete_name}
        levelName={card.level_name}
        programa={card.programa}
      />

      {/* Eje B — por qué no cabe la propuesta de un clic. Etiquetado como método
          para que no se lea como un hecho del atleta. */}
      {texto.motivo ? (
        <div className="mt-2 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-2">
          <p className="flex items-center gap-1 text-eyebrow font-semibold text-[color:var(--v2-warn)]">
            <MIcon name="account_tree" size={12} className="shrink-0" />
            Tu método
          </p>
          <p className="mt-0.5 text-label leading-snug text-[color:var(--v2-muted)]">
            {texto.motivo}
          </p>
        </div>
      ) : null}

      {/* Las puertas. La del atleta primero — es la que le desbloquea a él. */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {puertas.map((puerta) => {
          if (puerta.accion === 'reponer_bloque') {
            return (
              <button
                key={puerta.accion}
                type="button"
                onClick={() => setReponiendo(true)}
                className={cn(
                  BTN_BASE,
                  'bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)] hover:bg-[color:var(--v2-accent-press)]',
                )}
              >
                <MIcon name={ACCION_ICON[puerta.accion]} size={15} />
                {puerta.etiqueta}
              </button>
            );
          }
          const href =
            puerta.accion === 'editar_dias'
              ? `/atletas/${card.athlete_id}?tab=perfil`
              : '/periodizacion';
          return (
            <Link
              key={puerta.accion}
              href={href}
              className={cn(
                BTN_BASE,
                puerta.eje === 'metodo'
                  ? 'border border-[color:var(--v2-warn)] text-[color:var(--v2-warn)] hover:bg-[color:var(--v2-warn-soft)]'
                  : BTN_GHOST,
              )}
            >
              <MIcon name={ACCION_ICON[puerta.accion]} size={15} />
              {puerta.etiqueta}
            </Link>
          );
        })}
        <Link href={`/atletas/${card.athlete_id}`} className={cn(BTN_BASE, BTN_GHOST)}>
          Ver atleta
          <MIcon name="arrow_forward" size={15} />
        </Link>
      </div>

      {reponiendo ? (
        <ReponerBloqueModal
          athleteId={card.athlete_id}
          athleteName={card.athlete_name}
          titular={texto.titular}
          onRepuesto={() => setRepuesto(true)}
          onClose={() => {
            setReponiendo(false);
            if (repuesto) onAssigned(card.athlete_id);
          }}
        />
      ) : null}
    </div>
  );
}

// ── Single card (dispatches by kind) ────────────────────────────────────────────

export function AsignacionSugeridaCard({
  card,
  onAssigned,
}: {
  card: V2AsignacionSugeridaCard;
  onAssigned: (athleteId: number) => void;
}) {
  if (card.kind === 'ok') {
    return <ProposalCard card={card} onAssigned={onAssigned} />;
  }
  return <BlockedCard card={card} onAssigned={onAssigned} />;
}

// ── Strip (exported for HoyBoard) ─────────────────────────────────────────────

export function AsignacionSugeridaStrip({
  cards,
}: {
  cards: V2AsignacionSugeridaCard[];
}) {
  const [visible, setVisible] = useState<V2AsignacionSugeridaCard[]>(cards);

  if (visible.length === 0) return null;

  function handleAssigned(athleteId: number) {
    setVisible((prev) => prev.filter((c) => c.athlete_id !== athleteId));
  }

  return (
    <DecisionStrip icon="auto_awesome_motion" label="Asignación sugerida" count={visible.length}>
      {visible.map((card) => (
        <AsignacionSugeridaCard key={card.id} card={card} onAssigned={handleAssigned} />
      ))}
    </DecisionStrip>
  );
}
