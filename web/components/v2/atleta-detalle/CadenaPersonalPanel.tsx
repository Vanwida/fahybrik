'use client';

// LA CADENA DE MICROCICLOS DE UN ATLETA — «Personalizar plan» (0164) sólo
// sabía crear UN tramo. Un plan de verdad son varios seguidos («Base» 3 sem →
// «Descarga» 1 → «Build» 3 → …), y esto es lo que faltaba: verlos como la
// cadena que son, y poder añadir/reordenar/editar/borrar sin romper fechas.
//
// Dibuja la MISMA espina que ve el atleta y que sale en la nota del coach
// (`web/components/plan-espina`, `Espina`) — no se redibuja nada local, sólo
// se cuelgan los controles del nodo (`contenido`), que es justo lo que la
// pieza espera de cada superficie que la usa (ver CadenaEspina, el mismo
// patrón para la cadena de una secuencia).
//
// Sólo los nodos PERSONALES (`is_personal`) llevan controles — un nodo de
// biblioteca se ve, no se toca desde aquí. Un botón que no aplica (mover el
// primero hacia arriba, mover algo con historia) no se enseña: nunca
// deshabilitado con un error después.

import { useEffect, useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { Espina, TOKENS_V2, TONOS_V2, colorDelTono, type TramoEspina } from '@/components/plan-espina';
import { Panel } from './parts';
import { cn } from '@/lib/utils';
import { AnadirMicrocicloModal } from './AnadirMicrocicloModal';
import { EditarMicrocicloModal } from './EditarMicrocicloModal';
import { BorrarMicrocicloCadenaModal } from './BorrarMicrocicloCadenaModal';

interface ChainNode {
  assignment_id: string;
  month_template_id: string;
  week_count: number;
  weeks_label: string;
  title: string;
  detail: string | null;
  start_date: string;
  end_date: string;
  current_week: number | null;
  milestone: boolean;
  tone: number;
  is_personal: boolean;
  executed_count: number;
  pending_count: number;
  min_week_count: number | null;
  pending_by_week: number[];
  can_move_up: boolean;
  can_move_down: boolean;
  can_delete: boolean;
}

export function CadenaPersonalPanel({
  athleteId,
  athleteName,
  allowEmpty = false,
}: {
  athleteId: string;
  athleteName?: string;
  /** Si no hay cadena todavía, enseña el vacío + «Añadir microciclo» en vez
   *  de desaparecer. Es el estado honesto de un alta en modo personal. */
  allowEmpty?: boolean;
}) {
  const router = useRouter();
  const [chain, setChain] = useState<ChainNode[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ChainNode | null>(null);
  const [deleting, setDeleting] = useState<ChainNode | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);

  function load() {
    fetch(`/api/coach/athletes/${athleteId}/plan-chain`, { credentials: 'include' })
      .then((r) => r.json())
      .then((body: { chain?: ChainNode[] }) => setChain(body.chain ?? []))
      .catch(() => setLoadError(true));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athleteId]);

  async function move(node: ChainNode, direction: 'up' | 'down') {
    if (movingId) return;
    setMovingId(node.month_template_id);
    setMoveError(null);
    try {
      const res = await fetch(
        `/api/coach/athletes/${athleteId}/plan-chain/${node.month_template_id}/move`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ direction }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setMoveError(body?.error?.message ?? 'No se pudo mover el ciclo.');
        return;
      }
      load();
      router.refresh();
    } catch {
      setMoveError('No se pudo mover el ciclo. Inténtalo de nuevo.');
    } finally {
      setMovingId(null);
    }
  }

  if (chain === null) {
    return (
      <Panel title="Cadena de ciclos" bodyClassName="flex flex-col gap-2.5">
        {loadError ? (
          <p className="py-2 text-center text-xs text-[color:var(--v2-danger)]">
            No se pudo cargar la cadena.
          </p>
        ) : (
          <p className="py-2 text-center text-xs text-[color:var(--v2-muted)]">Cargando…</p>
        )}
      </Panel>
    );
  }
  // Sin nada asignado no hay cadena que dibujar ni "anterior" al que
  // encadenar — salvo en un alta personal, donde el vacío ES el estado
  // (el esqueleto nace al planificar, no antes).
  if (chain.length === 0 && !allowEmpty) return null;

  const editingIdx = editing ? chain.findIndex((n) => n.month_template_id === editing.month_template_id) : -1;

  const tramos: TramoEspina[] = chain.map((node) => ({
    clave: node.assignment_id,
    semanas: node.weeks_label,
    titulo: node.title,
    detalle: node.detail,
    color: colorDelTono(TONOS_V2, node.tone),
    destacado: node.milestone,
    actual: node.current_week !== null,
    semanaActual: node.current_week,
    contenido: node.is_personal ? (
      <ControlesMicrociclo
        node={node}
        moving={movingId === node.month_template_id}
        onMoveUp={node.can_move_up ? () => move(node, 'up') : undefined}
        onMoveDown={node.can_move_down ? () => move(node, 'down') : undefined}
        onEdit={() => setEditing(node)}
        onDelete={() => setDeleting(node)}
      />
    ) : (
      <span className="mt-1.5 inline-flex items-center gap-1 text-eyebrow font-medium text-[color:var(--v2-faint)]">
        <MIcon name="menu_book" size={12} /> De la biblioteca, no se edita aquí
      </span>
    ),
  }));

  return (
    <Panel title="Cadena de ciclos" bodyClassName="flex flex-col gap-2.5">
      {tramos.length > 0 ? (
        <Espina tokens={TOKENS_V2} tramos={tramos} />
      ) : (
        <p className="text-xs text-[color:var(--v2-muted)]">
          Todavía no hay ciclos. El primero aparece cuando lo planificas.
        </p>
      )}
      {moveError ? <p className="text-xs font-medium text-[color:var(--v2-danger)]">{moveError}</p> : null}
      <button
        type="button"
        onClick={() => setAdding(true)}
        className="v2-focus flex w-full items-center gap-2.5 rounded-[var(--v2-r-m)] border border-dashed border-[color:var(--v2-border)] px-3 py-2.5 text-left text-[color:var(--v2-faint)] transition-colors hover:border-[color:var(--v2-accent)] hover:text-[color:var(--v2-accent-text)]"
      >
        <MIcon name="add" size={20} />
        <span className="text-label font-bold">Añadir ciclo</span>
      </button>

      {adding ? (
        <AnadirMicrocicloModal
          athleteId={athleteId}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            load();
            router.refresh();
          }}
        />
      ) : null}
      {editing ? (
        <EditarMicrocicloModal
          athleteId={athleteId}
          monthTemplateId={editing.month_template_id}
          currentName={editing.title}
          currentWeekCount={editing.week_count}
          minWeekCount={editing.min_week_count ?? 1}
          pendingByWeek={editing.pending_by_week}
          // Sólo los tramos PERSONALES posteriores se recolocarían — un nodo
          // de biblioteca detrás (no debería darse en la práctica: lo
          // personal siempre cierra la cadena) nunca se mueve desde aquí.
          hasFollowingTramos={editingIdx >= 0 && chain.slice(editingIdx + 1).some((n) => n.is_personal)}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      ) : null}
      {deleting ? (
        <BorrarMicrocicloCadenaModal
          athleteId={athleteId}
          athleteName={athleteName ?? 'este atleta'}
          monthTemplateId={deleting.month_template_id}
          planName={deleting.title}
          pendingCount={deleting.pending_count}
          completedCount={deleting.executed_count}
          isCurrent={deleting.current_week !== null}
          hasFollowingTramos={chain.some((n) => n.is_personal && n.start_date > deleting.start_date)}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            load();
          }}
        />
      ) : null}
    </Panel>
  );
}

function ControlesMicrociclo({
  node,
  moving,
  onMoveUp,
  onMoveDown,
  onEdit,
  onDelete,
}: {
  node: ChainNode;
  moving: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="mt-1.5 flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        {onMoveUp ? (
          <BotonIcono icono="arrow_upward" etiqueta={`Mover «${node.title}» antes`} onClick={onMoveUp} disabled={moving} />
        ) : null}
        {onMoveDown ? (
          <BotonIcono
            icono="arrow_downward"
            etiqueta={`Mover «${node.title}» después`}
            onClick={onMoveDown}
            disabled={moving}
          />
        ) : null}
        <Link
          href={`/microciclos/${node.month_template_id}`}
          className="v2-focus inline-flex h-[22px] items-center gap-1 rounded-[var(--v2-r-xs)] bg-[color:var(--v2-accent)] px-1.5 text-label font-semibold text-[color:var(--v2-accent-fg)]"
        >
          <MIcon name="open_in_new" size={12} /> Abrir
        </Link>
        <button
          type="button"
          onClick={onEdit}
          className="v2-focus inline-flex h-[22px] items-center gap-1 rounded-[var(--v2-r-xs)] border border-[color:var(--v2-border)] px-1.5 text-label font-semibold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]"
        >
          <MIcon name="edit" size={12} /> Nombre
        </button>
        {node.can_delete ? (
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Borrar «${node.title}»`}
            title="Borrar de la cadena"
            className="v2-focus inline-flex h-[22px] items-center gap-1 rounded-[var(--v2-r-xs)] border border-[color:var(--v2-border)] px-1.5 text-label font-semibold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-danger)] hover:text-[color:var(--v2-danger)]"
          >
            <MIcon name="delete" size={12} /> Borrar
          </button>
        ) : null}
      </div>
      {node.executed_count > 0 ? (
        <span className="text-eyebrow text-[color:var(--v2-faint)]">
          {node.executed_count === 1 ? '1 sesión hecha' : `${node.executed_count} sesiones hechas`}, no
          se puede mover
          {node.min_week_count != null && node.min_week_count > 0
            ? ` ni acortar de ${node.min_week_count} ${node.min_week_count === 1 ? 'semana' : 'semanas'}`
            : ''}
          .
        </span>
      ) : null}
    </div>
  );
}

function BotonIcono({
  icono,
  etiqueta,
  onClick,
  disabled,
}: {
  icono: string;
  etiqueta: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={etiqueta}
      title={etiqueta}
      className={cn(
        'v2-focus inline-flex h-[22px] w-[26px] items-center justify-center rounded-[var(--v2-r-xs)] border border-[color:var(--v2-border)] text-[color:var(--v2-faint)] transition-colors',
        disabled ? 'cursor-not-allowed opacity-40' : 'hover:text-[color:var(--v2-fg)]',
      )}
    >
      <MIcon name={icono} size={14} />
    </button>
  );
}
