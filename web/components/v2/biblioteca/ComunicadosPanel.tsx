'use client';

// COMUNICADOS — lo que el coach le publica al atleta FUERA del entreno, escrito
// una vez y reutilizable: protocolos, preguntas, tareas, notas y focos.
//
// NO es la bandeja global de comunicados (docs/DECISIONS.md, 2026-08-09): el
// seguimiento de lo que le mandaste a alguien vive en SU ficha. Aquí sólo hay
// CONTENIDO — las plantillas y lo que está a medias — que es de lo que va la
// Biblioteca entera.
//
// Se agrupa por TIPO y no por antigüedad porque así es como se busca: el coach no
// recuerda cuándo escribió el protocolo de vuelta a la calma, recuerda que era un
// protocolo.
//
// BUSCADOR: no lleva uno propio. La Biblioteca ya tiene el suyo en la cabecera y
// nos pasa `query`, igual que a Ejercicios.
//
// PUBLICAR DESDE AQUÍ ES DE DOS PASOS: primero a quién (`PublicarAAtletas`) y
// luego el compositor con eso ya resuelto. De una PLANTILLA se escribe una copia
// (`id: null`); de un BORRADOR se reusa el mismo comunicado (`id`), que es lo que
// evita acabar con dos.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { EmptyState } from '@/components/v2/EmptyState';
import { Pill } from '@/components/v2/Pill';
import { TeachingEmptyState } from '@/components/v2/orientacion';
import { ModalPortal } from '@/components/v2/editor/ModalPortal';
import { GRID_CLS } from '@/components/v2/biblioteca/biblioteca-nav';
import { PublicarAAtletas } from '@/components/v2/biblioteca/PublicarAAtletas';
import {
  Compositor,
  type CambioEnBiblioteca,
  type Destinatario,
  type ModoCompositor,
  type PartidaCompositor,
} from '@/components/v2/atleta-detalle/del-coach/Compositor';
import {
  metaComunicado,
  useBiblioteca,
} from '@/components/v2/atleta-detalle/del-coach/biblioteca';
import {
  KIND_LABEL,
  type CoachCommunicationDTO,
} from '@fahybrid/shared/domain/coach-communications';
import {
  coincideComunicado,
  porTipo,
  KIND_COACH_ASKS,
} from '@/lib/dashboard/v2/del-coach';
import { desdeComunicado } from '@/lib/dashboard/v2/del-coach-borrador';

/** El nombre con el que el atleta ve firmado un comunicado es el del club, y la
 *  previa del compositor lo enseña. Si no llega, la previa lo dice en genérico en
 *  vez de firmar con un nombre inventado. */
const FIRMA_GENERICA = 'tu coach';

const CTA_CLS =
  'v2-focus inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-3 text-sm font-semibold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)]';

/** El paso en el que está publicar/editar. Uno cada vez: son modales. */
type Flujo =
  | { paso: 'destinatarios'; c: CoachCommunicationDTO }
  | {
      paso: 'escribir';
      modo: ModoCompositor;
      partida: PartidaCompositor;
      destinatarios: Destinatario[];
    }
  | null;

export function ComunicadosPanel({
  query,
  /** La acción principal de la pestaña vive en la cabecera de la Biblioteca (como
   *  en el resto), pero el compositor lo monta este panel, que es quien tiene la
   *  lista que refrescar. Por eso el estado lo lleva el padre y aquí sólo se pide
   *  abrirlo o cerrarlo. */
  nuevaPlantilla,
  onNuevaPlantilla,
}: {
  query?: string;
  nuevaPlantilla: boolean;
  onNuevaPlantilla: (abierta: boolean) => void;
}) {
  const { plantillas, borradores, error, cargando, borrando, cargar, reintentar, borrar, guardado, publicado } =
    useBiblioteca();

  const [firma, setFirma] = useState('');
  const [flujo, setFlujo] = useState<Flujo>(null);
  const [borrandoDialogo, setBorrandoDialogo] = useState<CoachCommunicationDTO | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Abrir la pestaña ES la petición: se carga al montar, como Ejercicios. `cargar`
  // no toca estado antes de su primer `await`, así que no dispara renders en cascada.
  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    let vivo = true;
    fetch('/api/coach/profile', { credentials: 'include' })
      .then((r) => (r.ok ? (r.json() as Promise<{ profile: { full_name: string } }>) : null))
      .then((d) => {
        if (vivo && d?.profile) setFirma(d.profile.full_name);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, []);

  const q = (query ?? '').trim().toLowerCase();

  /** Las dos listas en una: para el coach «lo que tengo escrito» es una sola cosa,
   *  y lo que distingue a un borrador es una marca, no un cajón aparte. */
  const todos = useMemo(
    () => [...(plantillas ?? []), ...(borradores ?? [])],
    [plantillas, borradores],
  );
  const visibles = useMemo(() => todos.filter((c) => coincideComunicado(c, q)), [todos, q]);
  const grupos = useMemo(() => porTipo(visibles), [visibles]);

  const aplicar = useCallback(
    (mensaje: string, cambio: CambioEnBiblioteca) => {
      if (cambio.guardado) guardado(cambio.guardado);
      if (cambio.publicadoId) publicado(cambio.publicadoId);
      setFlujo(null);
      setAviso(mensaje);
    },
    [guardado, publicado],
  );

  const coachName = firma || FIRMA_GENERICA;
  const listaCargada = plantillas !== null || borradores !== null;

  return (
    <div className="flex flex-col">
      {aviso ? (
        <div
          role="status"
          className="mb-3 flex items-center gap-2 rounded-[var(--v2-r-s)] border border-[color:var(--v2-ok)] bg-[color:var(--v2-ok-soft)] px-3 py-2"
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

      {/* Un fallo CON lista es otra cosa que un fallo SIN ella: el primero no puede
          llevarse por delante lo que el coach está mirando. */}
      {error && listaCargada ? (
        <p
          role="alert"
          className="mb-3 rounded-[var(--v2-r-s)] border border-[color:var(--v2-danger)] bg-[color:var(--v2-danger-soft)] px-3 py-2 text-label font-medium text-[color:var(--v2-danger)]"
        >
          {error}
        </p>
      ) : null}

      {cargando ? <Esqueleto /> : null}

      {error && !listaCargada ? (
        <EmptyState
          icon="cloud_off"
          title="No se pudieron cargar tus comunicados"
          description="Puede ser un fallo de red puntual."
          action={
            <button type="button" onClick={reintentar} className={CTA_CLS}>
              <MIcon name="refresh" size={16} />
              Reintentar
            </button>
          }
        />
      ) : null}

      {listaCargada && todos.length === 0 ? (
        <TeachingEmptyState
          icon="campaign"
          title="Aún no tienes plantillas"
          whatToDo={
            <>
              Una <b>plantilla</b> es un comunicado escrito una vez: un protocolo, una pregunta, una
              tarea, una nota o un foco.
            </>
          }
          why={
            <>
              <b>Por qué importa:</b> lo que le explicas a uno se lo acabas explicando a veinte, y
              así lo escribes una vez y cambias sólo lo que cambie.
            </>
          }
          action={
            <button type="button" onClick={() => onNuevaPlantilla(true)} className={CTA_CLS}>
              <MIcon name="add" size={16} />
              Crear mi primera plantilla
            </button>
          }
        />
      ) : null}

      {listaCargada && todos.length > 0 && visibles.length === 0 ? (
        <EmptyState
          icon="filter_alt_off"
          title="Ningún comunicado con esa búsqueda"
          description="Se busca por el título y por lo que escribiste arriba."
        />
      ) : null}

      <div className="flex flex-col gap-5">
        {grupos.map((g) => (
          <section key={g.kind} className="flex flex-col gap-2.5">
            <div className="flex flex-col gap-1">
              <h3 className="text-eyebrow font-bold uppercase tracking-[0.12em] text-[color:var(--v2-faint)]">
                {KIND_LABEL[g.kind]} · <span className="v2-num">{g.items.length}</span>
              </h3>
              <p className="text-label text-[color:var(--v2-muted)]">
                Le pide {KIND_COACH_ASKS[g.kind]}.
              </p>
            </div>
            <ul className={GRID_CLS}>
              {g.items.map((c) => (
                <TarjetaComunicado
                  key={c.id}
                  c={c}
                  onPublicar={() => setFlujo({ paso: 'destinatarios', c })}
                  onEditar={() =>
                    setFlujo({
                      paso: 'escribir',
                      // Una plantilla se edita COMO plantilla (sigue siendo un
                      // molde); un borrador se retoma tal cual, sin publicar.
                      modo: c.is_template ? 'plantilla' : 'publicar',
                      partida: { b: desdeComunicado(c), id: c.id },
                      destinatarios: [],
                    })
                  }
                  onBorrar={() => setBorrandoDialogo(c)}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>

      {visibles.length > 0 ? (
        <p className="mt-4 text-xs text-[color:var(--v2-faint)]">
          <span className="v2-num">{visibles.length}</span>{' '}
          {visibles.length === 1 ? 'comunicado' : 'comunicados'}
        </p>
      ) : null}

      {flujo?.paso === 'destinatarios' ? (
        <PublicarAAtletas
          titulo={flujo.c.title}
          onCerrar={() => setFlujo(null)}
          onElegidos={(destinatarios) =>
            setFlujo({
              paso: 'escribir',
              modo: 'publicar',
              // Una PLANTILLA es un molde: se escribe una copia (`id: null`). Un
              // BORRADOR es el mismo comunicado y publicarlo lo reusa.
              partida: {
                b: desdeComunicado(flujo.c),
                id: flujo.c.is_template ? null : flujo.c.id,
              },
              destinatarios,
            })
          }
        />
      ) : null}

      {flujo?.paso === 'escribir' ? (
        <Compositor
          modo={flujo.modo}
          destinatarios={flujo.destinatarios}
          coachName={coachName}
          partida={flujo.partida}
          onCerrar={() => setFlujo(null)}
          onHecho={aplicar}
        />
      ) : null}

      {nuevaPlantilla ? (
        <Compositor
          modo="plantilla"
          destinatarios={[]}
          coachName={coachName}
          onCerrar={() => onNuevaPlantilla(false)}
          onHecho={(mensaje, cambio) => {
            onNuevaPlantilla(false);
            aplicar(mensaje, cambio);
          }}
        />
      ) : null}

      {borrandoDialogo ? (
        <BorrarComunicadoDialog
          c={borrandoDialogo}
          borrando={borrando === borrandoDialogo.id}
          onCerrar={() => setBorrandoDialogo(null)}
          onConfirmar={() => {
            void borrar(borrandoDialogo.id).then(() => setBorrandoDialogo(null));
          }}
        />
      ) : null}
    </div>
  );
}

/** Una plantilla (o un borrador) en la rejilla: qué es, qué tamaño tiene y las
 *  tres cosas que se pueden hacer con ella. */
function TarjetaComunicado({
  c,
  onPublicar,
  onEditar,
  onBorrar,
}: {
  c: CoachCommunicationDTO;
  onPublicar: () => void;
  onEditar: () => void;
  onBorrar: () => void;
}) {
  return (
    <li className="flex flex-col gap-2 rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-3.5 transition-colors hover:border-[color:var(--v2-border-strong)]">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <h4 className="line-clamp-2 min-w-0 text-body font-semibold text-[color:var(--v2-fg)]">
          {c.title}
        </h4>
        {/* Un borrador se distingue de un molde con una marca, no con otra rejilla:
            los dos responden a «¿tengo esto ya escrito?». */}
        {c.is_template ? null : (
          <Pill tone="warn" variant="outline" title="Escrito y sin publicar todavía">
            Sin publicar
          </Pill>
        )}
      </div>

      <p className="text-label text-[color:var(--v2-muted)]">{metaComunicado(c)}</p>

      <div className="mt-auto flex items-center gap-1.5 pt-1">
        <button
          type="button"
          onClick={onPublicar}
          className="v2-focus inline-flex h-8 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-2.5 text-label font-bold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)]"
        >
          <MIcon name="send" size={15} />
          Publicar a…
        </button>
        <button
          type="button"
          onClick={onEditar}
          className="v2-focus inline-flex h-8 items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border-strong)] px-2.5 text-label font-semibold text-[color:var(--v2-fg)] transition-colors hover:bg-[color:var(--v2-surface-2)]"
        >
          <MIcon name="edit" size={15} />
          Editar
        </button>
        <button
          type="button"
          onClick={onBorrar}
          aria-label={`Borrar ${c.title}`}
          className="v2-focus ml-auto inline-flex h-8 w-8 items-center justify-center rounded-[var(--v2-r-s)] text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-danger)]"
        >
          <MIcon name="delete" size={16} />
        </button>
      </div>
    </li>
  );
}

/**
 * El «lo escribí sin querer» de una plantilla o de un borrador.
 *
 * Sólo aparece sobre lo que NO está publicado, así que aquí no hay caso «esto ya
 * lo tiene alguien»: lo publicado no se borra, se archiva, y no vive en esta
 * pestaña. Se monta sobre ModalPortal (Escape, trampa de foco, bloqueo de scroll)
 * siguiendo a `BorrarEjercicioDialog`, que es la forma canónica del repo — y como
 * allí, el rojo va en el texto y el borde, no de relleno: no hay token de tinta
 * sobre --v2-danger y el blanco sobre ese rojo no llega a AA.
 */
function BorrarComunicadoDialog({
  c,
  borrando,
  onCerrar,
  onConfirmar,
}: {
  c: CoachCommunicationDTO;
  borrando: boolean;
  onCerrar: () => void;
  onConfirmar: () => void;
}) {
  const que = c.is_template ? 'plantilla' : 'borrador';
  return (
    <ModalPortal onEscape={onCerrar} escapeEnabled={!borrando}>
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-[color:var(--v2-scrim)] p-4 backdrop-blur-sm"
        onClick={borrando ? undefined : onCerrar}
        role="presentation"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Borrar ${que} ${c.title}`}
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          className="v2-focus w-full max-w-[440px] rounded-[var(--v2-r-l)] border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-elevated)] p-5 shadow-[var(--v2-shadow-pop)]"
        >
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--v2-r-m)] bg-[color:var(--v2-danger-soft)] text-[color:var(--v2-danger)]"
            >
              <MIcon name="delete" size={20} />
            </span>
            <div className="min-w-0">
              <h2 className="v2-display text-xl">Borrar {que}</h2>
              <p className="mt-1 text-sm leading-relaxed text-[color:var(--v2-muted)]">
                Vas a borrar «<b className="text-[color:var(--v2-fg)]">{c.title}</b>» de tu
                biblioteca. No se puede deshacer.
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-[color:var(--v2-faint)]">
                Lo que ya le hayas publicado a alguien no se toca: sigue en su ficha.
              </p>
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={onCerrar}
              disabled={borrando}
              className="v2-focus inline-flex h-9 items-center rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-3.5 text-sm font-semibold text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-border-strong)] disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onConfirmar}
              disabled={borrando}
              className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-danger)] px-3.5 text-sm font-bold text-[color:var(--v2-danger)] transition-colors hover:bg-[color:var(--v2-danger-soft)] disabled:opacity-60"
            >
              <MIcon
                name={borrando ? 'progress_activity' : 'delete'}
                size={16}
                className={borrando ? 'animate-spin' : undefined}
              />
              {borrando ? 'Borrando…' : 'Borrar'}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

/** Carga: la forma de la rejilla, no un spinner — así no salta al llegar. */
function Esqueleto() {
  return (
    <ul className={GRID_CLS} aria-hidden>
      {Array.from({ length: 6 }, (_, i) => (
        <li
          key={i}
          className="h-[124px] animate-pulse rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)]"
          style={{ animationDelay: `${i * 60}ms` }}
        />
      ))}
    </ul>
  );
}
