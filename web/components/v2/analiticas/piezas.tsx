'use client';

// LAS PIEZAS DEL PANEL — lo que la pestaña Rendimiento necesita y los
// primitivos v2 no tienen: el cambio con su marca, el chip de ancla, el punto
// de familia, la cifra con su unidad, la tabla densa que se recompone en el
// móvil, la línea de hueco con su salida y la cabecera de una tarjeta. Todo con
// los tokens del panel (`--v2-*`, Figtree, suelo 12 px, cifras tabulares).

import type { CSSProperties, ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus, MoveRight } from 'lucide-react';
import type { Ancla, Comparacion, Familia, Lectura } from '@fahybrid/shared/domain/analytics/lectura';
import { Button, Card, Tooltip } from '@/components/v2/ui';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { cifra, esCero, formatearDelta, unidadCorta, type UnidadPintable } from './formato';
import { ACCION_ETIQUETA, type AccionHueco, type Hueco } from './huecos';
import { ANCLA_CHIP, ANCLA_GLOSA, tonoCambio, unidadComparacion, type TonoCambio } from './lecturas';
import { useAncho } from './graficos';
import { PIEL_PANEL, colorFamilia, type FamiliaGrande } from './piel';

// ---------------------------------------------------------------------------
// El cambio contra el periodo anterior
// ---------------------------------------------------------------------------

const CLASE_TONO: Record<TonoCambio, string> = {
  mejor: 'text-v2-ok',
  peor: 'text-v2-danger',
  igual: 'text-v2-muted',
  neutro: 'text-v2-muted',
};

/**
 * El delta en la unidad que lo juzga (A3). La marca dice «mejor» (↗) o «peor»
 * (↘) SOLO si el servidor lo juzgó; sin palabra del servidor, la flecha dice
 * hacia dónde se movió el número, sin color. «igual» cuando no llega al umbral
 * del coach o cuando, escrito, es cero.
 */
export function DeltaPanel({ l, comparacion, etiqueta, compacto = false }: { l: Pick<Lectura, 'veredicto' | 'comparacion'>; comparacion: Comparacion; etiqueta?: string; compacto?: boolean }) {
  if (comparacion.delta == null) return null;
  const unidad = unidadComparacion(comparacion);
  const cero = esCero(comparacion.delta, unidad);
  const tono: TonoCambio = cero ? 'igual' : tonoCambio(l);
  const Icono = tono === 'igual' ? Minus : tono === 'mejor' ? ArrowUpRight : tono === 'peor' ? ArrowDownRight : comparacion.delta > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn('inline-flex flex-wrap items-baseline gap-x-1.5 t-meta t-tnum', CLASE_TONO[tono])}>
      <span className="inline-flex items-center gap-0.5 whitespace-nowrap">
        <Icono aria-hidden className="size-3.5 self-center" strokeWidth={2} />
        {cero ? 'igual' : formatearDelta(comparacion.delta, unidad)}
      </span>
      {!compacto && etiqueta ? <span className="text-v2-faint">{etiqueta}</span> : null}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Ancla, familia
// ---------------------------------------------------------------------------

/** De qué peldaño sale la cifra. Estimado o por edad, en contorno a trazos: se ve sin leerlo. */
export function AnclaChip({ ancla }: { ancla: Ancla }) {
  const debil = ancla === 'estimada' || ancla === 'poblacional';
  return (
    <Tooltip content={ANCLA_GLOSA[ancla]}>
      <span
        tabIndex={0}
        className={cn(
          'inline-flex h-5 shrink-0 items-center rounded-full border px-2 t-meta text-v2-muted outline-none focus-visible:shadow-[0_0_0_2px_var(--v2-accent)]',
          debil ? 'border-dashed border-v2-border-strong' : 'border-v2-border',
        )}
      >
        {ANCLA_CHIP[ancla]}
      </span>
    </Tooltip>
  );
}

export function PuntoFamilia({ familia }: { familia: Familia | FamiliaGrande }) {
  return <span aria-hidden className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: colorFamilia(PIEL_PANEL, familia) }} />;
}

// ---------------------------------------------------------------------------
// La cifra
// ---------------------------------------------------------------------------

/** Una cifra del panel: etiqueta 11 px arriba, valor 28 px tabular, unidad al lado y una nota debajo. */
export function Cifra({ etiqueta, valor, unidad, texto, nota, ancla, tamano = 'l', children }: { etiqueta: ReactNode; valor: number | null; unidad: UnidadPintable; /** El número ya escrito, cuando no es el de la unidad (un «+22»). */ texto?: string; nota?: ReactNode; ancla?: Ancla | null; tamano?: 'l' | 'm'; children?: ReactNode }) {
  const u = unidadCorta(unidad, valor ?? undefined);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="t-label text-v2-faint">{etiqueta}</span>
        {ancla ? <AnclaChip ancla={ancla} /> : null}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={cn(tamano === 'l' ? 't-num-l' : 't-title-sm t-tnum', valor == null ? 'text-v2-faint' : 'text-v2-fg')}>{valor == null ? 'sin dato' : (texto ?? cifra(valor, unidad))}</span>
        {u && valor != null && !texto ? <span className="t-body-sm text-v2-muted">{u}</span> : null}
      </div>
      {children}
      {nota ? <div className="t-meta text-v2-faint">{nota}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// La tabla densa — y su versión de móvil
// ---------------------------------------------------------------------------

export interface ColumnaPanel<T> {
  id: string;
  cabecera: ReactNode;
  celda: (fila: T) => ReactNode;
  alinear?: 'izquierda' | 'derecha';
  ancho?: string;
  /** En el móvil la fila se apila: `principal` va arriba a la izquierda, `valor` arriba a la derecha, el resto en la línea de debajo. `oculta` no sale. */
  movil?: 'principal' | 'valor' | 'detalle' | 'oculta';
}

/** Hueco entre columnas de la rejilla (`gap-3`). */
const GAP_TABLA_PX = 12;
/** Lo mínimo que necesita una columna de texto sin ancho fijo para leerse en una línea. */
const MIN_COLUMNA_TEXTO_PX = 140;

/** Ancho mínimo de una rejilla: los anchos fijos, un mínimo por cada columna flexible y los huecos. */
function anchoMinimoTabla(columnas: { ancho?: string }[]): number {
  const suma = columnas.reduce((acc, c) => {
    const px = /^(\d+(?:\.\d+)?)px$/.exec(c.ancho ?? '');
    return acc + (px ? Number(px[1]) : MIN_COLUMNA_TEXTO_PX);
  }, 0);
  return suma + GAP_TABLA_PX * Math.max(0, columnas.length - 1);
}

/**
 * Tabla densa del panel: cabecera 11 px en mayúsculas, filas de 40 px, cifras
 * tabulares. Elige su forma por el ancho que TIENE, no por el de la pantalla
 * (una tarjeta a media pantalla en un monitor grande es estrecha): con sitio
 * para todas las columnas es una rejilla; si solo cabe sin las `oculta` (las
 * secundarias, como la tendencia) se queda sin ellas; si no cabe, cada fila se
 * recompone en dos líneas (lo principal y su valor arriba, el detalle debajo).
 * El dato que importa a 1440 importa a 390 (CONTRATO-UI §9.3), cambia de sitio.
 */
export function TablaPanel<T>({ columnas, filas, clave, etiqueta, seleccionada, onFila }: { columnas: ColumnaPanel<T>[]; filas: T[]; clave: (f: T) => string; etiqueta: string; seleccionada?: string | null; onFila?: (f: T) => void }) {
  const { ref, ancho } = useAncho<HTMLDivElement>(0);
  const principales = columnas.filter((c) => c.movil !== 'oculta');
  const enRejilla = ancho >= anchoMinimoTabla(columnas) ? columnas : ancho >= anchoMinimoTabla(principales) ? principales : null;
  const grid = enRejilla?.map((c) => c.ancho ?? 'minmax(0, 1fr)').join(' ');
  const celda = (c: ColumnaPanel<T>): CSSProperties => ({ textAlign: c.alinear === 'derecha' ? 'right' : 'left', minWidth: 0 });
  const principal = columnas.find((c) => c.movil === 'principal') ?? columnas[0]!;
  const valor = columnas.find((c) => c.movil === 'valor');
  const detalle = columnas.filter((c) => c !== principal && c !== valor && c.movil !== 'oculta');
  return (
    <div ref={ref} role="table" aria-label={etiqueta} className="flex flex-col">
      {enRejilla ? (
        <div role="row" className="grid gap-3 border-b border-v2-border pb-2" style={{ gridTemplateColumns: grid }}>
          {enRejilla.map((c) => (
            <span key={c.id} role="columnheader" className="t-label text-v2-faint" style={celda(c)}>
              {c.cabecera}
            </span>
          ))}
        </div>
      ) : null}
      {filas.map((f) => {
        const activa = seleccionada != null && clave(f) === seleccionada;
        const contenido = enRejilla ? (
          <div className="grid items-center gap-3" style={{ gridTemplateColumns: grid }}>
            {enRejilla.map((c) => (
              <span key={c.id} role="cell" className="t-body-sm t-tnum text-v2-fg" style={celda(c)}>
                {c.celda(f)}
              </span>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 t-body-sm text-v2-fg">{principal.celda(f)}</span>
              {valor ? <span className="shrink-0 t-body-sm t-tnum text-v2-fg">{valor.celda(f)}</span> : null}
            </div>
            {detalle.length > 0 ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 t-meta text-v2-muted">
                {detalle.map((c) => (
                  <span key={c.id} className="inline-flex items-center gap-1 t-tnum">
                    {c.celda(f)}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        );
        const cls = cn('border-b border-v2-border py-2 last:border-b-0', enRejilla && 'min-h-10 py-1.5', onFila && 'cursor-pointer hover:bg-v2-hover', activa && 'bg-v2-select');
        // Una fila pulsable es un div con teclado, no un <button>: sus celdas pueden llevar botones (Comparar) y un botón no puede contener otro.
        return onFila ? (
          <div
            key={clave(f)}
            role="row"
            tabIndex={0}
            aria-selected={activa}
            onClick={() => onFila(f)}
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onFila(f);
              }
            }}
            className={cn(cls, 'w-full text-left outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--v2-accent)]')}
          >
            {contenido}
          </div>
        ) : (
          <div key={clave(f)} role="row" className={cls}>
            {contenido}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// La tarjeta de un bloque y su hueco
// ---------------------------------------------------------------------------

/** La cabecera de una tarjeta con su pregunta (el subtítulo no es un adorno: es la pregunta que responde). */
export function CabeceraTarjeta({ id, titulo, pregunta, accion }: { id?: string; titulo: string; pregunta?: ReactNode; accion?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
      <div className="min-w-0">
        <h3 id={id} className="t-title-sm text-v2-fg">
          {titulo}
        </h3>
        {pregunta ? <p className="mt-0.5 t-body-sm text-v2-muted">{pregunta}</p> : null}
      </div>
      {accion ? <div className="flex shrink-0 items-center gap-1.5">{accion}</div> : null}
    </div>
  );
}

export type ManejarAccion = (a: AccionHueco) => { href: string } | { onClick: () => void } | null;

/** El plazo de un hueco: «12 de 42 días», con su barra (cuánto lleva, cuánto hace falta). */
function Plazo({ plazo }: { plazo: NonNullable<Hueco['plazo']> }) {
  const unidad = plazo.unidad === 'dias' ? 'días' : plazo.unidad;
  const pct = plazo.hacen > 0 ? Math.min(100, (plazo.llevas / plazo.hacen) * 100) : 0;
  return (
    <span className="inline-flex items-center gap-2 t-meta t-tnum text-v2-muted">
      <span aria-hidden className="relative inline-block h-1.5 w-20 overflow-hidden rounded-full bg-v2-surface-2">
        <span className="absolute inset-y-0 left-0 rounded-full bg-v2-muted" style={{ width: `${pct}%` }} />
      </span>
      {plazo.llevas} de {plazo.hacen} {unidad}
    </span>
  );
}

/** La línea de hueco de un bloque: título, una frase y su salida (o su plazo). Sin sermón. */
export function HuecoLinea({ hueco, manejar }: { hueco: Hueco; manejar?: ManejarAccion }) {
  const salida = hueco.accion && manejar ? manejar(hueco.accion) : null;
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-ctl border px-3 py-2.5', hueco.tipo === 'pendiente' ? 'border-dashed border-v2-border-strong' : 'border-v2-border')}>
      <span className="t-body-sm font-medium text-v2-fg">{hueco.titulo}</span>
      <span className="min-w-0 basis-full t-body-sm text-v2-muted sm:basis-auto sm:flex-1">{hueco.cuerpo}</span>
      {hueco.plazo ? <Plazo plazo={hueco.plazo} /> : null}
      {salida && hueco.accion ? (
        'href' in salida ? (
          <Link href={salida.href} className="ml-auto inline-flex h-7 items-center gap-1 rounded-ctl px-2.5 t-body-sm font-medium text-v2-fg outline-none hover:bg-v2-hover focus-visible:shadow-[0_0_0_2px_var(--v2-accent)]">
            {ACCION_ETIQUETA[hueco.accion]}
            <MoveRight aria-hidden className="size-3.5" />
          </Link>
        ) : (
          <Button size="sm" variant="ghost" className="ml-auto" onClick={salida.onClick}>
            {ACCION_ETIQUETA[hueco.accion]}
          </Button>
        )
      ) : null}
    </div>
  );
}

/** Una tarjeta del panel: cabecera con su pregunta, el hueco si lo hay y el contenido. */
export function Tarjeta({ id, titulo, pregunta, accion, hueco, manejar, className, children }: { id: string; titulo: string; pregunta?: ReactNode; accion?: ReactNode; hueco?: Hueco | null; manejar?: ManejarAccion; className?: string; children?: ReactNode }) {
  return (
    <Card className={cn('min-w-0 scroll-mt-24', className)} id={id} aria-labelledby={`${id}-titulo`}>
      <CabeceraTarjeta id={`${id}-titulo`} titulo={titulo} pregunta={pregunta} accion={accion} />
      {hueco ? <HuecoLinea hueco={hueco} manejar={manejar} /> : null}
      {children}
    </Card>
  );
}
