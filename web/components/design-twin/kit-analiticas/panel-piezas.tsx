'use client';

// LAS PIEZAS DEL PANEL DEL COACH — la pestaña Rendimiento pinta el MISMO
// contrato que el iPhone con los primitivos y los tokens del panel v2
// (`components/v2/ui`, `--v2-*`, Figtree, suelo 12 px, cifras tabulares en
// columnas). Aquí viven las que el panel necesita y v2 no tiene: la tabla
// densa de lecturas, el delta con su marca, el chip de ancla, el hueco de un
// bloque con salida y la fila de una familia.

import type { CSSProperties, ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Button } from '@/components/v2/ui';
import { cn } from '@/lib/utils';
import { ANCLA_ETIQUETA, type Ancla, type Comparacion, type EstadoBloque, type Familia, type FamiliaGrande, type UnidadPanel } from './contrato';
import { cifra, esCero, formatearDelta, unidadCorta } from './fmt';
import { esMejora } from './mecanismo';
import { PIEL_PANEL, colorFamilia } from './tokens';

/** ▲ mejor · ▼ peor · = dentro del ruido: la marca y la palabra, el color solo cuando juzga (ok/danger). */
export function DeltaPanel({ comparacion, unidad, compacto = false }: { comparacion: Comparacion; unidad: UnidadPanel; compacto?: boolean }) {
  const mejor = esMejora(comparacion, unidad);
  const igual = !comparacion.significativo;
  const Icono = igual ? Minus : mejor ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn('inline-flex flex-wrap items-baseline gap-x-1.5 t-meta t-tnum', igual ? 'text-v2-muted' : mejor ? 'text-v2-ok' : 'text-v2-danger')}>
      <span className="inline-flex items-center gap-0.5">
        <Icono aria-hidden className="size-3.5 self-center" strokeWidth={2} />
        {esCero(comparacion.delta, unidad) ? 'igual' : formatearDelta(comparacion.delta, unidad)}
      </span>
      {!compacto ? <span className="text-v2-faint">{comparacion.etiqueta_es}</span> : null}
    </span>
  );
}

export function AnclaPanel({ ancla }: { ancla: Ancla }) {
  const estimada = ancla === 'estimada' || ancla === 'poblacional';
  return <span className={cn('inline-flex h-5 items-center rounded-full border px-2 t-meta text-v2-muted', estimada ? 'border-dashed border-v2-border-strong' : 'border-v2-border')}>{ANCLA_ETIQUETA[ancla]}</span>;
}

export function PuntoFamiliaPanel({ familia }: { familia: Familia | FamiliaGrande }) {
  return <span aria-hidden className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: colorFamilia(PIEL_PANEL, familia) }} />;
}

/** Una cifra del panel: etiqueta 11 px arriba, valor 28 px tabular, unidad, delta y ancla. */
export function CifraPanel({ etiqueta, valor, unidad, comparacion, ancla, nota, tamano = 'l' }: { etiqueta: ReactNode; valor: number | null; unidad: UnidadPanel; comparacion?: Comparacion | null; ancla?: Ancla; nota?: ReactNode; tamano?: 'l' | 'xl' | 'm' }) {
  const u = unidadCorta(unidad, valor ?? undefined);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="t-label text-v2-faint">{etiqueta}</span>
        {ancla ? <AnclaPanel ancla={ancla} /> : null}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={cn(tamano === 'xl' ? 't-num-xl' : tamano === 'l' ? 't-num-l' : 't-title-sm t-tnum', valor == null ? 'text-v2-faint' : 'text-v2-fg')}>{valor == null ? '—' : cifra(valor, unidad)}</span>
        {u && valor != null ? <span className="t-body-sm text-v2-muted">{u}</span> : null}
      </div>
      {comparacion ? <DeltaPanel comparacion={comparacion} unidad={unidad} /> : null}
      {nota ? <div className="t-meta text-v2-faint">{nota}</div> : null}
    </div>
  );
}

export interface ColumnaPanel<T> {
  id: string;
  cabecera: ReactNode;
  celda: (fila: T) => ReactNode;
  alinear?: 'izquierda' | 'derecha';
  ancho?: string;
}

/** Tabla densa del panel: cabecera 11 px en mayúsculas, filas de 40 px, cifras tabulares. */
export function TablaPanel<T>({ columnas, filas, clave, etiqueta, seleccionada, onFila, densidad = 'compacta' }: { columnas: ColumnaPanel<T>[]; filas: T[]; clave: (f: T) => string; etiqueta: string; seleccionada?: string | null; onFila?: (f: T) => void; densidad?: 'compacta' | 'comoda' }) {
  const grid = columnas.map((c) => c.ancho ?? 'minmax(0, 1fr)').join(' ');
  const celda = (c: ColumnaPanel<T>): CSSProperties => ({ textAlign: c.alinear === 'derecha' ? 'right' : 'left', minWidth: 0 });
  return (
    <div role="table" aria-label={etiqueta} className="flex flex-col">
      <div role="row" className="grid gap-3 border-b border-v2-border pb-2" style={{ gridTemplateColumns: grid }}>
        {columnas.map((c) => (
          <span key={c.id} role="columnheader" className="t-label text-v2-faint" style={celda(c)}>
            {c.cabecera}
          </span>
        ))}
      </div>
      {filas.map((f) => {
        const activa = seleccionada != null && clave(f) === seleccionada;
        const contenido = columnas.map((c) => (
          <span key={c.id} role="cell" className="t-body-sm t-tnum text-v2-fg" style={celda(c)}>
            {c.celda(f)}
          </span>
        ));
        const cls = cn('grid items-center gap-3 border-b border-v2-border last:border-b-0', densidad === 'compacta' ? 'min-h-10 py-1.5' : 'min-h-12 py-2', onFila && 'cursor-pointer hover:bg-v2-hover', activa && 'bg-v2-select');
        // Una fila pulsable es un div con teclado, no un <button>: sus celdas pueden llevar botones (Comparar) y un botón no puede contener otro.
        return onFila ? (
          <div
            key={clave(f)}
            role="row"
            tabIndex={0}
            aria-selected={activa}
            onClick={() => onFila(f)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onFila(f);
              }
            }}
            className={cn(cls, 'w-full text-left outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--v2-accent)]')}
            style={{ gridTemplateColumns: grid }}
          >
            {contenido}
          </div>
        ) : (
          <div key={clave(f)} role="row" className={cls} style={{ gridTemplateColumns: grid }}>
            {contenido}
          </div>
        );
      })}
    </div>
  );
}

/** El hueco de un bloque en el panel: una línea con su salida (el coach no necesita el sermón). */
export function HuecoPanel({ estado, titulo, cuerpo, accion, onAccion }: { estado: Exclude<EstadoBloque, 'lleno'>; titulo: string; cuerpo: string; accion?: string | null; onAccion?: () => void }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 rounded-ctl border border-v2-border px-3 py-2.5', estado === 'viejo' && 'border-l-2 border-l-v2-warn')}>
      <span className="t-body-sm font-medium text-v2-fg">{titulo}</span>
      <span className="t-body-sm text-v2-muted">{cuerpo}</span>
      {accion ? (
        <Button size="sm" variant="ghost" onClick={onAccion} className="ml-auto">
          {accion}
        </Button>
      ) : null}
    </div>
  );
}

/** La cabecera de una tarjeta con su pregunta y, en la variante configurable, el asa para arrastrar. */
export function CabeceraTarjeta({ titulo, pregunta, accion, arrastrable = false }: { titulo: string; pregunta?: string; accion?: ReactNode; arrastrable?: boolean }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2">
        {arrastrable ? (
          <span aria-label="Arrastrar para reordenar" className="mt-1 inline-flex cursor-grab flex-col gap-0.5 text-v2-faint">
            <span className="block h-0.5 w-3 rounded bg-current" />
            <span className="block h-0.5 w-3 rounded bg-current" />
            <span className="block h-0.5 w-3 rounded bg-current" />
          </span>
        ) : null}
        <div className="min-w-0">
          <h3 className="t-title-sm text-v2-fg">{titulo}</h3>
          {pregunta ? <p className="mt-0.5 t-body-sm text-v2-muted">{pregunta}</p> : null}
        </div>
      </div>
      {accion ? <div className="flex shrink-0 items-center gap-1.5">{accion}</div> : null}
    </div>
  );
}
