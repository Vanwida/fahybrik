// EL FLUJO DE VALORES — la capa entre el modelo y los bytes.
//
// Un plan compacto es UNA lista de enteros no negativos (los «tokens») más una
// tabla de cadenas. Todo el diseño del formato (qué campo va después de cuál,
// qué se empaqueta, qué es opcional) vive en `codificar.ts` y `decodificar.ts`
// sobre esta abstracción; `transporte.ts` decide después cómo se escribe la
// lista (varint binario). Así el diseño y el transporte se pueden medir por
// separado y el decodificador de Monkey C tiene un solo verbo: «leer el
// siguiente valor».
//
// Convenciones que el reloj debe replicar tal cual:
//   · Ausente = 0 y presente = valor + 1 (`nOpc`): es el centinela documentado
//     de «no hay dato», nunca un cero inventado.
//   · Una cadena viaja como su índice en la tabla (`cadena`) o índice + 1 si
//     es opcional (`cadenaOpc`).
//   · Todo valor es un entero en [0, 2^31 − 1]. Los decimales se escalan
//     (décimas para los ejes, centésimas para los kilos) y el codificador se
//     niega a redondear: un valor que no cabe exacto es un error, no un ajuste.
//
// QUÉ NO HACER: no leer más allá del final (el lector lo detecta y falla, no
// devuelve ceros) y no tolerar tokens sobrantes (`fin()`), que delatan un
// desacuerdo de versión.

import {
  CADENAS_TRUNCABLES,
  ESCALA_CENTI,
  ESCALA_DECI,
  LIMITE_CADENA,
  LIMITE_CUE,
  MAX_NUM,
  REMATE_TRUNCADO,
  TOLERANCIA_ESCALA,
  type TipoCadena,
} from './formato';

/** Por qué se rechazó un plan: cada código es un tipo de hueco distinto. */
export type CodigoError =
  | 'no-entero'
  | 'fuera-de-rango'
  | 'cadena-larga'
  | 'clave-desconocida'
  | 'valor-desconocido'
  | 'vocabulario-incompleto'
  | 'fuera-de-limites'
  | 'truncado'
  | 'sobran-valores'
  | 'version'
  | 'formato';

export class ErrorPlanCompacto extends Error {
  constructor(
    readonly codigo: CodigoError,
    mensaje: string,
  ) {
    super(`[plan-compacto:${codigo}] ${mensaje}`);
    this.name = 'ErrorPlanCompacto';
  }
}

/** La lista de enteros y la tabla de cadenas: el plan sin transporte. */
export interface Flujo {
  version: number;
  cadenas: string[];
  tokens: number[];
}

/** Un uso de una cadena del plan (tipo + texto), para auditar qué texto viaja y cuánto pesa. */
export interface RegistroCadena {
  tipo: TipoCadena;
  texto: string;
  /** Caracteres (puntos de código) que llevaba antes de truncar. */
  largoOriginal: number;
  largo: number;
  truncada: boolean;
}

const contarCaracteres = (s: string) => [...s].length;

/** Recorta a `max` caracteres (puntos de código) y remata con «…» para que se vea que se cortó. */
function truncar(texto: string, max: number): string {
  const c = [...texto];
  return c.length <= max ? texto : `${c.slice(0, max - 1).join('')}${REMATE_TRUNCADO}`;
}

/** `valor` × `escala` como entero exacto, o error: nunca se redondea un dato del coach. */
export function escalar(valor: number, escala: number, donde: string): number {
  const v = valor * escala;
  const r = Math.round(v);
  if (!Number.isFinite(v) || Math.abs(v - r) > TOLERANCIA_ESCALA) {
    throw new ErrorPlanCompacto('no-entero', `${donde}: ${valor} no cabe exacto en 1/${escala}`);
  }
  return r;
}

export class Escritor {
  readonly tokens: number[] = [];
  readonly cadenas: string[] = [];
  readonly registro: RegistroCadena[] = [];
  private readonly indice = new Map<string, number>();
  private readonly vistas = new Set<string>();

  /** Un entero no negativo. */
  n(v: number, donde = 'valor'): void {
    if (!Number.isInteger(v)) throw new ErrorPlanCompacto('no-entero', `${donde}: ${v} no es entero`);
    if (v < 0 || v > MAX_NUM) throw new ErrorPlanCompacto('fuera-de-rango', `${donde}: ${v} fuera de [0, ${MAX_NUM}]`);
    this.tokens.push(v);
  }

  /** Opcional: 0 = ausente, valor + 1 = presente. */
  nOpc(v: number | null | undefined, donde = 'valor'): void {
    if (v == null) {
      this.tokens.push(0);
      return;
    }
    this.n(v + 1, donde);
  }

  /** Un valor de eje (o un porcentaje) en décimas. */
  deci(v: number, donde: string): void {
    this.n(escalar(v, ESCALA_DECI, donde), donde);
  }

  /** Opcional en décimas. */
  deciOpc(v: number | null | undefined, donde: string): void {
    this.nOpc(v == null ? null : escalar(v, ESCALA_DECI, donde), donde);
  }

  /** Kilos en centésimas. */
  centi(v: number, donde: string): void {
    this.n(escalar(v, ESCALA_CENTI, donde), donde);
  }

  centiOpc(v: number | null | undefined, donde: string): void {
    this.nOpc(v == null ? null : escalar(v, ESCALA_CENTI, donde), donde);
  }

  /** Una cadena internada; devuelve el valor que se escribe (su índice). */
  private internar(texto: string, tipo: TipoCadena, donde: string): number {
    const limite = CADENAS_TRUNCABLES.has(tipo) ? LIMITE_CUE : LIMITE_CADENA;
    const largoOriginal = contarCaracteres(texto);
    if (largoOriginal > limite && !CADENAS_TRUNCABLES.has(tipo)) {
      throw new ErrorPlanCompacto('cadena-larga', `${donde}: «${texto}» (${largoOriginal} > ${limite}); un ${tipo} no se trunca`);
    }
    const final = truncar(texto, limite);
    // Una misma cadena puede servir a dos campos («SkiErg 1km» de la tarea y de los dobles): se guarda
    // una vez, pero la auditoría anota cada uso para no ocultar qué campo la trae.
    const uso = `${tipo}\u0000${final}`;
    if (!this.vistas.has(uso)) {
      this.vistas.add(uso);
      this.registro.push({ tipo, texto: final, largoOriginal, largo: contarCaracteres(final), truncada: final !== texto });
    }
    const previo = this.indice.get(final);
    if (previo !== undefined) return previo;
    const i = this.cadenas.length;
    this.cadenas.push(final);
    this.indice.set(final, i);
    return i;
  }

  cadena(texto: string, tipo: TipoCadena, donde: string): void {
    this.tokens.push(this.internar(texto, tipo, donde));
  }

  /** Opcional: 0 = ausente, índice + 1 = presente. */
  cadenaOpc(texto: string | null | undefined, tipo: TipoCadena, donde: string): void {
    this.tokens.push(texto == null ? 0 : this.internar(texto, tipo, donde) + 1);
  }

  flujo(version: number): Flujo {
    return { version, cadenas: this.cadenas, tokens: this.tokens };
  }
}

export class Lector {
  private pos = 0;

  constructor(private readonly f: Flujo) {}

  get restantes(): number {
    return this.f.tokens.length - this.pos;
  }

  n(donde = 'valor'): number {
    const v = this.f.tokens[this.pos];
    if (v === undefined) throw new ErrorPlanCompacto('truncado', `${donde}: el plan acaba antes de tiempo (valor ${this.pos})`);
    this.pos += 1;
    return v;
  }

  /** Inversa de `nOpc`. */
  nOpc(donde = 'valor'): number | null {
    const v = this.n(donde);
    return v === 0 ? null : v - 1;
  }

  deci(donde: string): number {
    return this.n(donde) / ESCALA_DECI;
  }

  deciOpc(donde: string): number | null {
    const v = this.nOpc(donde);
    return v === null ? null : v / ESCALA_DECI;
  }

  centi(donde: string): number {
    return this.n(donde) / ESCALA_CENTI;
  }

  centiOpc(donde: string): number | null {
    const v = this.nOpc(donde);
    return v === null ? null : v / ESCALA_CENTI;
  }

  private cadenaEn(i: number, donde: string): string {
    const c = this.f.cadenas[i];
    if (c === undefined) throw new ErrorPlanCompacto('formato', `${donde}: la cadena ${i} no existe (hay ${this.f.cadenas.length})`);
    return c;
  }

  cadena(donde: string): string {
    return this.cadenaEn(this.n(donde), donde);
  }

  cadenaOpc(donde: string): string | undefined {
    const v = this.nOpc(donde);
    return v === null ? undefined : this.cadenaEn(v, donde);
  }

  /** Falla si sobran valores: un plan de otra versión que se leyó «bien» a medias. */
  fin(): void {
    if (this.restantes !== 0) throw new ErrorPlanCompacto('sobran-valores', `sobran ${this.restantes} valores tras el último paso`);
  }
}

/** El índice de un valor en su tabla, o error con el nombre del campo. */
export function codigoDe<T extends string>(tabla: readonly T[], valor: T, donde: string): number {
  const i = tabla.indexOf(valor);
  if (i < 0) throw new ErrorPlanCompacto('valor-desconocido', `${donde}: «${String(valor)}» no está en la tabla`);
  return i;
}

/** El valor de un código, o error si el reloj y el servidor no hablan la misma versión. */
export function valorDe<T extends string>(tabla: readonly T[], codigo: number, donde: string): T {
  const v = tabla[codigo];
  if (v === undefined) throw new ErrorPlanCompacto('valor-desconocido', `${donde}: código ${codigo} fuera de la tabla (${tabla.length})`);
  return v;
}

/** Comprueba que un objeto del modelo no trae claves que el formato no conoce. */
export function soloClaves(obj: object, permitidas: readonly string[], donde: string): void {
  for (const k of Object.keys(obj)) {
    if (!permitidas.includes(k)) {
      throw new ErrorPlanCompacto('clave-desconocida', `${donde}: el modelo trae «${k}» y el formato no lo lleva (hueco del modelo)`);
    }
  }
}
