// EL MOMENTO DEL DÍA — qué es el sujeto de la portada AHORA.
//
// La tesis de `hoy-dia`: el atleta no abre la app para ver el mismo panel
// siempre, abre para saber qué le toca ahora, y eso cambia a lo largo del día.
// Estas funciones son PURAS sobre la `LecturaHoy` (kit-hoy/contrato): la
// pantalla pinta lo que decidan, no decide nada por su cuenta. Lo fija
// `tests/design-twin/hoy-dia-momento.test.ts` sobre los catorce casos.
//
// Precedencia OBJETIVA (no es gusto: cada paso tapa a los de debajo porque
// sin él los de debajo no se pueden leer o no se pueden hacer):
//   1. cargando            → esqueleto (aún no sabemos cuál de los demás toca)
//   2. error de carga      → «No pudimos cargar tu plan» con «Reintentar»
//   3. sin coach           → montar el entreno de hoy (no hay plan que contar)
//   4. plan en pausa       → la pausa, dicha con calma (no una sesión vieja)
//   5. entreno a medias    → retomarlo (es la MISMA sesión, ya empezada)
//   6. check-in pendiente  → el check-in (el camino más corto a un número)
//   7. sesión pendiente    → la primera pendiente, como ESTADO (la puerta es el Plan)
//   8. sesiones cerradas   → «Hecho hoy», con hecha / a medias / sin hacer
//   9. descanso            → «Hoy descansas» y qué toca después; sin nada
//                            publicado y sin ningún dato, es el primer día.

import type {
  EstadoSesion,
  LecturaHoy,
  ModalidadHoy,
  Reclamo,
  SesionHoy,
} from '../../kit-hoy/contrato';

export type Manana = { titulo: string; modalidad: ModalidadHoy; dia: string };

export type Momento =
  | { tipo: 'cargando' }
  | { tipo: 'error' }
  | { tipo: 'libre' }
  | { tipo: 'pausa' }
  /** `sesion` es la de hoy con el mismo título, si la hay (para su modalidad). */
  | { tipo: 'retoma'; titulo: string; desde: string; sesion: SesionHoy | null }
  | { tipo: 'checkin' }
  /** `delDia` son TODAS las de hoy (para decir la otra franja sin hacerla héroe). */
  | { tipo: 'sesion'; sesion: SesionHoy; delDia: SesionHoy[] }
  | { tipo: 'hecho'; sesiones: SesionHoy[] }
  | { tipo: 'descanso'; manana: Manana | null }
  | { tipo: 'primer-dia' };

export type TipoMomento = Momento['tipo'];

type ReclamoDe<K extends Reclamo['clave']> = Extract<Reclamo, { clave: K }>;

function reclamo<K extends Reclamo['clave']>(l: LecturaHoy, clave: K): ReclamoDe<K> | null {
  return (l.reclamos.find((r) => r.clave === clave) as ReclamoDe<K> | undefined) ?? null;
}

/** Las sesiones de hoy, en el orden del día (AM, PM). Vacío si hoy no las trae. */
export function sesionesDeHoy(l: LecturaHoy): SesionHoy[] {
  return l.hoy?.tipo === 'sesiones' ? l.hoy.sesiones : [];
}

/**
 * El primer día: nada publicado después de hoy Y ningún dato del atleta todavía
 * (ni número de disposición ni una marca). Un veterano al final de lo publicado
 * NO es un primer día: es un descanso sin «mañana» todavía.
 */
function esPrimerDia(l: LecturaHoy): boolean {
  return l.disposicion.tipo === 'sin-datos' && l.marca === null;
}

export function momento(l: LecturaHoy): Momento {
  if (l.cargando) return { tipo: 'cargando' };
  if (l.hoy?.tipo === 'error-carga') return { tipo: 'error' };
  if (!l.conCoach) return { tipo: 'libre' };
  if (l.hoy?.tipo === 'pausado') return { tipo: 'pausa' };

  const sesiones = sesionesDeHoy(l);
  const aMedias = reclamo(l, 'a-medias');
  if (aMedias) {
    const sesion = sesiones.find((s) => s.titulo === aMedias.titulo) ?? null;
    return { tipo: 'retoma', titulo: aMedias.titulo, desde: aMedias.desde, sesion };
  }
  if (l.checkinPendiente) return { tipo: 'checkin' };

  const pendiente = sesiones.find((s) => s.estado === 'pendiente');
  if (pendiente) return { tipo: 'sesion', sesion: pendiente, delDia: sesiones };
  if (sesiones.length > 0) return { tipo: 'hecho', sesiones };

  // Con coach y sin `hoy` (o una lista vacía) es lo mismo que un día sin nada.
  const manana = l.hoy?.tipo === 'descanso' ? l.hoy.manana : null;
  if (!manana && esPrimerDia(l)) return { tipo: 'primer-dia' };
  return { tipo: 'descanso', manana };
}

// ---------------------------------------------------------------------------
// La línea del día — el instante en el que estás, sin inventar horarios
// ---------------------------------------------------------------------------

export type Paso = 'antes' | 'entreno' | 'despues';

export const PASOS: readonly Paso[] = ['antes', 'entreno', 'despues'];

export const ETIQUETA_PASO: Record<Paso, string> = {
  antes: 'Antes',
  entreno: 'Entreno',
  despues: 'Después',
};

export type Instante =
  /** Un día con sesiones: dónde estás respecto a ellas. `cerradas` de `total`. */
  | { tipo: 'recorrido'; ahora: Paso; cerradas: number; total: number }
  /** Un día sin sesiones que recorrer: se dice qué día es, no se dibuja un recorrido vacío. */
  | { tipo: 'rotulo'; texto: string };

/**
 * Dónde estás en el día. Sale del ESTADO de las sesiones (y de si hay una
 * empezada), jamás de una hora del plan: el plan no la tiene y la hora del
 * reloj no dice si ya entrenaste. Null cuando no hay día que contar (cargando,
 * error o sin coach).
 */
export function instanteDelDia(l: LecturaHoy): Instante | null {
  if (l.cargando || !l.conCoach || l.hoy === null) return null;
  if (l.hoy.tipo === 'error-carga') return null;
  if (l.hoy.tipo === 'pausado') return { tipo: 'rotulo', texto: 'Plan en pausa' };

  const empezado = reclamo(l, 'a-medias') !== null;
  const sesiones = sesionesDeHoy(l);
  if (sesiones.length === 0) {
    if (empezado) return { tipo: 'rotulo', texto: 'Entreno a medias' };
    const manana = l.hoy.tipo === 'descanso' ? l.hoy.manana : null;
    return { tipo: 'rotulo', texto: !manana && esPrimerDia(l) ? 'Primer día' : 'Día de descanso' };
  }

  const total = sesiones.length;
  const cerradas = sesiones.filter((s) => s.estado !== 'pendiente').length;
  const ahora: Paso = empezado ? 'entreno' : cerradas === 0 ? 'antes' : cerradas === total ? 'despues' : 'entreno';
  return { tipo: 'recorrido', ahora, cerradas, total };
}

// ---------------------------------------------------------------------------
// El saludo por la hora — el mismo corte que InicioView.timeOfDayGreeting
// ---------------------------------------------------------------------------

export function saludo(hora: string, nombre: string | null): string {
  const h = Number.parseInt(hora.split(':')[0] ?? '', 10);
  const base = h >= 6 && h < 13 ? 'Buenos días' : h >= 13 && h < 21 ? 'Buenas tardes' : 'Buenas noches';
  return nombre ? `${base}, ${nombre}` : base;
}

// ---------------------------------------------------------------------------
// «Contigo» — lo que te reclama, en el orden en que caduca
// ---------------------------------------------------------------------------

export type ItemContigo = Reclamo | { clave: 'comunicados'; n: number };

/**
 * Orden de lo que reclama: primero lo que caduca en minutos (tu pareja está
 * entrenando AHORA), luego lo empezado, luego lo que tiene fecha, luego lo que
 * espera sin prisa. Es mecanismo de la portada, no método del coach.
 */
const ORDEN_CONTIGO: Record<ItemContigo['clave'], number> = {
  'pareja-en-vivo': 0,
  'a-medias': 1,
  revision: 2,
  tests: 3,
  comunicados: 4,
};

/**
 * Los tests que el primer día se lleva el sujeto («empieza por tus tests»).
 * Solo si faltan: una batería completa no es por dónde empezar.
 */
export function testsDelPrimerDia(l: LecturaHoy): ReclamoDe<'tests'> | null {
  const t = reclamo(l, 'tests');
  return t && t.hechos < t.total ? t : null;
}

export function itemsContigo(l: LecturaHoy, m: Momento): ItemContigo[] {
  if (l.cargando) return [];
  const pausado = l.hoy?.tipo === 'pausado';
  const items: ItemContigo[] = l.reclamos.filter((r) => {
    // Lo empezado ya es el sujeto cuando toca; si otro momento lo tapa, se queda aquí.
    if (r.clave === 'a-medias') return m.tipo !== 'retoma';
    // Sin coach no hay revisión, ni batería, ni pareja de dobles (la crea el coach).
    if (!l.conCoach) return false;
    // Con el plan en pausa no hay tests que hacer (InicioView los esconde igual).
    if (r.clave === 'tests') return !pausado && !(m.tipo === 'primer-dia' && testsDelPrimerDia(l));
    return true;
  });
  if (l.conCoach && l.comunicados > 0) items.push({ clave: 'comunicados', n: l.comunicados });
  return items.sort((a, b) => ORDEN_CONTIGO[a.clave] - ORDEN_CONTIGO[b.clave]);
}

/**
 * «Únete en vivo» solo cuando tienes TU sesión pendiente hoy y el plan no está
 * en pausa (DoblesLiveBanner: `canStartToday`). Unirse lleva al Plan, que es la
 * única puerta que empieza un entreno.
 */
export function puedeUnirse(l: LecturaHoy): boolean {
  return sesionesDeHoy(l).some((s) => s.estado === 'pendiente');
}

// ---------------------------------------------------------------------------
// Vocabulario — el de la app, no uno nuevo
// ---------------------------------------------------------------------------

/**
 * Las marcas de estado de la app (`SessionMarkState` → PlanHeroeHoy):
 * `.done` «Completada», `.partial` «A medias», `.missed` «Sin hacer». La
 * pendiente no lleva marca en la app; aquí se dice «Por hacer» (la voz del
 * carril del plan) solo donde hace falta nombrarla.
 */
export const ETIQUETA_ESTADO: Record<EstadoSesion, string> = {
  hecha: 'Completada',
  parcial: 'A medias',
  saltada: 'Sin hacer',
  pendiente: 'Por hacer',
};

/** `Theme.Modality.Kind.label`, con mayúscula inicial. */
export const NOMBRE_MODALIDAD: Record<ModalidadHoy, string> = {
  run: 'Carrera',
  ergo: 'Ergómetro',
  strength: 'Fuerza',
  functional: 'Funcional',
  hyrox: 'HYROX',
  support: 'Movilidad',
  other: 'Otro',
};

export function capitaliza(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
