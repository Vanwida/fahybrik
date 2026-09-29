// UN FORMATEADOR POR UNIDAD — el servidor manda el número y la unidad (§5),
// y AQUÍ se decide cómo se escribe cada una, una sola vez, sobre los
// canónicos de `kit-composicion/formato.ts` (CONTRATO-UI §2: nada de un
// segundo `reloj` ni de un `toFixed` suelto en una pantalla).

import { conMillar, esDecimal, fechaCorta, horasYMin, kg, reloj, ritmo500, ritmoKm } from '../kit-composicion/formato';
import type { UnidadPanel } from './contrato';

export { conMillar, esDecimal, fechaCorta, horasYMin, reloj };

/** El valor con su unidad, como se lee en una celda: «4:12/km», «62 ms», «7,1 h», «132 kg». */
export function formatear(valor: number, unidad: UnidadPanel): string {
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
      return kg(valor);
    case 'metros':
      return valor >= 1000 ? `${valor % 1000 === 0 ? valor / 1000 : esDecimal(valor / 1000, valor >= 10000 ? 0 : 1)} km` : `${Math.round(valor)} m`;
    case 'm_s':
      return `${esDecimal(valor, 2)} m/s`;
    case 'pct':
      return `${Math.round(valor)} %`;
    case 'ratio':
      return esDecimal(valor, 2);
    case 'ml_kg_min':
      return esDecimal(valor, 1);
    case 'w':
      return `${Math.round(valor)} W`;
    case 'rpm':
      return `${Math.round(valor)} rpm`;
    case 'spm':
      return `${Math.round(valor)} s/min`;
    case 'rir':
      return `RIR ${Math.round(valor)}`;
    case 'reps':
      return `${Math.round(valor)} reps`;
    case 'kcal':
      return `${conMillar(valor)} kcal`;
    case 'sesiones':
      return `${Math.round(valor)} sesiones`;
    case 'dias':
      return `${Math.round(valor)} días`;
    case 'semanas':
      return `${Math.round(valor)} semanas`;
    case 'tss':
    case 'tss_dia':
    case 'tss_semana':
    case 'puntos':
      return conMillar(Math.round(valor));
    default:
      return conMillar(Math.round(valor));
  }
}

/** Solo la cifra, para cuando la unidad la pinta el layout aparte. */
export function cifra(valor: number, unidad: UnidadPanel): string {
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
      return Number.isInteger(valor) ? String(valor) : esDecimal(valor, 1);
    case 'metros':
      return valor >= 1000 ? esDecimal(valor / 1000, valor >= 10000 ? 0 : 1) : String(Math.round(valor));
    default:
      return conMillar(Math.round(valor));
  }
}

/** La unidad como sufijo corto, para pegarla a la cifra a 15 pt. Vacía cuando la cifra ya la lleva o no la necesita. Los metros son «m» por debajo del kilómetro. */
export function unidadCorta(unidad: UnidadPanel, valor?: number): string {
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
    case 'w':
      return 'W';
    case 'rpm':
      return 'rpm';
    case 'spm':
      return 's/min';
    case 'reps':
      return 'reps';
    case 'kcal':
      return 'kcal';
    case 'sesiones':
      return 'sesiones';
    case 'dias':
      return 'días';
    case 'semanas':
      return 'sem';
    case 'ml_kg_min':
      return 'VO₂máx';
    default:
      return '';
  }
}

/** ¿El delta es cero una vez escrito con la precisión de su unidad? Entonces se dice «igual», no «−0,0 h». */
export function esCero(delta: number, unidad: UnidadPanel): boolean {
  const decimales = unidad === 'horas' || unidad === 's_500m' || unidad === 's_1000m' || unidad === 'ml_kg_min' ? 1 : unidad === 'ratio' || unidad === 'm_s' ? 2 : unidad === 'kg' ? 1 : 0;
  return Math.round(Math.abs(delta) * 10 ** decimales) === 0;
}

/**
 * El delta con signo tipográfico y en la unidad que lo juzga: «−4 s/km»,
 * «+3 ms», «+2,5 kg», «+0,3 h», «+12». Sobre segundos se escribe en segundos,
 * nunca en formato reloj: «−0:04» no lo lee nadie.
 */
export function formatearDelta(delta: number, unidad: UnidadPanel): string {
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
      return `${signo}${Number.isInteger(abs) ? abs : esDecimal(abs, 1)} kg`;
    case 'metros':
      return abs >= 1000 ? `${signo}${esDecimal(abs / 1000, 1)} km` : `${signo}${Math.round(abs)} m`;
    case 'pct':
      return `${signo}${Math.round(abs)} pt`;
    case 'ratio':
      return `${signo}${esDecimal(abs, 2)}`;
    case 'ml_kg_min':
      return `${signo}${esDecimal(abs, 1)}`;
    case 'w':
      return `${signo}${Math.round(abs)} W`;
    case 'm_s':
      return `${signo}${esDecimal(abs, 2)} m/s`;
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
