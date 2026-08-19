'use client';

// DEL COACH — la pestaña de la ficha del atleta.
//
// Es la otra mitad de hablar con él: Mensajes CONVERSA, esto se PUBLICA y se
// SIGUE. Se llama igual que lo ve él en su móvil para que el coach sepa siempre
// en qué cajón está escribiendo.
//
// No hay sección de raíl a propósito (docs/DECISIONS.md 2026-08-09): con cien
// atletas el coach piensa en EL atleta, no en la feature, así que el seguimiento
// vive aquí y el compositor se abre desde aquí con el destinatario ya resuelto.
//
// El dato llega del servidor con la ficha (una sola lectura, sin parpadeo) y
// tras publicar o retirar se relee con `router.refresh()`, que es el patrón del
// resto del dashboard.

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { FichaCard, FichaLabel } from '../resumen/piezas';
import type { CoachAthleteCommunicationDTO } from '@fahybrid/shared/domain/coach-communications';
import { carriles } from '@/lib/dashboard/v2/del-coach';
import { Compositor } from './Compositor';
import { ComunicadoDetalle } from './ComunicadoDetalle';
import { FilaComunicado } from './lista';

export function DelCoachTab({
  athleteId,
  athleteName,
  coachName,
  communications,
}: {
  athleteId: string;
  athleteName: string;
  /** El nombre con el que el atleta ve firmados los comunicados (el del club). */
  coachName: string;
  communications: CoachAthleteCommunicationDTO[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [componiendo, setComponiendo] = useState(false);
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const { reclama, alDia, historial } = useMemo(() => carriles(communications), [communications]);
  const abierto = abiertoId ? (communications.find((c) => c.id === abiertoId) ?? null) : null;

  const recargar = (mensaje: string) => {
    setAviso(mensaje);
    startTransition(() => router.refresh());
  };

  const botonNuevo = (
    <button
      type="button"
      onClick={() => setComponiendo(true)}
      className="v2-focus inline-flex h-[34px] items-center rounded-[var(--v2-r-pill)] bg-[color:var(--v2-accent)] px-[15px] text-[12.5px] font-semibold text-[color:var(--v2-accent-fg)]"
    >
      Nuevo
    </button>
  );

  const vacio = communications.length === 0;

  return (
    <div className="mx-auto flex w-full max-w-[1300px] flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <FichaLabel>Del coach</FichaLabel>
          <p className="mt-1 max-w-[58ch] text-[13.5px] leading-relaxed text-[color:var(--v2-muted)]">
            Se publica y se rastrea. El día a día sigue en Mensaje.
          </p>
        </div>
        {vacio ? null : botonNuevo}
      </div>

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

      {vacio ? (
        <button
          type="button"
          onClick={() => setComponiendo(true)}
          className="v2-focus flex w-full items-center justify-between gap-3 rounded-[14px] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-4 py-3 text-left"
        >
          <span className="text-[13px] text-[color:var(--v2-muted)]">
            Todavía no le has publicado nada a {athleteName}
          </span>
          <span className="shrink-0 text-[12.5px] font-semibold text-[color:var(--v2-accent)]">Nuevo →</span>
        </button>
      ) : null}

      {reclama.length > 0 ? (
        <Carril
          titulo="Te reclama"
          pie="Arriba lo que todavía está abierto: algo sin contestar, sin hacer o sin abrir."
          lista={reclama}
          onAbrir={setAbiertoId}
        />
      ) : null}

      {alDia.length > 0 ? (
        <Carril titulo="Cerrado" lista={alDia} onAbrir={setAbiertoId} />
      ) : null}

      {historial.length > 0 ? (
        <details className="group">
          <summary className="v2-focus flex cursor-pointer list-none items-center gap-1.5 rounded-[var(--v2-r-s)] py-1 text-label font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]">
            <MIcon
              name="expand_more"
              size={16}
              className="transition-transform group-open:rotate-180"
            />
            Historial · {historial.length} retirado{historial.length === 1 ? '' : 's'}
          </summary>
          <ul className="mt-2.5 flex flex-col gap-2">
            {historial.map((c) => (
              <FilaComunicado key={c.id} c={c} onAbrir={() => setAbiertoId(c.id)} />
            ))}
          </ul>
        </details>
      ) : null}

      {componiendo ? (
        <Compositor
          modo="publicar"
          // Desde la ficha el destinatario NO se elige: es este atleta y ya está.
          destinatarios={[{ athlete_id: athleteId, full_name: athleteName }]}
          coachName={coachName}
          onCerrar={() => setComponiendo(false)}
          onHecho={(mensaje) => {
            setComponiendo(false);
            recargar(mensaje);
          }}
        />
      ) : null}

      {abierto ? (
        <ComunicadoDetalle
          c={abierto}
          athleteName={athleteName}
          onCerrar={() => setAbiertoId(null)}
          onRetirado={(mensaje) => {
            setAbiertoId(null);
            recargar(mensaje);
          }}
        />
      ) : null}
    </div>
  );
}

function Carril({
  titulo,
  pie,
  lista,
  onAbrir,
}: {
  titulo: string;
  pie?: string;
  lista: CoachAthleteCommunicationDTO[];
  onAbrir: (id: string) => void;
}) {
  return (
    <FichaCard>
      <FichaLabel>{titulo}</FichaLabel>
      {pie ? <p className="mt-1 text-[12.5px] text-[color:var(--v2-muted)]">{pie}</p> : null}
      <ul className="mt-3 flex flex-col gap-2">
        {lista.map((c) => (
          <FilaComunicado key={c.id} c={c} onAbrir={() => onAbrir(c.id)} />
        ))}
      </ul>
    </FichaCard>
  );
}
