// LA VOZ — lo que el reloj dice a los auriculares, en español (P5, §4).
//
// Alex, 25-09: voz al cambiar de paso y cada km, desde el PROPIO reloj (sin
// móvil también). Los avisos de ritmo son solo vibración. Cada frase sale del
// DATO del paso, nunca de un texto escrito a mano: si el coach cambia la
// prescripción, la voz cambia sola.
//
// Convención (la de los ejemplos del modelo): los metros en letra («Mil
// metros», «Quedan cien»), los tiempos en cifra («90 segundos», «3:50»); las
// cargas y las reps de un WOD o de fuerza, en cifra («8 repeticiones con 125
// kilos»). La voz sabe de cada familia porque el paso lo dice (M1, M5, M7):
// el ejercicio y su carga, la tarea del EMOM, la máquina y su /500.

import { esFuerza, kgDelPlan, textoEsfuerzo, type PasoFuerza } from './fuerza';
import { NOMBRE_CLASE_DEFECTO, FEMENINO_DEFECTO, type PasoBase, type Tarea, type Veredicto, type Vuelta } from './paso';
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

/** Lo que se dice de un tiempo: «20 segundos», «un minuto», «4 minutos». */
function tiempoDicho(s: number): string {
  if (s < 60 || s % 60 !== 0) return `${s} segundos`;
  return s === 60 ? 'un minuto' : `${s / 60} minutos`;
}

/**
 * Cómo se cuenta el paso en voz y en el aviso de deshacer: «Serie 3», «Tramo
 * 2». Un ergómetro o una estación cuentan series, no «Ergo 3».
 */
export function nombreCuenta(p: PasoBase): { nombre: string; femenino: boolean } {
  if (p.posicion?.tramo) return { nombre: 'Tramo', femenino: false };
  if (p.clase === 'ergo' || p.clase === 'estacion') return { nombre: 'Serie', femenino: true };
  return { nombre: NOMBRE_CLASE_DEFECTO[p.clase], femenino: FEMENINO_DEFECTO.has(p.clase) };
}

// ---------------------------------------------------------------------------
// Empieza el trabajo (GO)
// ---------------------------------------------------------------------------

/** Un movimiento del WOD dicho: «6 Bench Press, 60 kilos», «Row, todo el minuto». */
function tareaDicha(t: Tarea, ventanaS?: number): string {
  const carga = t.carga ? `, ${t.carga.kg} kilos` : '';
  if (!t.dosis || t.dosis.tipo === 'abierta') return ventanaS ? `${t.nombre}, ${ventanaS === 60 ? 'todo el minuto' : 'todo el intervalo'}` : t.nombre;
  const n = t.dosis.prescrito ?? 0;
  if (t.dosis.tipo === 'reps') return `${n} ${t.nombre}${carga}`;
  if (t.dosis.tipo === 'distancia') return `${t.nombre}, ${n} metros${carga}`;
  if (t.dosis.tipo === 'cal') return `${t.nombre}, ${n} calorías`;
  return `${t.nombre}${carga}`;
}

/** El GO de un paso de WOD: la tarea, no la ventana («3 de 12. 6 Bench Press, 60 kilos.»). */
function vozWod(p: PasoBase): string | null {
  const w = p.wod;
  const pos = p.posicion;
  if (!w) return null;
  switch (w.formato) {
    case 'emom':
      return `${pos?.serie?.n ?? ''} de ${w.ventanas}. ${tareaDicha(w.tarea, w.ventanaS)}.`;
    case 'amrap':
      return `AMRAP, ${w.duracionS / 60} minutos. ${w.tareas.map((t) => tareaDicha(t)).join(', ')}.`;
    case 'fortime': {
      if (!w.tarea) return null;
      const ronda = pos?.ronda && pos.estacion?.n === 1 ? `Ronda ${pos.ronda.n} de ${pos.ronda.de}. ` : '';
      return `${ronda}${tareaDicha(w.tarea)}.`;
    }
    case 'pared':
      return `Ronda ${pos?.ronda?.n ?? ''} de ${w.rondas}.`;
    default:
      return null;
  }
}

/** La carga dicha: la que está en la barra (declarada), la del plan (valor o rango) o nada. */
function cargaDicha(p: PasoFuerza, kg: number | null): string | null {
  if (kg != null) return `${num(kg)} kilos`;
  const r = kgDelPlan(p.fuerza.carga);
  if (!r) return null;
  return r[0] === r[1] ? `${num(r[0])} kilos` : `${num(r[0])} a ${num(r[1])} kilos`;
}

/** El GO de una serie de fuerza: «A1, Back Squat. Serie 2 de 4: 8 repeticiones con 125 kilos.» */
function vozSerie(p: PasoFuerza, kg: number | null): string {
  const f = p.fuerza;
  const s = p.posicion?.serie;
  const quien = [p.posicion?.slot, p.nombre].filter(Boolean).join(', ');
  const cabeza = `${quien}. ${f.aproximacion ? 'Aproximación' : 'Serie'}${s ? ` ${s.n} de ${s.de}` : ''}`;
  if (p.medida.tipo === 'tiempo') return `${cabeza}: ${tiempoDicho(p.medida.prescrito ?? 0)}.`;
  const carga = cargaDicha(p, kg);
  const lado = f.porLado ? ` por ${f.porLado}` : '';
  const esfuerzo = f.esfuerzo ? `, ${textoEsfuerzo(f.esfuerzo)}` : '';
  return `${cabeza}: ${p.medida.prescrito} repeticiones${lado}${carga ? ` con ${carga}` : ''}${esfuerzo}.`;
}

/** Posición y cuerpo del paso, sin saber de familias: «Serie 3 de 6. Mil metros a 3:50.» */
function vozCorrer(p: PasoBase): string {
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

/** El GO de un ergómetro: la máquina y su posición («SkiErg, 4 de 8. Doscientos cincuenta metros a 2:05 el quinientos.»). */
function vozErgo(p: PasoBase): string {
  const pos = p.posicion;
  const cuenta = pos?.serie ? `${pos.serie.n} de ${pos.serie.de}` : pos?.tramo ? `tramo ${pos.tramo.n} de ${pos.tramo.de}` : pos?.ronda ? `ronda ${pos.ronda.n} de ${pos.ronda.de}` : '';
  const frase = vozCorrer({ ...p, posicion: undefined });
  return cuenta ? frase.replace(/^([^.]+)\./, `$1, ${cuenta}.`) : frase;
}

/**
 * Al empezar un paso de trabajo (GO): «Serie 3 de 6. Mil metros a 3:50.» La
 * tarea del WOD, el ejercicio con su carga o la máquina, si el paso es de
 * esa familia. `kg`: la carga que está en la barra, si el atleta la declaró
 * en una serie anterior (cascada, P11); sin ella, la del plan.
 */
export function vozInicio(p: PasoBase, opciones: { kg?: number | null } = {}): string {
  const wod = vozWod(p);
  if (wod) return wod;
  if (esFuerza(p)) return vozSerie(p, opciones.kg ?? null);
  if (p.clase === 'ergo') return vozErgo(p);
  return vozCorrer(p);
}

// ---------------------------------------------------------------------------
// Deja de trabajar (.stop) y las transiciones
// ---------------------------------------------------------------------------

/** Al empezar una recuperación: «Recupera, 90 segundos trotando. Luego mil metros.» */
export function vozRecupera(p: PasoBase, siguiente: PasoBase | null): string {
  const modo = GERUNDIO[p.modoRecupera ?? 'trote'];
  const luego = siguiente && siguiente.rol === 'trabajo' ? medidaDicha(siguiente) : '';
  return `Recupera, ${medidaDicha(p)} ${modo}.${luego ? ` Luego ${luego}.` : ''}`;
}

/** Al empezar un descanso común: «Descanso entre tandas, 5 minutos.» En el reloj de pared, solo «Descanso.». */
export function vozDescanso(p: PasoBase): string {
  if (p.wod?.formato === 'pared') return 'Descanso.';
  return `${NOMBRE_CLASE_DEFECTO[p.clase]}, ${medidaDicha(p)}.`;
}

/**
 * Al entrar en un paso de transición: la Roxzone de entrada dice a qué
 * estación vas; la campana del AMRAP pide la puntuación; antes de una serie
 * que no sale de un descanso, «Colócate» con lo que viene. La Roxzone de
 * salida no habla: ya vibra el cambio. `undefined` = sin voz.
 */
export function vozTransicion(p: PasoBase, siguiente: PasoBase | null): string | undefined {
  if (p.roxzone === 'salida') return undefined;
  if (p.roxzone === 'entrada') return siguiente ? `Roxzone. Entras a ${siguiente.nombre}.` : undefined;
  if (p.wod?.formato === 'puntuacion') {
    const t = p.wod.tareas;
    return t.length > 1 ? 'Tiempo. Rondas y repeticiones.' : `Tiempo. ¿Cuántas ${t[0]!.nombre}?`;
  }
  const n = siguiente?.nombre;
  return n ? `Colócate: ${n.charAt(0).toLowerCase()}${n.slice(1)}.` : 'Colócate.';
}

// ---------------------------------------------------------------------------
// El resultado, el km, el preaviso
// ---------------------------------------------------------------------------

/**
 * Al cerrar una serie con objetivo: «Serie 3: 3:48, dentro.» (sin háptico: ya
 * vibra lo siguiente). A /500, el /500 medio («Serie 3: 2:01 el quinientos,
 * rápida.»); a pulso por tiempo, solo el veredicto: el tiempo es lo prescrito.
 */
export function vozFinSerie(p: PasoBase, v: Vuelta): string {
  const { nombre } = nombreCuenta(p);
  const palabra = (x: Veredicto | null) =>
    x === 'dentro' ? 'dentro' : x === 'por-encima' ? 'rápida' : x === 'por-debajo' ? 'lenta' : '';
  const o = principal(p);
  if (o?.eje === 'split500' && v.metros != null && v.metros > 0) {
    const juicio = palabra(v.veredicto);
    return `${nombre} ${v.n}: ${fmtRitmo((v.segundos * 500) / v.metros)} el quinientos${juicio ? `, ${juicio}` : ''}.`;
  }
  const pulso = o?.eje === 'zona' || o?.eje === 'ppm';
  const juicio = pulso
    ? v.veredicto === 'dentro' ? 'dentro' : v.veredicto === 'por-encima' ? 'pulso alto' : 'pulso bajo'
    : palabra(v.veredicto);
  if (pulso && p.medida.tipo === 'tiempo' && v.veredicto != null) return `${nombre} ${v.n}: ${juicio}.`;
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
