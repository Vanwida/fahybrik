// (1) LA LÁMINA DE CORRER — rodaje y serie de calle, UNA sola cara.
//
// ── QUÉ CAMBIÓ, Y POR QUÉ ESTA VISTA SE REHIZO (FH-30) ─────────────────────
// Esta pantalla era cuatro páginas de métricas —pulso, ritmo, distancia,
// tiempo—: el reloj enseñaba TODO lo que mide y dejaba al atleta la resta. La
// lámina invierte eso. Corriendo sólo hay una pregunta —«¿cuánto me falta?»—
// así que el sujeto es LO QUE FALTA de la pieza en curso, el ritmo baja al
// segundo nivel y el resto de las medidas se van a su propia página (`datos`).
// El pager de la app es Datos | Vivo | Controles, y el vivo —esto— es el que
// se mira corriendo.
//
// ── Y LA MISMA CARA SIRVE LAS DOS COSAS ────────────────────────────────────
// Rodaje y serie de calle no son dos pantallas: son la MISMA con otro sujeto.
// En un rodaje la pieza es el rodaje entero; en una serie, la serie. Lo único
// que cambia es de qué se resta y qué dice el contexto. Y lo mismo vale con el
// móvil conectado: el reloj en espejo pinta esta lámina, no una pantalla
// genérica — es lo que FH-30 cerró (`RodajeLamina` decide, las dos vistas
// pintan).
//
// ── QUÉ MIDE EL RELOJ AQUÍ ─────────────────────────────────────────────────
// Todo lo suyo: pulso, ritmo y distancia. Con una excepción, y es el escenario
// mínimo: hasta que el GPS no fija no hay ritmo ni distancia. No se pintan a
// cero —un «0,00 km» es un dato falso con cara de medida (§7)—: el sujeto cae
// al crono de la pieza y la nota dice por qué.
//
// ── QUÉ PUEDE HACER EL ATLETA ──────────────────────────────────────────────
// Corriendo, nada: `ojeada` de principio a fin, ni una acción anunciada. En la
// RECUPERACIÓN sí — ahí está parado o trotando y puede salir antes de tiempo,
// así que la fase cambia a `mando` y la única decisión del entreno se anuncia:
// «toca · empezar ya».

import {
  NOTA,
  clock,
  countdown,
  distanciaMedida,
  pace,
  unidadDistancia,
  W,
  type PaginaReloj,
} from '../../kit-watch';
import { RODAJE, SERIES_CALLE } from '../../datos-reloj';

// ---------------------------------------------------------------------------
// La ventana — el dato plano del que sale la lámina (espejo de RodajeLamina)
// ---------------------------------------------------------------------------

export interface Ventana {
  /** La pieza es un tramo de una carrera estructurada, no un rodaje de corrido. */
  esSerie: boolean;
  enRecupera: boolean;
  /** Calle: al aire libre, sin señal se dice. En cinta nunca. */
  esCalle: boolean;
  /** Metros MEDIDOS de la pieza. `null` = nadie los ha contado todavía. */
  metros: number | null;
  objetivoMetros: number | null;
  objetivoSegundos: number | null;
  segundosPieza: number;
  /** Lo que queda de la recuperación cuando la cierra un reloj. */
  quedaRecupera: number | null;
  ritmoSecKm: number | null;
  /** El veredicto del motor sobre el ritmo prescrito, ya juzgado. */
  enObjetivo: boolean;
  serieN: number;
  serieTotal: number;
  /** Lo que viene después de la recuperación, ya redactado. */
  siguiente: string | null;
}

/** Por debajo de esto un ritmo no describe un esfuerzo: describe un GPS fijando. */
const METROS_MIN_RITMO = 10;

interface Medida {
  sujeto: string;
  unidad?: string;
  /** El sujeto es lo que FALTA (y no lo que llevas). */
  quedan: boolean;
  sinSenal: boolean;
}

/**
 * LO QUE FALTA DE LA PIEZA, por orden de evidencia: los metros si hay hito y
 * alguien los mide, el reloj si lo cierra un reloj, y lo que llevas si no lo
 * cierra ninguno de los dos. El objetivo prescrito NUNCA hace de medida — así
 * es como un 5×500 enseñaba «500 m hechos» antes de la primera muestra.
 */
export function medida(v: Ventana): Medida {
  const hayGps = v.metros != null;
  const sinSenal = v.esCalle && !hayGps;

  if (v.objetivoMetros != null && v.objetivoMetros > 0) {
    if (v.metros == null) {
      return { sujeto: clock(v.segundosPieza), quedan: false, sinSenal };
    }
    const faltan = Math.max(0, v.objetivoMetros - v.metros);
    // En una serie los metros se cuentan enteros: son cientos, no kilómetros.
    if (v.esSerie) {
      return { sujeto: String(Math.ceil(faltan)), unidad: 'm', quedan: true, sinSenal: false };
    }
    return {
      sujeto: distanciaMedida(faltan),
      unidad: unidadDistancia(faltan),
      quedan: true,
      sinSenal: false,
    };
  }

  if (v.objetivoSegundos != null && v.objetivoSegundos > 0) {
    return {
      sujeto: countdown(Math.max(0, v.objetivoSegundos - v.segundosPieza)),
      quedan: true,
      sinSenal: sinSenal,
    };
  }

  return { sujeto: clock(v.segundosPieza), quedan: false, sinSenal };
}

/** El ritmo, con el suelo de honestidad puesto: sin metros suficientes, nada. */
export function ritmoDe(v: Ventana): string | null {
  if (v.ritmoSecKm == null || v.ritmoSecKm <= 0) return null;
  if (v.metros == null || v.metros < METROS_MIN_RITMO) return null;
  return `${pace(v.ritmoSecKm)}/km`;
}

// ---------------------------------------------------------------------------
// La lámina — una página, tres estados
// ---------------------------------------------------------------------------

export interface Gestos {
  /** Sólo existe en la recuperación: salir antes de que el reloj la agote. */
  empezarYa: () => void;
}

export function paginas(v: Ventana, g?: Gestos): PaginaReloj[] {
  const m = medida(v);
  const ritmo = ritmoDe(v);

  // RODAJE DE CORRIDO. Sin decisión dentro: se mira y no se toca.
  if (!v.esSerie) {
    // Sin señal el sujeto es el crono, así que el contexto dice «llevas»: sólo
    // se promete «te quedan» cuando hay de qué restar.
    const contexto = m.quedan && !m.sinSenal ? 'rodaje · te quedan' : 'rodaje · llevas';
    return [
      {
        id: 'vivo',
        contexto,
        modo: 'ojeada',
        sujeto: { texto: m.sujeto, unidad: m.unidad },
        // Sin señal no hay ritmo que pintar, y la nota dice por qué.
        segundo: m.sinSenal || ritmo == null ? undefined : { etiqueta: 'ritmo', valor: ritmo },
        nota: m.sinSenal ? NOTA.sinSenal : undefined,
      },
    ];
  }

  // LA RECUPERACIÓN. Aquí sí se decide: el reloj la agota solo, pero el atleta
  // puede salir antes — y esa es la única acción de toda la vista.
  if (v.enRecupera) {
    const viene = Math.max(1, Math.min(v.serieTotal, v.serieN + 1));
    return [
      {
        id: 'recupera',
        contexto: `recupera · viene la ${viene}`,
        modo: 'mando',
        sujeto: sujetoRecupera(v, m),
        // El segundo nivel de la recuperación NO es el ritmo: es lo que viene.
        // Trotando no se hace ninguna otra pregunta.
        segundo: v.siguiente == null ? undefined : { etiqueta: 'luego', valor: v.siguiente },
        accion: { etiqueta: 'toca · empezar ya', onToca: () => g?.empezarYa() },
      },
    ];
  }

  // LA SERIE. Lo que falta de ESTA, y el veredicto del ritmo si hay uno.
  const veredicto = v.enObjetivo ? 'en objetivo' : null;
  const base = `serie ${v.serieN} de ${v.serieTotal}`;
  return [
    {
      id: 'serie',
      contexto: m.quedan ? `${base} · te quedan` : base,
      modo: 'ojeada',
      sujeto: { texto: m.sujeto, unidad: m.unidad },
      segundo:
        m.sinSenal || ritmo == null
          ? undefined
          : { etiqueta: veredicto ?? 'ritmo', valor: ritmo, tono: veredicto ? W.ink : undefined },
      nota: m.sinSenal ? NOTA.sinSenal : undefined,
    },
  ];
}

/**
 * EL SUJETO DE LA RECUPERACIÓN, por orden de evidencia: si la serie iba por
 * metros y nadie los midió, lo que dijera la medida; si la cierra un reloj, lo
 * que queda, en verde; y si no la cierra nadie, lo que llevas trotando.
 */
function sujetoRecupera(v: Ventana, m: Medida): PaginaReloj['sujeto'] {
  if (v.objetivoMetros != null && v.metros == null) {
    return { texto: m.sujeto, unidad: m.unidad };
  }
  if (v.objetivoSegundos != null && v.objetivoSegundos > 0) {
    const queda = v.quedaRecupera ?? Math.max(0, v.objetivoSegundos - v.segundosPieza);
    return { texto: countdown(queda), tono: W.zoneGreen };
  }
  return { texto: clock(v.segundosPieza), tono: W.zoneGreen };
}

// ---------------------------------------------------------------------------
// La reproducción — el rodaje y la serie, con datos reales
// ---------------------------------------------------------------------------

export type Escena = 'rodaje' | 'serie';

export interface Estado {
  escena: Escena;
  /** ¿Ha fijado el GPS? Sin fijar no hay ritmo ni distancia. */
  gps: boolean;
  /** En la serie: trabajando o recuperando. */
  recupera: boolean;
  /** La serie en curso (1…5). */
  serie: number;
  /** Segundos dentro de la pieza. */
  t: number;
}

/** Los metros por segundo del rodaje: 1.000 m cada 312 s. */
export const VELOCIDAD_MS = 1000 / RODAJE.ritmoSecKm;

/** 10.000 m a 5:12/km son 52:00 — lo que dura el rodaje entero. */
export const DURACION_S = Math.round((RODAJE.distanciaM / 1000) * RODAJE.ritmoSecKm);

/** El segundo en el que arranca la reproducción: el metro 5.240, a mitad. */
export const DESDE_S = Math.round(RODAJE.desdeM / VELOCIDAD_MS);

/** Los metros de la serie: 4,0 m/s, el ritmo real de este atleta (4:10/km). */
export const SERIE_VELOCIDAD_MS = SERIES_CALLE.velocidadMs;

/** El segundo de la serie en el que arranca: 780 m dentro de los 1.200. */
export const SERIE_DESDE_S = Math.round(780 / SERIE_VELOCIDAD_MS);

function transcurrido(t: number, tope: number): number {
  return Math.min(Math.max(0, t), tope);
}

export function metrosDe(e: Estado): number {
  if (e.escena === 'rodaje') return transcurrido(e.t, DURACION_S) * VELOCIDAD_MS;
  return e.t * SERIE_VELOCIDAD_MS;
}

/**
 * El pulso deriva despacio a lo largo de la pieza: 150 → 158 en el rodaje (los
 * dos únicos valores que dejó la ejecución 145), 138 → 178 en la serie (los de
 * la 104). No se inventa una tercera cifra entre medias.
 */
export function bpmDe(e: Estado): number {
  if (e.escena === 'rodaje') {
    return Math.round(
      RODAJE.fcMedia + (RODAJE.fcMax - RODAJE.fcMedia) * (transcurrido(e.t, DURACION_S) / DURACION_S),
    );
  }
  const avance = (e.serie - 1) / Math.max(1, SERIES_CALLE.total - 1);
  return Math.round(SERIES_CALLE.fcDesde + (SERIES_CALLE.fcHasta - SERIES_CALLE.fcDesde) * avance);
}

/** El estado de la reproducción, traducido a la ventana que lee la lámina. */
export function ventanaDe(e: Estado): Ventana {
  if (e.escena === 'rodaje') {
    return {
      esSerie: false,
      enRecupera: false,
      esCalle: true,
      metros: e.gps ? metrosDe(e) : null,
      objetivoMetros: e.gps ? RODAJE.distanciaM : null,
      objetivoSegundos: null,
      segundosPieza: transcurrido(e.t, DURACION_S),
      quedaRecupera: null,
      ritmoSecKm: RODAJE.ritmoSecKm,
      enObjetivo: false,
      serieN: 1,
      serieTotal: 1,
      siguiente: null,
    };
  }
  const metros = metrosDe(e);
  return {
    esSerie: true,
    enRecupera: e.recupera,
    esCalle: true,
    metros: e.recupera ? null : metros,
    objetivoMetros: e.recupera ? null : SERIES_CALLE.objetivoM,
    objetivoSegundos: e.recupera ? SERIES_CALLE.recuperacionS : null,
    segundosPieza: e.t,
    quedaRecupera: e.recupera ? Math.max(0, SERIES_CALLE.recuperacionS - e.t) : null,
    ritmoSecKm: e.recupera ? null : SERIES_CALLE.ritmoSecKm,
    // El ritmo real de la serie (4:10/km) contra el prescrito: en banda.
    enObjetivo: !e.recupera,
    serieN: e.serie,
    serieTotal: SERIES_CALLE.total,
    siguiente: `${SERIES_CALLE.objetivoM} m`,
  };
}

// ---------------------------------------------------------------------------
// Los casos que esta vista puede alcanzar — los recorre `kit-watch.test.ts`
// ---------------------------------------------------------------------------

function caso(nombre: string, e: Estado) {
  return { nombre, paginas: paginas(ventanaDe(e)) };
}

export const CASOS = [
  caso('rodaje · sin señal', { escena: 'rodaje', gps: false, recupera: false, serie: 1, t: 0 }),
  caso('rodaje · a mitad', { escena: 'rodaje', gps: true, recupera: false, serie: 1, t: DESDE_S }),
  // Al salir, el sujeto más ancho de la vista: «10,00 km» por cubrir. Si algo
  // de este rodaje no cabe, cae aquí.
  caso('rodaje · al salir', { escena: 'rodaje', gps: true, recupera: false, serie: 1, t: 0 }),
  caso('serie · en marcha', {
    escena: 'serie',
    gps: true,
    recupera: false,
    serie: SERIES_CALLE.actual,
    t: SERIE_DESDE_S,
  }),
  caso('serie · recuperando', {
    escena: 'serie',
    gps: true,
    recupera: true,
    serie: SERIES_CALLE.actual,
    t: 18,
  }),
] as const;
