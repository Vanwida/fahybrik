// LA CABECERA POR DEFECTO — lo que el servidor rellena al servir una sesión.
//
// Esto es el PROTOTIPO del constructor de servidor (`shared/domain/watch-plan/`,
// arreglo A1 del modelo): dado un plan del kit y los datos que solo el
// servidor conoce (id de asignación, deporte del FIT, bandas del atleta),
// completa la cabecera con lo que el coach no tocó: sus valores por defecto de
// método (vocabulario, palabras del RPE, rangos de anotación, método del
// resumen). El reloj nunca ve un defecto: recibe el valor efectivo.
//
// Lo que se deriva de los pasos usa las funciones del kit (`hoyDe`,
// `duracionEstimada`), no una copia: la línea del brief que sale aquí es la
// misma que pinta el doble.
//
// La huella (`huellaDePlan`) es FNV-1a de 32 bits sobre el plan canónico con
// las claves ordenadas, recortada a 31 bits. Es una implementación de
// referencia: al reloj le da igual cómo se calcule, solo la devuelve con el
// resultado para decir con qué versión del plan se hizo la sesión.
//
// QUÉ NO HACER: no meter aquí el mapa modalidad → deporte del FIT (es un dato
// del servidor, arreglo A4, y lo decide la prueba T1 en un reloj real).

import { NOMBRE_CLASE_DEFECTO, FEMENINO_DEFECTO, type Entorno } from '../../kit-reloj/paso';
import { NOMBRE_FORMATO_DEFECTO } from '../../kit-reloj/familia';
import { METODO_RESUMEN_DEFECTO } from '../../kit-reloj/despues';
import { RANGO_ANOTAR_DEFECTO } from '../../kit-reloj/anotar';
import { duracionEstimada, hoyDe } from '../../kit-reloj/estructura';
import { RPE_PALABRA_DEFECTO } from '../../kit-reloj/tokens';
import type { PlanSesion } from '../../kit-reloj/secuencia';
import { canonico } from './canonico';
import { MAX_NUM, NUM_PALABRAS_RPE, type Procedencia } from './formato';
import type { BandasRitmo, MetaSesion, Vocabulario } from './tipos';

/** FNV-1a de 32 bits: desplazamiento y primo de la especificación. */
const FNV_DESPLAZAMIENTO = 0x811c9dc5;
const FNV_PRIMO = 0x01000193;

/** Separador entre la parte principal de la línea del brief y su detalle. */
const SEPARADOR_BRIEF = ' · ';

function estable(valor: unknown): string {
  if (Array.isArray(valor)) return `[${valor.map(estable).join(',')}]`;
  if (valor !== null && typeof valor === 'object') {
    const claves = Object.keys(valor).sort();
    return `{${claves.map((k) => `${JSON.stringify(k)}:${estable((valor as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(valor);
}

/** La huella de una versión del plan: 31 bits, estable entre ejecuciones. */
export function huellaDePlan(plan: PlanSesion): number {
  let h = FNV_DESPLAZAMIENTO;
  for (const c of estable(canonico(plan))) {
    h = Math.imul(h ^ c.charCodeAt(0), FNV_PRIMO) >>> 0;
  }
  return h & MAX_NUM;
}

/** Los datos que solo el servidor conoce. Todo lo demás se deriva del plan. */
export interface DatosServidor {
  asignacionId: number;
  fitSport: number;
  fitSubSport: number;
  procedenciaPpm?: Procedencia;
  bandasRitmo?: BandasRitmo[];
  entorno?: Entorno | null;
}

/** El vocabulario efectivo del coach: sus valores por defecto donde no cambió nada. */
export function vocabularioPorDefecto(plan: PlanSesion): Vocabulario {
  const clases: Vocabulario['clases'] = {};
  for (const p of plan.pasos) {
    clases[p.clase] = { nombre: NOMBRE_CLASE_DEFECTO[p.clase], femenino: FEMENINO_DEFECTO.has(p.clase) };
  }
  return {
    clases,
    formatos: { ...NOMBRE_FORMATO_DEFECTO },
    rpe: Array.from({ length: NUM_PALABRAS_RPE }, (_, n) => RPE_PALABRA_DEFECTO[n] ?? ''),
  };
}

/** El entorno de la sesión si todos los pasos que lo dicen dicen el mismo; si no, `null`. */
function entornoComun(plan: PlanSesion): Entorno | null {
  const distintos = new Set(plan.pasos.map((p) => p.entorno).filter((e): e is Entorno => e !== undefined));
  return distintos.size === 1 ? [...distintos][0]! : null;
}

export function metaPorDefecto(plan: PlanSesion, d: DatosServidor): MetaSesion {
  const hoy = hoyDe(plan.pasos);
  return {
    asignacionId: d.asignacionId,
    huella: huellaDePlan(plan),
    fitSport: d.fitSport,
    fitSubSport: d.fitSubSport,
    entorno: d.entorno !== undefined ? d.entorno : entornoComun(plan),
    duracionEstS: Math.round(plan.pasos.reduce((suma, p) => suma + duracionEstimada(p), 0)),
    // `hoyDe` deja un espacio al final cuando la medida es abierta («Rodaje »): se recorta aquí.
    estructura: [hoy.titulo, hoy.sub].filter(Boolean).join(SEPARADOR_BRIEF).trim(),
    procedenciaPpm: plan.zonas ? (d.procedenciaPpm ?? 'estimada') : null,
    bandasRitmo: d.bandasRitmo ?? [],
    vocabulario: vocabularioPorDefecto(plan),
    metodo: {
      resumen: { ...METODO_RESUMEN_DEFECTO },
      anotar: {
        repsDeMas: RANGO_ANOTAR_DEFECTO.repsDeMas,
        rpe: { ...RANGO_ANOTAR_DEFECTO.rpe },
        rir: { ...RANGO_ANOTAR_DEFECTO.rir },
        kgMax: RANGO_ANOTAR_DEFECTO.kgMax,
      },
    },
  };
}
