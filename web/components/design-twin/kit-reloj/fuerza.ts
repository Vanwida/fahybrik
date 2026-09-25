// LA SERIE DE FUERZA EN PALABRAS — funciones PURAS sobre la ficha (P11, M1).
//
// La ficha vive en el paso (`PasoBase.fuerza`, paso.ts). Aquí, lo que se dice
// de ella en la muñeca, en un sitio: la carga con sus dos ejes («121–131 kg ·
// 65–70 % RM»), el esfuerzo («RIR 3»), el tempo («3-1-1»), una serie en corto
// para «Viene:» y «Luego ·» («8 × 125 kg»), y el aviso de deshacer («A1 ·
// serie 3 hecha»). La voz de la serie (`vozInicio`) sale de aquí también.

import { fmtDuracion, num } from './reglas';
import type { CargaFuerza, EsfuerzoFuerza, FichaFuerza, PasoBase } from './paso';

export type PasoFuerza = PasoBase & { fuerza: FichaFuerza };

/** ¿Es una serie de fuerza con su ficha? Estrecha el tipo. */
export function esFuerza(p: PasoBase | null | undefined): p is PasoFuerza {
  return !!p && p.fuerza != null;
}

/** 127.5 → «127,5 kg». */
export const fmtKg = (n: number) => `${num(n)} kg`;

function rango(min: number, max: number, f: (n: number) => string): string {
  return min === max ? f(min) : `${f(min)}–${f(max)}`;
}

/** La RM resuelta en kg, redondeada al kilo como la enseña el plan: 65–70 % de 186,5 → 121–131. */
export function kgDelPlan(c: CargaFuerza): [number, number] | null {
  if (c.tipo === 'kg') return [c.min, c.max];
  if (c.tipo === 'rm' && c.rmKg) return [Math.round((c.rmKg * c.pctMin) / 100), Math.round((c.rmKg * c.pctMax) / 100)];
  return null;
}

/** «121–131 kg», «156 kg»; null si el plan no da kilos. */
export function textoKgPlan(c: CargaFuerza): string | null {
  const r = kgDelPlan(c);
  return r ? `${rango(r[0], r[1], num)} kg` : null;
}

/** «65–70 % RM». */
export function textoPct(c: CargaFuerza): string | null {
  return c.tipo === 'rm' ? `${rango(c.pctMin, c.pctMax, num)} % RM` : null;
}

/** «RIR 3», «RPE 7,5», «RIR 2–3». */
export function textoEsfuerzo(e: EsfuerzoFuerza): string {
  return `${e.eje === 'rir' ? 'RIR' : 'RPE'} ${rango(e.min, e.max, num)}`;
}

/** 3-1-1-0 → «3-1-1»; la pausa arriba solo si la hay. */
export function textoTempo(t: NonNullable<PasoBase['tempo']>): string {
  const base = `${t.excentrica}-${t.pausaAbajo}-${t.concentrica}`;
  return t.pausaArriba > 0 ? `${base}-${t.pausaArriba}` : base;
}

/** Lo que se hace en UNA serie, sin la carga: «8», «20″». */
export function cantidadSerie(p: PasoBase): string {
  const pr = p.medida.prescrito ?? 0;
  return p.medida.tipo === 'tiempo' ? fmtDuracion(pr) : String(pr);
}

/**
 * La carga de la línea de la serie. Con carga arrastrada (la que declaró el
 * atleta en la serie anterior del mismo ejercicio), esa: es la que está en la
 * barra. Si no, la del plan; si el plan no la da, «carga tuya».
 */
export function textoCarga(f: FichaFuerza, arrastrada: number | null): string | null {
  if (f.carga.tipo === 'corporal') return null;
  if (arrastrada != null) return f.carga.tipo === 'tuya' && f.carga.lastre ? `+${fmtKg(arrastrada)}` : fmtKg(arrastrada);
  if (f.carga.tipo === 'tuya') {
    const que = f.carga.lastre ? 'lastre tuyo' : 'carga tuya';
    return f.carga.ultimaKg != null ? `${que} · última ${fmtKg(f.carga.ultimaKg)}` : que;
  }
  return textoKgPlan(f.carga) ?? textoPct(f.carga);
}

/** Una serie en corto, para «Viene:» y «Luego ·»: «8 × 125 kg», «6 reps», «20″». */
export function dosisSerie(p: PasoFuerza, arrastrada: number | null): string {
  if (p.medida.tipo === 'tiempo') return cantidadSerie(p);
  const c = p.fuerza.carga;
  const kg = arrastrada != null ? fmtKg(arrastrada) : c.tipo === 'tuya' || c.tipo === 'corporal' ? null : textoKgPlan(c);
  return kg ? `${cantidadSerie(p)} × ${kg}` : `${cantidadSerie(p)} reps`;
}

/** El ejercicio entero en corto: «4 × 8 · RIR 3», «4 × 8 · 65–70 % RM», «3 × 20″». */
export function dosisEjercicio(p: PasoFuerza, series: number): string {
  const f = p.fuerza;
  const eje = f.esfuerzo ? textoEsfuerzo(f.esfuerzo) : (textoPct(f.carga) ?? textoKgPlan(f.carga));
  return [`${series} × ${cantidadSerie(p)}`, eje].filter(Boolean).join(' · ');
}

/** «A1 · serie 3 hecha» — el aviso de deshacer, corto para que quepa entero en el pie. */
export function avisoSerie(p: PasoFuerza): string {
  const s = p.posicion?.serie;
  const que = p.fuerza.aproximacion ? 'aproximación' : 'serie';
  const texto = `${que}${s ? ` ${s.n}` : ''} hecha`;
  return p.posicion?.slot ? `${p.posicion.slot} · ${texto}` : texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** «Serie 2/4» o «Aproximación 1/2». */
export function quienSerie(p: PasoFuerza): string {
  const s = p.posicion?.serie;
  const que = p.fuerza.aproximacion ? 'Aproximación' : 'Serie';
  return s ? `${que} ${s.n}/${s.de}` : que;
}
