// EL COPY DEL PLAN SIN COACH — cada frase que se escribe a partir de un número,
// en UN sitio (espejo de `FreePlanCopy`, `FreePlanEvidenceCopy` y
// `FreeGoalComparison` del Swift). El dominio manda enteros y enums; el castellano
// vive aquí, para que no haya dos frases para el mismo número (CONTRATO-UI §2).
//
// Las frases dicen lo que se sabe y lo que NO: un tiempo de pareja se llama de
// pareja, un ritmo de dobles es un suelo, y una comparación con otra categoría no
// se hace (los pesos cambian entre open y pro).

import { reloj, ritmoKm } from '../kit-composicion/formato';
import type { SemanaDelPlan } from './contrato';
import type { Comparacion, EvidenciaDeCarreras, FinalDeCarrera, LecturaLibre, MarcaLibre, OchoKm } from './contrato-libre';
import { diasEntre, formatoMinutos, trabajado } from './modelo';

/** A partir de estos días la cuenta atrás se lee en semanas y no en días. */
const SEMANAS_DESDE_DIAS = 14;
/** Como mucho se nombran estas marcas pendientes antes del «y N más». */
const MAX_MARCAS_NOMBRADAS = 3;

/** «es hoy» · «mañana» · «en 5 días» · «en 9 semanas». Null si el cable no trae cuenta atrás. */
export function cuentaAtras(dias: number | null): string | null {
  if (dias === null) return null;
  const n = Math.max(0, dias);
  if (n === 0) return 'es hoy';
  if (n === 1) return 'mañana';
  if (n < SEMANAS_DESDE_DIAS) return `en ${n} días`;
  const semanas = Math.round(n / 7);
  return `en ${semanas} ${semanas === 1 ? 'semana' : 'semanas'}`;
}

export function recuentoDeCarreras(n: number): string {
  return n === 1 ? '1 carrera' : `${n} carreras`;
}

/** «a, b y c». */
export function lista(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

/** «Berlín · may 2025». */
export function dondeYCuando(f: Pick<FinalDeCarrera, 'lugar' | 'cuando'>): string {
  return f.cuando ? `${f.lugar} · ${f.cuando}` : f.lugar;
}

/** «Para decirte cuánto tardarías aún nos faltan tus marcas: 1 km, Remo 500 m y Ski 1.000 m.» Null sin marcas pendientes. */
export function marcasQueFaltan(etiquetas: string[]): string | null {
  if (etiquetas.length === 0) return null;
  const mostradas = etiquetas.slice(0, MAX_MARCAS_NOMBRADAS);
  const resto = etiquetas.length - mostradas.length;
  const texto = resto > 0 ? `${mostradas.join(', ')} y ${resto} más` : lista(mostradas);
  return `Para decirte cuánto tardarías aún nos faltan tus marcas: ${texto}.`;
}

/** En dobles corren juntos: el ritmo lo marca el más lento, así que es un suelo. */
export function notaOchoKm(run: OchoKm): string {
  return run.suelo
    ? `En ${run.lugar}. Corristeis los 8 km los dos, así que este es tu suelo: más lento no vas.`
    : `En ${run.lugar}. Los 8 km de tu mejor carrera.`;
}

/** El último frente al mejor, cuando no hay tendencia que afirmar. */
export function ultimoFrenteAlMejor(ultimo: OchoKm, mejor: OchoKm): string {
  const ritmo = ritmoKm(ultimo.ritmoSKm);
  if (ultimo.suelo || mejor.suelo) {
    return `Tu último fue ${ritmo} en ${ultimo.lugar}. En dobles el ritmo lo marca la pareja, así que restarle tu mejor no te diría cómo estás.`;
  }
  const hueco = Math.abs(Math.round(ultimo.ritmoSKm - mejor.ritmoSKm));
  if (hueco === 0) return `Tu último fue ${ritmo} en ${ultimo.lugar}, clavado a tu mejor.`;
  const sentido = ultimo.ritmoSKm > mejor.ritmoSKm ? 'más lento' : 'más rápido';
  return `Tu último fue ${ritmo} en ${ultimo.lugar}: ${hueco} s por kilómetro ${sentido} que tu mejor.`;
}

export function textoTendencia(t: NonNullable<EvidenciaDeCarreras['tendencia']>): string {
  const s = Math.abs(Math.round(t.deltaSKm));
  if (t.sentido === 'mejora') return `Corriendo, vas a mejor: ${s} s por kilómetro más rápido en tus últimas ${t.carreras} carreras.`;
  if (t.sentido === 'empeora') return `Corriendo, vas a peor: ${s} s por kilómetro más lento en tus últimas ${t.carreras} carreras.`;
  return `Tu ritmo de carrera lleva ${t.carreras} carreras estable.`;
}

/** La línea que va bajo los 8 km: la tendencia, o los dos hechos y por qué no se restan. Null si no hay nada que decir. */
export function lineaDeProgreso(e: EvidenciaDeCarreras): string | null {
  if (e.tendencia) return textoTendencia(e.tendencia);
  if (e.ultimo8km && e.mejor8km) return ultimoFrenteAlMejor(e.ultimo8km, e.mejor8km);
  return null;
}

/** `deltaS = objetivo − mejor`. Positivo = el objetivo es MÁS LENTO de lo que ya corrió: mejor conversación que la de siempre. */
export function veredictoDelObjetivo(c: Extract<Comparacion, { tipo: 'mejor' }>): string {
  const hueco = reloj(Math.abs(c.deltaS));
  const donde = dondeYCuando(c.mejor);
  if (c.deltaS > 0) return `Ya fuiste ${hueco} más rápido que eso en ${donde}. Tu objetivo se te ha quedado corto.`;
  if (c.deltaS < 0) return `Te faltan ${hueco} desde tu mejor marca en ${donde}.`;
  return `Vas exactamente a tu objetivo, con lo que hiciste en ${donde}.`;
}

export function textoSinComparacion(c: Extract<Comparacion, { tipo: 'sin' }>): string {
  if (c.motivo === 'formato_distinto') {
    const categoria = c.categoria ?? 'esta categoría';
    return `No te comparamos con tus carreras porque ninguna fue en ${categoria}, y ahí cambian los pesos. Un tiempo de otra categoría no te diría la verdad.`;
  }
  return 'Cuando corras una en esta categoría te decimos cuánto te falta.';
}

/** «el 1 km» / «el remo 500 m»: el nombre de la marca tal y como se lee dentro del botón. */
export function nombreEnBoton(etiqueta: string): string {
  return `el ${etiqueta.toLowerCase()}`;
}

// ---------------------------------------------------------------------------
// La semana propia del atleta libre (`SemanaAtletaOperativa`)
// ---------------------------------------------------------------------------


/** La única acción anclada de la pestaña sin coach: la primera marca, o programar un entreno. */
export type AccionLibre = { tipo: 'medir'; marca: MarcaLibre } | { tipo: 'programar' };

/**
 * Sin nada medido la puerta es la primera marca de arranque (es lo que hay que
 * hacer ahora); con evidencia, lo útil es programar un entreno. Null mientras
 * carga: aún no sabemos cuál de las dos toca.
 */
export function accionLibre(l: LecturaLibre): AccionLibre | null {
  if (l.cargando) return null;
  const sinEvidencia = l.marcas.medidas.length === 0 && l.carrerasImportadas === 0;
  const primera = l.marcas.arranque[0];
  return sinEvidencia && primera ? { tipo: 'medir', marca: primera } : { tipo: 'programar' };
}

/** El rótulo del panel del día elegido: lo que tienes por delante o lo que hiciste. Hoy no lleva ninguno: «Hoy · Jueves 1» ya lo dice. */
export function rotuloDelPanel(iso: string, hoyIso: string): string {
  const d = diasEntre(hoyIso, iso);
  return d === 0 ? '' : d > 0 ? 'lo que tienes' : 'lo que hiciste';
}

/** Lo que se dice de un día sin sesiones, según sea hoy, futuro o pasado. */
export function textoDiaLibreVacio(iso: string, hoyIso: string): string {
  const d = diasEntre(hoyIso, iso);
  return d === 0 ? 'Aún no has entrenado hoy.' : d > 0 ? 'Nada programado ese día.' : 'Ese día no entrenaste.';
}

/**
 * «2 sesiones hechas · desde 1 h 20 · 1 sin tiempo previsto»: lo que llevas de
 * la semana. El tiempo es un SUELO (lo que nadie escribe solo suma) y el hueco se
 * declara al lado: cada mitad sola miente. Null si no hay ninguna hecha.
 */
export function resumenDeSemana(semana: SemanaDelPlan): string | null {
  const hechas = semana.dias.flatMap((d) => d.sesiones).filter((s) => trabajado(s.estado));
  if (hechas.length === 0) return null;
  let suelo = 0;
  let sinReloj = 0;
  for (const s of hechas) {
    if (s.duracion && 'minutos' in s.duracion && s.duracion.minutos > 0) suelo += s.duracion.minutos;
    else sinReloj += 1;
  }
  const partes = [`${hechas.length} ${hechas.length === 1 ? 'sesión hecha' : 'sesiones hechas'}`];
  const cifra = formatoMinutos(suelo);
  if (cifra) partes.push(`desde ${cifra}`);
  if (sinReloj > 0) partes.push(`${sinReloj} sin tiempo previsto`);
  return partes.join(' · ');
}
