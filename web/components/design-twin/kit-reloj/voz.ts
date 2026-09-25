// LA VOZ — lo que el reloj dice a los auriculares, en español (P5, §4).
//
// Alex, 25-09: voz al cambiar de paso y cada km, desde el PROPIO reloj (sin
// móvil también). Los avisos de ritmo son solo vibración. Cada frase sale del
// DATO del paso, nunca de un texto escrito a mano: si el coach cambia la
// prescripción, la voz cambia sola.
//
// Convención (la de los ejemplos del modelo): los metros en letra («Mil
// metros», «Quedan cien»), los tiempos en cifra («90 segundos», «3:50»).

import { NOMBRE_CLASE_DEFECTO, type PasoBase, type Veredicto, type Vuelta } from './paso';
import { fmtReloj, fmtRitmo, num, principal } from './reglas';

const UNIDADES = [
  'cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
  'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho',
  'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco',
  'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve',
];
const DECENAS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const CENTENAS = [
  '', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos',
  'setecientos', 'ochocientos', 'novecientos',
];

function hasta999(n: number): string {
  if (n < 30) return UNIDADES[n]!;
  if (n < 100) {
    const d = Math.floor(n / 10);
    const u = n % 10;
    return u === 0 ? DECENAS[d]! : `${DECENAS[d]} y ${UNIDADES[u]}`;
  }
  if (n === 100) return 'cien';
  const c = Math.floor(n / 100);
  const r = n % 100;
  return r === 0 ? CENTENAS[c]! : `${CENTENAS[c]} ${hasta999(r)}`;
}

/** 1000 → «mil»; 3950 → «tres mil novecientos cincuenta». Enteros de 0 a 999 999. */
export function enLetras(n: number): string {
  const x = Math.max(0, Math.round(n));
  if (x < 1000) return hasta999(x);
  const miles = Math.floor(x / 1000);
  const r = x % 1000;
  const m = miles === 1 ? 'mil' : `${hasta999(miles).replace(/uno$/, 'ún')} mil`;
  return r === 0 ? m : `${m} ${hasta999(r)}`;
}

const mayus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** La medida dicha: «mil metros», «90 segundos», «50 minutos». */
function medidaDicha(p: PasoBase): string {
  const pr = p.medida.prescrito;
  if (pr == null) return '';
  switch (p.medida.tipo) {
    case 'distancia':
      return `${enLetras(pr)} metros`;
    case 'tiempo':
      if (pr < 60 || pr % 60 !== 0) return `${pr} segundos`;
      return pr === 60 ? 'un minuto' : `${pr / 60} minutos`;
    case 'reps':
      return `${pr} repeticiones`;
    case 'cal':
      return `${pr} calorías`;
    default:
      return '';
  }
}

/** El objetivo dicho: «a 3:50» (centro de la banda), «en zona 2», «a RPE 7». */
function objetivoDicho(p: PasoBase): string {
  const o = principal(p);
  if (!o) return '';
  const centro = o.min != null && o.max != null ? (o.min + o.max) / 2 : (o.min ?? o.max ?? 0);
  switch (o.eje) {
    case 'ritmo':
      return `a ${fmtRitmo(centro)}`;
    case 'split500':
      return `a ${fmtRitmo(centro)} el quinientos`;
    case 'zona':
      return o.min != null && o.max != null && o.min !== o.max
        ? `en zona ${o.min} a ${o.max}`
        : `en zona ${o.max ?? o.min}`;
    case 'ppm':
      return o.papel === 'techo' ? `sin pasar de ${o.max}` : `a ${Math.round(centro)} pulsaciones`;
    case 'rpe':
      return `a RPE ${num(centro)}`;
    case 'potencia':
      return `a ${Math.round(centro)} vatios`;
    default:
      return '';
  }
}

const GERUNDIO = { trote: 'trotando', andar: 'caminando', parado: 'parado' } as const;

/** Al empezar un paso de trabajo (GO): «Serie 3 de 6. Mil metros a 3:50.» */
export function vozInicio(p: PasoBase): string {
  const nombre = NOMBRE_CLASE_DEFECTO[p.clase];
  const pos = p.posicion;
  const partes: string[] = [];
  if (pos?.tanda) partes.push(`Tanda ${pos.tanda.n} de ${pos.tanda.de}`);
  if (pos?.serie) partes.push(`${pos.tanda ? nombre.toLowerCase() : nombre} ${pos.serie.n} de ${pos.serie.de}`);
  if (pos?.tramo) partes.push(`${nombre}, tramo ${pos.tramo.n} de ${pos.tramo.de}`);
  if (partes.length === 0) partes.push(p.nombre ?? nombre);
  const cuerpo = [medidaDicha(p), objetivoDicho(p)].filter(Boolean).join(' ');
  return `${partes.join(', ')}.${cuerpo ? ` ${mayus(cuerpo)}.` : ''}`;
}

/** Al empezar una recuperación: «Recupera, 90 segundos trotando. Luego mil metros.» */
export function vozRecupera(p: PasoBase, siguiente: PasoBase | null): string {
  const modo = GERUNDIO[p.modoRecupera ?? 'trote'];
  const luego = siguiente && siguiente.rol === 'trabajo' ? medidaDicha(siguiente) : '';
  return `Recupera, ${medidaDicha(p)} ${modo}.${luego ? ` Luego ${luego}.` : ''}`;
}

/** Al empezar un descanso común: «Descanso entre tandas, 5 minutos.» */
export function vozDescanso(p: PasoBase): string {
  return `${NOMBRE_CLASE_DEFECTO[p.clase]}, ${medidaDicha(p)}.`;
}

/** Al cerrar una serie con objetivo: «Serie 3: 3:48, dentro.» (sin háptico: ya vibra lo siguiente). */
export function vozFinSerie(p: PasoBase, v: Vuelta): string {
  const nombre = NOMBRE_CLASE_DEFECTO[p.clase];
  const palabra = (x: Veredicto | null) =>
    x === 'dentro' ? 'dentro' : x === 'por-encima' ? 'rápida' : x === 'por-debajo' ? 'lenta' : '';
  const o = principal(p);
  const pulso = o?.eje === 'zona' || o?.eje === 'ppm';
  const juicio = pulso
    ? v.veredicto === 'dentro' ? 'dentro' : v.veredicto === 'por-encima' ? 'pulso alto' : 'pulso bajo'
    : palabra(v.veredicto);
  return `${nombre} ${v.n}: ${fmtReloj(v.segundos)}${juicio ? `, ${juicio}` : ''}.`;
}

/** La vuelta automática: «Kilómetro 5: 4:52.» */
export function vozKm(n: number, segundos: number): string {
  return `Kilómetro ${n}: ${fmtReloj(segundos)}.`;
}

/** El preaviso: «Quedan cien.» (distancia) o «Quedan diez segundos.» (tiempo). */
export function vozPreaviso(p: PasoBase, falta: number): string {
  return p.medida.tipo === 'distancia'
    ? `Quedan ${enLetras(Math.round(falta))}.`
    : `Quedan ${enLetras(Math.round(falta))} segundos.`;
}

export const VOZ_SESION = 'Sesión completada.';
