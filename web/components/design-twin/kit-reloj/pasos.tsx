'use client';

// LAS CARAS DEL PASO — una por lo que haces (§5), compuestas con las piezas.
//
//   PasoCorrer   el paso de correr: contexto, héroe según el objetivo (P3),
//                banda con su marca, lo que falta, la otra métrica.
//   Recupera     monocromo: la cuenta atrás (o los metros), «Luego · …», el
//                pulso bajando y «doble toque · empezar ya».
//   Descanso     la fase común de TODAS las familias (P8): cuenta atrás,
//                «Viene: …», +30 s, Empezar ya, preaviso a 10 s, 3-2-1, GO.
//   TresDosUno   a pantalla completa antes de un paso de trabajo.
//   AvisoVuelta  el km recién hecho, unos segundos sobre la lámina.
//
// Todas llenan su área con la misma columna (`Columna`): contexto arriba, el
// héroe en el centro óptico, los apoyos abajo. El alto del héroe sale de las
// filas presentes (`altoHeroe`), así que ninguna cara escribe un tamaño.

import type { CSSProperties, ReactNode } from 'react';
import { heroeDelPaso, laminaDelPaso, lineaPulso } from './lamina';
import { NOMBRE_CLASE_DEFECTO, type Lecturas, type Paso, type PasoBase, type ZonasCoach } from './paso';
import { contextoDe, fmtObjetivo, principal, textoPasoCorto } from './reglas';
import { BandaObjetivo } from './banda';
import {
  BotonAccion,
  ContextoLinea,
  Heroe,
  Instruccion,
  Linea,
  Nota,
  PistaAccion,
  lineasDeNota,
  useFilaAccion,
  usePrimaria,
} from './piezas';
import { ANCHO_PIE, C, FILA, HUECO, T, altoHeroe } from './tokens';

type NombreFila = keyof typeof FILA;

/** La columna de toda cara: safe areas del reloj, centrado, sin scroll. */
export function Columna({ children, estilo }: { children: ReactNode; estilo?: CSSProperties }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        padding: 'var(--twin-safe-top) calc(var(--twin-safe-right) + 2px) var(--twin-safe-bottom) calc(var(--twin-safe-left) + 2px)',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: HUECO,
        color: C.tinta,
        ...estilo,
      }}
    >
      {children}
    </div>
  );
}

/** El hueco elástico donde se centra el héroe. */
function Centro({ children }: { children: ReactNode }) {
  return (
    <div style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// El paso de correr
// ---------------------------------------------------------------------------

/**
 * EL PASO DE CORRER (calle, cinta, pista; rodaje, tirada, tempo, series,
 * progresivo, strides…). La decisión es de `laminaDelPaso`; esto la pinta.
 */
export function PasoCorrer({ paso, lecturas, zonas }: { paso: PasoBase; lecturas: Lecturas; zonas: ZonasCoach | null }) {
  const l = laminaDelPaso(paso, lecturas, zonas);
  // La nota va ARRIBA, bajo el contexto: abajo las esquinas del reloj dejan
  // ~150 pt y una nota de honestidad no puede quedarse a medias.
  const filas: NombreFila[] = ['contexto'];
  if (l.nota) filas.push(lineasDeNota(l.nota) === 2 ? 'nota2' : 'nota');
  if (l.banda) filas.push('banda');
  if (l.instruccion) filas.push('instruccion');
  if (l.segundo) filas.push('segundo');
  if (l.tercero) filas.push('tercero');
  return (
    <Columna>
      <ContextoLinea partes={l.contexto} />
      {l.nota ? <Nota>{l.nota}</Nota> : null}
      <Centro>
        <Heroe heroe={l.heroe} altoMax={altoHeroe(filas)} />
      </Centro>
      {l.banda ? <BandaObjetivo banda={l.banda} /> : null}
      {l.instruccion ? <Instruccion texto={l.instruccion} /> : null}
      {l.segundo ? <Linea linea={l.segundo} cuerpo={30} ancho={l.tercero ? undefined : ANCHO_PIE} /> : null}
      {l.tercero ? <Linea linea={l.tercero} cuerpo={22} ancho={ANCHO_PIE} /> : null}
    </Columna>
  );
}

// ---------------------------------------------------------------------------
// Recupera
// ---------------------------------------------------------------------------

/** «Luego · 1000 m a 3:45–3:55» — lo que viene, con su objetivo. */
export function LuegoLinea({ prefijo, siguiente }: { prefijo: string; siguiente: PasoBase }) {
  return (
    <Nota tono={C.tinta} prefijo={prefijo}>
      {textoViene(siguiente)}
    </Nota>
  );
}

/**
 * Lo que viene, en corto. Si abre una tanda o una ronda nueva, lo dice con su
 * tamaño: «Tanda 3/3 · 6 × 1′»; si no, el paso: «1000 m a 3:45–3:55».
 */
export function textoViene(p: PasoBase): string {
  const pos = p.posicion;
  const corto = textoPasoCorto(p);
  if (pos?.tanda && pos.serie?.n === 1) return `Tanda ${pos.tanda.n}/${pos.tanda.de} · ${pos.serie.de} × ${corto}`;
  if (pos?.ronda && (pos.estacion?.n ?? 1) === 1) return `Ronda ${pos.ronda.n}/${pos.ronda.de} · ${corto}`;
  // Sin objetivo, lo prescrito solo dice poco («1′»): se dice cuál es.
  if (pos?.serie && !principal(p)) return `${NOMBRE_CLASE_DEFECTO[p.clase]} ${pos.serie.n}/${pos.serie.de} · ${corto}`;
  return corto;
}

/**
 * RECUPERA — monocromo, sin tinte: aquí no se juzga nada (§4: ningún aviso
 * fuera de objetivo en recuperación). Lo que falta manda (lo de FH-30, que se
 * queda aquí), y la única decisión del momento se anuncia.
 */
export function Recupera({
  paso,
  lecturas,
  zonas,
  onEmpezarYa,
}: {
  paso: Paso;
  lecturas: Lecturas;
  zonas: ZonasCoach | null;
  /** Sin él, la acción de la carcasa (con su deshacer). */
  onEmpezarYa?: () => void;
}) {
  const filaAccion = useFilaAccion();
  const heroe = { ...heroeDelPaso(paso, lecturas, zonas), etiqueta: undefined };
  const l = laminaDelPaso(paso, lecturas, zonas);
  // Monocromo (P6): el pulso sin la marca de color de su zona.
  const pulso = l.tercero ? { ...l.tercero, zona: undefined } : null;
  const filas: NombreFila[] = ['contexto', 'tercero', filaAccion];
  if (paso.siguiente) filas.push('nota');
  // La pista va encima del pulso: la última fila es la más estrecha (esquinas)
  // y «doble toque · empezar ya» no cabe allí entera.
  return (
    <Columna>
      <ContextoLinea partes={contextoDe(paso)} />
      <Centro>
        <Heroe heroe={heroe} altoMax={altoHeroe(filas)} />
      </Centro>
      {paso.siguiente ? <LuegoLinea prefijo="Luego ·" siguiente={paso.siguiente} /> : null}
      <PistaAccion accion="empezar ya" onPulsa={onEmpezarYa} />
      {pulso ? <Linea linea={pulso} cuerpo={22} ancho={ANCHO_PIE} /> : null}
    </Columna>
  );
}

// ---------------------------------------------------------------------------
// Descanso común (P8)
// ---------------------------------------------------------------------------

/**
 * EL DESCANSO — la misma fase en fuerza, circuito y entre tandas. Cuenta
 * atrás, «Viene: …» con su objetivo, +30 s y Empezar ya. El preaviso a 10 s,
 * el 3-2-1 y el GO los pone la secuencia (eventos), no esta cara.
 */
export function Descanso({
  paso,
  lecturas,
  onMas30,
  onEmpezarYa,
}: {
  paso: Paso;
  lecturas: Lecturas;
  onMas30: () => void;
  /** Sin él, la acción de la carcasa (con su deshacer). */
  onEmpezarYa?: () => void;
}) {
  const primaria = usePrimaria();
  const empezar = onEmpezarYa ?? primaria ?? (() => undefined);
  const heroe = { ...heroeDelPaso(paso, lecturas, null), etiqueta: undefined };
  // El pulso bajando, monocromo: el descanso tampoco se tiñe (P6).
  const pulso = lecturas.ppm != null ? { ...lineaPulso(paso, lecturas, null), zona: undefined } : null;
  const filas: NombreFila[] = ['contexto', 'boton'];
  if (paso.siguiente) filas.push('nota');
  if (pulso) filas.push('tercero');
  return (
    <Columna>
      <ContextoLinea partes={contextoDe(paso)} />
      <Centro>
        <Heroe heroe={heroe} altoMax={altoHeroe(filas)} />
      </Centro>
      {pulso ? <Linea linea={pulso} cuerpo={22} /> : null}
      {paso.siguiente ? <LuegoLinea prefijo="Viene:" siguiente={paso.siguiente} /> : null}
      {/* Los extremos redondos de los botones caen en las esquinas del aro: la
          fila se mete 4 pt por lado y «+30 s» es corto para que «Empezar ya»
          quepa entero a 17 pt. */}
      <div style={{ display: 'flex', gap: 6, width: '100%', height: FILA.boton, alignItems: 'center', padding: '0 4px', boxSizing: 'border-box' }}>
        <BotonAccion etiqueta="+30 s" variante="superficie" onPulsa={onMas30} ancho={60} />
        <BotonAccion etiqueta="Empezar ya" onPulsa={empezar} ancho={114} />
      </div>
    </Columna>
  );
}

// ---------------------------------------------------------------------------
// 3-2-1 y GO
// ---------------------------------------------------------------------------

/**
 * LA CUENTA ATRÁS a pantalla completa antes de un paso de trabajo. Arriba, a
 * qué entras; en el centro, el número; debajo, contra qué. `n = 0` es el GO.
 */
export function TresDosUno({ n, paso }: { n: number; paso: PasoBase }) {
  // Debajo del contexto, solo lo que el contexto no dice: el movimiento («Wall
  // Balls») y contra qué entras («a 3:45–3:55»). Un rodaje «Rodaje · Z2 · 40′»
  // ya lo lleva todo arriba: el 3-2-1 gana la fila.
  const contexto = contextoDe(paso);
  const o = principal(paso);
  const obj = o ? fmtObjetivo(o) : null;
  const nombre = paso.nombre && !contexto.some((c) => c.includes(paso.nombre!)) ? paso.nombre : null;
  const texto = [nombre, obj && !contexto.includes(obj) ? `a ${obj}` : null].filter(Boolean).join(' · ') || null;
  const filas: NombreFila[] = texto ? ['contexto', 'instruccion'] : ['contexto'];
  return (
    <Columna estilo={{ background: C.fondo }}>
      <ContextoLinea partes={contexto} />
      {texto ? <Instruccion texto={texto} tono={C.tinta2} /> : null}
      <Centro>
        <Heroe heroe={{ clase: 'crono', texto: n > 0 ? String(n) : 'GO' }} altoMax={altoHeroe(filas)} />
      </Centro>
    </Columna>
  );
}

/** El km recién cerrado, sobre la lámina durante unos segundos. Sin háptico propio: ya vibró la vuelta. */
export function AvisoVuelta({ titulo, valor, pie }: { titulo: string; valor: string; pie: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 'calc(var(--twin-safe-left) + 4px)',
        right: 'calc(var(--twin-safe-right) + 4px)',
        top: 'calc(var(--twin-safe-top) + 26px)',
        borderRadius: 26,
        background: C.superficie2,
        padding: '10px 12px 12px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        boxShadow: '0 12px 30px rgba(0,0,0,0.6)',
        animation: 'reloj-entra 220ms ease-out',
      }}
    >
      <span style={{ fontSize: T.contexto.cuerpo, fontWeight: 600, color: C.tinta2 }}>{titulo}</span>
      <span style={{ fontSize: 56, fontWeight: T.heroe.peso, lineHeight: 0.9, fontVariantNumeric: 'tabular-nums' }}>
        {valor}
      </span>
      <span style={{ fontSize: T.nota.cuerpo, color: C.tinta2 }}>{pie}</span>
    </div>
  );
}
