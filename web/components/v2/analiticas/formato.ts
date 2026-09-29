// UN FORMATEADOR POR UNIDAD — el servidor manda el número y su unidad (modelo
// §5: «el cliente decide cómo se escribe»), y AQUÍ se decide cómo se escribe
// cada una, una sola vez, sobre los canónicos de `@/lib/formato` (CONTRATO-UI
// §2: nada de un segundo `reloj` ni de un `toFixed` suelto en una pantalla).
//
// Lo usan la pestaña Rendimiento del coach y el doble (`kit-analiticas/fmt.ts`
// lo reexporta): una sola grafía por unidad en las dos superficies web.
//
// LAS UNIDADES QUE LLEGAN. Las del contrato (`Unidad` de shared) más las que
// traen los bloques que otras sesiones están construyendo sobre el mismo sobre
// (puntos porcentuales, RPE, RIR, series, rondas, tramos, la bici por 1000 m,
// cadencias, un salto en cm): se escriben ya aquí para que el día que lleguen
// se lean bien sin tocar la pantalla. Una unidad que nadie conoce cae a un
// entero con millar — nunca a «undefined».
//
// Puro.

import type { Unidad } from '@fahybrid/shared/domain/analytics/lectura';
import { conMillar, esDecimal, fechaCorta, horasYMin, kg, reloj, ritmo500, ritmoKm } from '@/lib/formato';

export { conMillar, esDecimal, fechaCorta, horasYMin, reloj };

/**
 * Lo que un pintor puede recibir como unidad: las del contrato, las que añaden
 * los bloques en construcción y las del vocabulario de la propuesta del doble
 * (`w`, `tss_dia`, `semanas`), que se escriben igual que sus hermanas.
 */
export type UnidadPintable =
  | Unidad
  | 'pp'
  | 'rpe'
  | 'rir'
  | 'series'
  | 'rondas'
  | 'tramos'
  | 's_1000m'
  | 'spm'
  | 'rpm'
  | 'cm'
  | 'w'
  | 'tss_dia'
  | 'semanas';

/** Un entero con signo tipográfico cuando es negativo: «−4», «51», «1.234». */
export function entero(v: number): string {
  const r = Math.round(v);
  return r < 0 ? `−${conMillar(-r)}` : conMillar(r);
}

/** Un entero con signo SIEMPRE (la frescura se lee alrededor de cero): «+22», «−4», «0». */
export function conSigno(v: number): string {
  const r = Math.round(v);
  return r > 0 ? `+${conMillar(r)}` : r < 0 ? `−${conMillar(-r)}` : '0';
}

function decimalCorto(v: number, decimales: number): string {
  return Number.isInteger(v) ? String(v) : esDecimal(v, decimales);
}

/** El valor con su unidad, como se lee en una celda: «4:12/km», «63 ms», «7,3 h», «132 kg». */
export function formatear(valor: number, unidad: UnidadPintable): string {
  switch (unidad) {
    case 's_km':
      return ritmoKm(valor);
    case 's_500m':
      return ritmo500(valor);
    case 's_1000m':
      return `${reloj(valor)}/1000m`;
    case 'segundos':
      return reloj(valor);
    case 'horas':
      return `${esDecimal(valor, 1)} h`;
    case 'ms':
      return `${Math.round(valor)} ms`;
    case 'bpm':
      return `${Math.round(valor)} ppm`;
    case 'kg':
      return kg(Math.round(valor * 10) / 10);
    case 'metros':
      return valor >= 1000 ? `${valor % 1000 === 0 ? valor / 1000 : esDecimal(valor / 1000, valor >= 10000 ? 0 : 1)} km` : `${Math.round(valor)} m`;
    case 'm_s':
      return `${esDecimal(valor, 2)} m/s`;
    case 'pct':
      return `${Math.round(valor)} %`;
    case 'pp':
      return `${entero(valor)} pts`;
    case 'ratio':
      return esDecimal(valor, 2);
    case 'ml_kg_min':
      return esDecimal(valor, 1);
    case 'watts':
    case 'w':
      return `${Math.round(valor)} W`;
    case 'rpm':
      return `${Math.round(valor)} rpm`;
    case 'spm':
      return `${Math.round(valor)} pal/min`;
    case 'rir':
      return `RIR ${decimalCorto(valor, 1)}`;
    case 'rpe':
      return `RPE ${decimalCorto(valor, 1)}`;
    case 'reps':
      return `${Math.round(valor)} reps`;
    case 'series':
      return `${Math.round(valor)} series`;
    case 'rondas':
      return `${decimalCorto(Math.round(valor * 10) / 10, 1)} rondas`;
    case 'tramos':
      return `${Math.round(valor)} tramos`;
    case 'kcal':
      return `${conMillar(valor)} kcal`;
    case 'sesiones':
      return `${Math.round(valor)} ${Math.round(valor) === 1 ? 'sesión' : 'sesiones'}`;
    case 'dias':
      return `${Math.round(valor)} ${Math.round(valor) === 1 ? 'día' : 'días'}`;
    case 'semanas':
      return `${Math.round(valor)} sem`;
    case 'cm':
      return `${decimalCorto(Math.round(valor * 10) / 10, 1)} cm`;
    case 'tss':
    case 'tss_dia':
    case 'tss_semana':
    case 'puntos':
      return entero(valor);
    default:
      return entero(valor);
  }
}

/** Solo la cifra, para cuando la unidad la pinta el layout aparte (una cifra grande y su unidad al lado). */
export function cifra(valor: number, unidad: UnidadPintable): string {
  switch (unidad) {
    case 's_km':
    case 's_500m':
    case 's_1000m':
    case 'segundos':
      return reloj(valor);
    case 'horas':
      return esDecimal(valor, 1);
    case 'ratio':
      return esDecimal(valor, 2);
    case 'ml_kg_min':
      return esDecimal(valor, 1);
    case 'm_s':
      return esDecimal(valor, 2);
    case 'kg':
      return decimalCorto(Math.round(valor * 10) / 10, 1);
    case 'rondas':
    case 'cm':
    case 'rir':
    case 'rpe':
      return decimalCorto(Math.round(valor * 10) / 10, 1);
    case 'metros':
      return valor >= 1000 ? esDecimal(valor / 1000, valor >= 10000 ? 0 : 1) : String(Math.round(valor));
    default:
      return entero(valor);
  }
}

/** La unidad como sufijo corto, para pegarla a la cifra. Vacía cuando la cifra no la necesita (una carga, unos puntos). */
export function unidadCorta(unidad: UnidadPintable, valor?: number): string {
  switch (unidad) {
    case 's_km':
      return '/km';
    case 's_500m':
      return '/500m';
    case 's_1000m':
      return '/1000m';
    case 'horas':
      return 'h';
    case 'ms':
      return 'ms';
    case 'bpm':
      return 'ppm';
    case 'kg':
      return 'kg';
    case 'metros':
      return valor != null && valor < 1000 ? 'm' : 'km';
    case 'm_s':
      return 'm/s';
    case 'pct':
      return '%';
    case 'pp':
      return 'pts';
    case 'watts':
    case 'w':
      return 'W';
    case 'rpm':
      return 'rpm';
    case 'spm':
      return 'pal/min';
    case 'reps':
      return 'reps';
    case 'series':
      return 'series';
    case 'rondas':
      return 'rondas';
    case 'tramos':
      return 'tramos';
    case 'kcal':
      return 'kcal';
    case 'sesiones':
      return valor === 1 ? 'sesión' : 'sesiones';
    case 'dias':
      return valor === 1 ? 'día' : 'días';
    case 'semanas':
      return 'sem';
    case 'ml_kg_min':
      return 'ml/kg/min';
    case 'cm':
      return 'cm';
    case 'rir':
      return 'RIR';
    case 'rpe':
      return 'RPE';
    default:
      return '';
  }
}

/** Cuántos decimales tiene el delta de una unidad al escribirse (para decir «igual» y no «−0,0 h»). */
function decimalesDelta(unidad: UnidadPintable): number {
  switch (unidad) {
    case 'horas':
    case 's_500m':
    case 's_1000m':
    case 'ml_kg_min':
    case 'kg':
    case 'rondas':
    case 'rir':
    case 'rpe':
    case 'cm':
      return 1;
    case 'ratio':
    case 'm_s':
      return 2;
    default:
      return 0;
  }
}

/** ¿El delta es cero una vez escrito con la precisión de su unidad? Entonces se dice «igual». */
export function esCero(delta: number, unidad: UnidadPintable): boolean {
  const d = decimalesDelta(unidad);
  return Math.round(Math.abs(delta) * 10 ** d) === 0;
}

/**
 * El delta con signo tipográfico y en la unidad que lo juzga: «−4 s/km»,
 * «+3 ms», «+2,5 kg», «+0,3 h», «+12 %». Sobre segundos se escribe en
 * segundos, nunca en formato reloj por debajo del minuto: «−0:04» no lo lee
 * nadie. `pct` es un cambio RELATIVO (así lo calcula `comparacionDe`); `pp`,
 * la diferencia entre dos porcentajes.
 */
export function formatearDelta(delta: number, unidad: UnidadPintable): string {
  const signo = delta > 0 ? '+' : delta < 0 ? '−' : '±';
  const abs = Math.abs(delta);
  switch (unidad) {
    case 's_km':
      return `${signo}${Math.round(abs)} s/km`;
    case 's_500m':
      return `${signo}${esDecimal(abs, 1)} s/500m`;
    case 's_1000m':
      return `${signo}${esDecimal(abs, 1)} s/1000m`;
    case 'segundos':
      return abs >= 60 ? `${signo}${reloj(abs)}` : `${signo}${Math.round(abs)} s`;
    case 'horas':
      return `${signo}${esDecimal(abs, 1)} h`;
    case 'ms':
      return `${signo}${Math.round(abs)} ms`;
    case 'bpm':
      return `${signo}${Math.round(abs)} ppm`;
    case 'kg':
      return `${signo}${decimalCorto(Math.round(abs * 10) / 10, 1)} kg`;
    case 'metros':
      return abs >= 1000 ? `${signo}${esDecimal(abs / 1000, 1)} km` : `${signo}${Math.round(abs)} m`;
    case 'pct':
      return `${signo}${Math.round(abs)} %`;
    case 'pp':
      return `${signo}${Math.round(abs)} pts`;
    case 'ratio':
      return `${signo}${esDecimal(abs, 2)}`;
    case 'ml_kg_min':
      return `${signo}${esDecimal(abs, 1)}`;
    case 'watts':
    case 'w':
      return `${signo}${Math.round(abs)} W`;
    case 'm_s':
      return `${signo}${esDecimal(abs, 2)} m/s`;
    case 'rir':
    case 'rpe':
    case 'rondas':
    case 'cm':
      return `${signo}${decimalCorto(Math.round(abs * 10) / 10, 1)} ${unidadCorta(unidad)}`;
    case 'sesiones':
      return `${signo}${Math.round(abs)} ${Math.round(abs) === 1 ? 'sesión' : 'sesiones'}`;
    case 'reps':
    case 'series':
    case 'tramos':
      return `${signo}${Math.round(abs)} ${unidadCorta(unidad)}`;
    default:
      return `${signo}${conMillar(Math.round(abs))}`;
  }
}

/** Fecha corta con año solo si no es el de hoy: «12 sep», «3 nov 2025». */
export function fechaLegible(iso: string, hoy: string): string {
  return iso.slice(0, 4) === hoy.slice(0, 4) ? fechaCorta(iso) : `${fechaCorta(iso)} ${iso.slice(0, 4)}`;
}

/** «en 13 días», «mañana», «hoy», «hace 4 días». */
export function enDias(dias: number): string {
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'mañana';
  if (dias === -1) return 'ayer';
  if (dias > 1) return `en ${dias} días`;
  return `hace ${-dias} días`;
}

/** Horas de volumen para un eje o una celda: «8h 10min», «42 min». */
export function horas(segundos: number): string {
  return horasYMin(segundos);
}

/**
 * Lee un tiempo tecleado: «4:12» → 252 s, «1:04:30» → 3870 s, «252» → 252 s,
 * «4,2» → 4,2 s. Null si no es un tiempo (letras, un minuto de 60, vacío).
 */
export function leerReloj(texto: string): number | null {
  const t = texto.trim();
  if (t === '') return null;
  if (!t.includes(':')) {
    const n = Number(t.replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  const partes = t.split(':');
  if (partes.length > 3 || partes.some((p) => !/^\d+$/.test(p))) return null;
  const nums = partes.map(Number);
  if (nums.slice(1).some((n) => n >= 60)) return null;
  return nums.reduce((acc, n) => acc * 60 + n, 0);
}
