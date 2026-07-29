'use client';

// «vivo-fuerza» — el modelo y los datos de la familia.
//
// EL MODELO. Una prescripción de fuerza son CUATRO cosas independientes, y
// cualquiera de ellas puede faltar:
//
//   medida     → reps (o metros de un sled, o tiempo)   ← `ItemReal.dosis`
//   carga      → kg (o %RM, o peso corporal)            ← `ItemReal.objetivo`
//   intensidad → el RIR/RPE que pide el COACH
//   estructura → series · descanso · orden dentro del circuito
//
// No es un modelo defensivo: el circuito de pierna real (plantilla 442) llega
// con carga y estructura pero SIN medida, así que `reps: number | null` es la
// mitad de los escenarios de esta familia, no un caso de borde.
//
// Y hay una quinta cosa que NO es prescripción y no se mezcla con ella: lo que
// el atleta HIZO (`SerieHecha`). En fuerza gobierna el atleta — la app no puede
// medir ni una repetición ni un kilo, así que nada pasa de prescrito a hecho
// sin que él lo diga (CONTRATO-UI §7).
//
// Lo que no sale de `datos-reales.ts` se fabrica AQUÍ, una vez y declarado,
// igual que `CURSOR_HYROX` hace en el entreno en vivo.

import {
  BACK_SQUAT,
  CIRCUITO_PIERNA,
  MEDIDO_SQUAT,
  dosisConSeries,
  esDecimal,
  type ItemReal,
} from '../../datos-reales';

// ---------------------------------------------------------------------------
// Lectura de la prescripción — los strings de `ItemReal` a números utilizables
// ---------------------------------------------------------------------------

function decimalesDe(n: number): number {
  const punto = String(n).indexOf('.');
  return punto < 0 ? 0 : String(n).length - punto - 1;
}

/** Un número de cara al atleta: entero tal cual, decimal con coma (§2). */
export function numeroTexto(n: number): string {
  const d = decimalesDe(n);
  return d === 0 ? String(n) : esDecimal(n, d);
}

/**
 * ⚠️ CANÓNICO QUE FALTA EN EL SITIO COMPARTIDO (§2.1).
 *
 * `Formato.kg` existe en el Swift y en la tabla del contrato, pero
 * `datos-reales.ts` aún no lo tiene. Vive aquí porque esta carpeta es la única
 * que se puede escribir en este encargo; **tiene que subir a `datos-reales.ts`
 * y a la tabla del §2 en el siguiente lote**, antes de que la segunda pantalla
 * que necesite kilos escriba el suyo. Así nacieron las tres grafías de la
 * dosis del 29-jul.
 */
export function kg(valorKg: number): string {
  return `${numeroTexto(valorKg)} kg`;
}

/**
 * Extrae el número de una dosis o un objetivo (`'5 reps'` → 5, `'100 kg'` →
 * 100). Nulo cuando no hay texto — que es exactamente lo que pasa con el
 * `Reverse Lunge` del circuito real, cuya `dosis` es `null`.
 */
export function numeroDe(texto: string | null | undefined): number | null {
  if (!texto) return null;
  // Punto como separador de millares (`1.000 m`), coma como decimal (`2,5 kg`).
  const limpio = texto.replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  const encontrado = /-?\d+(?:\.\d+)?/.exec(limpio);
  return encontrado ? Number(encontrado[0]) : null;
}

/** Lo que el coach pidió. Cualquier campo puede ser nulo: así llega la base. */
export interface Prescripcion {
  ejercicio: string;
  series: number;
  /** Repeticiones por serie. Nulo = el coach no las escribió. */
  reps: number | null;
  cargaKg: number | null;
  /** RIR del COACH. Lo que sintió el atleta es otra cosa y se pregunta. */
  rir: number | null;
  /** Descanso prescrito. Nulo = el plan no lo trae y no se inventa uno. */
  descansoS: number | null;
  /**
   * La dosis entera con sus series (`4×5`), tal y como la escribe el canónico
   * compartido. No se recompone en ninguna vista: es la grafía que el 29-jul
   * salió de tres maneras distintas en tres pantallas el mismo día.
   */
  dosisSeries: string | null;
  /**
   * Con qué se hace. **Hueco del modelo de datos**: `exercises` no tiene
   * columna de material, así que hoy solo se puede afirmar «barra» para los
   * ejercicios que son de barra por definición (un back squat lo es; una
   * zancada a 30 kg puede ser barra, mancuernas o sandbag).
   *
   * Nulo = no se sabe → no se dibujan discos. Adivinarlo sería mandar al
   * atleta a cargar un material que a lo mejor no es el suyo (§7).
   */
  implemento: 'barra' | null;
}

/** Lo que el atleta declaró. Nada llega aquí sin que él lo diga. */
export interface SerieHecha {
  reps: number | null;
  cargaKg: number | null;
  /** Lo que SINTIÓ. Nulo = no lo dijo, y no se rellena con el del coach. */
  rirSentido: number | null;
}

function deItem(
  item: ItemReal,
  rirDelCoach: number | null,
  implemento: 'barra' | null = null
): Prescripcion {
  return {
    ejercicio: item.nombre,
    series: item.series ?? 1,
    reps: numeroDe(item.dosis),
    cargaKg: numeroDe(item.objetivo),
    rir: rirDelCoach,
    descansoS: item.descansoS ?? null,
    dosisSeries: dosisConSeries(item),
    implemento,
  };
}

// ---------------------------------------------------------------------------
// Los dos casos reales
// ---------------------------------------------------------------------------

const ITEM_SQUAT = BACK_SQUAT.bloques[0].items[0];
/** El bloque «Fuerza» del circuito: cuatro movimientos, ninguno con medida. */
const BLOQUE_CIRCUITO = CIRCUITO_PIERNA.bloques[1];

/**
 * Back Squat 4×5 @ 100 kg, descanso 90 s (plantilla 497 · asignación 349).
 *
 * FABRICADO y declarado: el **RIR 2**. La prescripción real no trae intensidad
 * subjetiva — es el mismo hueco del método que deja media biblioteca sin dosis.
 * Se añade aquí porque un squat sin RIR/RPE no está prescrito del todo y la
 * pantalla tiene que enseñar cómo se lee cuando SÍ lo lleva.
 */
export const SQUAT: Prescripcion = deItem(ITEM_SQUAT, 2, 'barra');

/**
 * Reverse Lunge: cuatro series a 30 kg y **sin repeticiones**. Literal de
 * `template_segments` (plantilla 442 · asignación 240). Sin RIR y sin descanso:
 * los dos campos son nulos de verdad, no por comodidad del mockup.
 */
export const LUNGE: Prescripcion = deItem(BLOQUE_CIRCUITO.items[0], null);

/** Sled Push: solo el nombre. Ni medida, ni carga, ni series. */
export const SLED: Prescripcion = deItem(BLOQUE_CIRCUITO.items[1], null);

/**
 * El orden del circuito. Las letras salen de que el bloque ES un circuito (la
 * plantilla se llama «Fuerza · circuito de pierna»): A1 → A2 → A3 → A4 y otra
 * vuelta. No se declara una superserie que el coach no escribió; se declara el
 * ORDEN, que sí está en las filas.
 */
export const CIRCUITO = BLOQUE_CIRCUITO.items.map((item, i) => ({
  letra: `A${i + 1}`,
  item,
}));

// ---------------------------------------------------------------------------
// El instante — fabricado una vez, las cuatro vistas describen el MISMO
// ---------------------------------------------------------------------------

/**
 * Serie 2 de 4: la 1 ya está registrada, la 2 es la que tienes delante.
 *
 * La serie 1 se archivó **sin RIR sentido**: el atleta la dio por hecha de un
 * toque y no dijo cómo fue. Es el estado normal y por eso se enseña.
 */
export const SERIE_1: SerieHecha = { reps: 5, cargaKg: 100, rirSentido: null };
export const SERIE_ACTIVA = 1; // 0-based → «serie 2 de 4»

/**
 * La 2, para poder entrar directo al descanso. Esta sí lleva RIR sentido: entre
 * las dos se ven los dos estados posibles del registro (con y sin), que es lo
 * que hay que poder juzgar.
 */
export const SERIE_2: SerieHecha = { reps: 5, cargaKg: 100, rirSentido: 2 };

/**
 * El pulso del descanso. Los dos extremos son MEDIDOS: la ejecución 162 de
 * esta misma asignación dio máximo 122 y media 95 ppm. Un back squat no saca a
 * este atleta de la zona 1 — el descanso se tiñe de calma porque el dato dice
 * calma, no porque quede bonito.
 *
 * (Ojo: el `zone_seconds` de esa ejecución dice 246 s en Z2, incompatible con
 * un máximo de 122 sobre un umbral de 162. Son las zonas del dispositivo, no
 * las nuestras. Aquí se usan las medidas directas y se deja el desajuste
 * anotado en vez de maquillarlo.)
 */
export const PULSO_DESCANSO = {
  alAcabarPpm: MEDIDO_SQUAT.fcMaxPpm ?? 122,
  asentadoPpm: MEDIDO_SQUAT.fcMediaPpm ?? 95,
  /** Constante de la caída, en segundos. Recuperación exponencial normal. */
  tauS: 28,
} as const;

export function pulsoTras(segundos: number): number {
  const { alAcabarPpm, asentadoPpm, tauS } = PULSO_DESCANSO;
  return Math.round(asentadoPpm + (alAcabarPpm - asentadoPpm) * Math.exp(-segundos / tauS));
}

/**
 * FABRICADO y declarado: la última vez. Es historial que la app SÍ puede saber
 * (`set_executions` de la semana pasada) y solo enseña lo que se registró
 * entonces — si el RIR no se hubiese declarado, esa línea no estaría.
 */
export const ULTIMA_VEZ = {
  haceDias: 7,
  series: 4,
  reps: 5,
  cargaKg: 100,
  seriesCompletas: 4,
  rirUltimaSerie: 2,
} as const;

/** Hay reloj en la muñeca. Sin él, el pulso no se pinta en ningún sitio (§7). */
export const CON_RELOJ = true;

// ---------------------------------------------------------------------------
// La grafía de UNA serie — un solo sitio (§2.1)
// ---------------------------------------------------------------------------

/**
 * `5 × 100 kg`. Cifra y unidad por separado para que el sujeto pueda pintar la
 * unidad más pequeña sin que nadie recomponga el string a mano.
 *
 * Ojo a la diferencia con `dosisConSeries()`, que es OTRO concepto: aquella
 * escribe *series × repeticiones* de toda la prescripción (`4×5`, pegado);
 * esta escribe *repeticiones × carga* de UNA serie (`5 × 100 kg`, separado).
 * Cada una en su sitio y ninguna reimplementada en una vista.
 */
export function serie(
  reps: number | null,
  cargaKg: number | null
): { cifra: string; unidad: string | null } | null {
  if (reps != null && cargaKg != null) {
    return { cifra: `${reps} × ${numeroTexto(cargaKg)}`, unidad: 'kg' };
  }
  if (cargaKg != null) return { cifra: numeroTexto(cargaKg), unidad: 'kg' };
  if (reps != null) return { cifra: String(reps), unidad: 'reps' };
  return null;
}

/** La misma serie en una línea, para el riel, el sello y «lo siguiente». */
export function serieTexto(reps: number | null, cargaKg: number | null): string | null {
  const s = serie(reps, cargaKg);
  return s && (s.unidad ? `${s.cifra} ${s.unidad}` : s.cifra);
}

// ---------------------------------------------------------------------------
// Los discos — cómo se carga la barra
// ---------------------------------------------------------------------------

/**
 * Barra olímpica de 20 kg. Es un SUPUESTO, y por eso se escribe siempre al
 * lado de los discos en la pantalla: si el box carga con una de 15, el atleta
 * lo ve y no se come un error silencioso de 5 kg.
 */
export const BARRA_KG = 20;

/** La escalera de discos de un gimnasio serio, de mayor a menor. */
export const DISCOS_KG = [25, 20, 15, 10, 5, 2.5, 1.25] as const;

/**
 * Los colores estándar de competición, mapeados a los tokens que existen (25
 * rojo · 20 azul · 15 amarillo · 10 verde). De 5 para abajo no hay token que
 * corresponda al color real, así que van en acero — que es como son en la
 * mayoría de boxes.
 */
export const COLOR_DISCO: Record<number, string> = {
  25: 'var(--twin-danger)',
  20: 'var(--twin-info)',
  15: 'var(--twin-warning)',
  10: 'var(--twin-ok)',
  5: 'var(--twin-neutral)',
  2.5: 'var(--twin-muted)',
  1.25: 'var(--twin-faint)',
};

/** Alto relativo del disco (el diámetro real: los tres grandes son iguales). */
export const ALTO_DISCO: Record<number, number> = {
  25: 1, 20: 1, 15: 0.94, 10: 0.74, 5: 0.58, 2.5: 0.44, 1.25: 0.36,
};

/** Grosor del disco en px. */
export const GRUESO_DISCO: Record<number, number> = {
  25: 17, 20: 15, 15: 13, 10: 11, 5: 9, 2.5: 7, 1.25: 6,
};

export interface Carga {
  /** Discos de un lado, del más pesado al más ligero (orden de carga real). */
  porLado: number[];
  kgPorLado: number;
  /** Lo que no se puede montar con discos estándar. Se dice, no se esconde. */
  sobraKg: number;
}

/** Todo se cuenta en pasos de 1,25 kg para no arrastrar errores de coma flotante. */
const UNIDAD_KG = 1.25;
const enUnidades = (valorKg: number) => Math.round(valorKg / UNIDAD_KG);

/**
 * Cómo carga un humano: **los menos discos posibles y, a igualdad, los menos
 * tamaños distintos**.
 *
 * El «coge siempre el más gordo que quepa» que sale solo al escribir esto da
 * 25 + 15 para 40 por lado. Cuadra la aritmética y ningún atleta lo hace: son
 * dos discos igual que 20 + 20, pero con dos tamaños en vez de uno. En la barra
 * se ve torcido y al descargar hay que pensar. Por eso la segunda regla no es
 * un capricho estético — es la que devuelve el 2×20 de los 100 kg reales.
 */
export function cargaDeBarra(totalKg: number, barraKg = BARRA_KG): Carga | null {
  if (totalKg < barraKg) return null;
  const kgPorLado = (totalKg - barraKg) / 2;
  const objetivo = enUnidades(kgPorLado);

  // mejor[i] = la mejor forma de montar i unidades; undefined = no se puede.
  const mejor: ({ discos: number[]; distintos: number } | undefined)[] = new Array(objetivo + 1);
  mejor[0] = { discos: [], distintos: 0 };

  for (let i = 1; i <= objetivo; i++) {
    for (const disco of DISCOS_KG) {
      const paso = enUnidades(disco);
      if (paso > i) continue;
      const previo = mejor[i - paso];
      if (!previo) continue;
      const discos = [...previo.discos, disco];
      const distintos = new Set(discos).size;
      const actual = mejor[i];
      const gana =
        !actual ||
        discos.length < actual.discos.length ||
        (discos.length === actual.discos.length && distintos < actual.distintos);
      if (gana) mejor[i] = { discos, distintos };
    }
  }

  // Si el peso no se puede montar con discos estándar, se monta lo que más se
  // acerque por debajo y se DICE lo que falta. Callarlo sería mandar al atleta
  // a levantar algo distinto de lo que pone la pantalla.
  let alcanzado = objetivo;
  while (alcanzado > 0 && !mejor[alcanzado]) alcanzado--;
  const solucion = mejor[alcanzado] ?? { discos: [], distintos: 0 };

  return {
    porLado: [...solucion.discos].sort((a, b) => b - a),
    kgPorLado,
    sobraKg: Math.round((objetivo - alcanzado) * UNIDAD_KG * 2 * 100) / 100,
  };
}
