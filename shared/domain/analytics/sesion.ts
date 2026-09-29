// ¿QUÉ PASÓ EN ESA SESIÓN? — el detalle de una sesión en las analíticas
// (docs/analiticas/modelo.md §3 fila 9): su carga tramo a tramo con el peldaño
// de cada uno, sus zonas, y lo hecho frente a lo planificado de la sesión.
//
// LA CARGA DE CADA TRAMO ES LA QUE EL PANEL SUMÓ. El detalle no vuelve a
// preciar: lee `preciarSesion` (la misma lectura de la base, el mismo método,
// las mismas anclas) y enseña, tramo a tramo, el precio que entró en la curva de
// forma — con su tiempo ya recortado a lo que le quedaba a la sesión, y el resto
// que ningún tramo cubre preciado aparte.
//
// El VEREDICTO de cada tramo contra su banda (el cumplimiento serie a serie, A8)
// es del motor de cumplimiento: aquí viajan lo prescrito y lo hecho, y el
// detalle lo declara pendiente hasta que ese motor lo sirva.
//
// Puro y sin base de datos.

import { HR_ZONES } from '../methodology/hr-zones';
import { anclaMasDebil } from './anclas';
import type { PrecioPlanSesion } from './carga-plan';
import type { ParteCarga, Peldano, PrecioSesion, PrecioTramo, SesionHecha, ZonasCongeladas } from './carga-tramo';
import { lecturaMedida, lecturaSinDato, type Ancla, type Lectura, type Parte, type Procedencia } from './lectura';

const GRUPO = 'ejecucion' as const;

/** La carga de UN tramo, como entró en la suma. */
export interface CargaDeTramo {
  /** Null cuando ningún peldaño pudo preciar nada del tramo. */
  tss: number | null;
  segundos: number;
  partes: ParteCarga[];
  sin_saber_s: number;
  /** El peldaño que precia más tiempo del tramo. Null si no se preció nada. */
  peldano: Peldano | null;
  /** El ancla más débil de sus partes (null = no depende de un umbral). */
  ancla: Ancla | null;
}

/** El precio de un tramo, en la forma del detalle. */
export function cargaDeTramo(p: PrecioTramo | null): CargaDeTramo | null {
  if (!p) return null;
  const porPeldano = new Map<Peldano, number>();
  for (const x of p.partes) porPeldano.set(x.peldano, (porPeldano.get(x.peldano) ?? 0) + x.segundos);
  let peldano: Peldano | null = null;
  for (const [k, v] of porPeldano) if (peldano == null || v > (porPeldano.get(peldano) ?? 0)) peldano = k;
  return {
    tss: p.partes.length > 0 ? p.partes.reduce((a, x) => a + x.tss, 0) : null,
    segundos: p.segundos,
    partes: p.partes,
    sin_saber_s: p.sin_saber_s,
    peldano,
    ancla: anclaMasDebil(p.partes.map((x) => x.ancla)),
  };
}

/** Las zonas congeladas de un tramo, en la forma del detalle (claves z1…z5). */
export interface ZonasDeTramo {
  por_zona: { z1: number; z2: number; z3: number; z4: number; z5: number };
  sin_pulso_s: number;
  ancla: Ancla | null;
}

export function zonasDeTramo(z: ZonasCongeladas | null): ZonasDeTramo | null {
  if (!z) return null;
  return {
    por_zona: { z1: z.por_zona[1] ?? 0, z2: z.por_zona[2] ?? 0, z3: z.por_zona[3] ?? 0, z4: z.por_zona[4] ?? 0, z5: z.por_zona[5] ?? 0 },
    sin_pulso_s: z.sin_pulso_s,
    ancla: z.ancla,
  };
}

export interface EntradaSesion {
  sesion: SesionHecha;
  precio: PrecioSesion;
  /** La carga planificada de su asignación. Null fuera del plan. */
  plan: PrecioPlanSesion | null;
}

const PELDANO_ES: Record<Peldano, string> = { potencia: 'Potencia', ritmo: 'Ritmo', pulso: 'Pulso', esfuerzo: 'Esfuerzo' };

const COBERTURA_SESION = { muestras: 1, dias_ventana: 1, dias_con_dato: 1, pct: 100 };

/** La planificada solo es una referencia cuando se sabe entera: con una línea sin saber es un suelo. */
function planEntero(plan: PrecioPlanSesion | null): PrecioPlanSesion | null {
  return plan && plan.items.length > 0 && plan.items_sin_saber === 0 ? plan : null;
}

function lecturaCarga(e: EntradaSesion): Lectura {
  const { precio: p } = e;
  const titulo_es = 'Carga';
  const preciado = p.partes.reduce((a, x) => a + x.segundos, 0);
  const pctEstimado = preciado > 0 ? (p.partes.filter((x) => x.ancla === 'estimada').reduce((a, x) => a + x.segundos, 0) / preciado) * 100 : 0;
  const medidos = p.partes.filter((x) => x.peldano !== 'esfuerzo').reduce((a, x) => a + x.segundos, 0);
  const procedencia: Procedencia = {
    de: 'carga_por_tramo',
    explica_es: `La suma de la carga de cada tramo por su mejor evidencia (potencia, ritmo, pulso o esfuerzo), más el resto de la sesión.${pctEstimado > 0 ? ` Un ${Math.round(pctEstimado)} % del tiempo preciado se apoya en un umbral estimado.` : ''}`,
    medida: medidos > preciado - medidos,
    ancla: anclaMasDebil(p.partes.map((x) => x.ancla)),
    proveedor: null,
  };
  if (p.tss == null) {
    return lecturaSinDato({ id: 'sesion.carga', grupo: GRUPO, titulo_es, falta: { por: 'esfuerzo', sesiones: 1 }, cobertura: COBERTURA_SESION, procedencia });
  }
  const plan = planEntero(e.plan);
  const porPeldano = new Map<Peldano, number>();
  for (const x of p.partes) porPeldano.set(x.peldano, (porPeldano.get(x.peldano) ?? 0) + x.segundos);
  // El reparto es del tiempo que se miró (preciado + sin saber), no de la duración
  // declarada: unas zonas congeladas pueden medir más que el total de la sesión.
  const total = preciado + p.sin_saber_s;
  const partes: Parte[] = [...porPeldano.entries()].map(([k, v]) => ({ code: k, etiqueta_es: PELDANO_ES[k], valor: v, pct: total > 0 ? (v / total) * 100 : null }));
  if (p.sin_saber_s > 0) partes.push({ code: 'sin_saber', etiqueta_es: 'Sin saber', valor: p.sin_saber_s, pct: total > 0 ? (p.sin_saber_s / total) * 100 : null });
  return lecturaMedida({
    id: 'sesion.carga',
    grupo: GRUPO,
    titulo_es,
    dato: { valor: p.tss, unidad: 'tss', referencia: plan ? { valor: plan.tss_conocido, delta: p.tss - plan.tss_conocido, de: 'plan' } : null },
    reparto: { unidad: 'segundos', total, partes },
    cobertura: { ...COBERTURA_SESION, falta: p.sin_saber_s > 0 ? { por: 'esfuerzo', sesiones: 1 } : null },
    procedencia,
  });
}

function lecturaDuracion(e: EntradaSesion): Lectura {
  const plan = planEntero(e.plan);
  const s = e.precio.segundos;
  return lecturaMedida({
    id: 'sesion.duracion',
    grupo: GRUPO,
    titulo_es: 'Duración',
    dato: { valor: s, unidad: 'segundos', referencia: plan ? { valor: plan.segundos_conocidos, delta: s - plan.segundos_conocidos, de: 'plan' } : null },
    cobertura: COBERTURA_SESION,
    procedencia: { de: 'duracion_sesion', explica_es: 'El tiempo de la sesión entera, frente al que escribe su plan.', medida: true, ancla: null, proveedor: null },
  });
}

function lecturaZonas(e: EntradaSesion): Lectura {
  const suma = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<1 | 2 | 3 | 4 | 5, number>;
  const anclas: Array<Ancla | null> = [];
  let sinPulso = 0;
  let huboPulso = false;
  for (const t of e.sesion.tramos) {
    if (t.pulso_medio != null && t.pulso_medio > 0) huboPulso = true;
    if (!t.zonas) continue;
    for (const z of HR_ZONES) suma[z] += t.zonas.por_zona[z] ?? 0;
    sinPulso += t.zonas.sin_pulso_s;
    if (HR_ZONES.some((z) => (t.zonas!.por_zona[z] ?? 0) > 0)) anclas.push(t.zonas.ancla);
  }
  const clasif = HR_ZONES.reduce((a, z) => a + suma[z], 0);
  const procedencia: Procedencia = {
    de: 'segundos_por_zona',
    explica_es: `Los segundos por zona de cada tramo, con las bandas de tu coach.${sinPulso > 0 ? ` ${Math.round(sinPulso / 60)} min de tramo sin pulso.` : ''}`,
    medida: true,
    ancla: anclaMasDebil(anclas),
    proveedor: null,
  };
  if (clasif <= 0) {
    return lecturaSinDato({ id: 'sesion.zonas', grupo: GRUPO, titulo_es: 'Zonas', falta: huboPulso ? { por: 'ancla' } : { por: 'sensor' }, cobertura: COBERTURA_SESION, procedencia: { ...procedencia, medida: false } });
  }
  return lecturaMedida({
    id: 'sesion.zonas',
    grupo: GRUPO,
    titulo_es: 'Zonas',
    dato: { valor: clasif, unidad: 'segundos', referencia: null },
    reparto: { unidad: 'segundos', total: clasif, partes: HR_ZONES.map((z) => ({ code: `z${z}`, etiqueta_es: `Z${z}`, valor: suma[z], pct: (suma[z] / clasif) * 100 })) },
    cobertura: COBERTURA_SESION,
    procedencia,
  });
}

/** Las lecturas de cabecera del detalle: carga (contra la planificada), duración y zonas. */
export function lecturasSesion(e: EntradaSesion): Lectura[] {
  return [lecturaCarga(e), lecturaDuracion(e), lecturaZonas(e)];
}
