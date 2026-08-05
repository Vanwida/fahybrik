'use client';

// ImportPhotoPicker — la cuarta puerta del importador: el coach suelta aquí las
// capturas de su calendario y de aquí salen ya subidas, EN ORDEN.
//
// EL ORDEN ES EL DATO. El coach dice DÓNDE EMPIEZA (arriba, en el destino) y lo
// que traigan las capturas se coloca a partir de ahí EN ESTE ORDEN. Lo que ponga
// escrito dentro de la foto no cuenta: leer «SEMANA 12» en un rótulo no la
// convierte en la semana 12 del plan que se está montando. Por eso las miniaturas
// van numeradas a la vista, se pueden reordenar, y jamás se reordenan solas por
// nombre de fichero.
//
// Reordenar tiene DOS caminos y los dos son de primera clase: arrastrar la
// miniatura, o las flechas de cada una. Arrastrar no existe para quien navega con
// teclado, así que las flechas no son un apaño: son el camino accesible, mueven el
// foco con la captura y lo cantan por `aria-live`.

import { useCallback, useEffect, useRef, useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';
import {
  MAX_PHOTOS,
  PHOTO_ACCEPT_ATTR,
  rejectionReason,
} from './import-photo-upload';

/** Una captura elegida por el coach, con su estado de subida. */
export interface PhotoDraft {
  /** Identidad estable de la captura mientras está en la pantalla. */
  id: string;
  file: File;
  /** URL local para la vista previa (se libera al quitarla). */
  preview: string;
  /** 0..100 mientras sube · null = todavía no ha empezado. */
  progress: number | null;
  /** Lo que devolvió la subida. Null = aún no está arriba. */
  pathname: string | null;
  error: string | null;
}

let draftSeq = 0;

function makeDraft(file: File): PhotoDraft {
  draftSeq += 1;
  return {
    id: `foto-${draftSeq}`,
    file,
    preview: URL.createObjectURL(file),
    progress: null,
    pathname: null,
    error: null,
  };
}

/** Mueve un elemento de `from` a `to` sin tocar el resto del orden. */
function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) {
    return [...list];
  }
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/** La miniatura: vista previa real, su número, quitar, y las dos flechas. */
function PhotoTile({
  photo,
  index,
  total,
  disabled,
  onMove,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragTarget,
  registerButton,
}: {
  photo: PhotoDraft;
  index: number;
  total: number;
  disabled: boolean;
  onMove: (from: number, to: number, focus: 'prev' | 'next') => void;
  onRemove: (id: string) => void;
  onDragStart: (index: number) => void;
  onDragOver: (index: number) => void;
  onDrop: (index: number) => void;
  onDragEnd: () => void;
  isDragTarget: boolean;
  registerButton: (key: string, el: HTMLButtonElement | null) => void;
}) {
  const [previewFailed, setPreviewFailed] = useState(false);
  const position = index + 1;
  const uploading = photo.progress != null && photo.pathname == null && photo.error == null;

  return (
    <li
      draggable={!disabled}
      onDragStart={(e) => {
        // Sin datos en el portapapeles Firefox cancela el arrastre antes de empezar.
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(index));
        onDragStart(index);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        onDragOver(index);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(index);
      }}
      onDragEnd={onDragEnd}
      className={cn(
        'w-28 shrink-0 space-y-1',
        disabled ? 'cursor-default' : 'cursor-grab active:cursor-grabbing',
      )}
    >
      <div
        className={cn(
          'relative aspect-[3/2] overflow-hidden rounded-[var(--v2-r-s)] border bg-[color:var(--v2-surface-2)]',
          isDragTarget
            ? 'border-[color:var(--v2-accent)]'
            : photo.error
              ? 'border-[color:var(--v2-danger)]'
              : 'border-[color:var(--v2-border-strong)]',
        )}
      >
        {photo.preview && !previewFailed ? (
          // eslint-disable-next-line @next/next/no-img-element -- objectURL local, no pasa por el optimizador
          <img
            src={photo.preview}
            alt={`Vista previa de ${photo.file.name}`}
            onError={() => setPreviewFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[color:var(--v2-faint)]">
            <MIcon name="image" size={22} />
          </span>
        )}

        {/* El número: es lo que decide dónde cae, así que se ve siempre. */}
        <span className="absolute left-1 top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-[var(--v2-r-pill)] bg-[color:var(--v2-accent)] px-1.5 text-nano font-bold text-[color:var(--v2-accent-fg)]">
          {position}
        </span>

        <button
          type="button"
          onClick={() => onRemove(photo.id)}
          disabled={disabled}
          aria-label={`Quitar la captura ${position}, ${photo.file.name}`}
          className="v2-focus absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-[var(--v2-r-pill)] bg-[color:var(--v2-bg)]/80 text-[color:var(--v2-fg)] transition-colors hover:bg-[color:var(--v2-danger)] hover:text-[color:var(--v2-accent-fg)] disabled:opacity-50"
        >
          <MIcon name="close" size={13} />
        </button>

        {uploading ? (
          <span className="absolute inset-x-0 bottom-0 h-1 bg-[color:var(--v2-surface-2)]">
            <span
              className="block h-full bg-[color:var(--v2-accent)] transition-[width]"
              style={{ width: `${photo.progress ?? 0}%` }}
            />
          </span>
        ) : null}

        {photo.pathname ? (
          <span className="absolute bottom-1 right-1 text-[color:var(--v2-ok)]">
            <MIcon name="check_circle" size={14} filled />
          </span>
        ) : null}
      </div>

      <p className="truncate text-nano text-[color:var(--v2-faint)]" title={photo.file.name}>
        {uploading ? `Subiendo ${photo.progress ?? 0}%` : photo.file.name}
      </p>

      <div className="flex items-center gap-1">
        <button
          type="button"
          ref={(el) => registerButton(`${photo.id}:prev`, el)}
          onClick={() => onMove(index, index - 1, 'prev')}
          disabled={disabled || index === 0}
          aria-label={`Mover la captura ${position} una posición antes`}
          className="v2-focus inline-flex h-6 w-6 items-center justify-center rounded-[var(--v2-r-2xs)] border border-[color:var(--v2-border)] text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)] disabled:opacity-30"
        >
          <MIcon name="arrow_back" size={14} />
        </button>
        <button
          type="button"
          ref={(el) => registerButton(`${photo.id}:next`, el)}
          onClick={() => onMove(index, index + 1, 'next')}
          disabled={disabled || index === total - 1}
          aria-label={`Mover la captura ${position} una posición después`}
          className="v2-focus inline-flex h-6 w-6 items-center justify-center rounded-[var(--v2-r-2xs)] border border-[color:var(--v2-border)] text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)] disabled:opacity-30"
        >
          <MIcon name="arrow_forward" size={14} />
        </button>
      </div>
    </li>
  );
}

export function ImportPhotoPicker({
  photos,
  onChange,
  disabled = false,
}: {
  photos: PhotoDraft[];
  onChange: (next: PhotoDraft[]) => void;
  /** Mientras se extrae: la tanda no se toca. */
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonsRef = useRef(new Map<string, HTMLButtonElement>());
  // A qué botón vuelve el foco después de reordenar. Va en una referencia y no en
  // estado porque no se pinta con él: solo lo lee el efecto que mueve el foco.
  const pendingFocusRef = useRef<{ id: string; dir: 'prev' | 'next' } | null>(null);
  const [rejections, setRejections] = useState<string[]>([]);
  const [announcement, setAnnouncement] = useState('');
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  // Las vistas previas son objetos vivos del navegador: si no se liberan, cada
  // tanda deja diez imágenes en memoria. Se libera lo que ya no está en la lista.
  const liveUrls = useRef(new Set<string>());
  useEffect(() => {
    const current = new Set(photos.map((p) => p.preview));
    for (const url of liveUrls.current) {
      if (!current.has(url)) {
        URL.revokeObjectURL(url);
        liveUrls.current.delete(url);
      }
    }
    for (const url of current) liveUrls.current.add(url);
  }, [photos]);
  useEffect(() => {
    const urls = liveUrls.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  // Tras mover una captura, el foco viaja CON ella: si no, el teclado se queda
  // apuntando a la posición vieja y el coach pierde el hilo a la segunda flecha.
  // Si la flecha que pulsó se ha quedado inservible (llegó a un extremo), el foco
  // salta a la otra flecha de la MISMA captura, nunca al vacío.
  useEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending) return;
    pendingFocusRef.current = null;
    const opposite = pending.dir === 'prev' ? 'next' : 'prev';
    const target = buttonsRef.current.get(`${pending.id}:${pending.dir}`);
    if (target && !target.disabled) target.focus();
    else buttonsRef.current.get(`${pending.id}:${opposite}`)?.focus();
  }, [photos]);

  const registerButton = useCallback((key: string, el: HTMLButtonElement | null) => {
    if (el) buttonsRef.current.set(key, el);
    else buttonsRef.current.delete(key);
  }, []);

  const addFiles = useCallback(
    (files: FileList | File[] | null) => {
      if (!files) return;
      const incoming = Array.from(files);
      if (incoming.length === 0) return;

      const accepted: PhotoDraft[] = [];
      const refused: string[] = [];
      let room = MAX_PHOTOS - photos.length;

      for (const file of incoming) {
        const reason = rejectionReason(file);
        if (reason) {
          refused.push(reason);
          continue;
        }
        if (room <= 0) {
          refused.push(
            `Como mucho ${MAX_PHOTOS} capturas por importación. «${file.name}» se queda fuera.`,
          );
          continue;
        }
        room -= 1;
        accepted.push(makeDraft(file));
      }

      setRejections(refused);
      if (accepted.length > 0) {
        onChange([...photos, ...accepted]);
        setAnnouncement(
          accepted.length === 1
            ? `Añadida 1 captura. Van ${photos.length + accepted.length}.`
            : `Añadidas ${accepted.length} capturas. Van ${photos.length + accepted.length}.`,
        );
      }
    },
    [onChange, photos],
  );

  const remove = useCallback(
    (id: string) => {
      const index = photos.findIndex((p) => p.id === id);
      onChange(photos.filter((p) => p.id !== id));
      setRejections([]);
      if (index >= 0) setAnnouncement(`Quitada la captura ${index + 1}.`);
    },
    [onChange, photos],
  );

  const move = useCallback(
    (from: number, to: number, dir: 'prev' | 'next') => {
      if (to < 0 || to >= photos.length) return;
      const moved = photos[from];
      if (!moved) return;
      onChange(moveItem(photos, from, to));
      setAnnouncement(`Captura movida a la posición ${to + 1} de ${photos.length}.`);
      pendingFocusRef.current = { id: moved.id, dir };
    },
    [onChange, photos],
  );

  const openPicker = () => inputRef.current?.click();

  const full = photos.length >= MAX_PHOTOS;

  return (
    <div className="space-y-2.5">
      <input
        ref={inputRef}
        type="file"
        accept={PHOTO_ACCEPT_ATTR}
        multiple
        className="sr-only"
        onChange={(e) => {
          addFiles(e.target.files);
          // Sin esto, volver a elegir el MISMO fichero no dispara el evento.
          e.target.value = '';
        }}
      />

      <div
        onDragOver={(e) => {
          if (disabled) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }}
        onDrop={(e) => {
          if (disabled) return;
          e.preventDefault();
          // Un arrastre INTERNO reordena (lo resuelve la miniatura) y no trae
          // ficheros; solo se añade lo que venga de fuera de la pantalla.
          if (dragFrom == null && e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
          setDragFrom(null);
          setDragOver(null);
        }}
        className={cn(
          'rounded-[var(--v2-r-m)] border border-dashed border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface-2)] p-4',
          disabled ? 'opacity-60' : null,
        )}
      >
        <p className="text-center text-sm font-semibold text-[color:var(--v2-fg)]">
          Arrastra las capturas
        </p>
        <p className="mt-1 text-center text-xs text-[color:var(--v2-muted)]">
          Varias fotos por importación · JPG, PNG o HEIC
        </p>

        <ol className="mt-4 flex flex-wrap justify-center gap-2.5">
          {photos.map((photo, index) => (
            <PhotoTile
              key={photo.id}
              photo={photo}
              index={index}
              total={photos.length}
              disabled={disabled}
              onMove={move}
              onRemove={remove}
              onDragStart={setDragFrom}
              onDragOver={setDragOver}
              onDrop={(target) => {
                if (dragFrom != null && dragFrom !== target) move(dragFrom, target, 'next');
                setDragFrom(null);
                setDragOver(null);
              }}
              onDragEnd={() => {
                setDragFrom(null);
                setDragOver(null);
              }}
              isDragTarget={dragOver === index && dragFrom != null && dragFrom !== index}
              registerButton={registerButton}
            />
          ))}
          {!full ? (
            <li className="w-28 shrink-0">
              <button
                type="button"
                onClick={openPicker}
                disabled={disabled}
                aria-label={
                  photos.length === 0 ? 'Elegir las capturas' : 'Añadir más capturas'
                }
                className="v2-focus flex aspect-[3/2] w-full items-center justify-center rounded-[var(--v2-r-s)] border border-dashed border-[color:var(--v2-border-strong)] text-[color:var(--v2-faint)] transition-colors hover:border-[color:var(--v2-accent)] hover:text-[color:var(--v2-accent)] disabled:opacity-50"
              >
                <MIcon name="add" size={22} />
              </button>
            </li>
          ) : null}
        </ol>
      </div>

      {/* Con UNA captura el orden no puede importar, así que el aviso sobra: era
          ruido en el caso más común. Sale solo desde la segunda, que es cuando
          hay algo que ordenar. */}
      {photos.length > 1 ? (
        <p className="text-xs leading-snug text-[color:var(--v2-muted)]">
          Se colocan en ESTE orden a partir de donde has dicho arriba: la <strong>1</strong> va
          primero. Lo que ponga escrito dentro de la foto no cuenta. Arrastra una miniatura o usa
          sus flechas para cambiarlo.
        </p>
      ) : null}

      {full ? (
        <p className="text-xs text-[color:var(--v2-muted)]">
          Ya van {MAX_PHOTOS} capturas, el máximo por importación.
        </p>
      ) : null}

      {rejections.length > 0 ? (
        <ul className="space-y-1">
          {rejections.map((reason) => (
            <li
              key={reason}
              className="flex items-start gap-1.5 text-xs leading-snug text-[color:var(--v2-warn)]"
            >
              <MIcon name="warning" size={14} className="mt-px shrink-0" />
              {reason}
            </li>
          ))}
        </ul>
      ) : null}

      {photos.some((p) => p.error) ? (
        <ul className="space-y-1">
          {photos
            .filter((p) => p.error)
            .map((p) => (
              <li
                key={p.id}
                className="flex items-start gap-1.5 text-xs leading-snug text-[color:var(--v2-danger)]"
              >
                <MIcon name="error" size={14} className="mt-px shrink-0" />
                {p.error}
              </li>
            ))}
        </ul>
      ) : null}

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
