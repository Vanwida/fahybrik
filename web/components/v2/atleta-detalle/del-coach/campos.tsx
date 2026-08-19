'use client';

// Los campos del compositor. Viven aquí y no dentro de cada formulario por la
// regla 0 del CONTRATO-UI: los cinco tipos comparten título, ayuda, error,
// interruptor y selector de ancla, y si cada formulario se los dibujara
// acabaríamos con cinco grafías del mismo campo.
//
// Todo sale de los tokens v2 del dashboard. Ni un hex, ni un tamaño suelto.

import { useRef, type ReactNode } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Envoltorio de campo
// ---------------------------------------------------------------------------

export function Campo({
  etiqueta,
  htmlFor,
  ayuda,
  error,
  children,
  className,
}: {
  etiqueta: string;
  /** Cuando el campo es UN control, la etiqueta es su `<label>` de verdad. */
  htmlFor?: string;
  ayuda?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {htmlFor ? (
        <label className="v2-micro" htmlFor={htmlFor}>
          {etiqueta}
        </label>
      ) : (
        <span className="v2-micro">{etiqueta}</span>
      )}
      {ayuda ? (
        <p className="text-label leading-relaxed text-[color:var(--v2-muted)]">{ayuda}</p>
      ) : null}
      {children}
      {error ? <ErrorCampo mensaje={error} /> : null}
    </div>
  );
}

export function ErrorCampo({ mensaje }: { mensaje: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-label font-semibold text-[color:var(--v2-danger)]">
      <MIcon name="error" size={13} />
      {mensaje}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Entradas
// ---------------------------------------------------------------------------

const BASE_ENTRADA =
  'w-full rounded-[var(--v2-r-s)] border bg-[color:var(--v2-surface)] px-3 py-2.5 text-body text-[color:var(--v2-fg)] transition-colors placeholder:text-[color:var(--v2-faint)] hover:border-[color:var(--v2-border-strong)] focus:border-[color:var(--v2-accent)] focus:outline-none';

function bordeDe(error?: boolean) {
  return error ? 'border-[color:var(--v2-danger)]' : 'border-[color:var(--v2-border-strong)]';
}

export function Entrada({
  id,
  value,
  onChange,
  placeholder,
  error,
  grande,
  type = 'text',
  maxLength,
  ariaLabel,
  className,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: boolean;
  /** El título del comunicado: es el sujeto del formulario y pesa como tal. */
  grande?: boolean;
  type?: 'text' | 'date';
  maxLength?: number;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      maxLength={maxLength}
      aria-label={ariaLabel}
      aria-invalid={error || undefined}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        BASE_ENTRADA,
        bordeDe(error),
        grande && 'v2-display text-lg leading-snug',
        type === 'date' && 'v2-num max-w-[220px]',
        className,
      )}
    />
  );
}

export function AreaTexto({
  id,
  value,
  onChange,
  placeholder,
  rows = 3,
  error,
  maxLength,
  ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  error?: boolean;
  maxLength?: number;
  ariaLabel?: string;
}) {
  return (
    <textarea
      id={id}
      rows={rows}
      value={value}
      maxLength={maxLength}
      aria-label={ariaLabel}
      aria-invalid={error || undefined}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={cn(BASE_ENTRADA, bordeDe(error), 'resize-y leading-relaxed')}
    />
  );
}

// ---------------------------------------------------------------------------
// Interruptor
// ---------------------------------------------------------------------------

export function Interruptor({
  checked,
  onChange,
  titulo,
  detalle,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  titulo: string;
  detalle: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className={cn(
          'v2-focus peer relative mt-0.5 h-[23px] w-10 shrink-0 cursor-pointer appearance-none rounded-[var(--v2-r-pill)] border transition-colors',
          'border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface-2)]',
          'checked:border-transparent checked:bg-[color:var(--v2-accent)]',
          'after:absolute after:left-0.5 after:top-0.5 after:h-[17px] after:w-[17px] after:rounded-[var(--v2-r-pill)]',
          'after:bg-[color:var(--v2-muted)] after:transition-transform after:content-[""]',
          'checked:after:translate-x-[17px] checked:after:bg-[color:var(--v2-accent-fg)]',
        )}
      />
      <span className="flex flex-col gap-1">
        <span className="text-body font-semibold text-[color:var(--v2-fg)]">{titulo}</span>
        <span className="text-label leading-relaxed text-[color:var(--v2-muted)]">{detalle}</span>
      </span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Casilla o lectura
// ---------------------------------------------------------------------------

/**
 * Si un paso lleva casilla o es una línea que el atleta sólo lee.
 *
 * Va DENTRO de la fila del paso, así que no puede ser un `Interruptor`: sus
 * 40 px de raíl y sus dos líneas de texto competirían con el paso, que es el
 * sujeto. Es un botón que dice el estado en el que ESTÁ, y tocarlo lo cambia.
 */
export function AlternadorCasilla({
  checkable,
  onChange,
  indice,
}: {
  checkable: boolean;
  onChange: (v: boolean) => void;
  /** Número del paso en voz alta, para distinguir un alternador de otro. */
  indice: number;
}) {
  const estado = checkable ? 'Con casilla' : 'Solo lectura';
  return (
    <button
      type="button"
      onClick={() => onChange(!checkable)}
      aria-label={`Paso ${indice}: ${estado}`}
      title={
        checkable
          ? 'Lo marca al hacerlo. Toca para dejarlo en solo lectura.'
          : 'Solo lo lee. Toca para ponerle casilla.'
      }
      className={cn(
        'v2-focus inline-flex h-9 shrink-0 items-center gap-1.5 self-start rounded-[var(--v2-r-pill)] border px-2.5 text-label font-semibold transition-colors',
        checkable
          ? 'border-[color:var(--v2-accent)] bg-[color:var(--v2-accent-soft)] text-[color:var(--v2-accent)]'
          : 'border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface-2)] text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]',
      )}
    >
      <MIcon name={checkable ? 'check_box' : 'notes'} size={15} />
      {estado}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Chips de una sola elección
// ---------------------------------------------------------------------------

export function ChipsUnicos<T extends string>({
  opciones,
  valor,
  onChange,
  ariaLabel,
  compacto,
}: {
  opciones: ReadonlyArray<{ value: T; label: string }>;
  valor: T;
  onChange: (v: T) => void;
  ariaLabel: string;
  /** Dentro de una fila, no encabezando el formulario: el chip se encoge para no
   *  competir con el campo que rotula. */
  compacto?: boolean;
}) {
  return (
    <div className={cn('flex flex-wrap', compacto ? 'gap-1' : 'gap-2')} role="group" aria-label={ariaLabel}>
      {opciones.map((o) => {
        const activo = o.value === valor;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={activo}
            onClick={() => onChange(o.value)}
            className={cn(
              'v2-focus inline-flex items-center rounded-[var(--v2-r-pill)] border transition-colors',
              compacto ? 'px-2.5 py-1 text-label' : 'px-3 py-1.5 text-body',
              activo
                ? 'border-[color:var(--v2-accent)] bg-[color:var(--v2-accent-soft)] font-semibold text-[color:var(--v2-accent)]'
                : 'border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] text-[color:var(--v2-muted)] hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * El aviso de una fila: lo que hay que saber ANTES de que el servidor diga que
 * no. No es un error todavía (nada está mal escrito), es la condición que le
 * falta a lo que acabas de elegir.
 */
export function AvisoFila({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-warn)] bg-[color:var(--v2-warn-soft)] px-2.5 py-1.5 text-label leading-relaxed text-[color:var(--v2-fg)]">
      <MIcon name="info" size={14} className="mt-0.5 shrink-0 text-[color:var(--v2-warn)]" />
      <span>{children}</span>
    </p>
  );
}

/** La línea de una sección que no se teclea: dice de dónde sale lo que se va a
 *  ver, para que un campo ausente no se lea como un campo que falta. */
export function LineaDeEmbed({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 rounded-[var(--v2-r-s)] border border-dashed border-[color:var(--v2-border-strong)] px-2.5 py-2 text-label leading-relaxed text-[color:var(--v2-muted)]">
      <MIcon name="route" size={14} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

// ---------------------------------------------------------------------------
// Filas ordenables
// ---------------------------------------------------------------------------

export interface ControlesFila {
  /** Mover esta fila a esa posición (arrastre o teclado). */
  mover: (desde: number, hasta: number) => void;
  quitar: (index: number) => void;
}

/**
 * La lista ordenada de pasos / secciones / opciones.
 *
 * Se reordena arrastrando el asa Y con el teclado (flechas sobre el asa): un
 * arrastre suelto deja el reordenado fuera del alcance de quien no usa ratón, y
 * el orden de un protocolo no es decorativo — es el protocolo.
 */
export function FilasOrdenables<T extends { key: string }>({
  filas,
  onMover,
  onQuitar,
  minimo,
  nombreFila,
  render,
}: {
  filas: T[];
  onMover: (desde: number, hasta: number) => void;
  onQuitar: (index: number) => void;
  /** Por debajo de este número la fila ya no se puede quitar (la forma del tipo). */
  minimo: number;
  /** Cómo se llama una fila en voz alta: «paso», «opción», «sección». */
  nombreFila: string;
  render: (fila: T, index: number) => ReactNode;
}) {
  const arrastrando = useRef<number | null>(null);

  return (
    <div className="flex flex-col gap-2">
      {filas.map((fila, i) => (
        <div
          key={fila.key}
          onDragOver={(e) => {
            if (arrastrando.current === null) return;
            e.preventDefault();
          }}
          onDrop={(e) => {
            const desde = arrastrando.current;
            arrastrando.current = null;
            if (desde === null || desde === i) return;
            e.preventDefault();
            onMover(desde, i);
          }}
          className="flex items-start gap-2 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-2 transition-colors hover:border-[color:var(--v2-border-strong)]"
        >
          <button
            type="button"
            draggable
            onDragStart={() => {
              arrastrando.current = i;
            }}
            onDragEnd={() => {
              arrastrando.current = null;
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp' && i > 0) {
                e.preventDefault();
                onMover(i, i - 1);
              }
              if (e.key === 'ArrowDown' && i < filas.length - 1) {
                e.preventDefault();
                onMover(i, i + 1);
              }
            }}
            aria-label={`Reordenar ${nombreFila} ${i + 1} de ${filas.length}. Usa las flechas arriba y abajo.`}
            className="v2-focus mt-1 shrink-0 cursor-grab rounded-[var(--v2-r-2xs)] p-1 text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-muted)] active:cursor-grabbing"
          >
            <MIcon name="drag_indicator" size={16} />
          </button>

          <div className="flex min-w-0 flex-1 flex-col gap-2">{render(fila, i)}</div>

          <button
            type="button"
            onClick={() => onQuitar(i)}
            disabled={filas.length <= minimo}
            aria-label={`Quitar ${nombreFila} ${i + 1}`}
            className="v2-focus mt-1 shrink-0 rounded-[var(--v2-r-2xs)] p-1 text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-danger)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <MIcon name="close" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

/** El botón de añadir una fila, en la voz del tipo («+ Añadir paso»). */
export function BotonAnadir({
  onClick,
  children,
  disabled,
}: {
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="v2-focus self-start rounded-[var(--v2-r-m)] border border-dashed border-[color:var(--v2-border-strong)] px-3.5 py-2 text-label font-semibold text-[color:var(--v2-muted)] transition-colors hover:border-solid hover:border-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** Rótulo interno de una fila («Opción», «Si la elige»): dos campos seguidos sin
 *  nombre no se distinguen, y el segundo ES la consecuencia. */
export function RotuloFila({ children }: { children: ReactNode }) {
  return (
    <span className="text-eyebrow font-bold uppercase tracking-[0.12em] text-[color:var(--v2-muted)]">
      {children}
    </span>
  );
}
