// LO COMÚN DE «GARMIN · AL TERMINAR» — funciones PURAS que comparten todas las
// caras de después de la sesión (sesión completada, RPE, resúmenes, envío).
//
// El kit da las líneas colocadas sobre la cuerda del círculo (`colocar`,
// `caja`) y el ajuste de una línea por partes (`ajustarPartes`).
// Las caras de después necesitan tres cosas más que el kit aún no tiene y que
// aquí se resuelven UNA vez:
//
//   · `apilarTexto`   un texto que se parte en tantas líneas como haga falta,
//                     cada una con SU cuerda (en un círculo, dos líneas no
//                     miden igual). Corta antes por « · » que por una palabra.
//   · `Tok` y `lineaDeTokens`   una línea de dato hecha de números (bitmap),
//                     unidades y separadores: «4 × 8 · máx 131 kg».
//   · `DisposicionFin`   la `Disposicion` del kit más lo que ella no dibuja:
//                     las barras de las zonas de pulso y el glifo del envío.
//
// PIEZAS GENÉRICAS: las usarán también «Garmin · circuito», «· fuerza» y
// «· WOD» cuando pinten un resumen; el arquitecto las sube a `kit-garmin/`
// (tres usos = extraer). Aquí no hay método del coach: ningún umbral, ninguna
// palabra de clase.
//
// Qué NO hacer: colocar una línea sin pasar por la cuerda de su altura; poner
// un número suelto en una pieza (todo sale de `TG`, `AIRE`, `REJILLA`, `PISTA`).

import {
  AIRE,
  REJILLA,
  TG,
  altoLinea,
  anchoEn,
  caja,
  chica,
  colocar,
  cuerpoPx,
  cuerpoQueCabe,
  enSubconjunto,
  type Caja,
  type Cara,
  type Disposicion,
  type Fila,
  type LineaG,
  type Pieza,
  type Tono,
  cajaEnFila,
} from '../../kit-garmin';

/** El alto de una línea al suelo (nota). */
export const ALTO_NOTA = altoLinea(TG.nota, 'nota');

/** Donde vive el cuerpo de una página: bajo el contexto y por encima del pie (fracción de D). */
export const CUERPO = [REJILLA.heroe[0], REJILLA.pie[0]] as const;

// ---------------------------------------------------------------------------
// Lo que la `Disposicion` del kit no dibuja
// ---------------------------------------------------------------------------

/** Una barra (zona de pulso): px del reloj, con su color SIN pintar (en MIP lo pasa por `aMip` el pintor). */
export interface BarraG {
  x: number;
  y: number;
  ancho: number;
  alto: number;
  /** Cuánto de la barra está llena, 0–1: el resto es el carril. */
  llena: number;
  color: string;
}

/** Los glifos del estado de envío: por su FORMA se distinguen, nunca por un color (P6). */
export type GlifoEnvio = 'reloj' | 'nube' | 'visto' | 'reintento' | 'aviso';

export interface GlifoG {
  glifo: GlifoEnvio;
  /** Centro vertical y lado, px. */
  y: number;
  talla: number;
}

/** La disposición del kit y, si la cara los lleva, sus barras y su glifo. */
export interface DisposicionFin extends Disposicion {
  barras?: BarraG[];
  glifo?: GlifoG | null;
}

// ---------------------------------------------------------------------------
// Texto apilado
// ---------------------------------------------------------------------------

export interface OpcionesApilar {
  cara?: Cara;
  tono?: Tono;
  aire?: number;
}

/**
 * Un texto por partes, apilado desde `y` (fracción de D): en una línea si cabe
 * (cada línea con la cuerda de SU altura); si no, parte a parte —antes se
 * corta entre partes («Parcial · 4 de 6 series» → «Parcial» / «4 de 6
 * series») que por una palabra—, y una parte que sola no cabe, por palabras.
 * `y1` es donde acaba el bloque (con su aire), para seguir apilando.
 */
export function apilarTexto(rol: string, partes: string | readonly string[], y: number, frac: number, D: number, o: OpcionesApilar = {}): { lineas: LineaG[]; y1: number } {
  const cara = o.cara ?? 'nota';
  const cuerpo = cuerpoPx(frac, D);
  const alto = altoLinea(frac, cara);
  const aire = o.aire ?? AIRE.lineas;
  const tono = o.tono ?? 'tinta';
  const lineas: LineaG[] = [];
  let yk = y;
  const cabeEn = (texto: string) => anchoEn(cara, texto, cuerpo) <= Math.floor(caja(yk, alto).ancho * D);
  const cerrar = (texto: string) => {
    lineas.push(colocar(rol, [{ texto, cara, cuerpo, tono }], caja(yk, alto), D));
    yk += alto + aire;
  };
  /** El corte de una parte en dos líneas que menos aprieta la más apretada (cada una con la cuerda de la suya): «Terminaste en» / «la serie 5 de 6», no «…en la serie 5» / «de 6». */
  const partirEnDos = (palabras: string[]): [string, string] | null => {
    const c1 = Math.floor(caja(yk, alto).ancho * D);
    const c2 = Math.floor(caja(yk + alto + aire, alto).ancho * D);
    let mejor: { corte: [string, string]; aprieto: number } | null = null;
    for (let i = 1; i < palabras.length; i++) {
      const a = palabras.slice(0, i).join(' ');
      const b = palabras.slice(i).join(' ');
      const aprieto = Math.max(anchoEn(cara, a, cuerpo) / c1, anchoEn(cara, b, cuerpo) / c2);
      if (aprieto <= 1 && (!mejor || aprieto < mejor.aprieto)) mejor = { corte: [a, b], aprieto };
    }
    return mejor?.corte ?? null;
  };
  let actual = '';
  for (const parte of (typeof partes === 'string' ? [partes] : [...partes]).filter(Boolean)) {
    const junto = actual ? `${actual} · ${parte}` : parte;
    if (cabeEn(junto)) {
      actual = junto;
      continue;
    }
    if (actual) cerrar(actual);
    actual = '';
    // La parte, sola en su línea; si tampoco cabe, en dos líneas equilibradas y, si ni así, palabra a palabra.
    if (cabeEn(parte)) {
      actual = parte;
      continue;
    }
    const dos = partirEnDos(parte.split(' '));
    if (dos) {
      cerrar(dos[0]);
      actual = dos[1];
      continue;
    }
    for (const palabra of parte.split(' ')) {
      const prueba = actual ? `${actual} ${palabra}` : palabra;
      if (!actual || cabeEn(prueba)) actual = prueba;
      else {
        cerrar(actual);
        actual = palabra;
      }
    }
  }
  if (actual) cerrar(actual);
  return { lineas, y1: yk };
}

/** Un bloque de texto de una cara, por prioridad: `null` = no hay (no se pinta). */
export interface BloqueTexto {
  rol: string;
  texto: string | readonly string[] | null;
  tono?: Tono;
}

/**
 * Apila bloques de texto desde `y` POR PRIORIDAD (el primero manda) mientras
 * quepan ENTEROS: cada línea dentro de la cuerda de su altura y todo antes de
 * `hasta` (por defecto, el fondo del pie). Un bloque que no cabe no se pinta a
 * medias: se pierde el siguiente menos importante. Una línea corta cabe más
 * abajo que una larga, así que no hay un tope fijo. Sirve a las caras que
 * dicen más de lo que el círculo da de sí en el peor caso.
 */
export function apilarBloques(bloques: readonly BloqueTexto[], y: number, frac: number, D: number, hasta: number = REJILLA.pie[1]): { lineas: LineaG[]; y1: number } {
  const lineas: LineaG[] = [];
  let yk = y;
  for (const b of bloques) {
    if (b.texto == null) continue;
    const bloque = apilarTexto(b.rol, b.texto, yk, frac, D, { tono: b.tono ?? 'tinta2' });
    if (bloque.y1 - AIRE.lineas > hasta || !bloque.lineas.every((l) => l.cabe)) continue;
    lineas.push(...bloque.lineas);
    yk = bloque.y1;
  }
  return { lineas, y1: yk };
}

// ---------------------------------------------------------------------------
// Una línea de dato hecha de fichas
// ---------------------------------------------------------------------------

/**
 * Una ficha de una línea de dato: `v` un valor (en la bitmap si la sabe pintar),
 * `u` su unidad (pegada), `t` una palabra suelta (×, máx…) y `'·'` el separador.
 * `tono` solo en los valores: lo que se quedó por defecto va en tinta2.
 */
export type Tok = { v: string; tono?: Tono } | { u: string } | { t: string } | '·';

/**
 * «4 × 8», «máx 131 kg», «6 × 15 m» a fichas: los números, valores; «×», una
 * palabra suelta; «·», el separador; lo demás, unidad. Solo para lo que ya
 * viene formateado del kit (`fmtPrescrito`, `kgTexto`).
 */
export function tokensDeTexto(texto: string, tono?: Tono): Tok[] {
  return texto
    .split(/\s+/)
    .filter(Boolean)
    .map((w): Tok => {
      if (w === '·') return '·';
      if (w === '×') return { t: '×' };
      return enSubconjunto(w) ? { v: w, tono } : { u: w };
    });
}

/** Las piezas de una línea de fichas a un cuerpo de valor: unidades y palabras al suelo, valores a `cuerpo`. */
export function piezasDeTokens(toks: readonly Tok[], cuerpo: number, D: number): Pieza[] {
  const aire = AIRE.piezas * D;
  const suelo = cuerpoPx(TG.nota, D);
  const ps: Pieza[] = [];
  toks.forEach((k, i) => {
    const previa = toks[i - 1];
    const antes = i === 0 ? 0 : previa === '·' ? aire / 2 : aire;
    if (k === '·') ps.push({ texto: '·', cara: 'nota', cuerpo: suelo, tono: 'tinta2', antes: i === 0 ? 0 : aire / 2 });
    else if ('u' in k) ps.push({ texto: k.u, cara: 'nota', cuerpo: suelo, tono: 'tinta2', antes: i === 0 ? 0 : AIRE.unidad * D });
    else if ('t' in k) ps.push({ texto: k.t, cara: 'nota', cuerpo: suelo, tono: 'tinta2', antes: i === 0 ? 0 : aire / 2 });
    else ps.push({ texto: k.v, cara: enSubconjunto(k.v) ? 'cifras' : 'texto', cuerpo, tono: k.tono ?? 'tinta', antes });
  });
  return ps;
}

/** Una línea de fichas en su caja: baja de cuerpo hasta el suelo antes de perder nada; si ni así cabe, `cabe: false` y los tests lo cazan. */
export function lineaDeTokens(rol: string, toks: readonly Tok[], frac: number, donde: Fila | Caja, D: number): LineaG {
  const c = typeof donde === 'string' ? cajaEnFila(donde, altoLinea(frac, 'cifras')) : donde;
  const r = cuerpoQueCabe((cu) => piezasDeTokens(toks, cu, D), frac, D, Math.floor(c.ancho * D));
  return colocar(rol, r.piezas, c, D, 'centro', r.cabe);
}

/**
 * Reparte `n` filas de `alto` en una franja, JUNTAS y centradas: el hueco entre
 * ellas es el de `hueco` (o menos si no caben), no todo el sobrante. En un
 * círculo el sobrante repartido manda las últimas filas al fondo, donde la
 * cuerda es corta; juntas y al centro, donde es larga, caben más.
 */
export function repartirJunto(n: number, alto: number, franja: readonly [number, number], hueco: number): Caja[] {
  const [desde, hasta] = franja;
  const libre = hasta - desde - n * alto;
  const entre = n > 1 ? Math.min(hueco, Math.max(0, libre / (n - 1))) : 0;
  const total = n * alto + (n - 1) * entre;
  const y0 = desde + Math.max(0, hasta - desde - total) / 2;
  return Array.from({ length: n }, (_, k) => caja(y0 + k * (alto + entre), alto));
}

/**
 * Parte una línea de fichas en dos por el separador más cercano a la mitad
 * (una fila de ocho cargas no cabe en una línea en ningún reloj). `null` si no
 * hay separador: una línea sin «·» no se parte.
 */
export function partirFichas(toks: readonly Tok[]): [Tok[], Tok[]] | null {
  const cortes = toks.map((k, i) => (k === '·' ? i : -1)).filter((i) => i > 0 && i < toks.length - 1);
  if (cortes.length === 0) return null;
  const medio = toks.length / 2;
  const corte = cortes.reduce((mejor, i) => (Math.abs(i - medio) < Math.abs(mejor - medio) ? i : mejor));
  return [toks.slice(0, corte), toks.slice(corte + 1)];
}

/** Una línea de texto al suelo, pegada a `y`: la nota de una cara. */
export function lineaNota(rol: string, texto: string, y: number, D: number, tono: Tono = 'tinta2'): LineaG {
  return colocar(rol, [chica(texto, D, tono)], caja(y, ALTO_NOTA), D);
}

/** Una disposición sin nada: el punto de partida de una cara que la llena. */
export const sinBarras = (d: Disposicion): DisposicionFin => ({ ...d, barras: [], glifo: null });
