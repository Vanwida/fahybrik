// EL GENERADOR DE SEÑAL DEL DOBLE — una fuente, N proyecciones.
//
// Es la misma ley que sigue producción (docs/DECISIONS.md, 11-ago): se escribe
// UN guion de la carrera y de él salen a la vez la curva, las repeticiones, los
// kilómetros, el reparto de zonas, los totales y la ruta. Escribir cada
// proyección por separado dejaría que la tabla dijera una cosa y la curva otra,
// que es justo lo que la pantalla de al lado viene a evitar.
//
// La señal es ILUSTRATIVA y determinista (ondulación por seno, cero aleatorio):
// ninguna ejecución de la base tiene todavía traza de correr. Vive en su propio
// módulo para que `datos.ts` sea solo LAS CARRERAS y se lea de un vistazo.

import { zonaDe, type Zona } from '../../kit-vivo';
import type { Kilometro, Muestra, PuntoRuta, Repeticion } from './modelo';

// ---------------------------------------------------------------------------
// Las bandas de ritmo del atleta — DATO, no constante (Regla Nº0)
// ---------------------------------------------------------------------------

/**
 * Lo que en producción resuelve `athlete_zone_profiles` → `resolved_intensity`
 * (per_km): dónde cortan las zonas de ritmo de ESTE atleta. Otro entrenador las
 * corta en otro sitio, así que nace como dato del perfil y no como constante.
 * Umbral ≈ 4:05/km. Es la única tabla que colorea el mapa, de modo que el color
 * significa lo mismo aquí que en el resto de la app: tu zona.
 */
const RITMO_POR_ZONA: Record<Zona, { rapidoSkm: number; lentoSkm: number }> = {
  1: { rapidoSkm: 320, lentoSkm: Infinity },
  2: { rapidoSkm: 285, lentoSkm: 320 },
  3: { rapidoSkm: 260, lentoSkm: 285 },
  4: { rapidoSkm: 240, lentoSkm: 260 },
  5: { rapidoSkm: 0, lentoSkm: 240 },
};

function zonaDeRitmo(skm: number | null): Zona | null {
  if (skm == null) return null;
  for (const z of [5, 4, 3, 2, 1] as const) {
    if (skm < RITMO_POR_ZONA[z].lentoSkm) return z;
  }
  return 1;
}

/**
 * La banda de pulso de una zona, BARRIDA del mismo clasificador que pinta la
 * app (`zonaDe` → `hrZone` → fracciones del umbral). Escribir «Z2 = 130-148» a
 * mano es cómo el mockup acaba enseñando una zona distinta de la de la app para
 * el mismo pulso — el bug que el 28-jul ya costó una vez.
 */
export function bandaDeZona(z: Zona): { minPpm: number; maxPpm: number } {
  const dentro = [];
  for (let ppm = 60; ppm <= 220; ppm += 1) if (zonaDe(ppm) === z) dentro.push(ppm);
  return { minPpm: dentro[0] ?? 0, maxPpm: dentro[dentro.length - 1] ?? 0 };
}

// ---------------------------------------------------------------------------
// El generador — de un guion salen todas las proyecciones
// ---------------------------------------------------------------------------

export interface Paso {
  papel: 'trabajo' | 'recuperacion' | 'suelto';
  modo?: 'trote' | 'andando' | 'parado';
  /** Duración en s. Se deriva de `distanciaM` cuando la repetición se mide en metros. */
  dur?: number;
  distanciaM?: number;
  /** s/km. Nulo = parado: no avanza y no tiene ritmo, y no se le inventa uno. */
  skm: number | null;
  /** Ritmo al FINAL del paso: el ritmo deriva de `skm` a este a lo largo del
   *  tramo. Un rodaje no corre a un número fijo durante media hora y luego salta
   *  al siguiente — se va yendo, y esa cuesta abajo es justo la deriva que la
   *  pantalla mide más abajo. */
  skmFin?: number;
  ppm: number;
  pendientePct?: number;
  /** Se corrió, pero el reloj no emitió: el hueco existe y tiene que verse. */
  sinSenal?: boolean;
}

/** Una muestra cada 5 s: la cadencia media real medida en la 0156. */
const CADA_S = 5;
/**
 * El ruido del ritmo por GPS, en dos frecuencias.
 *
 * La RÁPIDA (±3 s/km) es el temblor de posición, y su periodo son exactamente
 * los 25 s de la ventana con que dibuja `curva.tsx`: así la media móvil se lo
 * come entero, que es lo que hace la app de verdad. Con un periodo cualquiera se
 * alía contra el muestreo de 5 s y la curva sale con pelo.
 *
 * La LENTA (±2 s/km cada ~4 min) SOBREVIVE al suavizado a propósito: es
 * variación del corredor, no del aparato, y borrarla dejaría una recta que
 * ninguna carrera dibuja.
 */
const RUIDO_RAPIDO_SKM = 3;
const RUIDO_RAPIDO_PERIODO_S = 25;
const RUIDO_LENTO_SKM = 2;
const RUIDO_LENTO_PERIODO_S = 232;
/** Inercia del pulso: no salta al ritmo, lo persigue. Es lo que hace que la
 *  línea fina vaya un poco por detrás de la gruesa, como en la vida. */
const INERCIA_PULSO = 0.1;
/** Y encima, la ondulación lenta de un pulso real: ±2 ppm cada tres minutos. */
const PULSO_ONDA_PPM = 2;
const PULSO_PERIODO_S = 185;

interface Generada {
  traza: { ritmo: Muestra[]; pulso: Muestra[] };
  repeticiones: Repeticion[];
  kilometros: Kilometro[];
  zonasS: Partial<Record<'z1' | 'z2' | 'z3' | 'z4' | 'z5', number>>;
  distanciaM: number;
  duracionS: number;
  /** DERIVADAS de la señal, nunca declaradas aparte: si la escena escribiera su
   *  propia FC media, la cifra y la curva podrían contarse cosas distintas. */
  fcMediaPpm: number;
  fcMaxPpm: number;
  ruta: PuntoRuta[];
}

function duracionDe(p: Paso): number {
  if (p.dur != null) return p.dur;
  if (p.distanciaM != null && p.skm != null) return Math.round((p.distanciaM / 1000) * p.skm);
  return 0;
}

/**
 * Dónde se corrió. No es decorado: cambia DOS cosas de la señal.
 *
 *  · `calle` — la distancia la da el GPS, con su temblor de posición, y hay ruta.
 *  · `cinta` — la distancia la da la CINTA, que es más estable que el GPS, y no
 *    hay ruta ninguna. Por eso el ruido baja a una fracción y la curva sale con
 *    mesetas limpias: una cinta sostiene el ritmo que le pones.
 */
export type Superficie = 'calle' | 'cinta';

/** Cuánto del temblor del GPS conserva una cinta. Casi nada, y por eso se nota. */
const RUIDO_EN_CINTA = 0.15;

export function generar(guion: Paso[], superficie: Superficie): Generada {
  const conRuta = superficie === 'calle';
  const escalaRuido = superficie === 'cinta' ? RUIDO_EN_CINTA : 1;
  const ritmo: Muestra[] = [];
  const pulso: Muestra[] = [];
  const repeticiones: Repeticion[] = [];
  const zonasS: Record<string, number> = {};
  // Trazo del recorrido: el rumbo deriva con una suma de senos y el paso avanza
  // con la velocidad, así que un tramo rápido dibuja más calle que uno suave.
  const crudo: Array<{ x: number; y: number; skm: number | null }> = [];

  let t = 0;
  let metros = 0;
  let ppm = guion[0]?.ppm ?? 120;
  let nTrabajo = 0;
  let rumbo = 0;
  let px = 0;
  let py = 0;
  // Muestras por kilómetro, para cortarlos DESPUÉS de tener la señal entera.
  const cortes: Array<{ metros: number; t: number; skm: number | null; ppm: number; ciego: boolean }> = [];

  for (const paso of guion) {
    const dur = duracionDe(paso);
    if (paso.papel !== 'suelto') {
      if (paso.papel === 'trabajo') nTrabajo += 1;
      repeticiones.push({
        n: nTrabajo,
        papel: paso.papel,
        modo: paso.modo,
        inicioS: t,
        duracionS: dur,
        distanciaM: paso.distanciaM ?? (paso.skm != null ? Math.round((dur / paso.skm) * 1000) : null),
        // Con rampa, el ritmo del tramo es su media — no el de la primera muestra.
        ritmoSkm: paso.skm == null ? null : (paso.skm + (paso.skmFin ?? paso.skm)) / 2,
        fcMediaPpm: paso.ppm,
        pendientePct: paso.pendientePct ?? null,
      });
    }

    for (let d = 0; d < dur; d += CADA_S) {
      const base = paso.skm == null ? null : paso.skm + ((paso.skmFin ?? paso.skm) - paso.skm) * (d / Math.max(1, dur));
      const onda = (periodo: number) => Math.sin((2 * Math.PI * t) / periodo);
      const skm =
        base == null
          ? null
          : base +
            (onda(RUIDO_RAPIDO_PERIODO_S) * RUIDO_RAPIDO_SKM + onda(RUIDO_LENTO_PERIODO_S) * RUIDO_LENTO_SKM) *
              escalaRuido;
      // La onda del pulso se suma FUERA del filtro: metida dentro, la inercia la
      // realimenta y el ±1,5 ppm que sale se dibuja como una lima sobre un eje
      // de 25 ppm. Un pulso ondula despacio, no vibra.
      ppm += (paso.ppm - ppm) * INERCIA_PULSO;
      const latido = Math.round(ppm + onda(PULSO_PERIODO_S) * PULSO_ONDA_PPM);
      if (skm != null) metros += (CADA_S / skm) * 1000;

      // El hueco NO emite muestras. Ni ritmo ni pulso: la carrera siguió, el
      // archivo no. Rellenarlo sería fabricar dato (DECISIONS, 11-ago).
      if (!paso.sinSenal) {
        if (skm != null) ritmo.push({ t, v: skm });
        pulso.push({ t, v: latido });
        const z = zonaDe(latido);
        if (z) zonasS[`z${z}`] = (zonasS[`z${z}`] ?? 0) + CADA_S;
      }

      cortes.push({ metros, t, skm, ppm: latido, ciego: paso.sinSenal === true });

      if (conRuta && skm != null) {
        // Rumbo con dos giros lentos: sale un recorrido de calle —curvas largas,
        // alguna vuelta— y no el nudo que deja una deriva rápida.
        rumbo += Math.sin(t / 210) * 0.05 + Math.sin(t / 640) * 0.03;
        const avance = (CADA_S / skm) * 1000;
        px += Math.cos(rumbo) * avance;
        py += Math.sin(rumbo) * avance;
        crudo.push({ x: px, y: py, skm });
      }

      t += CADA_S;
    }
  }

  return {
    traza: { ritmo, pulso },
    repeticiones,
    kilometros: cortarKilometros(cortes),
    zonasS,
    distanciaM: Math.round(metros),
    duracionS: t,
    fcMediaPpm: Math.round(pulso.reduce((a, m) => a + m.v, 0) / Math.max(1, pulso.length)),
    fcMaxPpm: pulso.reduce((a, m) => Math.max(a, m.v), 0),
    ruta: conRuta ? normalizarRuta(crudo) : [],
  };
}

/**
 * Los kilómetros se DERIVAN, nunca se guardan. El corte es el instante en que la
 * distancia cruza cada múltiplo de 1000 m; el último es PARCIAL con su distancia
 * real, jamás redondeada. Un kilómetro que atraviesa un hueco de señal no
 * recibe un ritmo interpolado: se declara sin cobertura.
 */
function cortarKilometros(
  cortes: Array<{ metros: number; t: number; skm: number | null; ppm: number; ciego: boolean }>,
): Kilometro[] {
  const kms: Kilometro[] = [];
  let desde = 0;
  let n = 1;
  const cerrar = (hasta: number, distanciaM: number, parcial: boolean) => {
    const ventana = cortes.slice(desde, hasta + 1);
    const conRitmo = ventana.filter((c) => c.skm != null && !c.ciego);
    const ciego = ventana.some((c) => c.ciego);
    kms.push({
      n,
      parcial,
      distanciaM,
      cruceS: cortes[hasta]?.t ?? 0,
      ritmoSkm: ciego || conRitmo.length === 0 ? null : conRitmo.reduce((a, c) => a + c.skm!, 0) / conRitmo.length,
      fcMediaPpm: ciego || ventana.length === 0 ? null : Math.round(ventana.reduce((a, c) => a + c.ppm, 0) / ventana.length),
      sinCobertura: ciego ? 'sin señal' : null,
    });
    n += 1;
    desde = hasta;
  };

  for (let i = 0; i < cortes.length; i += 1) {
    if (cortes[i]!.metros >= n * 1000) cerrar(i, 1000, false);
  }
  const ultimo = cortes[cortes.length - 1];
  const cola = ultimo ? ultimo.metros - (n - 1) * 1000 : 0;
  // La cola se enseña a partir de 80 m: por debajo son metros de frenada y una
  // fila que dice «0,03 km» no es información, es ruido.
  if (ultimo && cola >= 80) cerrar(cortes.length - 1, Math.round(cola), true);
  return kms;
}

/** Encaja el trazo en un lienzo 1×0,62 sin deformarlo, y le pone su zona. */
function normalizarRuta(crudo: Array<{ x: number; y: number; skm: number | null }>): PuntoRuta[] {
  if (crudo.length < 2) return [];
  const xs = crudo.map((p) => p.x);
  const ys = crudo.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const ancho = Math.max(...xs) - minX || 1;
  const alto = Math.max(...ys) - minY || 1;
  const escala = Math.min(1 / ancho, 0.62 / alto);
  const dx = (1 - ancho * escala) / 2;
  const dy = (0.62 - alto * escala) / 2;
  // Uno de cada cuatro: 400 puntos en 378 pt de ancho no añaden nada al ojo.
  //
  // Y REDONDEADO A LA MILÉSIMA, que no es cosmética: un `y` de
  // 21.715382023356458 lo escribe el servidor con un dígito más que el cliente y
  // React canta un fallo de hidratación en consola por cada punto de la ruta.
  // Con tres decimales sobre un lienzo de 0..1 la coordenada es exacta en los
  // dos lados y sigue sobrando precisión para 378 pt de ancho.
  const mil = (v: number) => Math.round(v * 1000) / 1000;
  return crudo
    .filter((_, i) => i % 4 === 0)
    .map((p) => ({
      x: mil((p.x - minX) * escala + dx),
      y: mil((p.y - minY) * escala + dy),
      zona: zonaDeRitmo(p.skm),
    }));
}

/** Un tramo que no es ni serie ni recuperación: calentamiento, vuelta a la calma
 *  o el cuerpo de un rodaje. Con `skmFin` el ritmo deriva a lo largo del paso. */
export const suelto = (dur: number, skm: number, ppm: number, skmFin?: number): Paso => ({
  papel: 'suelto',
  dur,
  skm,
  skmFin,
  ppm,
});
