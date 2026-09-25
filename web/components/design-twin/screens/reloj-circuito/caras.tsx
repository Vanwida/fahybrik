'use client';

// LAS CARAS DEL CIRCUITO (P10) — una por lo que haces, con las piezas del kit.
//
//   CaraCarrera   el tramo de carrera: LA MISMA lámina de correr
//                 (`laminaDelPaso`: el objetivo del coach manda) con la posición
//                 «Ronda 2/5 · Run 1000 m» y el crono total bajo el contexto.
//   CaraEstacion  nombre, dosis y carga. Si algo la mide (el PM5), el número
//                 grande es lo que falta; si nada la mide, el crono de la
//                 estación con «lo dices tú».
//   CaraRoxzone   «Roxzone · entras a Wall Balls» con su crono; la de salida
//                 sigue sola al volver a correr.
//   CaraAmrap     el AMRAP dentro del chipper: lo que falta de la ventana y las
//                 reps con la corona.
//
// Todas llevan el total en el mismo sitio y el pulso en la fila de abajo.

import type { WheelEvent as ReactWheelEvent } from 'react';
import { useRef } from 'react';
import {
  ANCHO_PIE,
  BandaObjetivo,
  C,
  Columna,
  ContextoLinea,
  Heroe,
  Instruccion,
  Linea,
  Nota,
  BotonAccion,
  altoHeroe,
  esCarrera,
  fmtObjetivo,
  fmtReloj,
  fmtRitmo,
  heroeDelPaso,
  laminaDelPaso,
  lineaPulso,
  principal,
  usePrimaria,
  useReloj,
  type FILA,
  type HeroeVista,
  type Lecturas,
  type Paso,
  type PasoBase,
  type ZonasCoach,
} from '../../kit-reloj';
import { sentidoRoxzone, type Circuito } from './planes';
import { Centro, FilaReps, Titulo, lineaTotal, pistaCerrar, pistaDeclarar } from './piezas';
import { dosisCompleta, dosisDe, estacionMedida, posicionDe } from './texto';

type Fila = keyof typeof FILA;

interface Comun {
  paso: Paso;
  lecturas: Lecturas;
  zonas: ZonasCoach | null;
  c: Circuito;
  /** El crono total; `null` en el calentamiento (aún no puntúa). */
  total: number | null;
}

/** El total, bajo el contexto: la puntuación nunca se va de la pantalla (hoy se va en los tramos). */
function Total({ total, c }: { total: number | null; c: Circuito }) {
  return total != null ? <Linea linea={lineaTotal(total, c.cap)} cuerpo={22} /> : null;
}

/** El botón de cerrar en un reloj sin doble toque ni botón Acción (≥ 44 pt, acotado). */
function BotonCerrar({ etiqueta }: { etiqueta: string }) {
  const primaria = usePrimaria();
  return (
    <div style={{ width: '100%', padding: '0 8px', boxSizing: 'border-box' }}>
      <BotonAccion etiqueta={etiqueta} onPulsa={primaria ?? (() => undefined)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// El tramo de carrera
// ---------------------------------------------------------------------------

/**
 * La lámina de correr tal cual (P10): la decide `laminaDelPaso`. Solo cambian
 * el contexto (la posición en el circuito) y la línea del total. Si el
 * objetivo es un RPE («RPE 8 · ritmo de carrera»), el ritmo ACTUAL va debajo:
 * la palabra del coach habla de ritmo y sin él no se puede cumplir.
 */
export function CaraCarrera({ paso, lecturas, zonas, c, total }: Comun) {
  const l = laminaDelPaso(paso, lecturas, zonas);
  const ritmo = l.instruccion && !l.segundo && esCarrera(paso) ? { valor: fmtRitmo(lecturas.ritmo), unidad: '/km' } : null;
  const filas: Fila[] = ['contexto'];
  if (l.nota) filas.push('nota');
  if (total != null) filas.push('tercero');
  if (l.banda) filas.push('banda');
  if (l.instruccion) filas.push('instruccion');
  if (l.segundo) filas.push('segundo');
  if (ritmo) filas.push('tercero');
  if (l.tercero) filas.push('tercero');
  return (
    <Columna>
      <ContextoLinea partes={posicionDe(paso, c)} />
      {l.nota ? <Nota>{l.nota}</Nota> : null}
      <Total total={total} c={c} />
      <Centro>
        <Heroe heroe={l.heroe} altoMax={altoHeroe(filas)} />
      </Centro>
      {l.banda ? <BandaObjetivo banda={l.banda} /> : null}
      {l.instruccion ? <Instruccion texto={l.instruccion} /> : null}
      {l.segundo ? <Linea linea={l.segundo} cuerpo={30} ancho={l.tercero ? undefined : ANCHO_PIE} /> : null}
      {ritmo ? <Linea linea={ritmo} cuerpo={22} /> : null}
      {l.tercero ? <Linea linea={l.tercero} cuerpo={22} ancho={ANCHO_PIE} /> : null}
    </Columna>
  );
}

// ---------------------------------------------------------------------------
// La estación
// ---------------------------------------------------------------------------

/**
 * LA ESTACIÓN. Medida (PM5): «SkiErg · RPE 8,5», lo que falta con «quedan ·
 * PM5», el /500 actual; se cierra sola al llegar. Declarada: «Sled Push» /
 * «50 m · 152 kg», el crono de la estación con «lo dices tú · doble toque».
 */
export function CaraEstacion({ paso, lecturas, zonas, c, total }: Comun) {
  const { modelo } = useReloj();
  const medida = estacionMedida(paso);
  const o = principal(paso);
  const sinGesto = modelo === 'sin-gesto' && !medida;
  const dosis = dosisDe(paso);
  // Sin gesto, el botón ocupa una fila: la dosis sube al título.
  const titulo = medida && o ? `${paso.nombre} · ${fmtObjetivo(o)}` : sinGesto && dosis.length ? `${paso.nombre} · ${dosis.join(' · ')}` : (paso.nombre ?? '');
  const conDosis = !medida && !sinGesto && dosis.length > 0;

  let heroe: HeroeVista;
  if (medida) {
    const h = heroeDelPaso(paso, lecturas, zonas);
    heroe = h.clase === 'falta' ? { ...h, etiqueta: paso.medida.mide === 'ergo' ? 'quedan · PM5' : 'quedan' } : h;
  } else {
    // Sin gesto, «Estación hecha» ya dice que la cierras tú: el héroe va sin etiqueta y gana alto.
    heroe = { clase: 'crono', texto: fmtReloj(lecturas.t), etiqueta: sinGesto ? undefined : pistaDeclarar(modelo) };
  }
  const split = paso.medida.mide === 'ergo' ? { valor: fmtRitmo(lecturas.ritmo != null ? lecturas.ritmo / 2 : null), unidad: '/500' } : null;
  const pulso = lineaPulso(paso, lecturas, zonas);

  const filas: Fila[] = ['contexto', 'instruccion'];
  if (conDosis) filas.push('contexto');
  if (total != null) filas.push('tercero');
  if (split) filas.push('tercero');
  if (sinGesto) filas.push('boton');
  filas.push('tercero');
  return (
    <Columna>
      <ContextoLinea partes={posicionDe(paso, c)} />
      <Titulo texto={titulo} />
      {conDosis ? <ContextoLinea partes={dosis} tono={C.tinta2} /> : null}
      <Total total={total} c={c} />
      <Centro>
        <Heroe heroe={heroe} altoMax={altoHeroe(filas)} />
      </Centro>
      {split ? <Linea linea={split} cuerpo={22} /> : null}
      {/* El botón encima del pulso: la última fila es la más estrecha y el pulso no se va nunca (P3). */}
      {sinGesto ? <BotonCerrar etiqueta="Estación hecha" /> : null}
      <Linea linea={pulso} cuerpo={22} ancho={ANCHO_PIE} />
    </Columna>
  );
}

// ---------------------------------------------------------------------------
// La Roxzone
// ---------------------------------------------------------------------------

/**
 * LA ROXZONE, como paso propio (si el coach la activa). Entrada: a qué
 * estación vas, con su dosis y su carga; la cierras al empezar la estación.
 * Salida: a qué tramo sales; se cierra sola cuando la muñeca ve que corres.
 */
export function CaraRoxzone({ paso, lecturas, zonas, c, total }: Comun) {
  const { modelo } = useReloj();
  const sig: PasoBase | null = paso.siguiente;
  const entrada = sentidoRoxzone(paso) === 'entrada';
  const sinGesto = modelo === 'sin-gesto' && entrada;
  const r = sig?.posicion?.ronda;

  const contexto = entrada && sig ? ['Roxzone', ...posicionDe(sig, c)] : ['Roxzone', 'salida'];
  const titulo = !sig ? '' : entrada ? (sig.nombre ?? '') : c.formato === 'hyrox' && r ? `Run ${r.n}/${r.de}` : 'Run';
  // En la Roxzone el PM5 aún no cuenta: la dosis se dice entera.
  // Sin gesto la fila del botón se come la de la dosis (la dosis también la dice la voz).
  const dosis = sig && !sinGesto ? dosisCompleta(sig) : [];
  const pista = entrada ? pistaCerrar(modelo, 'empiezo') : 'sigue sola al correr';
  const heroe: HeroeVista = { clase: 'crono', texto: fmtReloj(lecturas.t), etiqueta: sinGesto ? undefined : pista };

  const filas: Fila[] = ['contexto', 'instruccion'];
  if (dosis.length) filas.push('contexto');
  if (total != null) filas.push('tercero');
  if (sinGesto) filas.push('boton');
  filas.push('tercero');
  return (
    <Columna>
      <ContextoLinea partes={contexto} />
      <Titulo texto={titulo} prefijo={entrada ? 'entras a' : 'sales a'} />
      {dosis.length ? <ContextoLinea partes={dosis} tono={C.tinta2} /> : null}
      <Total total={total} c={c} />
      <Centro>
        <Heroe heroe={heroe} altoMax={altoHeroe(filas)} />
      </Centro>
      {sinGesto ? <BotonCerrar etiqueta="Empiezo" /> : null}
      <Linea linea={lineaPulso(paso, lecturas, zonas)} cuerpo={22} ancho={ANCHO_PIE} />
    </Columna>
  );
}

// ---------------------------------------------------------------------------
// El AMRAP dentro del chipper
// ---------------------------------------------------------------------------

/**
 * EL AMRAP (506): la tarea en la muñeca, lo que falta de la ventana y las reps
 * que declaras con la corona. En el doble la rueda del ratón sobre la esfera
 * gira la corona; la corona del bisel sigue pasando páginas (el kit aún no deja
 * que una cara la capture — «Para el kit»).
 */
export function CaraAmrap({ paso, lecturas, zonas, c, total, reps, onCorona }: Comun & { reps: number; onCorona: (d: 1 | -1) => void }) {
  const rueda = useRef({ acumulado: 0, ultimo: 0 });
  const heroe = heroeDelPaso(paso, lecturas, zonas);
  const filas: Fila[] = ['contexto', 'instruccion', 'tercero', 'tercero'];
  if (total != null) filas.push('tercero');
  const onWheel = (e: ReactWheelEvent) => {
    e.stopPropagation();
    const w = rueda.current;
    const ahora = Date.now();
    w.acumulado += e.deltaY;
    if (Math.abs(w.acumulado) >= 30 && ahora - w.ultimo > 90) {
      onCorona(w.acumulado > 0 ? 1 : -1);
      w.acumulado = 0;
      w.ultimo = ahora;
    }
  };
  return (
    <div onWheel={onWheel} style={{ position: 'absolute', inset: 0 }}>
      <Columna>
        <ContextoLinea partes={posicionDe(paso, c)} />
        <Titulo texto={paso.nombre ?? ''} />
        <Total total={total} c={c} />
        <Centro>
          <Heroe heroe={heroe} altoMax={altoHeroe(filas)} />
        </Centro>
        <FilaReps reps={reps} />
        <Linea linea={lineaPulso(paso, lecturas, zonas)} cuerpo={22} ancho={ANCHO_PIE} />
      </Columna>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Qué cara lleva cada paso
// ---------------------------------------------------------------------------

export function caraDelPaso(p: Comun & { reps: number; onCorona: (d: 1 | -1) => void }) {
  const { paso } = p;
  if (paso.clase === 'estacion') return <CaraEstacion {...p} />;
  if (paso.clase === 'roxzone') return <CaraRoxzone {...p} />;
  if (paso.clase === 'amrap') return <CaraAmrap {...p} />;
  return <CaraCarrera {...p} />;
}

