// LO QUE SE DICE EN EL RELOJ GARMIN DE FUERZA — funciones PURAS sobre el paso.
//
// La serie de fuerza en palabras es la de `kit-reloj` (`fuerza.ts`: la carga con
// sus dos ejes, el esfuerzo, el tempo, la serie en corto) y lo que viene es el
// de «Muñeca · fuerza» (`reloj-fuerza/textos.ts`): aquí NO se copia nada. Lo
// único propio es cómo se REPARTE lo dicho sobre un círculo:
//
//   partesDosis   la dosis con sus dos ejes por PARTES y por prioridad:
//                 «5 × 100 kg» · «RIR 2» · «3-1-1» · «65–70 % RM». La cara la
//                 pone en una línea si cabe y, si no, la primera parte arriba y
//                 las demás debajo; lo que no cabe se quita por el final (nunca
//                 el peso ni el esfuerzo antes que el porcentaje).
//   partesOtro    lo mismo para lo que no es una serie (una estación, un ergo,
//                 movilidad): lo prescrito, la carga del implemento, el objetivo.
//   vistaTrabajo  todo lo que dice un paso de trabajo, decidido aquí. El HÉROE
//                 no: ese es de `laminaDelPaso` (G2), la vista no decide.
//
// Qué NO hacer: escribir un nombre de ejercicio o una unidad a mano (salen del
// paso); pintar como medidas las reps que nadie cuenta (G7): el héroe de una
// serie que dice el atleta es el crono, y la dosis va como INSTRUCCIÓN.

import {
  nombreDeClase,
  cantidadSerie,
  dosisSerie,
  esFuerza,
  fmtPrescrito,
  laminaDelPaso,
  nombreCuenta,
  quienSerie,
  seriesQueHeredan,
  textoCarga,
  textoCargaImplemento,
  textoEsfuerzo,
  textoPct,
  textoTempo,
  type Lamina,
  type Campo,
  type Lecturas,
  type Paso,
  type PasoBase,
  type PasoFuerza,
  type PlanSesion,
  type Registro,
  type ReglasAviso,
  type Viene,
  type ZonasCoach,
} from '../../kit-reloj';
import { abreEjercicio, siguienteTrabajo } from '../reloj-fuerza/modelo';
import { conSlot, dosisRestante, textoLuego, textoViene } from '../reloj-fuerza/textos';

/**
 * La dosis de UNA serie, por partes y por prioridad. El orden es el de lectura
 * y el de importancia: qué haces y con qué carga, por lado, el esfuerzo, el
 * tempo y, al final (lo primero que se cae), el porcentaje de la RM.
 */
export function partesDosis(p: PasoFuerza, arrastrada: number | null): string[] {
  const f = p.fuerza;
  const lastre = f.carga.tipo === 'tuya' && f.carga.lastre;
  // Con lastre, lo que está en la barra es un añadido: «6 × +5 kg», no «6 × 5 kg».
  const principal =
    lastre && arrastrada != null && p.medida.tipo !== 'tiempo' ? `${cantidadSerie(p)} × ${textoCarga(f, arrastrada)}` : dosisSerie(p, arrastrada);
  const partes = [principal];
  if (f.porLado) partes.push(`por ${f.porLado}`);
  if (f.esfuerzo) partes.push(textoEsfuerzo(f.esfuerzo));
  if (p.tempo) partes.push(textoTempo(p.tempo));
  const pct = textoPct(f.carga);
  if (pct) partes.push(pct);
  // Sin carga del coach ni declarada: «carga tuya · última 140 kg» (la de la última vez es solo una propuesta).
  // Se parte por su «·» para que lo de la última vez sea lo primero que se caiga.
  if (f.carga.tipo === 'tuya' && arrastrada == null) partes.push(...(textoCarga(f, null) ?? '').split(' · '));
  return partes.filter(Boolean);
}

/** La dosis de un paso que no es una serie de fuerza: lo prescrito, la carga del implemento y el objetivo. */
export function partesOtro(p: PasoBase, l: Lamina): string[] {
  return [fmtPrescrito(p.medida), textoCargaImplemento(p.carga), l.instruccion].filter((x): x is string => !!x);
}

export interface VistaTrabajo {
  /** «A1 · Back Squat», «Sled Push»: el nombre primero. */
  nombre: string;
  /** «Serie 2/4» · «llevas»: dónde estás y qué cuenta el número grande. */
  etiqueta: string[];
  /**
   * Lo que el coach dice, o lo que viene si cambia de ejercicio, en orden de
   * preferencia: la cara pone el primero que cabe en una línea (sin el «Coach ·»
   * si hace falta) y, si ninguno cabe, el primero en dos, si sobra sitio.
   */
  nota: string[];
  dosis: string[];
  /** Lo que decide `laminaDelPaso`: el héroe, la banda, lo que falta, el pulso. */
  lamina: Pick<Lamina, 'heroe' | 'banda' | 'segundo' | 'tercero'>;
  /** El pulso en monocromo (colócate, descanso): aquí no se juzga nada. */
  pulsoMono?: boolean;
}

export interface CtxTrabajo {
  plan: PlanSesion;
  /** El índice del paso en el plan. */
  i: number;
  zonas: ZonasCoach | null;
  reglas: ReglasAviso;
  /** La carga declarada en la serie anterior del mismo ejercicio (la cascada). */
  arrastrada: number | null;
}

/** «Luego · A2 Box Jump» solo si dice algo: un compañero de superserie o un ejercicio nuevo; «descanso 2′» ya se sabe. */
export function luegoQueDiceAlgo(plan: PlanSesion, i: number): string | null {
  const t = textoLuego(plan, i);
  return t && !t.startsWith('descanso') ? `Luego · ${t}` : null;
}

/** Todo lo que dice un paso de trabajo. El héroe y el pulso, de la lámina del kit. */
export function vistaTrabajo(paso: Paso, l: Lecturas, c: CtxTrabajo): VistaTrabajo {
  const lamina = laminaDelPaso(paso, l, c.zonas, c.reglas);
  const fuerza = esFuerza(paso);
  const posicion = fuerza
    ? quienSerie(paso)
    : paso.posicion?.serie
      ? `${nombreCuenta(paso).nombre} ${paso.posicion.serie.n}/${paso.posicion.serie.de}`
      : nombreDeClase(c.plan, paso.clase).nombre;
  return {
    nombre: conSlot(paso) || nombreDeClase(c.plan, paso.clase).nombre,
    etiqueta: [posicion, lamina.heroe.etiqueta].filter((x): x is string => !!x),
    nota: paso.cue ? [`Coach · ${paso.cue}`, paso.cue] : [luegoQueDiceAlgo(c.plan, c.i)].filter((x): x is string => !!x),
    dosis: fuerza ? partesDosis(paso, c.arrastrada) : partesOtro(paso, lamina),
    lamina,
  };
}

// ---------------------------------------------------------------------------
// La anotación
// ---------------------------------------------------------------------------

/** Lo que es cada dato de la celda: «reps», «kg», «+kg» (un lastre se anota en kilos añadidos), «RIR»/«RPE». */
export function etiquetaCampo(p: PasoFuerza, campo: Campo): string {
  if (campo === 'reps') return 'reps';
  if (campo === 'kg') return p.fuerza.carga.tipo === 'tuya' && p.fuerza.carga.lastre ? '+kg' : 'kg';
  return p.fuerza.esfuerzo?.eje === 'rpe' ? 'RPE' : 'RIR';
}

/** Hasta dónde llega la carga que se está tocando: «también en las series 2–4»; `null` si no arrastra a ninguna. */
export function pistaCascada(plan: PlanSesion, j: number, registro: Registro): string | null {
  const s = seriesQueHeredan(plan, j, registro);
  if (s.length === 0) return null;
  return s.length === 1 ? `también en la serie ${s[0]}` : `también en las series ${s[0]}–${s[s.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Lo que viene
// ---------------------------------------------------------------------------

/**
 * «Viene: …» del descanso `i`. Las series de fuerza, como en la muñeca
 * (`textoViene`: el ejercicio nuevo entero, o la serie con la carga que está en
 * la barra). Lo que no es fuerza (una estación, un ergo) dice EN QUÉ SERIE
 * estás si el ejercicio ya está en curso («Serie 8/8 · 250 m») y, si abre uno,
 * su dosis entera con la carga del implemento («Sled Push · 5 × 25 m · 180 kg»).
 */
export function vieneDe(plan: PlanSesion, i: number, registro: Registro): Viene | null {
  const j = siguienteTrabajo(plan, i + 1);
  if (j == null) return null;
  const q = plan.pasos[j]!;
  if (esFuerza(q)) return textoViene(plan, i, registro);
  const carga = textoCargaImplemento(q.carga);
  const una = [fmtPrescrito(q.medida), carga].filter(Boolean).join(' · ');
  const serie = q.posicion?.serie;
  if (serie && !abreEjercicio(plan, j)) return { que: `${nombreCuenta(q).nombre} ${serie.n}/${serie.de}`, dosis: una || null };
  const dosis = [dosisRestante(plan, j), carga].filter(Boolean).join(' · ');
  return q.nombre ? { que: q.nombre, dosis: dosis || null } : { que: dosis || nombreDeClase(plan, q.clase).nombre, dosis: null };
}
