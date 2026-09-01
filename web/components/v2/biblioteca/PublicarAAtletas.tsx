'use client';

// PUBLICAR A… — el primer paso de publicar un comunicado desde la Biblioteca: a
// quién le llega.
//
// La ficha del atleta no necesita esto (ahí el destinatario ya está resuelto y
// preguntarlo sería preguntar lo que ya se sabe). Aquí sí: el coach parte del
// CONTENIDO («este protocolo de calentamiento») y lo que le falta es la lista.
//
// El tope no es una manía nuestra: `MAX_PUBLISH_RECIPIENTS` es el límite que
// valida el servidor, así que se dice AQUÍ y no después de un 422. Y publicar
// valida el roster entero o falla entero, así que la lista que sale de esta
// pantalla es la que se publica: no hay «a casi todos».

import { useEffect, useMemo, useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { ModalPortal } from '@/components/v2/editor/ModalPortal';
import { EmptyState } from '@/components/v2/EmptyState';
import { MAX_PUBLISH_RECIPIENTS } from '@fahybrid/shared/domain/coach-communications';
import type { Destinatario } from '@/components/v2/atleta-detalle/del-coach/Compositor';

interface AtletaDelRoster {
  athlete_id: string;
  full_name: string;
  level_name: string | null;
}

const CTA_CLS =
  'v2-focus inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[var(--v2-r-pill)] bg-[color:var(--v2-accent)] px-3.5 text-sm font-semibold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)] disabled:opacity-40';

const ATAJO_CLS = 'v2-focus font-semibold text-[color:var(--v2-accent-text)]';

export function PublicarAAtletas({
  titulo,
  onCerrar,
  onElegidos,
}: {
  /** El comunicado que se va a publicar, para no perder de vista qué se manda. */
  titulo: string;
  onCerrar: () => void;
  /** Los elegidos, con su nombre: el compositor los nombra en su cabecera. */
  onElegidos: (ds: Destinatario[]) => void;
}) {
  const [atletas, setAtletas] = useState<AtletaDelRoster[] | null>(null);
  const [fallo, setFallo] = useState(false);
  const [recarga, setRecarga] = useState(0);
  const [filtro, setFiltro] = useState('');
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());

  useEffect(() => {
    let vivo = true;
    fetch('/api/coach/athletes', { credentials: 'include' })
      .then((r) => (r.ok ? (r.json() as Promise<{ athletes: AtletaDelRoster[] }>) : null))
      .then((data) => {
        if (!vivo) return;
        if (data?.athletes) setAtletas(data.athletes);
        else setFallo(true);
      })
      .catch(() => {
        if (vivo) setFallo(true);
      });
    return () => {
      vivo = false;
    };
  }, [recarga]);

  const filtrando = filtro.trim().length > 0;
  const visibles = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!atletas) return [];
    return q ? atletas.filter((a) => a.full_name.toLowerCase().includes(q)) : atletas;
  }, [atletas, filtro]);

  const lleno = elegidos.size >= MAX_PUBLISH_RECIPIENTS;

  function alternar(id: string) {
    setElegidos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_PUBLISH_RECIPIENTS) next.add(id);
      return next;
    });
  }

  /** «todos» = todos los que estás viendo, hasta el tope. */
  function todos() {
    setElegidos(new Set(visibles.slice(0, MAX_PUBLISH_RECIPIENTS).map((a) => a.athlete_id)));
  }

  function confirmar() {
    if (!atletas || elegidos.size === 0) return;
    onElegidos(
      atletas
        .filter((a) => elegidos.has(a.athlete_id))
        .map((a) => ({ athlete_id: a.athlete_id, full_name: a.full_name })),
    );
  }

  const primero = atletas?.find((a) => elegidos.has(a.athlete_id));
  const etiqueta =
    elegidos.size === 0
      ? 'Escribírselo'
      : elegidos.size === 1 && primero
        ? `Escribírselo a ${primero.full_name}`
        : `Escribírselo a ${elegidos.size} atletas`;

  return (
    <ModalPortal onEscape={onCerrar}>
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-[color:var(--v2-scrim)] sm:items-center sm:p-6"
        onClick={onCerrar}
        role="presentation"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Publicar ${titulo}`}
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          className="v2-focus flex max-h-[92vh] w-full max-w-[520px] flex-col overflow-hidden rounded-t-[var(--v2-r-l)] border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface)] sm:rounded-[var(--v2-r-l)]"
        >
          <div className="flex items-start justify-between gap-3 border-b border-[color:var(--v2-border)] px-5 py-4">
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold tracking-tight text-[color:var(--v2-fg)]">
                Publicar · {titulo}
              </h2>
              <p className="mt-1 text-xs text-[color:var(--v2-muted)]">
                Elige a quién le llega. Después lo personalizas antes de publicarlo.
              </p>
            </div>
            <button
              type="button"
              aria-label="Cerrar"
              onClick={onCerrar}
              className="v2-focus inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-fg)]"
            >
              <MIcon name="close" size={20} />
            </button>
          </div>

          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-5 py-4">
            <label className="relative flex items-center">
              <span className="pointer-events-none absolute left-2.5 text-[color:var(--v2-faint)]">
                <MIcon name="search" size={18} />
              </span>
              <input
                type="search"
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                placeholder="buscar por nombre…"
                aria-label="Buscar un atleta por su nombre"
                className="v2-focus h-9 w-full rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] pl-8 pr-3 text-sm text-[color:var(--v2-fg)] placeholder:text-[color:var(--v2-faint)] focus:border-[color:var(--v2-border-strong)]"
              />
            </label>

            {atletas === null && !fallo ? <Esqueleto /> : null}

            {fallo ? (
              <EmptyState
                icon="cloud_off"
                title="No se pudo cargar tu lista de atletas"
                description="Puede ser un fallo de red puntual."
                action={
                  <button
                    type="button"
                    onClick={() => {
                      setFallo(false);
                      setRecarga((n) => n + 1);
                    }}
                    className={CTA_CLS}
                  >
                    <MIcon name="refresh" size={16} />
                    Reintentar
                  </button>
                }
              />
            ) : null}

            {atletas !== null && atletas.length === 0 ? (
              <EmptyState
                icon="group"
                title="Todavía no tienes atletas"
                description="Un comunicado se publica a alguien: cuando tengas atletas dados de alta podrás mandárselo."
              />
            ) : null}

            {atletas !== null && atletas.length > 0 && visibles.length === 0 ? (
              <EmptyState
                icon="filter_alt_off"
                title="Ningún atleta con ese nombre"
                description="Prueba con otra búsqueda."
              />
            ) : null}

            {visibles.length > 0 ? (
              <ul className="overflow-hidden rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)]">
                {visibles.map((a) => {
                  const on = elegidos.has(a.athlete_id);
                  return (
                    <li key={a.athlete_id}>
                      <button
                        type="button"
                        onClick={() => alternar(a.athlete_id)}
                        aria-pressed={on}
                        disabled={!on && lleno}
                        className={`v2-focus flex w-full items-center gap-3 border-b border-[color:var(--v2-border)] px-3.5 py-2.5 text-left last:border-b-0 disabled:opacity-40 ${
                          on ? 'bg-[color:var(--v2-accent-soft)]' : ''
                        }`}
                      >
                        <span
                          aria-hidden
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[var(--v2-r-2xs)] border ${
                            on
                              ? 'border-[color:var(--v2-accent)] bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)]'
                              : 'border-[color:var(--v2-border-strong)]'
                          }`}
                        >
                          {on ? <MIcon name="check" size={12} /> : null}
                        </span>
                        <span className="flex-1 truncate text-body text-[color:var(--v2-fg)]">
                          {a.full_name}
                        </span>
                        {a.level_name ? (
                          <span className="shrink-0 text-label text-[color:var(--v2-faint)]">
                            {a.level_name}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}

            {atletas !== null && atletas.length > 0 ? (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[color:var(--v2-faint)]">
                {/* El denominador es el roster ENTERO, no lo que el filtro deja
                    ver: si no, escribir tres letras diría «5 de 2». */}
                <span>
                  Seleccionados <span className="v2-num">{elegidos.size}</span> de{' '}
                  <span className="v2-num">{atletas.length}</span>
                </span>
                <span aria-hidden>·</span>
                <button type="button" onClick={todos} className={ATAJO_CLS}>
                  {filtrando ? 'todos los que ves' : 'todos'}
                </button>
                <span aria-hidden>·</span>
                <button type="button" onClick={() => setElegidos(new Set())} className={ATAJO_CLS}>
                  ninguno
                </button>
              </div>
            ) : null}

            {lleno ? (
              <p className="text-label font-medium text-[color:var(--v2-warn)]">
                Son {MAX_PUBLISH_RECIPIENTS} atletas como máximo por publicación. Quita a alguien
                para poder añadir a otro.
              </p>
            ) : null}
          </div>

          <div className="flex justify-end gap-2.5 border-t border-[color:var(--v2-border)] bg-[color:var(--v2-bg)] px-5 py-3.5">
            <button
              type="button"
              onClick={onCerrar}
              className="v2-focus inline-flex h-9 items-center rounded-[var(--v2-r-s)] border border-[color:var(--v2-border-strong)] px-3.5 text-sm font-semibold text-[color:var(--v2-fg)] transition-colors hover:bg-[color:var(--v2-surface-2)]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmar}
              disabled={elegidos.size === 0}
              className={CTA_CLS}
            >
              <MIcon name="edit_note" size={16} />
              {etiqueta}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

/** Carga: la forma de la lista, no un spinner — así no salta al llegar. */
function Esqueleto() {
  return (
    <ul className="flex flex-col gap-1.5" aria-hidden>
      {Array.from({ length: 5 }, (_, i) => (
        <li
          key={i}
          className="h-[42px] animate-pulse rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)]"
          style={{ animationDelay: `${i * 60}ms` }}
        />
      ))}
    </ul>
  );
}
