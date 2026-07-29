'use client';

// Los átomos de «vivo-fuerza».
//
// NOTA para quien integre: `Cabecera` es el mismo cromo que `TopStrip` en
// `screens/entreno-vivo/piezas.tsx`. Están duplicados porque cada familia de
// esta tanda escribe solo en su carpeta; el §0 pide que suba a `kit.tsx` en el
// lote de integración, antes de que sean tres.

import type { ReactNode } from 'react';
import { IconCheckCircle, IconChevron, IconClose, Label, Mono, RAD, SP } from '../../kit';
import { reloj } from '../../datos-reales';
import { kg, serieTexto, type Prescripcion, type SerieHecha } from './data';

// ---------------------------------------------------------------------------
// Cromo
// ---------------------------------------------------------------------------

function BotonCromo({ children, label, onClick }: { children: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      style={{
        width: 26,
        height: 28,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        border: 0,
        color: 'var(--twin-muted)',
        cursor: 'pointer',
        padding: 0,
      }}
    >
      {children}
    </button>
  );
}

export function Cabecera({
  bloque,
  ejercicio,
  indice,
  total,
  onSalir,
}: {
  bloque: string;
  ejercicio: string;
  indice: number;
  total: number;
  onSalir: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', flex: '0 0 auto' }}>
      <BotonCromo label="Salir del entreno" onClick={onSalir}>
        <IconClose size={13} />
      </BotonCromo>
      <BotonCromo label="Pausar entreno" onClick={onSalir}>
        <span style={{ fontSize: 16 }}>‖</span>
      </BotonCromo>
      <BotonCromo label="Volver atrás" onClick={onSalir}>
        <IconChevron dir="left" size={13} />
      </BotonCromo>
      <span style={{ flex: 1 }} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
        <span
          style={{
            font: 'italic 800 9px/1.1 var(--twin-font-sans)',
            letterSpacing: '0.08em',
            color: 'var(--twin-accent-text)',
          }}
        >
          {bloque.toUpperCase()}
        </span>
        <Mono size={11} color="var(--twin-muted)">
          {ejercicio.toUpperCase()}
        </Mono>
      </div>
      <Mono size={11} color="var(--twin-muted)" style={{ marginLeft: 10 }}>
        {indice}/{total}
      </Mono>
    </div>
  );
}

// ---------------------------------------------------------------------------
// El riel de series — dónde vas de las cuatro
// ---------------------------------------------------------------------------

function Peldano({
  arriba,
  abajo,
  estado,
}: {
  arriba: string;
  abajo?: string;
  estado: 'hecha' | 'actual' | 'futura';
}) {
  const actual = estado === 'actual';
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        minHeight: 46,
        padding: '7px 2px',
        borderRadius: RAD.s,
        background: actual ? 'var(--twin-accent)' : 'var(--twin-surface)',
        color: actual ? 'var(--twin-accent-on)' : 'var(--twin-muted)',
        border: `${actual ? 1.5 : 1}px solid ${actual ? 'var(--twin-accent-text)' : 'var(--twin-hairline)'}`,
        opacity: estado === 'futura' ? 0.55 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {estado === 'hecha' && (
          <span style={{ color: 'var(--twin-ok)', display: 'inline-flex' }}>
            <IconCheckCircle size={11} />
          </span>
        )}
        <Mono size={13} weight={800} color="currentColor">
          {arriba}
        </Mono>
      </div>
      {abajo && (
        <Mono size={9} weight={600} color="currentColor" style={{ opacity: 0.75 }}>
          {abajo}
        </Mono>
      )}
    </div>
  );
}

/**
 * Las series como peldaños. Las hechas enseñan lo que se REGISTRÓ (no lo que
 * se pidió: en la 3 puede que bajes el peso, y eso es justo lo que quieres ver
 * antes de decidir la siguiente). Las futuras solo el número — repetir tres
 * veces la misma prescripción es ruido.
 */
export function RielSeries({
  total,
  activa,
  hechas,
}: {
  total: number;
  activa: number;
  hechas: Record<number, SerieHecha>;
}) {
  return (
    <div style={{ display: 'flex', gap: 6, flex: '0 0 auto' }}>
      {Array.from({ length: total }, (_, i) => {
        const hecha = hechas[i];
        const estado = hecha ? 'hecha' : i === activa ? 'actual' : 'futura';
        return (
          <Peldano
            key={i}
            arriba={String(i + 1)}
            abajo={hecha ? (serieTexto(hecha.reps, hecha.cargaKg) ?? undefined) : undefined}
            estado={estado}
          />
        );
      })}
    </div>
  );
}

/**
 * El nombre corto para un peldaño. DOS palabras, no una: el circuito real
 * tiene `Sled Push` y `Sled drag (backwards)` seguidos, y cortando por la
 * primera palabra los dos peldaños ponían «Sled» — el riel dejaba de decir
 * dónde estás, que es su único trabajo.
 */
function corto(nombre: string): string {
  return nombre.split(' ').slice(0, 2).join(' ');
}

/** El orden del circuito: A1 · A2 · A3 · A4, con el que tienes delante encendido. */
export function RielCircuito({
  letras,
  activo,
}: {
  letras: { letra: string; nombre: string }[];
  activo: number;
}) {
  return (
    <div style={{ display: 'flex', gap: 6, flex: '0 0 auto' }}>
      {letras.map((l, i) => (
        <Peldano
          key={l.letra}
          arriba={l.letra}
          abajo={corto(l.nombre)}
          estado={i === activo ? 'actual' : i < activo ? 'hecha' : 'futura'}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// El sujeto — la serie que tienes delante
// ---------------------------------------------------------------------------

/**
 * `gobierna` (§6.1): la cifra escala con el hueco. Si la prescripción no trae
 * medida, el sujeto DEGRADA a lo único que hay (la carga) en vez de romperse
 * o de inventarse unas repeticiones.
 */
export function Sujeto({
  encima,
  cifra,
  unidad,
  nombre,
  pastilla,
  debajo,
}: {
  encima: string;
  cifra: string;
  unidad: string | null;
  nombre: string;
  pastilla?: string;
  debajo?: ReactNode;
}) {
  return (
    <div style={{ flex: '1 1 auto', minHeight: 0, display: 'grid', placeItems: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SP.s }}>
        <Label size={10}>{encima}</Label>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, maxWidth: '100%' }}>
          <span
            style={{
              fontFamily: 'var(--twin-font-mono)',
              fontWeight: 800,
              // El techo lo pone «5 × 100» a lo ancho del lienzo: siete cifras
              // en mono a 82 px no caben en 402 pt y el número se partía en dos
              // líneas dejando el «kg» huérfano en la esquina.
              fontSize: 'clamp(44px, 10vh, 64px)',
              lineHeight: 1,
              whiteSpace: 'nowrap',
              fontVariantNumeric: 'tabular-nums',
              color: 'var(--twin-fg)',
            }}
          >
            {cifra}
          </span>
          {unidad && (
            <span
              style={{
                fontFamily: 'var(--twin-font-mono)',
                fontWeight: 700,
                fontSize: 22,
                color: 'var(--twin-muted)',
              }}
            >
              {unidad}
            </span>
          )}
        </div>
        <span
          style={{
            font: 'italic 800 24px/1.1 var(--twin-font-sans)',
            letterSpacing: '-0.01em',
            color: 'var(--twin-fg)',
          }}
        >
          {nombre}
        </span>
        {pastilla && <span className="tw-pill">{pastilla}</span>}
        {debajo}
      </div>
    </div>
  );
}

/**
 * El sujeto cuando no hay ninguna cifra: ni medida, ni carga. Pasa de verdad —
 * el `Sled Push` del circuito real llega con el nombre y nada más.
 *
 * Entonces el sujeto ES el nombre, y va en la voz de titular (cursiva), no en
 * la de instrumento: el mono es para lo que se compara columna a columna, y un
 * nombre no se compara con nada (§4).
 */
export function SujetoNombre({
  encima,
  nombre,
  debajo,
}: {
  encima: string;
  nombre: string;
  debajo?: ReactNode;
}) {
  return (
    <div style={{ flex: '1 1 auto', minHeight: 0, display: 'grid', placeItems: 'center' }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: SP.m,
          textAlign: 'center',
        }}
      >
        <Label size={10}>{encima}</Label>
        <span
          style={{
            font: 'italic 800 clamp(34px, 8vh, 52px)/1.05 var(--twin-font-sans)',
            letterSpacing: '-0.01em',
            color: 'var(--twin-fg)',
          }}
        >
          {nombre}
        </span>
        {debajo}
      </div>
    </div>
  );
}

/** «RIR 2» con su traducción, porque el número solo no dice qué hacer. */
export function pastillaRir(rir: number | null): string | undefined {
  if (rir == null) return undefined;
  return rir === 0 ? 'RIR 0 · hasta el fallo' : `RIR ${rir} · deja ${rir} dentro`;
}

// ---------------------------------------------------------------------------
// El pie — lo que da contexto a la serie
// ---------------------------------------------------------------------------

export function Pie({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        flex: '0 0 auto',
        display: 'flex',
        alignItems: 'center',
        gap: SP.m,
        padding: '11px 13px',
        borderRadius: RAD.m,
        background: 'var(--twin-surface)',
        border: '1px solid var(--twin-hairline)',
      }}
    >
      {children}
    </div>
  );
}

/** Lo que hiciste la última vez con este ejercicio — solo lo que registraste. */
export function UltimaVez({
  haceDias,
  linea,
  detalle,
}: {
  haceDias: number;
  linea: string;
  detalle: string;
}) {
  return (
    <Pie>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
        <Label size={9}>hace {haceDias} días</Label>
        <Mono size={15} weight={700}>
          {linea}
        </Mono>
      </div>
      <span
        style={{
          font: '500 11px/1.3 var(--twin-font-sans)',
          color: 'var(--twin-muted)',
          textAlign: 'right',
          maxWidth: 132,
        }}
      >
        {detalle}
      </span>
    </Pie>
  );
}

/**
 * Un hueco del plan, declarado con su salida (§6.2 bis). Se declara PORQUE hay
 * un acto concreto que lo llena; si no lo hubiera, se callaría.
 */
export function Hueco({ titulo, texto, accion }: { titulo: string; texto: string; accion: ReactNode }) {
  return (
    <div
      style={{
        flex: '0 0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: SP.s,
        padding: SP.m,
        borderRadius: RAD.m,
        background: 'var(--twin-surface)',
        border: '1px dashed var(--twin-hairline-strong)',
      }}
    >
      <Label size={9}>{titulo}</Label>
      <span style={{ font: '500 13px/1.35 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{texto}</span>
      {accion}
    </div>
  );
}

/** La serie que acabas de cerrar, sellada. */
export function Sello({ titulo, linea, cola }: { titulo: string; linea: string; cola?: string }) {
  return (
    <Pie>
      <span style={{ color: 'var(--twin-ok)', display: 'inline-flex' }}>
        <IconCheckCircle size={16} />
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
        <Label size={9}>{titulo}</Label>
        <Mono size={14} weight={700}>
          {linea}
        </Mono>
      </div>
      {cola && (
        <span style={{ font: '500 11px var(--twin-font-sans)', color: 'var(--twin-muted)' }}>{cola}</span>
      )}
    </Pie>
  );
}

/**
 * Lo que pone el plan para este ejercicio, entero y en una línea. La dosis sale
 * del canónico (`dosisSeries`, `4×5`) y no se recompone aquí; cuando falta, se
 * dice que falta en vez de rellenarla.
 */
export function TiraPlan({ p }: { p: Prescripcion }) {
  const partes: string[] = [];
  if (p.dosisSeries) partes.push(p.dosisSeries);
  else if (p.series > 1) partes.push(`${p.series} series`);
  if (p.cargaKg != null) partes.push(kg(p.cargaKg));
  if (p.descansoS != null) partes.push(`descanso ${reloj(p.descansoS)}`);
  if (partes.length === 0) return null;

  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 6, flex: '0 0 auto' }}>
      <Mono size={12} color="var(--twin-muted)">
        {partes.join('  ·  ')}
      </Mono>
    </div>
  );
}
