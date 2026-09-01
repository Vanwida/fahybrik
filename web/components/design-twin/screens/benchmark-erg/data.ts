// Datos del benchmark de remo — atleta de ejemplo, todo coherente entre sí.
//
// Nada aquí es aleatorio. La pieza es una CURVA FIJA de ritmo por segundo y el
// resto de métricas se DERIVAN de ella con las relaciones que ya usa la app
// (vatios = 2,80 / (ritmo por metro)³ — ErgHUDContent.avgWatts), así los números
// del HUD no pueden contradecirse entre sí ni cambiar entre reproducciones.

/** La marca que se va a batir (#Marcas → MarkView). */
export const MARCA = {
  slug: 'row_500m',
  label: 'Remo 500 m',
  /** MarkResult.value — el PR en segundos. La app lo PINTA redondeado ("1:52"). */
  prSegundos: 112.4,
  prRelativo: 'hace 3 semanas',
  distanciaM: 500,
} as const;

/**
 * El objetivo de ritmo del intento, calculado como BenchmarkLaunch.paceTargetSeconds:
 * para un erg, best × 500 / distancia, redondeado. Un benchmark es a tope, así que
 * el objetivo honesto es el PR del propio atleta — "a batir".
 */
export const OBJETIVO_S_500 = Math.round((MARCA.prSegundos * 500) / MARCA.distanciaM);

/**
 * LiveTramo del benchmark: "Remo" es el gesto (label), "500 m" es lo que mide
 * (workLine) — el mismo par que ErgHUDContent enseña en su cabecera, su cuenta
 * atrás y su cuerpo sin monitor. No es MARCA.label ("Remo 500 m"): esa cadena es
 * la ficha de la marca, no la voz del tramo en vivo.
 */
export const TRAMO_LABEL = 'Remo';
export const TRAMO_WORK_LINE = `${MARCA.distanciaM} m`;
/** `sinLecturaMotivo` de ErgHUDContent — por qué un raíl no tiene número aún. */
export const SIN_LECTURA_MOTIVO = 'esperando la primera palada';

/** Historial de la marca, del más reciente al más antiguo (MarkView.history). */
export interface FilaHistorial {
  relativo: string;
  /** historyTag(result) — de dónde salió la marca, en cristiano. */
  tag: string;
  segundos: number;
}

export const HISTORIAL: readonly FilaHistorial[] = [
  { relativo: 'hace 3 semanas', tag: 'te probaste', segundos: 112.4 },
  { relativo: 'hace 2 meses', tag: 'test del coach', segundos: 115.1 },
  { relativo: 'hace 5 meses', tag: 'lo dijiste tú', segundos: 121.0 },
];

/** El monitor que aparece al escanear. La app muestra el ID del serial. */
export const PM5 = {
  nombre: 'PM5 430512345',
  serial: '430512345',
} as const;

/** Umbral (LTHR) del atleta de ejemplo — de él salen las zonas, como en la app. */
export const UMBRAL_BPM = 168;

/** Tiempos del guion, en ms. Uno solo por cosa para poder afinarlos de un vistazo. */
export const TIEMPOS = {
  /** Escaneo BLE hasta que aparece el primer erg. */
  escaneoMs: 2500,
  /** Reescaneo al volver tras una caída: el erg ya está cerca y sale antes. */
  reescaneoMs: 1200,
  /** Envío CSAFE de la pieza al monitor (limpio). */
  programarMs: 700,
  /** Monitor sucio: terminate + program, dos tramas en vez de una. */
  programarSucioMs: 1600,
  /** 3-2-1 de WorkoutSession.countInSeconds. */
  countInS: 3,
  /** Segundo de la pieza en el que se cae el enlace (≈40 %). */
  caidaEnS: 45,
} as const;

// ---------------------------------------------------------------------------
// La pieza: 500 m a ritmo de PR, tramo a tramo
// ---------------------------------------------------------------------------

interface TramoRitmo {
  /** Segundo (excluido) hasta el que manda este ritmo. */
  hasta: number;
  /** s/500m. */
  ritmo: number;
  /** Paladas por minuto sostenidas en el tramo. */
  spm: number;
}

/** Salida fuerte → asentar → apretar el último cuarto. Un 500 m de verdad. */
const TRAMOS: readonly TramoRitmo[] = [
  { hasta: 6, ritmo: 100, spm: 44 },
  { hasta: 15, ritmo: 108, spm: 38 },
  { hasta: 35, ritmo: 113, spm: 34 },
  { hasta: 75, ritmo: 112, spm: 33 },
  { hasta: 95, ritmo: 111, spm: 34 },
  { hasta: 105, ritmo: 109, spm: 36 },
  { hasta: Number.POSITIVE_INFINITY, ritmo: 101, spm: 39 },
];

function tramoEn(segundo: number): TramoRitmo {
  return TRAMOS.find((t) => segundo < t.hasta) ?? TRAMOS[TRAMOS.length - 1];
}

/** Ritmo instantáneo (s/500m) en el segundo dado. */
export function ritmoEn(segundo: number): number {
  return tramoEn(segundo).ritmo;
}

/** Paladas por minuto en el segundo dado. */
export function spmEn(segundo: number): number {
  return tramoEn(segundo).spm;
}

const MAX_S = 200;

/** Metros acumulados al final de cada segundo, integrando 500/ritmo. */
const ACUMULADO: readonly number[] = (() => {
  const out: number[] = [0];
  for (let i = 0; i < MAX_S; i += 1) out.push(out[i] + 500 / ritmoEn(i));
  return out;
})();

/** Metros cubiertos tras `segundo` segundos de pieza. */
export function metrosEn(segundo: number): number {
  const i = Math.max(0, Math.min(MAX_S, Math.floor(segundo)));
  return ACUMULADO[i];
}

/** Tiempo exacto (con decimales) en el que la pieza cruza los 500 m. */
export const TIEMPO_FINAL_S = (() => {
  const i = ACUMULADO.findIndex((m) => m >= MARCA.distanciaM);
  if (i <= 0) return 0;
  const previo = ACUMULADO[i - 1];
  return i - 1 + (MARCA.distanciaM - previo) / (ACUMULADO[i] - previo);
})();

/** El segundo del tick en el que el HUD ya canta la pieza completada. */
export const SEGUNDO_FINAL = Math.ceil(TIEMPO_FINAL_S);

/** Ritmo MEDIO a los `segundo` segundos: el tiempo por 500 m sostenido hasta ahí. */
export function ritmoMedioEn(segundo: number): number | null {
  const m = metrosEn(segundo);
  if (segundo <= 0 || m <= 0) return null;
  return (500 * segundo) / m;
}

/**
 * Vatios desde el ritmo, con la relación publicada por Concept2 que la app ya
 * usa para los vatios medios: W = 2,80 / (segundos por metro)³.
 */
export function vatiosDesdeRitmo(ritmoS500: number): number {
  const porMetro = ritmoS500 / 500;
  return Math.round(2.8 / porMetro ** 3);
}

/**
 * Cal/h desde vatios, con la fórmula publicada por Concept2. El HUD de esta
 * pantalla ya no la pinta (rail de 3 tiles), pero la consumen los guiones de
 * `vivo-amrap` y `vivo-emom` — no es código muerto.
 */
export function calPorHoraDesdeVatios(vatios: number): number {
  return Math.round(vatios * 4 * 0.8604 + 300);
}

/** Pulso: sube de reposo alto a casi máximo hacia el final de la pieza. */
export function pulsoEn(segundo: number): number {
  const subida = Math.min(1, segundo / 95) ** 0.75;
  return Math.round(118 + 60 * subida);
}

// ---------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------

/**
 * El reloj de tiempo transcurrido de la app — WorkoutSession.formatElapsed, que
 * SÍ rellena los minutos con cero ("01:50"). `fmtClock` de sim.ts no lo hace
 * (es el formato de los splits, "1:50"), por eso este vive aquí.
 */
export function fmtElapsed(segundos: number): string {
  const total = Math.round(Math.max(0, segundos));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const dosDigitos = (n: number) => String(n).padStart(2, '0');
  if (total >= 3600) return `${h}:${dosDigitos(m)}:${dosDigitos(s)}`;
  return `${dosDigitos(m)}:${dosDigitos(s)}`;
}

/** MarkFormat.clock — el valor de una marca ("1:52"). */
export function fmtMarca(segundos: number): string {
  const total = Math.max(0, Math.round(segundos));
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** MarkFormat.delta — "−3 s" / "+2 s", orientado a que verde = mejor. */
export function fmtDeltaMarca(previo: number, nuevo: number): { label: string; mejora: boolean } | null {
  const diff = nuevo - previo;
  if (Math.abs(diff) < 0.5) return null;
  return {
    label: `${diff > 0 ? '+' : '−'}${Math.round(Math.abs(diff))} s`,
    // Todas las marcas de remo son de tiempo: menos es mejor.
    mejora: diff < 0,
  };
}
