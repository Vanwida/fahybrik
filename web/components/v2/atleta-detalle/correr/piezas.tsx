'use client';

// Las piezas de «Cómo corre». Gráficos hechos a mano con SVG y flex: son cuatro
// formas simples y ninguna justifica una librería.
//
// LA DISCIPLINA QUE COMPARTEN TODAS, y es la mitad del valor de estas tarjetas:
// si no hay bastante dato, se dice — nunca se pinta un cero. Cada pieza recibe
// lo que sabe y lo que NO sabe por separado, y la que no sabe lo escribe.

import type { ReactNode } from 'react';
import { Pill, type PillTone } from '@/components/v2/Pill';

// ---------------------------------------------------------------------------
// Marco
// ---------------------------------------------------------------------------

export function Panel({
  titulo,
  chip,
  chipTono = 'neutral',
  children,
}: {
  titulo: string;
  chip?: string | null;
  chipTono?: PillTone;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-4 sm:p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5">
        <h3 className="v2-micro">{titulo}</h3>
        {chip ? (
          <Pill tone={chipTono} variant="outline">
            {chip}
          </Pill>
        ) : null}
      </header>
      {children}
    </section>
  );
}

/** EL VEREDICTO VA DELANTE Y LOS NÚMEROS DEBAJO, nunca al revés: un entrenador
 *  no necesita el índice, necesita saber qué pasa. `tono` sólo se usa cuando el
 *  dato permite pronunciarse. */
export function Veredicto({
  frase,
  apoyo,
  tono,
}: {
  frase: string;
  apoyo?: string | null;
  tono?: 'alerta' | null;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p
        className="v2-display max-w-[34ch] text-[clamp(19px,2.6vw,24px)] leading-tight"
        style={tono === 'alerta' ? { color: 'var(--v2-warn)' } : undefined}
      >
        {frase}
      </p>
      {apoyo ? <p className="max-w-[60ch] text-sm leading-relaxed text-[color:var(--v2-muted)]">{apoyo}</p> : null}
    </div>
  );
}

/** La nota de método: qué umbral del coach decidió lo de arriba. Va en apagado
 *  porque es la letra pequeña, pero va SIEMPRE que un umbral haya mandado. */
export function NotaMetodo({ children }: { children: ReactNode }) {
  return <p className="max-w-[68ch] text-xs leading-relaxed text-[color:var(--v2-faint)]">{children}</p>;
}

/** Cuando una tarjeta no tiene con qué hablar. Dice qué falta, no «sin datos». */
export function SinBastante({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-[var(--v2-r-s)] border border-dashed border-[color:var(--v2-border-strong)] px-3.5 py-3 text-xs leading-relaxed text-[color:var(--v2-muted)]">
      {children}
    </p>
  );
}

export function Cifras({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

export function Cifra({ etiqueta, valor, pie, tono }: { etiqueta: string; valor: string; pie?: string; tono?: string }) {
  return (
    <div className="min-w-[7rem] flex-1 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 py-2.5">
      <span className="v2-micro block text-[9.5px]">{etiqueta}</span>
      <span className="v2-num mt-1.5 block text-2xl font-semibold" style={{ color: tono ?? 'var(--v2-fg)' }}>
        {valor}
      </span>
      {pie ? <span className="mt-0.5 block text-[11px] leading-snug text-[color:var(--v2-muted)]">{pie}</span> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LA BARRA DEL SESGO — hacia dónde falla, de un vistazo
// ---------------------------------------------------------------------------

/**
 * EL PORCENTAJE SOLO NO SIRVE, y esta barra es la razón de ser de la tarjeta.
 *
 * Un 74 % de acierto con los fallos por lento y un 74 % con los fallos por
 * rápido significan cosas OPUESTAS: en el primero la prescripción va larga, en
 * el segundo va corta. Con la cifra sola son idénticos; con los dos hombros
 * dibujados a cada lado del bloque «en banda» son dos dibujos espejo y se ve
 * cuál es cuál sin leer nada.
 *
 * Los dos lados van del MISMO ámbar a propósito (es el tier compartido:
 * salirse es una señal para el entrenador, no un suspenso), así que lo que
 * distingue la dirección es el ANCHO y la etiqueta, nunca el color solo. El
 * hombro de la izquierda lleva trama para que también se distinga sin color.
 */
export function BarraSesgo({
  rapido,
  dentro,
  lento,
  pct,
}: {
  rapido: number;
  dentro: number;
  lento: number;
  /** % de acierto. Null cuando no hay muestra para afirmarlo: entonces la
   *  barra se dibuja igual (los recuentos son reales) y el pie se calla. */
  pct: number | null;
}) {
  const total = rapido + dentro + lento;
  if (total === 0) return null;
  const w = (n: number) => `${(n / total) * 100}%`;

  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="flex h-8 w-full overflow-hidden rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)]"
        role="img"
        aria-label={`${dentro} en banda, ${rapido} más rápido, ${lento} más lento`}
      >
        {rapido > 0 ? (
          <span
            className="flex items-center justify-center overflow-hidden text-[11px] font-bold text-[color:var(--v2-warn)]"
            style={{
              width: w(rapido),
              background:
                'repeating-linear-gradient(135deg, color-mix(in srgb, var(--v2-warn) 26%, transparent) 0 4px, color-mix(in srgb, var(--v2-warn) 9%, transparent) 4px 8px)',
            }}
          />
        ) : null}
        {dentro > 0 ? (
          <span
            className="v2-num flex items-center justify-center overflow-hidden whitespace-nowrap px-1 text-[11px] font-bold text-[color:var(--v2-ok)]"
            style={{ width: w(dentro), background: 'var(--v2-ok-soft)' }}
          >
            {dentro} en banda
          </span>
        ) : null}
        {lento > 0 ? (
          <span
            className="v2-num flex items-center justify-center overflow-hidden text-[11px] font-bold text-[color:var(--v2-warn)]"
            style={{ width: w(lento), background: 'var(--v2-warn-soft)' }}
          >
            {lento}
          </span>
        ) : null}
      </div>
      <div className="flex items-baseline justify-between gap-2 text-[11px] leading-snug text-[color:var(--v2-muted)]">
        <span>{rapido > 0 ? `${rapido} más ${rapido === 1 ? 'rápido' : 'rápidos'}` : ''}</span>
        <span className="text-[color:var(--v2-faint)]">{pct != null ? `${pct} % de acierto` : ''}</span>
        <span className="text-right">{lento > 0 ? `${lento} más ${lento === 1 ? 'lento' : 'lentos'}` : ''}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// COLUMNAS POR POSICIÓN — dónde se rompe dentro de la serie
// ---------------------------------------------------------------------------

/** Por debajo de este acierto la columna pasa a ámbar. No es un umbral de
 *  juicio del coach: es el punto medio, y sirve para que el ojo separe la
 *  mitad buena de la mala sin leer los números. */
const MITAD = 50;

/** Alto de la columna que NO lleva porcentaje. Corto y con trama para que no se
 *  pueda leer como un valor: es «aún no lo sé», no «casi cero». */
const ALTO_SIN_PCT = 14;

export function ColumnasPorPosicion({
  posiciones,
  minPorPosicion,
}: {
  posiciones: Array<{ position: number; n: number; pct_dentro: number | null }>;
  minPorPosicion: number;
}) {
  if (posiciones.length === 0) return null;
  const ordinal = (n: number) => `${n}.ª`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-[132px] items-end gap-1.5 sm:gap-2">
        {posiciones.map((p) => {
          const sinPct = p.pct_dentro == null;
          const baja = p.pct_dentro != null && p.pct_dentro < MITAD;
          const color = sinPct ? 'var(--v2-faint)' : baja ? 'var(--v2-warn)' : 'var(--v2-ok)';
          return (
            <div key={p.position} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
              <span
                className="v2-num text-[11px] font-bold leading-none"
                style={{ color, fontSize: sinPct ? 10 : undefined }}
              >
                {sinPct ? `${p.n} aún` : `${p.pct_dentro} %`}
              </span>
              <span
                className="w-full max-w-[3.5rem] rounded-t-[5px]"
                style={{
                  height: sinPct ? ALTO_SIN_PCT : `${Math.max(3, p.pct_dentro!)}%`,
                  background: sinPct
                    ? 'repeating-linear-gradient(135deg, color-mix(in srgb, var(--v2-muted) 16%, transparent) 0 4px, transparent 4px 8px)'
                    : `color-mix(in srgb, ${color} 16%, transparent)`,
                  boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 34%, transparent)`,
                }}
              />
              <span className="text-[10.5px] leading-none text-[color:var(--v2-faint)]">{ordinal(p.position)}</span>
              <span className="v2-num text-[9.5px] leading-none text-[color:var(--v2-faint)] opacity-75">{p.n}</span>
            </div>
          );
        })}
      </div>
      <NotaMetodo>
        Debajo de cada columna, cuántas repeticiones la sostienen. Una posición con menos de {minPorPosicion} no lleva
        porcentaje: cuenta en el total, pero un 0 % con dos observaciones sería una conclusión inventada. A partir de
        cuántas se puede afirmar algo lo decides tú.
      </NotaMetodo>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BARRAS SEMANALES — el volumen
// ---------------------------------------------------------------------------

export function BarrasSemanales({
  semanas,
}: {
  semanas: Array<{ week_start: string; km: number; en_curso: boolean }>;
}) {
  if (semanas.length === 0) return null;
  const max = Math.max(...semanas.map((s) => s.km), 1);
  const etiqueta = (iso: string) => {
    const d = new Date(`${iso}T00:00:00`);
    return Number.isNaN(d.getTime())
      ? iso
      : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '');
  };

  return (
    <div className="flex h-[150px] items-end gap-1 sm:gap-1.5">
      {semanas.map((s) => (
        <div key={s.week_start} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
          <span
            className="v2-num text-[11px] font-bold leading-none"
            style={{ color: s.en_curso ? 'var(--v2-accent)' : 'var(--v2-fg)' }}
          >
            {s.km.toFixed(1).replace('.', ',')}
          </span>
          <span
            className="w-full max-w-[2.9rem] rounded-t-[5px]"
            style={{
              height: `${Math.max(2, (s.km / max) * 100)}%`,
              background: s.en_curso
                ? 'repeating-linear-gradient(135deg, color-mix(in srgb, var(--v2-accent) 24%, transparent) 0 4px, color-mix(in srgb, var(--v2-accent) 7%, transparent) 4px 8px)'
                : 'color-mix(in srgb, var(--v2-fg) 16%, transparent)',
              boxShadow: s.en_curso
                ? 'inset 0 0 0 1px color-mix(in srgb, var(--v2-accent) 34%, transparent)'
                : 'inset 0 0 0 1px color-mix(in srgb, var(--v2-fg) 10%, transparent)',
            }}
          />
          <span className="whitespace-nowrap text-[9.5px] leading-none text-[color:var(--v2-faint)]">
            {etiqueta(s.week_start)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LÍNEA DE COSTE — lo que le cuesta correr cansado
// ---------------------------------------------------------------------------

export function LineaDeCoste({ puntos }: { puntos: Array<{ week_start: string; cost_s_per_km: number }> }) {
  if (puntos.length === 0) return null;
  const W = 100;
  const H = 34;
  const valores = puntos.map((p) => p.cost_s_per_km);
  const min = Math.min(0, ...valores);
  const max = Math.max(...valores, min + 1);
  const x = (i: number) => (puntos.length === 1 ? W / 2 : (i / (puntos.length - 1)) * W);
  const y = (v: number) => H - ((v - min) / (max - min)) * H;
  const etiqueta = (iso: string) => {
    const d = new Date(`${iso}T00:00:00`);
    return Number.isNaN(d.getTime())
      ? iso
      : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '');
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="h-[110px] w-full"
            role="img"
            aria-label={`Coste de correr cansado, de ${valores[0]!.toFixed(1)} a ${valores[valores.length - 1]!.toFixed(1)} segundos por kilómetro`}
          >
            <polyline
              points={puntos.map((p, i) => `${x(i)},${y(p.cost_s_per_km)}`).join(' ')}
              fill="none"
              stroke="var(--v2-accent)"
              strokeWidth={1.2}
              vectorEffect="non-scaling-stroke"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {puntos.map((p, i) => (
              <circle key={p.week_start} cx={x(i)} cy={y(p.cost_s_per_km)} r={1.6} fill="var(--v2-accent)" vectorEffect="non-scaling-stroke" />
            ))}
          </svg>
          <div className="flex justify-between text-[9.5px] leading-none text-[color:var(--v2-faint)]">
            <span>{etiqueta(puntos[0]!.week_start)}</span>
            {puntos.length > 1 ? <span>{etiqueta(puntos[puntos.length - 1]!.week_start)}</span> : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <span className="v2-num text-2xl font-semibold leading-none text-[color:var(--v2-fg)]">
            {formatCoste(valores[valores.length - 1]!)}
          </span>
          <span className="text-[10.5px] leading-none text-[color:var(--v2-muted)]">s/km ahora</span>
        </div>
      </div>
    </div>
  );
}

/** Un coste con su signo: positivo es que pierde ritmo al correr fatigado, que
 *  es el caso normal. Un negativo es dato real y se enseña igual. */
export function formatCoste(v: number): string {
  const n = Math.abs(v).toFixed(1).replace('.', ',');
  return v >= 0 ? `+${n}` : `−${n}`;
}
