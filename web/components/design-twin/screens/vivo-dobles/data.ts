// El relevo — el modelo del tramo compartido, y las curvas de las que sale
// TODO lo que pintan las tres escenas.
//
// LA REGLA QUE ORDENA LA PANTALLA. En un relevo hay tres fuentes distintas, y
// cada dato de la pantalla pertenece a una de ellas. De aquí sale el diseño
// entero, no de una lista de casos:
//
//  1. LA MÁQUINA mide la PIEZA, no a la persona. El monitor del remo cuenta
//     metros y ritmo reme quien reme, así que el parcial de tu pareja SÍ se
//     pinta con su /500m: no es un dato de ella, es un dato de la máquina.
//     Un relevo de burpees no lo mide nadie, y ahí no habría ritmo que enseñar
//     ni cuenta de salida que estimar.
//  2. TU dispositivo te mide a TI. Tu pulso es tuyo. El de tu pareja no llega
//     a este móvil (su reloj no está emparejado), así que no hay fila para él:
//     ni hueco, ni guion, ni barra vacía (CONTRATO-UI §7).
//  3. NADIE mide que os habéis cambiado de asiento. Los metros dicen cuándo se
//     acaba su relevo; que ya estéis cambiados lo confirma un toque.
//
// Y la regla del motor, la que gobierna el registro: lo que trabaja tu pareja
// NO se te apunta. Aquí eso no es una nota al pie — es la barra bicolor, donde
// se ve de un vistazo cuánto del tramo es tuyo y cuánto suyo.
//
// FABRICACIÓN DECLARADA: en el corpus de composición (`datos-reales.ts`) no hay
// ninguna sesión de dobles, así que el tramo, los ritmos y el pulso se fabrican
// AQUÍ, una sola vez — igual que `CURSOR_HYROX` en el entreno en vivo. Las tres
// escenas derivan de estas curvas y por eso no pueden contradecirse entre sí.

export type Quien = 'tu' | 'pareja';

/** Un trozo de la pieza remado por alguien, en metros del tramo. */
export interface Segmento {
  quien: Quien;
  desdeM: number;
  hastaM: number;
}

/**
 * El contrato de las dos escenas de relevo (la tuya y la suya). Vive aquí y no
 * dentro de una de ellas porque las dos lo cumplen: si se declarase en una, la
 * otra la importaría solo por el tipo y quedaría colgando de su hermana.
 */
export interface EscenaLegProps {
  /** Los relevos ya cerrados: el reparto REAL, no el planeado. */
  hechos: Segmento[];
  /** El relevo en curso, con su frontera planeada. */
  actual: Segmento;
  /** Metros del tramo al montar la escena. */
  desdeM: number;
  /** Segundos que llevas fuera de la máquina al montar (para tu pulso). */
  descansoDesdeS: number;
  /** El relevo se cierra en `metros` (por la hora o por el toque). */
  onRelevo: (metros: number) => void;
  onLog: (linea: string) => void;
}

// ---------------------------------------------------------------------------
// La pareja
// ---------------------------------------------------------------------------

/** El nombre de tu pareja. Es lo único que la pantalla nombra: tú eres «tú». */
export const PAREJA = 'Ana';

/**
 * El atleta del fixture. Su propia app NUNCA escribe su nombre (§3: se le habla
 * de tú), así que solo viaja a la cronología del panel, que es la vista del
 * director y no la del atleta.
 */
export const ATLETA = 'Marcos';

/** Tú eres el naranja de marca; tu pareja, el azul de info — el mismo reparto
 * que ya usa la app (`Theme.Color.partner = info`, DoblesTurnHero.swift). */
export const COLOR: Record<Quien, string> = {
  tu: 'var(--twin-accent)',
  pareja: 'var(--twin-info)',
};

/** El mismo color, en la variante legible sobre fondo (claro incluido). */
export const COLOR_TEXTO: Record<Quien, string> = {
  tu: 'var(--twin-accent-text)',
  pareja: 'var(--twin-info)',
};

export function nombreDe(quien: Quien): string {
  return quien === 'tu' ? 'Tú' : PAREJA;
}

// ---------------------------------------------------------------------------
// El tramo — una pieza, un reparto, un orden
// ---------------------------------------------------------------------------

export const TRAMO = {
  /** `exercises.name`, en inglés como está guardado (ver `datos-reales.ts`). */
  ejercicio: 'Rowing',
  titulo: 'Remo 1.000',
  totalM: 1000,
  /** El reparto: relevos de 250 m. */
  relevoM: 250,
  /** El objetivo prescrito del tramo, en segundos por 500 m. */
  objetivoS500: 125,
} as const;

/** El orden: empieza tu pareja. Cuatro relevos de 250 m. */
export const PLAN: Segmento[] = Array.from(
  { length: TRAMO.totalM / TRAMO.relevoM },
  (_, i): Segmento => ({
    quien: i % 2 === 0 ? 'pareja' : 'tu',
    desdeM: i * TRAMO.relevoM,
    hastaM: (i + 1) * TRAMO.relevoM,
  }),
);

/** Lo ya remado cuando una escena arranca en mitad del relevo `indice`. */
export function planHasta(indice: number): Segmento[] {
  return PLAN.slice(0, indice).map((s) => ({ ...s }));
}

// ---------------------------------------------------------------------------
// Las curvas — un ritmo por persona, y el tiempo que cuesta cambiar
// ---------------------------------------------------------------------------

/** Ritmo sostenido de cada uno en su relevo, en segundos por 500 m. */
const RITMO_S500: Record<Quien, number> = { tu: 122, pareja: 130 };

/** Segundos que se pierden en cada cambio. El reloj del tramo los cuenta:
 * son parte de la pieza, y en dobles es justo donde se escapa el tiempo. */
export const CAMBIO_S = 4;

export function ritmoS500(quien: Quien): number {
  return RITMO_S500[quien];
}

/** Metros por segundo a los que avanza la pieza con esa persona dentro. */
export function velocidad(quien: Quien): number {
  return 500 / RITMO_S500[quien];
}

/** Los metros de la pieza tras `t` segundos de este relevo, sin pasarse del
 * final del tramo (el monitor cuenta la pieza entera, no el relevo). */
export function metrosEn(desdeM: number, quien: Quien, t: number): number {
  return Math.min(TRAMO.totalM, desdeM + velocidad(quien) * Math.max(0, t));
}

/** El reloj del tramo: lo remado por cada uno más los cambios ya hechos. */
export function relojTramoS(hechos: Segmento[], actual: Segmento, metros: number): number {
  const remado = hechos.reduce((s, seg) => s + (seg.hastaM - seg.desdeM) / velocidad(seg.quien), 0);
  const enCurso = Math.max(0, metros - actual.desdeM) / velocidad(actual.quien);
  return remado + enCurso + hechos.length * CAMBIO_S;
}

/** Los metros que lleva cada uno. La suma es el tramo; el reparto, la verdad
 * del registro: lo de tu pareja no entra en tu volumen. */
export function metrosPorQuien(
  hechos: Segmento[],
  actual: Segmento,
  metros: number,
): Record<Quien, number> {
  const total: Record<Quien, number> = { tu: 0, pareja: 0 };
  for (const seg of hechos) total[seg.quien] += seg.hastaM - seg.desdeM;
  total[actual.quien] += Math.max(0, metros - actual.desdeM);
  return total;
}

// ---------------------------------------------------------------------------
// La estimación de salida — medida y estimación, separadas a propósito
// ---------------------------------------------------------------------------

/** Segundos que le quedan a quien está dentro, a su ritmo de ahora. */
export function estimaSalidaS(restanteM: number, quien: Quien): number {
  return Math.max(0, restanteM) / velocidad(quien);
}

/**
 * Una estimación se escribe como una estimación. Lejos se redondea a 5 s
 * (nadie sale «en 34»); cerca ya se cuenta entera, porque a esa distancia sí
 * decide cuándo te levantas.
 *
 * Devuelve solo las CIFRAS: el `~` y la unidad los pinta el layout aparte,
 * igual que el ritmo con su `/500m` (§2). Así el marcador de estimación no
 * viaja escondido dentro de un string que otra pantalla podría recortar.
 */
export function estimaCifras(segundos: number): string {
  const s = Math.max(0, segundos);
  return String(s > 20 ? Math.round(s / 5) * 5 : Math.ceil(s));
}

/** Bajo este umbral la pantalla deja de contar y te manda levantarte. */
export const PREPARARSE_S = 10;

// ---------------------------------------------------------------------------
// Tu pulso — el único que este móvil mide
// ---------------------------------------------------------------------------

/**
 * Remando: sube con lo que llevas del relevo, de Z3 a Z5. Un 250 de dobles se
 * va a rojo al final; por eso el relevo se aguanta.
 */
export function pulsoRemando(progreso: number): number {
  const p = Math.min(1, Math.max(0, progreso));
  return Math.round(145 + 27 * p);
}

/**
 * Recuperando: cae desde el pico exacto donde acaba `pulsoRemando(1)` = 172,
 * así el cambio de escena no da un salto imposible. En los 65 s de su relevo
 * bajas a Z2, que es lo que se siente y lo que hace útil la vista de espera.
 */
export function pulsoRecuperando(tDescansoS: number): number {
  return Math.round(132 + 40 * Math.exp(-Math.max(0, tDescansoS) / 45));
}

// La zona de un pulso NO se calcula aquí: es `zonaDe` de `kit-vivo`, la misma
// para las diez vistas en vivo (§10.1). Esta copia local existía desde antes del
// kit y devolvía siempre una zona, sin el caso «sin pulso» que el §7 exige.

// ---------------------------------------------------------------------------
// Formato — nada se escribe a mano en las escenas (§2)
// ---------------------------------------------------------------------------

/**
 * Metros del tramo con punto de millar: `614`, `1.000`.
 *
 * A mano y no con `toLocaleString('es-ES')`, que devuelve `1000` sin punto: el
 * CLDR español no agrupa los números de cuatro cifras. Será correcto para la
 * RAE, pero la app escribe `1.000 m` en todas partes (`datos-reales.ts`, la
 * ruta de HYROX, la biblioteca), y dos grafías del mismo metraje en dos
 * pantallas es exactamente lo que el §2 del contrato existe para evitar.
 */
export function metrosTexto(metros: number): string {
  const n = Math.round(Math.max(0, metros));
  if (n < 1000) return String(n);
  return `${Math.floor(n / 1000)}.${String(n % 1000).padStart(3, '0')}`;
}

/** Las cifras del ritmo; la unidad `/500m` la pinta el layout aparte (§2). */
export function ritmoCifras(segundosPor500: number): string {
  const s = Math.max(0, Math.round(segundosPor500));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Cómo va tu ritmo contra el objetivo NO se escribe aquí: es `Delta` de
// `kit-vivo` (§10), que ya dice contra qué compara y pinta el verde de «vas
// mejor». Había una versión local que devolvía «2 s por encima» con su color a
// mano, y era la misma lectura escrita por segunda vez.
