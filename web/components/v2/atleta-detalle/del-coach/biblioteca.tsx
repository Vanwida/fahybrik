'use client';

// EMPEZAR DESDE ALGO QUE YA EXISTE — la biblioteca de plantillas y lo que el
// coach tiene a medias.
//
// Son dos listas y un solo panel a propósito: desde la ficha de un atleta, «una
// plantilla» y «un borrador» responden a la misma pregunta («¿tengo esto ya
// escrito?») y se usan igual — se cargan en el compositor, se personalizan y se
// publican. Partirlas en dos sitios obligaría a acordarse de en cuál se guardó.
//
// La plantilla NO se publica: es un molde, así que al elegirla se escribe un
// comunicado nuevo. El borrador sí es el mismo comunicado, y por eso se puede
// borrar desde aquí: si no, un borrador guardado por error no tendría salida.

import { useCallback, useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { Pill } from '@/components/v2/Pill';
import { KIND_LABEL, type CoachCommunicationDTO } from '@fahybrid/shared/domain/coach-communications';
import { ANCHOR_COACH_LABEL } from '@/lib/dashboard/v2/del-coach';
import { borrarOArchivar, listarVista } from './api';

/** Lo que distingue a una plantilla de otra de un vistazo: su tamaño y dónde cae.
 *  Exportado porque la pestaña Comunicados enseña lo MISMO en su rejilla. */
export function metaComunicado(c: CoachCommunicationDTO): string {
  const trozos: string[] = [];
  if (c.kind === 'protocol') trozos.push(`${c.items.length} ${c.items.length === 1 ? 'paso' : 'pasos'}`);
  if (c.kind === 'note') trozos.push(`${c.items.length} ${c.items.length === 1 ? 'sección' : 'secciones'}`);
  if (c.kind === 'question') trozos.push(`${c.items.length} opciones`);
  trozos.push(ANCHOR_COACH_LABEL[c.anchor_kind]);
  return trozos.join(' · ');
}

/** Quitar uno de una lista que puede no estar cargada todavía. */
function sin(id: string) {
  return (prev: CoachCommunicationDTO[] | null) => prev?.filter((c) => c.id !== id) ?? prev;
}

/** Meterlo delante, o reemplazarlo si ya estaba (una edición no lo duplica). */
function con(c: CoachCommunicationDTO) {
  return (prev: CoachCommunicationDTO[] | null) => {
    if (prev === null) return prev;
    const i = prev.findIndex((x) => x.id === c.id);
    if (i === -1) return [c, ...prev];
    const next = [...prev];
    next[i] = c;
    return next;
  };
}

/**
 * El estado de la biblioteca de comunicados del coach: sus plantillas y lo que
 * tiene a medias. Vive fuera del panel porque lo usan las dos superficies que la
 * enseñan — el desplegable «Desde biblioteca…» del compositor y la pestaña
 * Comunicados de la Biblioteca, que es una rejilla de página entera.
 *
 * `cargar` NO toca estado antes del primer `await` a propósito: así la pestaña
 * puede dispararla desde su efecto de montaje sin encender el aviso de renders en
 * cascada. Por eso `cargando` se DERIVA en vez de guardarse: además deja una sola
 * respuesta a «¿todavía no hay nada?».
 */
export function useBiblioteca() {
  const [plantillas, setPlantillas] = useState<CoachCommunicationDTO[] | null>(null);
  const [borradores, setBorradores] = useState<CoachCommunicationDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [borrando, setBorrando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [t, d] = await Promise.all([listarVista('templates'), listarVista('drafts')]);
    if (!t.ok) {
      setError(t.mensaje);
      return;
    }
    if (!d.ok) {
      setError(d.mensaje);
      return;
    }
    setError(null);
    setPlantillas(t.data);
    setBorradores(d.data);
  }, []);

  /** Limpiar el error es lo que hace el botón, no la carga: si no, «¿cuándo deja
   *  de haber error?» tendría dos respuestas. */
  const reintentar = useCallback(() => {
    setError(null);
    void cargar();
  }, [cargar]);

  const borrar = useCallback(async (id: string) => {
    setBorrando(id);
    const r = await borrarOArchivar(id);
    setBorrando(null);
    if (!r.ok) {
      setError(r.mensaje);
      return;
    }
    // Sale de las dos: desde la pestaña también se borran plantillas, y el
    // servidor ya dijo que no existe — volver a pedir la lista sólo la haría
    // parpadear. Y un fallo anterior deja de ser verdad: se retira con él.
    setError(null);
    setPlantillas(sin(id));
    setBorradores(sin(id));
  }, []);

  /** Un comunicado recién escrito entra en la lista que le toca por lo que ES. */
  const guardado = useCallback((c: CoachCommunicationDTO) => {
    if (c.is_template) {
      setPlantillas(con(c));
      setBorradores(sin(c.id));
    } else {
      setBorradores(con(c));
      setPlantillas(sin(c.id));
    }
  }, []);

  /** Un borrador que se publica deja de estar sin publicar: se va de la lista. */
  const publicado = useCallback((id: string) => setBorradores(sin(id)), []);

  const cargando = plantillas === null && borradores === null && error === null;

  return {
    plantillas,
    borradores,
    error,
    cargando,
    borrando,
    cargar,
    reintentar,
    borrar,
    guardado,
    publicado,
  };
}

export type EstadoBiblioteca = ReturnType<typeof useBiblioteca>;

export function PanelBiblioteca({
  estado,
  onElegir,
  onBorrado,
  onCerrar,
}: {
  estado: EstadoBiblioteca;
  /** `borradorId` viaja cuando lo elegido ERA un borrador: publicarlo lo reusa. */
  onElegir: (c: CoachCommunicationDTO, borradorId: string | null) => void;
  /** Avisa de qué borrador ha desaparecido: si es el que está cargado, el
   *  compositor tiene que dejar de intentar reusarlo al publicar. */
  onBorrado: (id: string) => void;
  onCerrar: () => void;
}) {
  const { plantillas, borradores, error, cargando, borrando, reintentar, borrar } = estado;
  const vacio =
    !cargando && plantillas !== null && borradores !== null && plantillas.length === 0 && borradores.length === 0;

  return (
    <div className="flex flex-col gap-3 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-3.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="v2-micro">Empezar desde algo escrito</h3>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar la biblioteca"
          className="v2-focus inline-flex h-7 w-7 items-center justify-center rounded-[var(--v2-r-s)] text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-fg)]"
        >
          <MIcon name="close" size={16} />
        </button>
      </div>

      {error ? (
        <div className="flex items-center justify-between gap-3 rounded-[var(--v2-r-s)] border border-[color:var(--v2-danger)] bg-[color:var(--v2-danger-soft)] px-3 py-2">
          <span className="text-label font-medium text-[color:var(--v2-danger)]">{error}</span>
          <button
            type="button"
            onClick={reintentar}
            className="v2-focus inline-flex items-center gap-1 rounded-[var(--v2-r-s)] border border-[color:var(--v2-danger)] px-2 py-1 text-label font-semibold text-[color:var(--v2-danger)]"
          >
            <MIcon name="refresh" size={13} />
            Reintentar
          </button>
        </div>
      ) : null}

      {cargando ? (
        <span className="inline-flex items-center gap-2 py-2 text-label text-[color:var(--v2-faint)]">
          <MIcon name="progress_activity" size={15} className="animate-spin" />
          Cargando…
        </span>
      ) : null}

      {vacio ? (
        <p className="py-1 text-label leading-relaxed text-[color:var(--v2-muted)]">
          Todavía no has guardado nada. Al publicar un comunicado marca «Guardar en biblioteca» y
          aparecerá aquí para reutilizarlo con otro atleta, cambiando sólo lo que cambie.
        </p>
      ) : null}

      {plantillas && plantillas.length > 0 ? (
        <Grupo titulo="Biblioteca">
          {plantillas.map((c) => (
            <Fila key={c.id} c={c} onUsar={() => onElegir(c, null)} />
          ))}
        </Grupo>
      ) : null}

      {borradores && borradores.length > 0 ? (
        <Grupo titulo="Sin publicar">
          {borradores.map((c) => (
            <Fila
              key={c.id}
              c={c}
              onUsar={() => onElegir(c, c.id)}
              onBorrar={() => {
                onBorrado(c.id);
                void borrar(c.id);
              }}
              borrando={borrando === c.id}
            />
          ))}
        </Grupo>
      ) : null}
    </div>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-eyebrow font-bold uppercase tracking-[0.12em] text-[color:var(--v2-faint)]">
        {titulo}
      </span>
      <ul className="flex flex-col gap-1.5">{children}</ul>
    </div>
  );
}

function Fila({
  c,
  onUsar,
  onBorrar,
  borrando,
}: {
  c: CoachCommunicationDTO;
  onUsar: () => void;
  onBorrar?: () => void;
  borrando?: boolean;
}) {
  return (
    <li className="flex items-center gap-2.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-3 py-2">
      <Pill tone={c.kind === 'note' ? 'neutral' : c.kind === 'focus' ? 'info' : 'accent'} variant="soft">
        {KIND_LABEL[c.kind]}
      </Pill>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body font-semibold text-[color:var(--v2-fg)]">{c.title}</span>
        <span className="truncate text-label text-[color:var(--v2-muted)]">
          {metaComunicado(c)}
        </span>
      </span>
      {onBorrar ? (
        <button
          type="button"
          onClick={onBorrar}
          disabled={borrando}
          aria-label={`Borrar el borrador ${c.title}`}
          className="v2-focus inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--v2-r-s)] text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-danger)] disabled:opacity-50"
        >
          <MIcon name={borrando ? 'progress_activity' : 'delete'} size={15} className={borrando ? 'animate-spin' : undefined} />
        </button>
      ) : null}
      <button
        type="button"
        onClick={onUsar}
        className="v2-focus inline-flex h-7 shrink-0 items-center rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-2.5 text-label font-bold text-[color:var(--v2-accent-fg)] transition-opacity hover:opacity-90"
      >
        Usar
      </button>
    </li>
  );
}
