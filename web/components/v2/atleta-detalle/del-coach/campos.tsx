'use client';

// Los campos del compositor. Viven aquí y no dentro de cada formulario por la
// regla 0 del CONTRATO-UI: los cinco tipos comparten título, ayuda, error,
// interruptor y selector de ancla, y si cada formulario se los dibujara
// acabaríamos con cinco grafías del mismo campo.
//
// Todo sale de los tokens v2 del dashboard. Ni un hex, ni un tamaño suelto.

import { useRef, type ReactNode } from 'react';
import { CircleAlert, GripVertical, Info, ListChecks, Plus, Route, Text, X } from 'lucide-react';
import { Button, IconButton, Input, Switch, Textarea } from '@/components/v2/ui';
import { ChipGroup } from '@/components/v2/controls/ChipGroup';
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
    <div className={cn('flex flex-col gap-1.5', className)}>
      {htmlFor ? (
        <label className="t-meta text-v2-muted" htmlFor={htmlFor}>
          {etiqueta}
        </label>
      ) : (
        <span className="t-meta text-v2-muted">{etiqueta}</span>
      )}
      {ayuda ? <p className="t-meta text-v2-faint">{ayuda}</p> : null}
      {children}
      {error ? <ErrorCampo mensaje={error} /> : null}
    </div>
  );
}

export function ErrorCampo({ mensaje }: { mensaje: string }) {
  return (
    <span className="inline-flex items-center gap-1 t-meta text-v2-danger">
      <CircleAlert aria-hidden strokeWidth={2} className="size-3.5" />
      {mensaje}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Entradas
// ---------------------------------------------------------------------------

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
    <Input
      id={id}
      type={type}
      size="lg"
      value={value}
      maxLength={maxLength}
      aria-label={ariaLabel}
      invalid={error}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={cn(grande && 'font-semibold', type === 'date' && 'max-w-[220px] t-tnum', className)}
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
    <Textarea
      id={id}
      rows={rows}
      value={value}
      maxLength={maxLength}
      aria-label={ariaLabel}
      invalid={error}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
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
    <Switch
      checked={checked}
      onCheckedChange={onChange}
      className="items-start"
      label={
        <span className="flex flex-col gap-0.5">
          <span className="t-body font-medium text-v2-fg">{titulo}</span>
          <span className="t-meta text-v2-muted">{detalle}</span>
        </span>
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Casilla o lectura
// ---------------------------------------------------------------------------

/**
 * Si un paso lleva casilla o es una línea que el atleta sólo lee.
 *
 * Va DENTRO de la fila del paso, así que no puede ser un `Interruptor`: sus dos
 * líneas de texto competirían con el paso, que es el sujeto. Es un botón que
 * dice el estado en el que ESTÁ, y tocarlo lo cambia.
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
    <Button
      size="sm"
      icon={checkable ? ListChecks : Text}
      onClick={() => onChange(!checkable)}
      aria-label={`Paso ${indice}: ${estado}`}
      aria-pressed={checkable}
      title={checkable ? 'Lo marca al hacerlo. Toca para dejarlo en solo lectura.' : 'Solo lo lee. Toca para ponerle casilla.'}
      className={cn('self-start', checkable ? 'text-v2-fg' : 'text-v2-muted')}
    >
      {estado}
    </Button>
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
}: {
  opciones: ReadonlyArray<{ value: T; label: string }>;
  valor: T;
  onChange: (v: T) => void;
  ariaLabel: string;
  /** Heredado: dentro de una fila; el control ya es compacto (28 px). */
  compacto?: boolean;
}) {
  return <ChipGroup mono={false} ariaLabel={ariaLabel} options={opciones} value={valor} onChange={onChange} />;
}

/**
 * El aviso de una fila: lo que hay que saber ANTES de que el servidor diga que
 * no. No es un error todavía (nada está mal escrito), es la condición que le
 * falta a lo que acabas de elegir.
 */
export function AvisoFila({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 rounded-ctl bg-v2-warn-soft px-2.5 py-1.5 t-body-sm text-v2-fg">
      <Info aria-hidden strokeWidth={2} className="mt-0.5 size-3.5 shrink-0 text-v2-warn" />
      <span>{children}</span>
    </p>
  );
}

/** La línea de una sección que no se teclea: dice de dónde sale lo que se va a
 *  ver, para que un campo ausente no se lea como un campo que falta. */
export function LineaDeEmbed({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 rounded-ctl bg-v2-surface-2 px-2.5 py-2 t-body-sm text-v2-muted">
      <Route aria-hidden strokeWidth={1.75} className="mt-0.5 size-3.5 shrink-0" />
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
          className="flex items-start gap-1.5 rounded-panel border border-v2-border p-2"
        >
          <Button
            variant="ghost"
            size="sm"
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
            className="w-7 cursor-grab px-0 active:cursor-grabbing"
          >
            <GripVertical aria-hidden strokeWidth={1.75} />
          </Button>

          <div className="flex min-w-0 flex-1 flex-col gap-2">{render(fila, i)}</div>

          <IconButton
            icon={X}
            size="sm"
            onClick={() => onQuitar(i)}
            disabled={filas.length <= minimo}
            label={`Quitar ${nombreFila} ${i + 1}`}
            className="hover:text-v2-danger"
          />
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
    <Button size="sm" icon={Plus} onClick={onClick} disabled={disabled} className="self-start">
      {children}
    </Button>
  );
}

/** Rótulo interno de una fila («Opción», «Si la elige»): dos campos seguidos sin
 *  nombre no se distinguen, y el segundo ES la consecuencia. */
export function RotuloFila({ children }: { children: ReactNode }) {
  return <span className="t-meta text-v2-muted">{children}</span>;
}
