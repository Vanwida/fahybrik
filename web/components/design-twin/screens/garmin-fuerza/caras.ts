// LAS CARAS DE FUERZA EN EL CÍRCULO — funciones PURAS: de lo que dice el paso
// (`textos.ts`) a una `Disposicion` sobre la rejilla del reloj Garmin.
//
//   disponerTrabajo          la serie (o la estación, o el ergo de una sesión de
//                            fuerza): el nombre PRIMERO, dónde estás, el héroe de
//                            `laminaDelPaso` (G2: aquí no se elige), la dosis con
//                            sus dos ejes en una o dos líneas y el pulso al pie.
//   disponerDescansoFuerza   el descanso común (P8) con lo que viene y lo anotado.
//   disponerAnotar           el descanso que anota: los datos de la serie como
//                            celdas, la enfocada en su marco naranja (es la acción
//                            del momento). Propuesto = gris y anillo; declarado =
//                            blanco y punto (el color no es el único aviso).
//   vistaColocate / vistaCuenta   el «colócate» antes de una isometría y el 3-2-1
//                            con el nombre y la carga que está en la barra: la
//                            misma cara de trabajo, otro héroe.
//
// El círculo manda: un nombre largo del coach («Isometría en puente de glúteo»)
// no cabe en la franja del contexto a 218; baja a dos líneas y el resto de la
// cara se aparta lo justo. Si el héroe no puede quedarse en 0,20 D, se cae antes
// la nota y luego la etiqueta: el número grande no se encoge (G2, G11).
//
// Qué NO hacer: elegir aquí el héroe (`laminaDelPaso`); truncar un nombre con «…»
// (un dato a medias no se pinta: se parte en dos líneas); un `fontSize`, un hex o
// un número suelto (`TG`, `AIRE`, `REJILLA`).

import {
  AIRE,
  REJILLA,
  TG,
  ajustarPartes,
  altoLinea,
  altoNota,
  anchoEn,
  caja,
  cajaEnFila,
  chica,
  colocar,
  cuerpoPx,
  cuerposHaciaElSuelo,
  disponerBanda,
  heroeEn,
  lineaDeDato,
  lineaDePartes,
  lineaDeTexto,
  lineasApoyo,
  lineasContexto,
  partirEnLineas,
  type Caja,
  type Disposicion,
  type LineaG,
  type Pieza,
  type PistaG,
} from '../../kit-garmin';
import {
  heroeDelPaso,
  laminaDelPaso,
  lineaPulso,
  type Lecturas,
  type LineaVista,
  type Paso,
  type PasoBase,
  type PasoFuerza,
  type PlanSesion,
  quienSerie,
  nombreCuenta,
  NOMBRE_CLASE_DEFECTO,
  esFuerza,
} from '../../kit-reloj';
import { conSlot } from '../reloj-fuerza/textos';
import { partesDosis, partesOtro, type VistaTrabajo } from './textos';

const ALTO_NOTA = altoLinea(TG.nota, 'nota');
const ALTO_CONTEXTO = altoLinea(TG.contexto, 'texto');

/** Hasta dónde llega un nombre en dos líneas (fracción de D): bajo él arranca lo demás. */
const NOMBRE_EN_DOS_HASTA = 0.31;

// ---------------------------------------------------------------------------
// El nombre, primero: una línea o dos
// ---------------------------------------------------------------------------

/**
 * El nombre del ejercicio. En su franja del contexto si cabe (baja de cuerpo
 * hasta el suelo antes de nada); si no, en dos líneas más abajo, donde la
 * cuerda del círculo ya deja pasar una palabra. `hasta` es dónde acaba (fracción de D).
 */
export function lineasNombre(nombre: string, D: number): { lineas: LineaG[]; hasta: number } {
  const una = cajaEnFila('contexto', ALTO_CONTEXTO);
  const a = ajustarPartes([nombre], 'texto', TG.contexto, D, Math.floor(una.ancho * D));
  const pieza = (texto: string, cuerpo: number): Pieza[] => [{ texto, cara: 'texto', cuerpo, tono: 'tinta' }];
  if (a.cabe) return { lineas: [colocar('nombre', pieza(a.texto, a.cuerpo), una, D)], hasta: REJILLA.contexto[1] };
  const abajo = caja(NOMBRE_EN_DOS_HASTA - ALTO_CONTEXTO, ALTO_CONTEXTO);
  const arriba = caja(abajo.y - ALTO_CONTEXTO, ALTO_CONTEXTO);
  for (const cuerpo of cuerposHaciaElSuelo(TG.contexto, D)) {
    const partido = partirEnLineas(nombre, 'texto', cuerpo, [Math.floor(arriba.ancho * D), Math.floor(abajo.ancho * D)]);
    if (partido) {
      return { lineas: [colocar('nombre', pieza(partido[0], cuerpo), arriba, D), colocar('nombre', pieza(partido[1], cuerpo), abajo, D)], hasta: NOMBRE_EN_DOS_HASTA };
    }
  }
  return { lineas: [colocar('nombre', pieza(a.texto, a.cuerpo), una, D, 'centro', false)], hasta: REJILLA.contexto[1] };
}

// ---------------------------------------------------------------------------
// La dosis: una línea si cabe, y si no, lo principal arriba y el resto debajo
// ---------------------------------------------------------------------------

/**
 * Reparte las partes de la dosis en las dos filas que tiene bajo el héroe. Una
 * sola línea, entera, si cabe sin bajar del cuerpo del contexto; si no, la
 * primera parte (qué haces y con qué carga) en la fila de la banda y las demás
 * en la siguiente, quitando por el final lo que no quepa.
 */
export function repartirDosis(partes: readonly string[], D: number): { arriba: string; abajo: string | null } {
  const filaA = cajaEnFila('banda', altoLinea(TG.tercero, 'texto'));
  const todo = partes.join(' · ');
  const minimo = cuerpoPx(TG.contexto, D);
  const cabeEnUna = cuerposHaciaElSuelo(TG.tercero, D).some((c) => c >= minimo && anchoEn('texto', todo, c) <= Math.floor(filaA.ancho * D));
  if (cabeEnUna || partes.length === 1) return { arriba: todo, abajo: null };
  const filaB = cajaEnFila('secundaria', altoLinea(TG.contexto, 'texto'));
  const resto = ajustarPartes(partes.slice(1), 'texto', TG.contexto, D, Math.floor(filaB.ancho * D));
  return { arriba: partes[0]!, abajo: resto.texto };
}

// ---------------------------------------------------------------------------
// La nota: lo que dice el coach, o lo que viene
// ---------------------------------------------------------------------------

/**
 * La nota apilada desde `y`: el primer candidato que cabe en UNA línea; si
 * ninguno, el primero en dos. Los candidatos van por orden de preferencia
 * («Coach · concéntrica explosiva», luego «concéntrica explosiva»).
 */
export function lineasNota(candidatos: readonly string[], y: number, D: number, tono: 'tinta' | 'tinta2' = 'tinta2'): LineaG[] {
  if (candidatos.length === 0) return [];
  const una = caja(y, ALTO_NOTA);
  const cuerpo = cuerpoPx(TG.nota, D);
  const cabeEnUna = candidatos.find((t) => anchoEn('nota', t, cuerpo) <= Math.floor(una.ancho * D));
  const texto = cabeEnUna ?? candidatos[0]!;
  return lineaDeTexto('nota', texto, TG.nota, D, { una, arriba: una, abajo: caja(y + altoNota, ALTO_NOTA) }, { tono });
}

// ---------------------------------------------------------------------------
// El paso de trabajo
// ---------------------------------------------------------------------------

/** De arriba abajo: nombre · etiqueta · nota · HÉROE · dosis (o banda) · pulso. */
export function disponerTrabajo(v: VistaTrabajo, D: number): Disposicion {
  const nombre = lineasNombre(v.nombre, D);
  const lineas: LineaG[] = [...nombre.lineas];
  let y = Math.max(REJILLA.heroe[0], nombre.hasta + AIRE.lineas);
  const heroeMin = altoLinea(TG.heroe.min, 'cifras');
  const cabe = (coste: number) => REJILLA.heroe[1] - y - coste >= heroeMin;

  // El héroe no se encoge: primero se cae la nota y, si aún no cabe, la etiqueta.
  // La etiqueta va primero (arriba la cuerda es corta) y la nota justo encima del héroe.
  const usaEtiqueta = v.etiqueta.length > 0 && cabe(altoNota);
  if (usaEtiqueta) {
    lineas.push(...lineaDePartes('etiqueta', v.etiqueta, TG.nota, caja(y, ALTO_NOTA), D, { cara: 'nota', tono: 'tinta2' }));
    y += altoNota;
  }
  const nota = lineasNota(v.nota, y, D);
  if (nota.length > 0 && cabe(nota.length * altoNota)) {
    lineas.push(...nota);
    y += nota.length * altoNota;
  }

  const h = v.lamina.heroe;
  const heroe = heroeEn(h.texto, h.unidad, y, REJILLA.heroe[1], D);

  let pista: PistaG | null = null;
  if (v.lamina.banda) {
    const b = disponerBanda(v.lamina.banda, D);
    lineas.push(b.linea);
    pista = b.pista;
    if (v.lamina.segundo) lineas.push(lineaDeDato('secundaria', v.lamina.segundo, TG.segundo, 'secundaria', D));
  } else if (v.dosis.length > 0) {
    const d = repartirDosis(v.dosis, D);
    lineas.push(...lineaDePartes('dosis', [d.arriba], TG.tercero, cajaEnFila('banda', altoLinea(TG.tercero, 'texto')), D));
    if (d.abajo) lineas.push(...lineaDePartes('dosis-2', [d.abajo], TG.contexto, cajaEnFila('secundaria', ALTO_CONTEXTO), D));
  }
  if (v.lamina.tercero) lineas.push(lineaDeDato('pie', v.lamina.tercero, TG.tercero, 'pie', D, v.pulsoMono));
  return { D, lineas, heroe, pista };
}

/** El «colócate» antes de una isometría: el nombre y la dosis de lo que viene, y la cuenta atrás. Monocromo. */
export function vistaColocate(paso: Paso, sig: PasoFuerza, l: Lecturas, arrastrada: number | null): VistaTrabajo {
  const h = heroeDelPaso(paso, l, null);
  return {
    nombre: conSlot(sig),
    etiqueta: ['Colócate', h.etiqueta ?? ''].filter(Boolean),
    nota: [],
    dosis: [quienSerie(sig), ...partesDosis(sig, arrastrada)],
    lamina: { heroe: h, banda: null, segundo: null, tercero: { ...lineaPulso(paso, l, null), zona: undefined } },
    pulsoMono: true,
  };
}

const LECTURAS_VACIAS: Lecturas = { t: 0, hecho: null, ritmo: null, ppm: null, gps: 'no-aplica' };

/** El 3-2-1 y el GO de un paso de trabajo: su nombre, su dosis (con la carga que está en la barra) y el número. */
export function vistaCuenta(n: number, sig: PasoBase, plan: PlanSesion, arrastrada: number | null): VistaTrabajo {
  const fuerza = esFuerza(sig);
  const lamina = laminaDelPaso(sig, LECTURAS_VACIAS, plan.zonas, plan.reglas);
  const serie = fuerza
    ? quienSerie(sig)
    : sig.posicion?.serie
      ? `${nombreCuenta(sig).nombre} ${sig.posicion.serie.n}/${sig.posicion.serie.de}`
      : NOMBRE_CLASE_DEFECTO[sig.clase];
  return {
    nombre: conSlot(sig) || NOMBRE_CLASE_DEFECTO[sig.clase],
    etiqueta: [serie],
    nota: [],
    dosis: fuerza ? partesDosis(sig, arrastrada) : partesOtro(sig, lamina),
    lamina: { heroe: { clase: 'crono', texto: n > 0 ? String(n) : 'GO' }, banda: null, segundo: null, tercero: null },
  };
}

// ---------------------------------------------------------------------------
// El descanso común, con lo que viene
// ---------------------------------------------------------------------------

/** Cuánto se come de la franja del héroe lo que va encima de él. */
const bajoDe = (lineas: LineaG[], D: number) => (lineas.length === 0 ? REJILLA.heroe[0] : Math.max(...lineas.map((l) => (l.y + l.alto) / D)) + AIRE.lineas);

/**
 * «Viene: …» en una o dos líneas, entero. Si el nombre largo y la dosis no
 * caben juntos, se dice el nombre solo: la dosis está en la serie, al llegar.
 */
export function lineasViene(que: string, dosis: string | null, D: number): LineaG[] {
  const candidatos = dosis ? [`${que} · ${dosis}`, que] : [que];
  for (const c of candidatos) {
    const ls = lineasApoyo('viene', 'Viene:', c, D);
    if (ls.every((l) => l.cabe)) return ls;
  }
  return lineasApoyo('viene', 'Viene:', que, D);
}

/** Lo anotado, dicho para el descanso ya cerrado: de más a menos largo (entra el primero que cabe en una línea). */
export interface ResumenDescanso {
  textos: string[];
  /** «sin confirmar» pide atención: va en tinta, no en tinta2. */
  atencion: boolean;
}

/**
 * El descanso: «Descanso», lo anotado (si hay) sobre la cuenta atrás de héroe,
 * «Viene: …» y el pulso (monocromo: aquí no se juzga nada). El resumen cede el
 * sitio antes que encoger el héroe (G2).
 */
export function disponerDescansoFuerza(p: Paso, l: Lecturas, D: number, viene: { que: string; dosis: string | null } | null, resumen: ResumenDescanso | null): Disposicion {
  const h = heroeDelPaso(p, l, null);
  const lineas: LineaG[] = [...lineasContexto(['Descanso'], D)];
  let y = Math.max(REJILLA.heroe[0], bajoDe(lineas, D));
  if (resumen) {
    const nota = lineasNota(resumen.textos, y, D, resumen.atencion ? 'tinta' : 'tinta2');
    if (REJILLA.heroe[1] - y - nota.length * altoNota >= altoLinea(TG.heroe.min, 'cifras')) {
      lineas.push(...nota);
      y += nota.length * altoNota;
    }
  }
  const heroe = heroeEn(h.texto, h.unidad, y, REJILLA.heroe[1], D);
  if (viene) lineas.push(...lineasViene(viene.que, viene.dosis, D));
  if (l.ppm != null) lineas.push(lineaDeDato('pie', { ...lineaPulso(p, l, null), zona: undefined }, TG.tercero, 'pie', D, true));
  return { D, lineas, heroe, pista: null };
}

// ---------------------------------------------------------------------------
// El descanso que anota
// ---------------------------------------------------------------------------

export type EstadoCampo = 'propuesto' | 'medido' | 'declarado';

export interface CampoVista {
  /** «reps», «kg», «RIR»: lo que es el dato. */
  etiqueta: string;
  /** «8», «127,5», «—» (nadie lo ha dicho ni el plan lo propone). */
  valor: string;
  estado: EstadoCampo;
}

export interface VistaAnotar {
  /** «1:24»: lo que queda de descanso. */
  cuenta: string;
  /** La serie que se anota: «A1 · Back Squat». */
  nombre: string;
  /** «Serie 2 · sin confirmar». */
  estado: string;
  /** Lo mismo sin la serie («sin confirmar»): si la ayuda de teclas no cabe entera con la primera, se cambia por esta. */
  estadoCorto: string;
  campos: CampoVista[];
  /** El campo enfocado; `null` mientras dura el deshacer (los botones aún no son de la anotación). */
  foco: number | null;
  /** «también en las series 2–4»: lo que la carga arrastra hacia las de detrás. */
  pista: string | null;
  pulso: LineaVista | null;
}

export interface CeldaAnotar {
  /** El centro de la celda, en px del reloj. */
  cx: number;
  /** Una disposición de dos líneas (valor y etiqueta) y, si está enfocada, su marco. */
  d: Disposicion;
  ancho: number;
  y: number;
  alto: number;
}

export interface DisposicionAnotar {
  base: Disposicion;
  celdas: CeldaAnotar[];
}

/** Las teclas de la anotación, dichas en una línea (solo con un campo enfocado). */
export const AYUDA_ANOTAR = ['▲▼ cambia', 'START ok'] as const;

const RELLENO_CELDA = 0.012;
const MAX_CELDA = 0.3;

function celdaDe(c: CampoVista, enfocada: boolean, cx: number, y: number, ancho: number, D: number): CeldaAnotar {
  const altoValor = altoLinea(TG.segundo, 'cifras');
  const alto = altoValor + ALTO_NOTA + 2 * RELLENO_CELDA;
  const propuesto = c.estado === 'propuesto';
  const util = ancho * D - AIRE.piezas * D;
  const cuerpo = cuerposHaciaElSuelo(TG.segundo, D).find((k) => anchoEn('cifras', c.valor, k) <= util) ?? cuerpoPx(TG.suelo, D);
  const valor = colocar('valor', [{ texto: c.valor, cara: 'cifras', cuerpo, tono: propuesto ? 'tinta2' : 'tinta' }], { y: y + RELLENO_CELDA, alto: altoValor, ancho }, D);
  const glifo: Pieza = { texto: '', cara: 'nota', cuerpo: cuerpoPx(TG.nota, D), tono: 'tinta2', glifo: propuesto ? 'pendiente' : 'hecho' };
  const etiqueta = colocar('etiqueta', [glifo, chica(c.etiqueta, D, 'tinta2', AIRE.unidad * D)], { y: y + RELLENO_CELDA + altoValor, alto: ALTO_NOTA, ancho }, D);
  const marco = enfocada ? { y: y * D, alto: alto * D, ancho: Math.floor(ancho * D) } : null;
  return { cx, d: { D, lineas: [valor, etiqueta], heroe: null, pista: null, marco }, ancho: ancho * D, y: y * D, alto: alto * D };
}

/**
 * EL DESCANSO QUE ANOTA. Arriba el nombre de la serie y lo que queda de
 * descanso; en medio, los datos de la serie (reps, carga, esfuerzo) como
 * celdas, la enfocada en su marco naranja; debajo, en qué punto está lo anotado
 * (o hasta dónde llega la carga), la ayuda de teclas y el pulso. El aire que
 * sobra entre el contenido y el pie se reparte entre sus bloques: nada queda
 * pegado arriba con un hueco al fondo.
 */
export function disponerAnotar(v: VistaAnotar, D: number): DisposicionAnotar {
  let ultimo: DisposicionAnotar | null = null;
  // La ayuda de teclas manda sobre el estado: se prueba con el estado entero, con el corto y, si aun así la ayuda no cabe entera (un nombre de dos líneas se come el círculo), sin él (los puntos y anillos ya lo dicen).
  for (const estado of ['entero', 'corto', 'sin'] as const) {
    const compacto = colocarAnotar(v, D, AIRE.lineas, estado);
    const hueco = Math.min(HUECO_MAX_ANOTAR, AIRE.lineas + Math.max(0, compacto.sobra) / 3);
    const holgado = colocarAnotar(v, D, hueco, estado);
    // Con más aire una línea de texto puede pasar a dos (o no caber): entonces, el compacto.
    const bien = holgado.d.base.lineas.every((l) => l.cabe) && holgado.d.base.lineas.length === compacto.d.base.lineas.length && holgado.sobra >= 0;
    ultimo = bien ? holgado.d : compacto.d;
    if (v.foco == null || ayudaCompleta(ultimo)) break;
  }
  return ultimo!;
}

/** ¿Se ven las teclas enteras («▲▼ cambia · START ok»)? */
function ayudaCompleta(d: DisposicionAnotar): boolean {
  const l = d.base.lineas.find((x) => x.rol === 'ayuda');
  return !!l && l.piezas.map((p) => p.texto).join('') === AYUDA_ANOTAR.join(' · ');
}

/** El aire máximo entre bloques (fracción de D): más, y la cara se descuelga. */
const HUECO_MAX_ANOTAR = 0.04;

function colocarAnotar(v: VistaAnotar, D: number, hueco: number, modo: 'entero' | 'corto' | 'sin'): { d: DisposicionAnotar; sobra: number } {
  const nombre = lineasNombre(v.nombre, D);
  const lineas: LineaG[] = [...nombre.lineas];
  let y = Math.max(REJILLA.heroe[0], nombre.hasta + AIRE.lineas);

  const cuerpo = cuerpoPx(TG.contexto, D);
  lineas.push(colocar('cuenta', [chica('Descanso', D), { texto: v.cuenta, cara: 'cifras', cuerpo, tono: 'tinta', antes: AIRE.piezas * D }], caja(y, ALTO_CONTEXTO), D));
  y += ALTO_CONTEXTO + hueco;

  const n = v.campos.length;
  const altoCelda = altoLinea(TG.segundo, 'cifras') + ALTO_NOTA + 2 * RELLENO_CELDA;
  const fila = caja(y, altoCelda);
  const ancho = Math.min(MAX_CELDA, (fila.ancho - AIRE.piezas * (n - 1)) / n);
  const celdas = v.campos.map((c, k) => celdaDe(c, v.foco === k, D / 2 + (k - (n - 1) / 2) * (ancho + AIRE.piezas) * D, y, ancho, D));
  y += altoCelda + hueco;

  // En qué punto está: la pista de la carga (si está enfocada) o el estado de la serie.
  if (modo !== 'sin') {
    const tono = v.pista ? 'tinta' : 'tinta2';
    const estado = lineaDeTexto('estado', v.pista ?? (modo === 'corto' ? v.estadoCorto : v.estado), TG.nota, D, { una: caja(y, ALTO_NOTA), arriba: caja(y, ALTO_NOTA), abajo: caja(y + altoNota, ALTO_NOTA) }, { tono });
    lineas.push(...estado);
    y += estado.length * altoNota + hueco / 2;
  }

  // La ayuda de teclas, solo si hay un campo enfocado y queda sitio antes del pie.
  if (v.foco != null && y + ALTO_NOTA <= REJILLA.pie[0] - AIRE.lineas) {
    lineas.push(...lineaDePartes('ayuda', [...AYUDA_ANOTAR], TG.nota, caja(y, ALTO_NOTA), D, { cara: 'nota', tono: 'tinta2' }));
    y += ALTO_NOTA;
  }
  if (v.pulso) lineas.push(lineaDeDato('pie', { ...v.pulso, zona: undefined }, TG.tercero, 'pie', D, true));
  return { d: { base: { D, lineas, heroe: null, pista: null }, celdas }, sobra: REJILLA.pie[0] - AIRE.lineas - y };
}

/** Caja de una celda en fracción de D (para medir el círculo en los tests). */
export function cajaDeCelda(c: CeldaAnotar, D: number): Caja {
  return caja(c.y / D, c.alto / D);
}
