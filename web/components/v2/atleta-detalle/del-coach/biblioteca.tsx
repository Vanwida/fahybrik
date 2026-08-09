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

/** Lo que distingue a una plantilla de otra de un vistazo: su tamaño y dónde cae. */
function meta(c: CoachCommunicationDTO): string {
  const trozos: string[] = [];
  if (c.kind === 'protocol') trozos.push(`${c.items.length} ${c.items.length === 1 ? 'paso' : 'pasos'}`);
  if (c.kind === 'note') trozos.push(`${c.items.length} ${c.items.length === 1 ? 'sección' : 'secciones'}`);
  if (c.kind === 'question') trozos.push(`${c.items.length} opciones`);
  trozos.push(ANCHOR_COACH_LABEL[c.anchor_kind]);
  return trozos.join(' · ');
}

/**
 * El estado de la biblioteca, fuera del panel a propósito: la carga se dispara
 * en el CLICK que abre el panel, no en un efecto de montaje. Traer datos es una
 * reacción a un acto del coach, no una sincronización con un sistema externo —
 * y montarlo como efecto es lo que enciende el aviso de renders en cascada.
 */
export function useBiblioteca() {
  const [plantillas, setPlantillas] = useState<CoachCommunicationDTO[] | null>(null);
  const [borradores, setBorradores] = useState<CoachCommunicationDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [borrando, setBorrando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const [t, d] = await Promise.all([listarVista('templates'), listarVista('drafts')]);
    setCargando(false);
    if (!t.ok || !d.ok) {
      setError(t.ok ? (d as { mensaje: string }).mensaje : t.mensaje);
      return;
    }
    setError(null);
    setPlantillas(t.data);
    setBorradores(d.data);
  }, []);

  const borrar = useCallback(async (id: string) => {
    setBorrando(id);
    const r = await borrarOArchivar(id);
    setBorrando(null);
    if (!r.ok) {
      setError(r.mensaje);
      return;
    }
    setBorradores((prev) => (prev ?? []).filter((c) => c.id !== id));
  }, []);

  return { plantillas, borradores, error, cargando, borrando, cargar, borrar };
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
  const { plantillas, borradores, error, cargando, borrando, cargar, borrar } = estado;
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
            onClick={() => void cargar()}
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
        <span className="truncate text-label text-[color:var(--v2-muted)]">{meta(c)}</span>
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
