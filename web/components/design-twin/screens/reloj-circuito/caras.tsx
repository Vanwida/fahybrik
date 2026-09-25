'use client';

// LAS CARAS DEL CIRCUITO (P10) — una por lo que haces, con las piezas del kit.
//
//   carrera       LA MISMA cara de correr del kit (`PasoCorrer`: el objetivo del
//                 coach manda) con la posición «Ronda 2/5 · Run 1000 m» y el
//                 crono total bajo el contexto.
//   CaraEstacion  nombre, dosis y carga. Si algo la mide (el PM5), el número
//                 grande es lo que falta; si nada la mide, el crono de la
//                 estación con «lo dices tú».
//   CaraRoxzone   «Roxzone · entras a Wall Balls» con su crono; la de salida
//                 sigue sola al volver a correr (el motor la cierra por detección).
//   CaraAmrap     el AMRAP dentro del chipper: lo que falta de la ventana y la
//                 tarea. Las reps se dicen en la campana (`CaraPuntuacion` del
//                 kit), no durante el AMRAP (Alex, 25-09).
//
// Todas llevan el total en el mismo sitio y el pulso en la fila de abajo.

import {
  ANCHO_PIE,
  C,
  Centro,
  CaraPuntuacion,
  Columna,
  ContextoLinea,
  Heroe,
  Linea,
  Nota,
  PasoCorrer,
  PistaAccion,
  Titulo,
  altoHeroe,
  fmtObjetivo,
  fmtReloj,
  fmtRitmo,
  heroeDelPaso,
  lineaPulso,
  lineaTotal,
  pistaCerrar,
  pistaDeclarar,
  principal,
  useReloj,
  type Dial,
  type FILA,
  type HeroeVista,
  type Lecturas,
  type Paso,
  type PasoBase,
  type ZonasCoach,
} from '../../kit-reloj';
import { esPuntuacion, type Circuito } from './planes';
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
  const split = paso.medida.mide === 'ergo' ? { valor: fmtRitmo(lecturas.split500), unidad: '/500' } : null;
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
      {sinGesto ? <PistaAccion accion="estación hecha" /> : null}
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
  const entrada = paso.roxzone === 'entrada';
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
      {sinGesto ? <PistaAccion accion="empiezo" /> : null}
      <Linea linea={lineaPulso(paso, lecturas, zonas)} cuerpo={22} ancho={ANCHO_PIE} />
    </Columna>
  );
}

// ---------------------------------------------------------------------------
// El AMRAP dentro del chipper
// ---------------------------------------------------------------------------

/**
 * EL AMRAP (506): la tarea en la muñeca y lo que falta de la ventana. Nada que
 * contar en vivo: las reps se dicen en la campana, con la corona.
 */
export function CaraAmrap({ paso, lecturas, zonas, c, total }: Comun) {
  const heroe = heroeDelPaso(paso, lecturas, zonas);
  const filas: Fila[] = ['contexto', 'instruccion', 'nota', 'tercero'];
  if (total != null) filas.push('tercero');
  return (
    <Columna>
      <ContextoLinea partes={posicionDe(paso, c)} />
      <Titulo texto={paso.nombre ?? ''} />
      <Total total={total} c={c} />
      <Centro>
        <Heroe heroe={heroe} altoMax={altoHeroe(filas)} />
      </Centro>
      <Nota>reps: al final, con la corona</Nota>
      <Linea linea={lineaPulso(paso, lecturas, zonas)} cuerpo={22} ancho={ANCHO_PIE} />
    </Columna>
  );
}

// ---------------------------------------------------------------------------
// Qué cara lleva cada paso
// ---------------------------------------------------------------------------

export function caraDelPaso(p: Comun & { dial: Dial | null }) {
  const { paso } = p;
  if (esPuntuacion(paso) && p.dial) return <CaraPuntuacion paso={paso} lecturas={p.lecturas} zonas={p.zonas} dial={p.dial} />;
  if (paso.clase === 'estacion') return <CaraEstacion {...p} />;
  if (paso.clase === 'roxzone') return <CaraRoxzone {...p} />;
  if (paso.clase === 'amrap') return <CaraAmrap {...p} />;
  // La carrera: la cara de correr del kit, con la posición y el total. Si el
  // objetivo es un RPE («RPE 8 · ritmo de carrera»), el ritmo ACTUAL va debajo:
  // la palabra del coach habla de ritmo y sin él no se puede cumplir.
  return (
    <PasoCorrer
      paso={paso}
      lecturas={p.lecturas}
      zonas={p.zonas}
      contexto={posicionDe(paso, p.c)}
      bajoContexto={p.total != null ? lineaTotal(p.total, p.c.cap) : null}
      ritmoConRpe
    />
  );
}
