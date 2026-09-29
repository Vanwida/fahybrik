// DECODIFICAR — del flujo de valores al plan y su cabecera. Inversa exacta de
// `codificar.ts`, escrita paso a paso en el mismo orden para que el
// decodificador de Monkey C se pueda leer al lado de este fichero.
//
// Lo que devuelve es la FORMA CANÓNICA del plan (`canonico.ts`): cada paso con
// `id` = su posición como texto y la clave de ejercicio = el ordinal de su
// primera aparición. Solo pone las claves opcionales que el cable trae: nunca
// un `undefined` ni un `false` inventado.
//
// Lo que NO hace, a propósito: no adivina. Una versión de esquema que no
// conoce, un código fuera de tabla o valores que sobran al final son errores
// (`ErrorPlanCompacto`), nunca un plan «casi bien» en una muñeca.

import type {
  CargaFuerza,
  EsfuerzoFuerza,
  FichaFuerza,
  InfoWod,
  Medida,
  Objetivo,
  PasoBase,
  Posicion,
  ReglasAviso,
  Tarea,
  ZonasCoach,
} from '../../kit-reloj/paso';
import { estacionDe, type Dobles } from '../../kit-reloj/dobles';
import type { BandasRitmo } from '../../kit-reloj/paso';
import type { MetodoReloj, NombreClase, Vocabulario } from '../../kit-reloj/metodo';
import type { PlanSesion } from '../../kit-reloj/secuencia';
import {
  ANCHOS_BANDERAS_PASO,
  ANCHOS_EXTRAS,
  ANCHOS_FICHA,
  ANCHOS_FLAGS_REGLAS,
  ANCHOS_MEDIDA,
  ANCHOS_OBJETIVO,
  ANCHOS_POSICION,
  ANCHOS_ROL_FASE,
  ANCHOS_TAREA,
  BANDERAS_PASO,
  CLASES,
  CODIGO_LETRA_A,
  CONTADORES,
  EJES,
  EJES_ESFUERZO,
  ESCALAS_OBJETIVO,
  TIPOS_ALTERNA,
  ENTORNOS,
  ESCALA_PCT,
  FASES,
  FORMATOS_NOMBRADOS,
  FORMATOS_WOD,
  MAQUINAS,
  MODOS_RECUPERA,
  NUM_PALABRAS_RPE,
  PAPELES,
  POR_LADO,
  PROCEDENCIAS,
  QUIEN_MIDE,
  ROLES,
  ROXZONAS,
  SENTIDOS_AVISO,
  TIPOS_CARGA,
  TIPOS_MEDIDA,
  TURNOS_DOBLES,
  UNIDADES_RITMO,
  VERSION_ESQUEMA,
  desempaquetar,
  type BanderaPaso,
} from './formato';
import { ErrorPlanCompacto, Lector, valorDe, type Flujo } from './flujo';
import { deBinario, desenvolver } from './transporte';
import type { MetaSesion, SesionCompacta } from './tipos';

/** Inversa de `codigoOpc`: 0 = sin dato. */
function valorOpc<T extends string>(tabla: readonly T[], codigo: number, donde: string): T | undefined {
  return codigo === 0 ? undefined : valorDe(tabla, codigo - 1, donde);
}

// ---------------------------------------------------------------------------
// Piezas pequeñas
// ---------------------------------------------------------------------------

function leerMedida(r: Lector, ctx: string): Medida {
  const [tipo, mide] = desempaquetar(ANCHOS_MEDIDA, r.n(`${ctx}.medida`));
  return { tipo: valorDe(TIPOS_MEDIDA, tipo!, `${ctx}.medida.tipo`), prescrito: r.nOpc(`${ctx}.medida.prescrito`), mide: valorDe(QUIEN_MIDE, mide!, `${ctx}.medida.mide`) };
}

function leerCarga(r: Lector, ctx: string): { kg: number; implementos?: number } {
  const kg = r.centi(`${ctx}.carga.kg`);
  const implementos = r.n(`${ctx}.carga.implementos`);
  return implementos === 0 ? { kg } : { kg, implementos };
}

function leerValorDeEje(r: Lector, eje: Objetivo['eje'], ctx: string): number | null {
  return eje === 'kg' ? r.centiOpc(ctx) : r.deciOpc(ctx);
}

function leerObjetivo(r: Lector, ctx: string): Objetivo {
  const [eje, papel, lleva, avisa, escala] = desempaquetar(ANCHOS_OBJETIVO, r.n(ctx));
  const e = valorDe(EJES, eje!, `${ctx}.eje`);
  const o: Objetivo = { eje: e, min: leerValorDeEje(r, e, `${ctx}.min`), max: leerValorDeEje(r, e, `${ctx}.max`), papel: valorDe(PAPELES, papel!, `${ctx}.papel`) };
  const sentido = valorOpc(SENTIDOS_AVISO, avisa!, `${ctx}.avisa`);
  if (sentido !== undefined) o.avisa = sentido;
  if (lleva) o.palabra = r.cadena(`${ctx}.palabra`);
  const esc = valorOpc(ESCALAS_OBJETIVO, escala!, `${ctx}.escala`);
  if (esc !== undefined) o.escala = esc;
  return o;
}

function leerPosicion(r: Lector, ctx: string): Posicion {
  const mascara = desempaquetar(ANCHOS_POSICION, r.n(`${ctx}.posicion`));
  const pos: Posicion = {};
  CONTADORES.forEach((k, i) => {
    if (mascara[i]) pos[k] = { n: r.n(`${ctx}.posicion.${k}.n`), de: r.n(`${ctx}.posicion.${k}.de`) };
  });
  if (mascara[CONTADORES.length]) {
    const letra = String.fromCharCode(r.n(`${ctx}.slot`) + CODIGO_LETRA_A);
    pos.slot = `${letra}${r.n(`${ctx}.slot`)}`;
  }
  return pos;
}

function leerTarea(r: Lector, ctx: string): Tarea {
  const nombre = r.cadena(`${ctx}.nombre`);
  const [dosis, carga, corporal, corre, mide] = desempaquetar(ANCHOS_TAREA, r.n(`${ctx}.flags`));
  const t: Tarea = { nombre, dosis: dosis ? leerMedida(r, `${ctx}.dosis`) : null, mide: valorDe(QUIEN_MIDE, mide!, `${ctx}.mide`) };
  if (carga) t.carga = leerCarga(r, ctx);
  if (corporal) t.corporal = true;
  if (corre) t.corre = true;
  return t;
}

interface TablasLeidas {
  tareas: Tarea[];
  listas: Tarea[][];
}

function tareaEn(t: TablasLeidas, i: number, ctx: string): Tarea {
  const x = t.tareas[i];
  if (!x) throw new ErrorPlanCompacto('formato', `${ctx}: la tarea ${i} no existe`);
  return x;
}

function listaEn(t: TablasLeidas, i: number, ctx: string): Tarea[] {
  const x = t.listas[i];
  if (!x) throw new ErrorPlanCompacto('formato', `${ctx}: la lista ${i} no existe`);
  return x;
}

function leerWod(r: Lector, t: TablasLeidas, ctx: string): InfoWod {
  const formato = valorDe(FORMATOS_WOD, r.n(`${ctx}.wod.formato`), `${ctx}.wod.formato`);
  switch (formato) {
    case 'emom': {
      const ciclo = listaEn(t, r.n(ctx), ctx);
      const tarea = ciclo[r.n(ctx)];
      if (!tarea) throw new ErrorPlanCompacto('formato', `${ctx}.wod: la tarea del EMOM no está en su ciclo`);
      return { formato, tarea, ciclo, ventanas: r.n(ctx), ventanaS: r.n(ctx) };
    }
    case 'amrap':
    case 'puntuacion':
      return { formato, tareas: listaEn(t, r.n(ctx), ctx), duracionS: r.n(ctx) };
    case 'fortime': {
      const i = r.nOpc(ctx);
      return { formato, tarea: i === null ? null : tareaEn(t, i, ctx), capS: r.nOpc(ctx) };
    }
    case 'pared':
      return { formato, trabajoS: r.n(ctx), descansoS: r.n(ctx), rondas: r.n(ctx) };
    case 'deathby':
      return { formato, tarea: tareaEn(t, r.n(ctx), ctx), inicio: r.n(ctx), incremento: r.n(ctx), ventanaS: r.n(ctx), tope: r.nOpc(ctx) };
  }
}

function leerCargaFuerza(r: Lector, ctx: string): CargaFuerza {
  const tipo = valorDe(TIPOS_CARGA, r.n(`${ctx}.carga.tipo`), `${ctx}.carga.tipo`);
  switch (tipo) {
    case 'kg':
      return { tipo, min: r.centi(ctx), max: r.centi(ctx) };
    case 'rm':
      return { tipo, pctMin: r.deci(ctx), pctMax: r.deci(ctx), rmKg: r.centiOpc(ctx) };
    case 'corporal':
      return { tipo };
    case 'tuya': {
      const ultimaKg = r.centiOpc(ctx);
      return r.n(ctx) ? { tipo, ultimaKg, lastre: true } : { tipo, ultimaKg };
    }
  }
}

function leerEsfuerzo(r: Lector, ctx: string): EsfuerzoFuerza | null {
  const c = r.n(`${ctx}.esfuerzo`);
  if (c === 0) return null;
  return { eje: valorDe(EJES_ESFUERZO, c - 1, `${ctx}.esfuerzo.eje`), min: r.deci(ctx), max: r.deci(ctx) };
}

function leerFicha(r: Lector, ctx: string): FichaFuerza {
  const ejercicio = String(r.n(`${ctx}.ejercicio`));
  const carga = leerCargaFuerza(r, ctx);
  const esfuerzo = leerEsfuerzo(r, ctx);
  const [porLado, aproximacion, vacia] = desempaquetar(ANCHOS_FICHA, r.n(`${ctx}.ficha`));
  const f: FichaFuerza = { ejercicio, carga, esfuerzo, pasoKg: r.centi(`${ctx}.pasoKg`) };
  const lado = valorOpc(POR_LADO, porLado!, `${ctx}.porLado`);
  if (lado !== undefined) f.porLado = lado;
  if (aproximacion) f.aproximacion = true;
  if (vacia) f.vaciaKg = r.centi(`${ctx}.vaciaKg`);
  return f;
}

/** Un relevo de dobles. La pareja y la estación NO viajan aquí: las pone `leerPaso` (plan y paso). */
function leerDobles(r: Lector, ctx: string): Dobles {
  const turno = valorDe(TURNOS_DOBLES, r.n(`${ctx}.turno`), `${ctx}.turno`);
  const tuyas = r.nOpc(`${ctx}.tuyas`);
  const suyas = r.nOpc(`${ctx}.suyas`);
  const d: Dobles = { turno, pctTuyo: r.n(`${ctx}.pctTuyo`) };
  if (tuyas !== null) d.tuyas = tuyas;
  if (suyas !== null) d.suyas = suyas;
  const alterna = r.n(`${ctx}.alterna`);
  if (alterna !== 0) d.alternaCada = { tipo: valorDe(TIPOS_ALTERNA, alterna - 1, `${ctx}.alterna.tipo`), n: r.n(`${ctx}.alterna.n`) };
  return d;
}

// ---------------------------------------------------------------------------
// El paso
// ---------------------------------------------------------------------------

function leerPaso(r: Lector, i: number, t: TablasLeidas, pareja: string | undefined): PasoBase {
  const ctx = `paso ${i}`;
  const clase = valorDe(CLASES, r.n(`${ctx}.clase`), `${ctx}.clase`);
  const [rol, fase, cierre] = desempaquetar(ANCHOS_ROL_FASE, r.n(`${ctx}.rol`));
  const medida = leerMedida(r, ctx);
  const [nObjetivos, ...bits] = desempaquetar(ANCHOS_BANDERAS_PASO, r.n(`${ctx}.banderas`));
  const hay = Object.fromEntries(BANDERAS_PASO.map((b, k) => [b, bits[k] === 1])) as Record<BanderaPaso, boolean>;

  const p: PasoBase = {
    id: String(i),
    clase,
    rol: valorDe(ROLES, rol!, `${ctx}.rol`),
    fase: valorDe(FASES, fase!, `${ctx}.fase`),
    medida,
    objetivos: [],
    cierre: cierre ? 'atleta' : 'medida',
  };
  if (hay.extras) {
    const [modo, entorno, maquina, roxzone] = desempaquetar(ANCHOS_EXTRAS, r.n(`${ctx}.extras`));
    const m = valorOpc(MODOS_RECUPERA, modo!, `${ctx}.modoRecupera`);
    const e = valorOpc(ENTORNOS, entorno!, `${ctx}.entorno`);
    const q = valorOpc(MAQUINAS, maquina!, `${ctx}.maquina`);
    const x = valorOpc(ROXZONAS, roxzone!, `${ctx}.roxzone`);
    if (m !== undefined) p.modoRecupera = m;
    if (e !== undefined) p.entorno = e;
    if (q !== undefined) p.maquina = { tipo: q };
    if (x !== undefined) p.roxzone = x;
  }
  for (let k = 0; k < nObjetivos!; k++) p.objetivos.push(leerObjetivo(r, `${ctx}.objetivos[${k}]`));
  if (hay.posicion) p.posicion = leerPosicion(r, ctx);
  if (hay.bloque) p.bloque = r.n(`${ctx}.bloque`);
  if (hay.nombre) p.nombre = r.cadena(`${ctx}.nombre`);
  if (hay.carga) p.carga = leerCarga(r, ctx);
  if (hay.tempo) p.tempo = { excentrica: r.n(ctx), pausaAbajo: r.n(ctx), concentrica: r.n(ctx), pausaArriba: r.n(ctx) };
  if (hay.cue) p.cue = r.cadena(`${ctx}.cue`);
  if (hay.vueltaAuto) p.vueltaAutoM = r.n(`${ctx}.vueltaAutoM`);
  if (hay.damper) {
    if (!p.maquina) throw new ErrorPlanCompacto('formato', `${ctx}: damper sin máquina`);
    p.maquina.damper = r.n(`${ctx}.damper`);
  }
  if (hay.wod) p.wod = leerWod(r, t, ctx);
  if (hay.fuerza) p.fuerza = leerFicha(r, ctx);
  if (hay.dobles) {
    // La pareja es de la sesión y la estación se deriva del paso: el pintor las lee del paso, como siempre.
    p.dobles = { ...leerDobles(r, ctx), ...(pareja !== undefined ? { pareja } : {}) };
    p.dobles.estacion = estacionDe(p);
  }
  if (hay.grupo) p.grupo = { id: r.n(`${ctx}.grupo.id`), veces: r.n(`${ctx}.grupo.veces`) };
  return p;
}

// ---------------------------------------------------------------------------
// Cabecera, zonas, reglas, vocabulario, método
// ---------------------------------------------------------------------------

function leerZonas(r: Lector): ZonasCoach | null {
  const n = r.n('plan.zonas');
  if (n === 0) return null;
  const techos = Array.from({ length: n }, () => r.n('plan.zonas.techos'));
  const procedencia = valorDe(PROCEDENCIAS, r.n('plan.zonas.procedencia'), 'plan.zonas.procedencia');
  const zonas: ZonasCoach = { techos, procedencia };
  if (r.n('plan.zonas.nombres')) zonas.nombres = techos.map(() => r.cadena('plan.zonas.nombres'));
  return zonas;
}

function leerBandasRitmo(r: Lector): BandasRitmo[] {
  const n = r.n('plan.bandasRitmo');
  return Array.from({ length: n }, (_, i) => {
    const unidad = valorDe(UNIDADES_RITMO, r.n(`bandas[${i}].unidad`), `bandas[${i}].unidad`);
    const procedencia = valorDe(PROCEDENCIAS, r.n(`bandas[${i}].procedencia`), `bandas[${i}].procedencia`);
    const zonas = Array.from({ length: r.n(`bandas[${i}].zonas`) }, () => ({ rapidoS: r.n(`bandas[${i}].rapidoS`), lentoS: r.nOpc(`bandas[${i}].lentoS`) }));
    return { unidad, procedencia, zonas };
  });
}

function leerReglas(r: Lector): ReglasAviso {
  // El orden es el de `escribirReglas`: cada lectura avanza el cursor.
  const holgura = {
    ritmo: r.n('plan.reglas.holgura.ritmo'),
    ppm: r.n('plan.reglas.holgura.ppm'),
    split500: r.n('plan.reglas.holgura.split500'),
    vatios: r.n('plan.reglas.holgura.vatios'),
    cadencia: r.n('plan.reglas.holgura.cadencia'),
  };
  const cadenciaS = r.n('plan.reglas.cadenciaS');
  const confirmacionS = r.n('plan.reglas.confirmacionS');
  const graciaZonaS = r.n('plan.reglas.graciaZonaS');
  const preavisoS = r.n('plan.reglas.preavisoS');
  const preavisoM = r.n('plan.reglas.preavisoM');
  const preavisoMinimoS = r.n('plan.reglas.preavisoMinimoS');
  const [calentamiento, recuperacion] = desempaquetar(ANCHOS_FLAGS_REGLAS, r.n('plan.reglas.avisar'));
  return {
    holgura,
    cadenciaS,
    confirmacionS,
    graciaZonaS,
    preavisoS,
    preavisoM,
    preavisoMinimoS,
    avisarEnCalentamiento: calentamiento === 1,
    avisarEnRecuperacion: recuperacion === 1,
  };
}

function leerVocabulario(r: Lector): Vocabulario {
  const clases: Vocabulario['clases'] = {};
  const n = r.n('vocabulario.clases');
  for (let k = 0; k < n; k++) {
    const clase = valorDe(CLASES, r.n('vocabulario.clase'), 'vocabulario.clase');
    const nc: NombreClase = { nombre: r.cadena(`vocabulario.clases.${clase}`), femenino: r.n('vocabulario.femenino') === 1 };
    clases[clase] = nc;
  }
  const formatos = Object.fromEntries(FORMATOS_NOMBRADOS.map((f) => [f, r.cadena(`vocabulario.formatos.${f}`)])) as Vocabulario['formatos'];
  const rpe = Array.from({ length: NUM_PALABRAS_RPE }, (_, k) => r.cadena(`vocabulario.rpe[${k}]`));
  return { clases, formatos, rpe };
}

function leerMetodo(r: Lector): MetodoReloj {
  const paresMinimos = r.n('metodo.resumen.paresMinimos');
  const umbralHecho = r.n('metodo.resumen.umbralHecho') / ESCALA_PCT;
  const guardarQuietoS = r.n('metodo.resumen.guardarQuietoS');
  const repsDeMas = r.n('metodo.anotar.repsDeMas');
  const eje = () => ({ min: r.deci('metodo.anotar.min'), max: r.deci('metodo.anotar.max'), paso: r.deci('metodo.anotar.paso') });
  const rpe = eje();
  const rir = eje();
  return { resumen: { paresMinimos, umbralHecho, guardarQuietoS }, anotar: { repsDeMas, rpe, rir, kgMax: r.centi('metodo.anotar.kgMax') } };
}

// ---------------------------------------------------------------------------
// Entrada pública
// ---------------------------------------------------------------------------

/** Del flujo a la sesión. Rechaza una versión distinta de la que este código escribe. */
export function decodificarFlujo(f: Flujo): SesionCompacta {
  if (f.version !== VERSION_ESQUEMA) {
    throw new ErrorPlanCompacto('version', `plan de la versión ${f.version}; este reloj entiende la ${VERSION_ESQUEMA}`);
  }
  const r = new Lector(f);
  const asignacionId = r.n('meta.asignacionId');
  const huella = r.n('meta.huella');
  const fitSport = r.n('meta.fitSport');
  const fitSubSport = r.n('meta.fitSubSport');
  const entorno = valorOpc(ENTORNOS, r.n('meta.entorno'), 'meta.entorno') ?? null;
  const duracionEstS = r.n('meta.duracionEstS');
  const zonas = leerZonas(r);
  const bandasRitmo = leerBandasRitmo(r);
  const reglas = leerReglas(r);
  const vocabulario = leerVocabulario(r);
  const metodo = leerMetodo(r);
  const pareja = r.cadenaOpc('plan.pareja');

  const tareas = Array.from({ length: r.n('tareas') }, (_, k) => leerTarea(r, `tarea ${k}`));
  const listas = Array.from({ length: r.n('listas') }, () => Array.from({ length: r.n('listas.largo') }, () => tareaEn({ tareas, listas: [] }, r.n('listas.tarea'), 'listas')));
  const pasos = Array.from({ length: r.n('pasos') }, (_, i) => leerPaso(r, i, { tareas, listas }, pareja));
  r.fin();

  const plan: PlanSesion = { pasos, zonas, reglas, vocabulario, metodo };
  if (bandasRitmo.length > 0) plan.bandasRitmo = bandasRitmo;
  if (pareja !== undefined) plan.pareja = pareja;
  const meta: MetaSesion = { asignacionId, huella, fitSport, fitSubSport, entorno, duracionEstS };
  return { meta, plan };
}

/** `decodificarSesion(bytes)`: la sesión (cabecera + plan) desde los bytes del servidor. */
export function decodificarSesion(bytes: Uint8Array): SesionCompacta {
  return decodificarFlujo(deBinario(bytes));
}

/** Solo el plan, tal como lo consume el motor del kit. */
export function decodificarPlan(bytes: Uint8Array): PlanSesion {
  return decodificarSesion(bytes).plan;
}

/** Desde el sobre JSON con el base64 (lo que baja por la red). */
export function decodificarSobre(json: string): SesionCompacta {
  return decodificarSesion(desenvolver(json));
}
