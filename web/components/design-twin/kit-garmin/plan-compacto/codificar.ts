// CODIFICAR — el plan de una sesión y su cabecera, como flujo de valores y bytes.
//
// Función PURA: mismo plan y misma cabecera, mismos bytes. Lee `PlanSesion`
// (kit-reloj) tal como lo dibuja el doble y escribe, paso a paso y PLANO, todo
// lo que define `PasoBase`: sin recursión, con la posición anidada como campos.
//
// Aquí está el ORDEN del cable y las banderas de cada paso; el cómo de cada
// campo (medida, objetivo, carga, WOD, ficha de fuerza, dobles) está en
// `codificar-campos.ts`. El orden es el de este fichero:
//   cabecera · zonas de pulso · bandas de ritmo · reglas de aviso · vocabulario ·
//   método · pareja · tabla de tareas · tabla de listas · pasos.
// y dentro de un paso: clase · rol/fase/cierre · medida · banderas [· extras] ·
// objetivos · posición · bloque · nombre · carga · tempo · cue · vuelta
// automática · damper · WOD · ficha de fuerza · dobles · grupo. Las banderas dicen qué
// trozos opcionales hay; un paso de recuperación cabe en unos 8 bytes.
//
// Lo que NO hace, a propósito:
//   · No redondea. Un valor que no cabe exacto en décimas (ejes) o centésimas
//     (kilos) se rechaza: es un dato del coach.
//   · No admite claves que no conoce: si el modelo crece y el formato no, falla.
//   · No lleva `id` de paso ni la clave de ejercicio: son claves de la UI del
//     doble. En el cable un paso es su posición y un ejercicio es el ordinal de
//     su primera aparición (ver `canonico.ts`).
//   · No inventa texto: solo cadenas de catálogo, cue, palabras de RPE, la pareja
//     y el vocabulario que el coach ya escribió. Nada derivado (brief, estación,
//     pacto) viaja: el reloj lo compone del dato.

import type { BandasRitmo, PasoBase, ReglasAviso, ZonasCoach } from '../../kit-reloj/paso';
import type { MetodoReloj, Vocabulario } from '../../kit-reloj/metodo';
import type { PlanSesion } from '../../kit-reloj/secuencia';
import {
  ANCHOS_BANDERAS_PASO,
  ANCHOS_EXTRAS,
  ANCHOS_FLAGS_REGLAS,
  ANCHOS_ROL_FASE,
  BANDERAS_PASO,
  CLASES,
  CLAVES_GRUPO,
  CLAVES_MAQUINA,
  CLAVES_PASO,
  CLAVES_PLAN,
  CLAVES_TEMPO,
  CLAVES_ZONAS,
  ENTORNOS,
  ESCALA_PCT,
  FASES,
  FORMATOS_NOMBRADOS,
  MAQUINAS,
  MAX_OBJETIVOS,
  MODOS_RECUPERA,
  NUM_PALABRAS_RPE,
  PROCEDENCIAS,
  ROLES,
  ROXZONAS,
  UNIDADES_RITMO,
  VERSION_ESQUEMA,
  empaquetar,
  type BanderaPaso,
} from './formato';
import { ErrorPlanCompacto, Escritor, codigoDe, escalar, soloClaves, type Flujo, type RegistroCadena } from './flujo';
import {
  escribirCarga,
  escribirDobles,
  escribirFicha,
  escribirMedida,
  escribirObjetivo,
  escribirPosicion,
  escribirTarea,
  escribirWod,
  tablasDeTareas,
  type Tablas,
} from './codificar-campos';
import { aBinario } from './transporte';
import type { MetaSesion } from './tipos';

// ---------------------------------------------------------------------------
// El paso
// ---------------------------------------------------------------------------

/** 0 = sin dato; si no, 1 + posición en la tabla. */
const codigoOpc = <T extends string>(tabla: readonly T[], v: T | undefined, donde: string): number => (v === undefined ? 0 : 1 + codigoDe(tabla, v, donde));

function escribirPaso(w: Escritor, p: PasoBase, i: number, tablas: Tablas, ejercicios: Map<string, number>, plan: PlanSesion): void {
  const ctx = `paso ${i} (${p.clase})`;
  soloClaves(p, CLAVES_PASO, ctx);
  if (p.objetivos.length > MAX_OBJETIVOS) {
    throw new ErrorPlanCompacto('fuera-de-limites', `${ctx}: ${p.objetivos.length} objetivos (máximo ${MAX_OBJETIVOS}, M1)`);
  }
  const extras = empaquetar(ANCHOS_EXTRAS, [
    codigoOpc(MODOS_RECUPERA, p.modoRecupera, `${ctx}.modoRecupera`),
    codigoOpc(ENTORNOS, p.entorno, `${ctx}.entorno`),
    p.maquina ? 1 + codigoDe(MAQUINAS, p.maquina.tipo, `${ctx}.maquina.tipo`) : 0,
    codigoOpc(ROXZONAS, p.roxzone, `${ctx}.roxzone`),
  ]);
  const presentes: Record<BanderaPaso, boolean> = {
    posicion: p.posicion !== undefined,
    bloque: p.bloque !== undefined,
    nombre: p.nombre !== undefined,
    carga: p.carga !== undefined,
    extras: extras !== 0,
    tempo: p.tempo !== undefined,
    cue: p.cue !== undefined,
    vueltaAuto: p.vueltaAutoM !== undefined,
    wod: p.wod !== undefined,
    fuerza: p.fuerza !== undefined,
    dobles: p.dobles !== undefined,
    damper: p.maquina?.damper !== undefined,
    grupo: p.grupo !== undefined,
  };

  w.n(codigoDe(CLASES, p.clase, `${ctx}.clase`));
  w.n(empaquetar(ANCHOS_ROL_FASE, [codigoDe(ROLES, p.rol, `${ctx}.rol`), codigoDe(FASES, p.fase, `${ctx}.fase`), p.cierre === 'atleta' ? 1 : 0]));
  escribirMedida(w, p.medida, ctx);
  w.n(empaquetar(ANCHOS_BANDERAS_PASO, [p.objetivos.length, ...BANDERAS_PASO.map((b) => (presentes[b] ? 1 : 0))]));
  if (presentes.extras) w.n(extras);
  p.objetivos.forEach((o, k) => escribirObjetivo(w, o, `${ctx}.objetivos[${k}]`));
  if (p.posicion) escribirPosicion(w, p.posicion, ctx);
  if (p.bloque !== undefined) w.n(p.bloque, `${ctx}.bloque`);
  if (p.nombre !== undefined) w.cadena(p.nombre, 'catalogo', `${ctx}.nombre`);
  if (p.carga) escribirCarga(w, p.carga, ctx);
  if (p.tempo) {
    soloClaves(p.tempo, CLAVES_TEMPO, `${ctx}.tempo`);
    w.n(p.tempo.excentrica, `${ctx}.tempo`);
    w.n(p.tempo.pausaAbajo, `${ctx}.tempo`);
    w.n(p.tempo.concentrica, `${ctx}.tempo`);
    w.n(p.tempo.pausaArriba, `${ctx}.tempo`);
  }
  if (p.cue !== undefined) w.cadena(p.cue, 'cue', `${ctx}.cue`);
  if (p.vueltaAutoM !== undefined) w.n(p.vueltaAutoM, `${ctx}.vueltaAutoM`);
  if (p.maquina) {
    soloClaves(p.maquina, CLAVES_MAQUINA, `${ctx}.maquina`);
    if (p.maquina.damper !== undefined) w.n(p.maquina.damper, `${ctx}.maquina.damper`);
  }
  if (p.wod) escribirWod(w, p.wod, tablas, ctx);
  if (p.fuerza) escribirFicha(w, p.fuerza, ejercicios, ctx);
  if (p.dobles) escribirDobles(w, p.dobles, plan, ctx);
  if (p.grupo) {
    soloClaves(p.grupo, CLAVES_GRUPO, `${ctx}.grupo`);
    w.n(p.grupo.id, `${ctx}.grupo.id`);
    w.n(p.grupo.veces, `${ctx}.grupo.veces`);
  }
}

// ---------------------------------------------------------------------------
// Cabecera, zonas, reglas, vocabulario, método
// ---------------------------------------------------------------------------

function escribirZonas(w: Escritor, zonas: ZonasCoach | null): void {
  if (zonas === null) {
    w.n(0);
    return;
  }
  soloClaves(zonas, CLAVES_ZONAS, 'plan.zonas');
  if (zonas.techos.length === 0) throw new ErrorPlanCompacto('fuera-de-limites', 'plan.zonas: sin techos (un plan sin zonas lleva `null`)');
  if (zonas.procedencia === undefined) throw new ErrorPlanCompacto('fuera-de-limites', 'plan.zonas.procedencia: hay zonas y falta decir si son estimadas o medidas');
  w.n(zonas.techos.length);
  zonas.techos.forEach((t, k) => w.n(t, `plan.zonas.techos[${k}]`));
  w.n(codigoDe(PROCEDENCIAS, zonas.procedencia, 'plan.zonas.procedencia'));
  if (zonas.nombres === undefined) {
    w.n(0);
    return;
  }
  if (zonas.nombres.length !== zonas.techos.length) throw new ErrorPlanCompacto('fuera-de-limites', 'plan.zonas.nombres: uno por zona');
  w.n(1);
  zonas.nombres.forEach((n, k) => w.cadena(n, 'zona', `plan.zonas.nombres[${k}]`));
}

function escribirBandasRitmo(w: Escritor, bandas: BandasRitmo[]): void {
  w.n(bandas.length);
  bandas.forEach((b, i) => {
    w.n(codigoDe(UNIDADES_RITMO, b.unidad, `plan.bandasRitmo[${i}].unidad`));
    w.n(codigoDe(PROCEDENCIAS, b.procedencia, `plan.bandasRitmo[${i}].procedencia`));
    w.n(b.zonas.length);
    b.zonas.forEach((z, k) => {
      w.n(z.rapidoS, `plan.bandasRitmo[${i}].zonas[${k}].rapidoS`);
      w.nOpc(z.lentoS, `plan.bandasRitmo[${i}].zonas[${k}].lentoS`);
    });
  });
}

function escribirReglas(w: Escritor, r: ReglasAviso): void {
  const h = r.holgura;
  const campos: Array<[string, number]> = [
    ['holgura.ritmo', h.ritmo],
    ['holgura.ppm', h.ppm],
    ['holgura.split500', h.split500],
    ['holgura.vatios', h.vatios],
    ['holgura.cadencia', h.cadencia],
    ['cadenciaS', r.cadenciaS],
    ['confirmacionS', r.confirmacionS],
    ['graciaZonaS', r.graciaZonaS],
    ['preavisoS', r.preavisoS],
    ['preavisoM', r.preavisoM],
    ['preavisoMinimoS', r.preavisoMinimoS],
  ];
  for (const [k, v] of campos) w.n(v, `plan.reglas.${k}`);
  w.n(empaquetar(ANCHOS_FLAGS_REGLAS, [r.avisarEnCalentamiento ? 1 : 0, r.avisarEnRecuperacion ? 1 : 0]));
}

function escribirVocabulario(w: Escritor, v: Vocabulario | undefined, pasos: PasoBase[]): void {
  if (v === undefined) throw new ErrorPlanCompacto('vocabulario-incompleto', 'plan.vocabulario: el plan que se sirve lleva el vocabulario EFECTIVO del coach (el reloj no conoce ningún defecto)');
  for (const c of new Set(pasos.map((p) => p.clase))) {
    if (!v.clases[c]) throw new ErrorPlanCompacto('vocabulario-incompleto', `plan.vocabulario.clases: falta el nombre de «${c}», que usa la sesión`);
  }
  const clases = CLASES.filter((c) => v.clases[c] !== undefined);
  w.n(clases.length);
  for (const c of clases) {
    const nc = v.clases[c]!;
    w.n(codigoDe(CLASES, c, 'vocabulario.clase'));
    w.cadena(nc.nombre, 'vocabulario', `vocabulario.clases.${c}`);
    w.n(nc.femenino ? 1 : 0);
  }
  for (const f of FORMATOS_NOMBRADOS) w.cadena(v.formatos[f], 'vocabulario', `vocabulario.formatos.${f}`);
  if (v.rpe.length !== NUM_PALABRAS_RPE) {
    throw new ErrorPlanCompacto('vocabulario-incompleto', `plan.vocabulario.rpe: ${v.rpe.length} palabras (hacen falta ${NUM_PALABRAS_RPE}, de RPE 0 a 10)`);
  }
  v.rpe.forEach((p, k) => w.cadena(p, 'vocabulario', `vocabulario.rpe[${k}]`));
}

function escribirMetodo(w: Escritor, m: MetodoReloj | undefined): void {
  if (m === undefined) throw new ErrorPlanCompacto('metodo-ausente', 'plan.metodo: el plan que se sirve lleva el método EFECTIVO del coach (resumen y rango de la corona)');
  w.n(m.resumen.paresMinimos, 'metodo.resumen.paresMinimos');
  w.n(escalar(m.resumen.umbralHecho, ESCALA_PCT, 'metodo.resumen.umbralHecho'), 'metodo.resumen.umbralHecho');
  w.n(m.resumen.guardarQuietoS, 'metodo.resumen.guardarQuietoS');
  const a = m.anotar;
  w.n(a.repsDeMas, 'metodo.anotar.repsDeMas');
  for (const e of [a.rpe, a.rir]) {
    w.deci(e.min, 'metodo.anotar.min');
    w.deci(e.max, 'metodo.anotar.max');
    w.deci(e.paso, 'metodo.anotar.paso');
  }
  w.centi(a.kgMax, 'metodo.anotar.kgMax');
}

// ---------------------------------------------------------------------------
// Entrada pública
// ---------------------------------------------------------------------------

export interface InformeCodificacion {
  flujo: Flujo;
  /** Cada cadena única del plan con su tipo y si se truncó: la auditoría de «texto libre». */
  cadenas: RegistroCadena[];
}

/** El plan como flujo de valores, con el informe de las cadenas que lleva. */
export function flujoDeSesion(plan: PlanSesion, meta: MetaSesion): InformeCodificacion {
  soloClaves(plan, CLAVES_PLAN, 'plan');
  const w = new Escritor();
  w.n(meta.asignacionId, 'meta.asignacionId');
  w.n(meta.huella, 'meta.huella');
  w.n(meta.fitSport, 'meta.fitSport');
  w.n(meta.fitSubSport, 'meta.fitSubSport');
  w.n(codigoOpc(ENTORNOS, meta.entorno ?? undefined, 'meta.entorno'));
  w.n(meta.duracionEstS, 'meta.duracionEstS');
  escribirZonas(w, plan.zonas);
  escribirBandasRitmo(w, plan.bandasRitmo ?? []);
  escribirReglas(w, plan.reglas);
  escribirVocabulario(w, plan.vocabulario, plan.pasos);
  escribirMetodo(w, plan.metodo);
  w.cadenaOpc(plan.pareja, 'pareja', 'plan.pareja');

  const tablas = tablasDeTareas(plan.pasos);
  w.n(tablas.tareas.length);
  tablas.tareas.forEach((t, k) => escribirTarea(w, t, `tarea ${k}`));
  w.n(tablas.listas.length);
  for (const l of tablas.listas) {
    w.n(l.length);
    l.forEach((k) => w.n(k));
  }

  w.n(plan.pasos.length);
  const ejercicios = new Map<string, number>();
  plan.pasos.forEach((p, i) => escribirPaso(w, p, i, tablas, ejercicios, plan));
  return { flujo: w.flujo(VERSION_ESQUEMA), cadenas: w.registro };
}

/** `codificarSesion(plan, meta)`: los bytes que el servidor sirve (dentro del sobre base64). */
export function codificarSesion(plan: PlanSesion, meta: MetaSesion): Uint8Array {
  return aBinario(flujoDeSesion(plan, meta).flujo);
}
