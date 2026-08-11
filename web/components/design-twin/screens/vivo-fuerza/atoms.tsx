'use client';

// Los átomos de «vivo-fuerza».
//
// Lo que aquí NO se escribe (§10 del CONTRATO-UI): ni el tinte del lienzo, ni
// el numeral, ni el reparto del alto, ni la acción. Todo eso vive UNA vez en
// `kit-vivo.tsx` y esta carpeta lo consume. Antes de este lote esta familia
// tenía cuatro numerales distintos a mano para el mismo hueco — dos de ellos
// con `vh`, que mide la ventana del navegador y no el teléfono.
//
// NOTA para quien integre: `Cabecera` es el mismo cromo que `TopStrip` en
// `screens/entreno-vivo/piezas.tsx`. Están duplicados porque cada familia de
// esta tanda escribe solo en su carpeta; el §0 pide que suba a `kit.tsx` en el
// lote de integración, antes de que sean tres.

import type { ReactNode } from 'react';
import { IconCheckCircle, IconChevron, IconClose, Label, Mono, RAD, SP } from '../../kit';
import { EtiquetaSujeto, Numeral } from '../../kit-vivo';
import { reloj } from '../../datos-reales';
import { kg, serie, serieTexto, type Prescripcion, type SerieHecha } from './data';

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
  accion,
}: {
  bloque: string;
  ejercicio: string;
  indice: number;
  total: number;
  onSalir: () => void;
  /**
   * La ranura que el Swift tiene entre el título y el contador: ahí es donde
   * `ActiveWorkoutView` pone el botón de vídeo cuando el tramo lo trae. Vacía
   * por defecto, así que esta familia no cambia; la usa `vivo-clave`, que va
   * justo de lo que se puede pedir desde el cromo sin parar el cronómetro.
   */
  accion?: ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
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
      {accion}
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

export interface Peldano2 {
  cifra: string;
  unidad: string | null;
}

/** La serie repartida en los dos peldaños del numeral compartido (§10.2/§10.6). */
export interface DosisSerie {
  /** El que gobierna la pantalla. */
  sujeto: Peldano2;
  /** Lo segundo, cuando existe. */
  segundo: Peldano2 | null;
}

/**
 * La serie, como sujeto de la banda.
 *
 * **`5 × 100` es UNA cosa, y así se lee.** Es la prescripción que el atleta
 * tiene delante: ni «100 kg» con un «5 reps» colgando debajo (eso invierte la
 * jerarquía — en fuerza se leen las repeticiones y luego la carga) ni dos datos
 * sueltos que hay que recomponer de cabeza entre serie y serie.
 *
 * Hubo un intento de partirla en dos peldaños porque siete avances de la mono a
 * 125 pt miden 525 sobre un lienzo de 378 y se salían. Pero eso era un fallo del
 * numeral compartido, no de la fuerza: `Numeral` ya tiene presupuesto de ancho
 * (kit-vivo) y encoge la cifra larga lo justo para que quepa entera. El arreglo
 * fue a la raíz, no al caso.
 *
 * La degradación se conserva y es del modelo, no del layout: sin carga (peso
 * corporal) el sujeto son las repeticiones; sin repeticiones —el `Reverse Lunge`
 * real llega con 30 kg y sin ellas— el sujeto es la carga sola; sin ninguna de
 * las dos no hay cifra que inventar y manda el nombre (§7).
 */
export function dosisEnPeldanos(reps: number | null, cargaKg: number | null): DosisSerie | null {
  const completa = serie(reps, cargaKg);
  if (completa) return { sujeto: completa, segundo: null };
  const carga = serie(null, cargaKg);
  if (carga) return { sujeto: carga, segundo: null };
  const repeticiones = serie(reps, null);
  if (repeticiones) return { sujeto: repeticiones, segundo: null };
  return null;
}

/**
 * El nombre del ejercicio. Es un valor CATEGÓRICO: gana a su etiqueta por peso
 * y por un escalón de la tipografía de TEXTO, no monoespaciándose (§4). Va a la
 * misma voz que el nombre de la tarea en `Trabajo` (kit-vivo) para que fuerza y
 * EMOM digan «qué estás haciendo» con la misma letra.
 */
export function NombreEjercicio({ children }: { children: ReactNode }) {
  return (
    <span
      style={{ font: 'italic 800 20px/1.15 var(--twin-font-sans)', letterSpacing: '-0.01em', color: 'var(--twin-fg)' }}
    >
      {children}
    </span>
  );
}

/**
 * El sujeto de la banda (§10.3): etiqueta, cifra que gobierna, el segundo
 * peldaño, el nombre y lo que el coach pidió de intensidad.
 *
 * No lleva superficie ni reparte alto: de eso se encarga `BandaSujeto`. Antes
 * era un `flex: 1 1 auto` con su propio `place-items`, y por eso el sujeto caía
 * a una altura distinta en cada una de las cuatro vistas de esta familia.
 */
export function Sujeto({
  encima,
  dosis,
  nombre,
  pastilla,
  debajo,
}: {
  encima: string;
  dosis: DosisSerie;
  nombre: string;
  pastilla?: string;
  debajo?: ReactNode;
}) {
  return (
    <>
      <EtiquetaSujeto>{encima}</EtiquetaSujeto>
      <Numeral unidad={dosis.sujeto.unidad ?? undefined}>{dosis.sujeto.cifra}</Numeral>
      {dosis.segundo && (
        <Numeral escala="segundo" unidad={dosis.segundo.unidad ?? undefined}>
          {dosis.segundo.cifra}
        </Numeral>
      )}
      <NombreEjercicio>{nombre}</NombreEjercicio>
      {pastilla && <span className="tw-pill">{pastilla}</span>}
      {debajo}
    </>
  );
}

/**
 * El sujeto cuando no hay ninguna cifra: ni medida, ni carga. Pasa de verdad —
 * el `Sled Push` del circuito real llega con el nombre y nada más.
 *
 * Entonces el sujeto ES el nombre, y va en la voz de titular (cursiva), no en
 * la de instrumento: el mono es para lo que se compara columna a columna, y un
 * nombre no se compara con nada (§4). El tamaño sale de la escala de twin.css
 * (`t-display`), no de un clamp escrito aquí.
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
    <>
      <EtiquetaSujeto>{encima}</EtiquetaSujeto>
      <span className="t-display">{nombre}</span>
      {debajo}
    </>
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

/**
 * Lo que queda del descanso, como GEOMETRÍA: el número dice cuánto y la barra
 * dice cuánto de lo prescrito. Vive en la franja de contexto, que es la que no
 * desaparece nunca (§10.3).
 *
 * Sustituye al anillo que rodeaba la cuenta atrás: el numeral del §10.2 mide
 * ~300 pt de ancho y no cabe dentro de un anillo que quepa en la banda. Es la
 * TERCERA barra de drenaje de la tanda (las otras dos viven en `vivo-correr` y
 * en `vivo-emom`): su sitio es `kit-vivo`, y así se dice en el informe (§0).
 */
export function BarraDescanso({ fraccion, tono }: { fraccion: number; tono: string }) {
  return (
    <div
      aria-hidden
      style={{
        width: '100%',
        height: 10,
        borderRadius: 5,
        background: 'var(--twin-surface-sunken)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${Math.max(0, Math.min(1, fraccion)) * 100}%`,
          background: tono,
          transition: 'width 900ms linear, background-color 900ms ease-out',
        }}
      />
    </div>
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
    <div style={{ display: 'flex', justifyContent: 'center', gap: 6, width: '100%' }}>
      <Mono size={12} color="var(--twin-muted)">
        {partes.join('  ·  ')}
      </Mono>
    </div>
  );
}
