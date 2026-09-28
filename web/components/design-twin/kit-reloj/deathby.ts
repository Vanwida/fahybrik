// DEATH BY — funciones PURAS (I4 y §4 del modelo del iPhone; P12 de la
// muñeca). El Swift las espeja. Fichero propio de la familia WOD (28-09): el
// kit no lo tenía (`InfoWod` acababa en el reloj de pared) y el vivo de hoy lo
// pintaba como «Ronda 1/N».
//
// La pregunta de la familia: ¿cuántas reps este minuto? El héroe son las reps
// de ESTE minuto (la escalera ya resuelta en `tarea.dosis`), el trabajo es lo
// que queda del minuto, y el WOD acaba cuando el reloj te caza: un minuto que
// se cierra sin «Hecho» es el último. La puntuación son los minutos completos.
//
// Lo que es MÉTODO (inicio, incremento, ventana, tope) es dato del paso; lo
// que es MECANISMO (cuántos minutos se generan sin tope) es una constante.

import { NOMBRE_FORMATO_DEFECTO } from './familia';
import type { HeroeVista } from './lamina';
import type { InfoWod, Medida, PasoBase, Tarea } from './paso';
import { fmtDuracion, fmtReloj } from './reglas';

export type InfoDeathBy = Extract<InfoWod, { formato: 'deathby' }>;

/**
 * Sin tope del coach, cuántas ventanas se generan: nadie pasa de aquí en un
 * death by de verdad (Death by Burpee de 20′ son 210 burpees). Mecanismo.
 */
export const DEATHBY_VENTANAS_DEFECTO = 20;

/** La info del death by de un paso, si la tiene. */
export function deathByDe(p: PasoBase | null | undefined): InfoDeathBy | null {
  return p?.wod?.formato === 'deathby' ? p.wod : null;
}

/** Las reps (o cal) que tocan en la ventana `n` (1-based): inicio + incremento × (n − 1). */
export function repsDelMinuto(info: Pick<InfoDeathBy, 'inicio' | 'incremento'>, n: number): number {
  return info.inicio + info.incremento * (n - 1);
}

export interface EscaleraDeathBy {
  inicio: number;
  incremento: number;
  ventanaS: number;
  tope: number | null;
}

/**
 * LOS PASOS DE UN DEATH BY: una ventana por minuto con la tarea resuelta
 * («7 Burpee» en el minuto 7), cerrada por el reloj. `tarea.dosis` dice si son
 * reps o calorías (la del minuto 1 = `inicio`). Lo genera el kit para que el
 * plan del coach y el libre del atleta sean el mismo objeto.
 */
export function minutosDeathBy(tarea: Tarea, escalera: EscaleraDeathBy, id: (k: number) => string, bloque = 0): PasoBase[] {
  const n = escalera.tope ?? DEATHBY_VENTANAS_DEFECTO;
  const tipo: Medida['tipo'] = tarea.dosis?.tipo === 'cal' ? 'cal' : 'reps';
  const mide: Medida['mide'] = tarea.dosis?.mide ?? tarea.mide;
  const info: Omit<InfoDeathBy, 'tarea'> = { formato: 'deathby', inicio: escalera.inicio, incremento: escalera.incremento, ventanaS: escalera.ventanaS, tope: escalera.tope };
  return Array.from({ length: n }, (_, k) => {
    const dosis: Medida = { tipo, prescrito: repsDelMinuto(escalera, k + 1), mide };
    return {
      id: id(k),
      clase: 'emom',
      rol: 'trabajo',
      fase: 'principal',
      nombre: tarea.nombre,
      carga: tarea.carga,
      medida: { tipo: 'tiempo', prescrito: escalera.ventanaS, mide: 'reloj' },
      objetivos: [],
      posicion: { serie: { n: k + 1, de: n } },
      cierre: 'medida',
      bloque,
      wod: { ...info, tarea: { ...tarea, dosis } },
    };
  });
}

// ---------------------------------------------------------------------------
// Lo que se pinta
// ---------------------------------------------------------------------------

/** «7 Burpee» / «14 cal» de este minuto, con la carga en la etiqueta. `hechaEn`: ya está hecho, y cuándo. */
export function heroeDeathBy(p: PasoBase, hechaEn: number | null = null): HeroeVista | null {
  const w = deathByDe(p);
  if (!w) return null;
  const reps = w.tarea.dosis?.prescrito ?? repsDelMinuto(w, p.posicion?.serie?.n ?? 1);
  const unidad = w.tarea.dosis?.tipo === 'cal' ? `cal ${w.tarea.nombre}` : w.tarea.nombre;
  const carga = w.tarea.carga ? `${w.tarea.carga.implementos ? `${w.tarea.carga.implementos} × ` : ''}${w.tarea.carga.kg} kg` : null;
  const etiqueta = hechaEn != null ? `hecho en ${fmtReloj(hechaEn)} · respiro` : ['este minuto', carga].filter(Boolean).join(' · ');
  return { clase: 'falta', texto: String(reps), unidad, etiqueta };
}

/** La cabecera: «Minuto 7» (abierto) o «Minuto 7/20» (con tope del coach). */
export function posicionDeathBy(p: PasoBase): string[] | null {
  const w = deathByDe(p);
  if (!w) return null;
  const n = p.posicion?.serie?.n ?? 1;
  return [w.tope != null ? `Minuto ${n}/${w.tope}` : `Minuto ${n}`];
}

/** El formato en castellano de box: «Death by · +1 cada 1′», «Death by · 10 y +2 cada 1′ · hasta 15». */
export function formatoDeathBy(w: InfoDeathBy, nombres = NOMBRE_FORMATO_DEFECTO): string {
  const escalera = w.inicio === w.incremento ? `+${w.incremento} cada ${fmtDuracion(w.ventanaS)}` : `${w.inicio} y +${w.incremento} cada ${fmtDuracion(w.ventanaS)}`;
  return [nombres.deathby, escalera, w.tope != null ? `hasta ${w.tope}` : null].filter(Boolean).join(' · ');
}

/** Lo que viene: «Minuto 8 · 8 Burpee». */
export function vieneDeathBy(p: PasoBase): string | null {
  const w = deathByDe(p);
  if (!w) return null;
  const n = p.posicion?.serie?.n ?? 1;
  const reps = w.tarea.dosis?.prescrito ?? repsDelMinuto(w, n);
  return `Minuto ${n} · ${reps} ${w.tarea.dosis?.tipo === 'cal' ? 'cal ' : ''}${w.tarea.nombre}`;
}

/** El GO: «Minuto 7. 7 burpees.» / «Minuto 3. 14 calorías de remo.» */
export function vozDeathBy(p: PasoBase): string | null {
  const w = deathByDe(p);
  if (!w) return null;
  const n = p.posicion?.serie?.n ?? 1;
  const reps = w.tarea.dosis?.prescrito ?? repsDelMinuto(w, n);
  const que = w.tarea.dosis?.tipo === 'cal' ? `${reps} calorías de ${w.tarea.nombre.toLowerCase()}` : `${reps} ${w.tarea.nombre}`;
  return `Minuto ${n}. ${que}.`;
}

/** La fila de la Estructura: «Death by Burpee · 1 + 1 cada 1′ · hasta 20». */
export function filaDeathBy(p: PasoBase): { linea: string; detalle: string } | null {
  const w = deathByDe(p);
  if (!w) return null;
  const carga = w.tarea.carga ? ` · ${w.tarea.carga.kg} kg` : '';
  return {
    linea: `${NOMBRE_FORMATO_DEFECTO.deathby} ${w.tarea.nombre}${carga}`,
    detalle: [`${w.inicio} + ${w.incremento} cada ${fmtDuracion(w.ventanaS)}`, w.tope != null ? `hasta ${w.tope}` : 'hasta que el reloj te cace'].join(' · '),
  };
}

/**
 * ¿El reloj te ha cazado? Un minuto de death by que se cierra sin marcar la
 * tarea es el último: la puntuación son los minutos completos (los de antes).
 * `hechas`: en qué segundo se marcó cada ventana, por id de paso.
 */
export function cazadoEn(pasos: ReadonlyArray<PasoBase>, iCerrado: number, hechas: Record<string, number>): boolean {
  const p = pasos[iCerrado];
  return !!p && deathByDe(p) != null && hechas[p.id] == null;
}

/** La puntuación dicha: «9 minutos completos · te cazó el 10» (o «los 20», si llegaste al tope). */
export function resultadoDeathBy(completos: number, tope: number | null): string {
  if (tope != null && completos >= tope) return `${completos} minutos completos · hasta el tope`;
  return `${completos} ${completos === 1 ? 'minuto completo' : 'minutos completos'} · te cazó el ${completos + 1}`;
}
