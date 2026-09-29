// LO QUE PERFIL DECIDE, PURO Y CON TEST (web/tests/design-twin/perfil-rehecho.test.ts).
//
// La pantalla PINTA lo que sale de aquí y no calcula nada. Está separado porque
// es donde viven las decisiones que importan (qué es un contador y qué un valor
// medido, cuándo un hueco se declara y cuándo se calla, qué reclama al atleta y
// qué puerta se queda a la vista), y así se prueban una a una en vez de a través
// de una captura.
//
// Es el port de `RendimientoEstados` (RendimientoSection.swift) y de las reglas
// de `ProfileView` (subtítulo de identidad, puertas), más lo que Swift no tiene:
// la fuente que NO contestó, el estado de cada puerta y el reparto de lo que
// reclama.

import {
  ETIQUETA_OBJETIVO,
  NOMBRE_DISPOSITIVO,
  type Identidad,
  type LecturaPerfil,
  type Suscripcion,
} from './contrato';
import { cifraKg } from './rendimiento';
import { SEP, unir } from './texto';

// ---------------------------------------------------------------------------
// Identidad
// ---------------------------------------------------------------------------

/** Iniciales del avatar. VACÍAS sin nombre: un círculo con un guion no es un dato (§7). */
export function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0))
    .join('')
    .toUpperCase();
}

/**
 * El subtítulo, hecho SOLO con los campos que hay (`identitySubtitle`): división
 * (de su carrera), edad, años entrenando, altura y peso. No existe un «nivel» del
 * atleta y no se inventa. Null = no hay ni una métrica: el subtítulo se calla y
 * en su sitio va la invitación a completarlo.
 *
 * Diferencia con Swift, a propósito: «6 años entrenando» y «172 cm · 64,5 kg»
 * (Swift escribe «6y entrenando» y «172cm / 64kg»: inglés a medias y sin espacio,
 * contra CONTRATO-UI §2 y §3).
 */
export function subtituloIdentidad(id: Identidad): string | null {
  const partes: string[] = [];
  if (id.division) partes.push(`división ${id.division}`);
  if (id.edad !== null) partes.push(`${id.edad} años`);
  if (id.anosEntrenando !== null && id.anosEntrenando > 0) {
    partes.push(id.anosEntrenando === 1 ? '1 año entrenando' : `${id.anosEntrenando} años entrenando`);
  }
  const cuerpo = [
    id.alturaCm !== null ? `${Math.round(id.alturaCm)} cm` : null,
    id.pesoKg !== null ? `${cifraKg(id.pesoKg)} kg` : null,
  ].filter((x): x is string => x !== null);
  if (cuerpo.length > 0) partes.push(cuerpo.join(SEP));
  return partes.length > 0 ? partes.join(SEP) : null;
}

/**
 * El momento del sujeto. `por-completar` es la invitación honesta: sin nombre, o
 * sin ni una métrica que contar. Una foto que falta NO lo activa (nunca se obliga
 * a poner la cara): la chapita de cámara del avatar es su única insistencia.
 */
export type ModoIdentidad = 'cargando' | 'error' | 'completo' | 'por-completar';

export function modoIdentidad(l: LecturaPerfil): ModoIdentidad {
  if (l.cargando) return 'cargando';
  if (l.errorCarga) return 'error';
  if (l.identidad.nombre.trim() === '' || subtituloIdentidad(l.identidad) === null) return 'por-completar';
  return 'completo';
}

/** El título del sujeto: el nombre, o la pregunta cuando aún no lo hay. */
export function tituloIdentidad(id: Identidad): string {
  const n = id.nombre.trim();
  return n === '' ? '¿Cómo te llamas?' : n;
}

/**
 * La frase que acompaña al sujeto cuando NO hay subtítulo, y qué le cuesta al
 * atleta cambiarlo. Solo promete lo que la app hace de verdad: con fecha de
 * nacimiento el servidor saca una primera estimación de zonas de pulso
 * (`from_age`; MyZonesView lo dice), y solo con coach hay zonas que enseñar.
 */
export function apoyoDeIdentidad(l: LecturaPerfil): string | null {
  const id = l.identidad;
  if (id.nombre.trim() === '') return 'Ponle nombre a tu perfil para empezar.';
  if (subtituloIdentidad(id) !== null) return null;
  if (l.conCoach && id.edad === null && id.fcMax === null) {
    return 'Con tu fecha de nacimiento calculamos tus primeras zonas de pulso.';
  }
  return 'Cuéntanos tu edad, tu altura y tu peso.';
}

/** La única acción del sujeto, la que más falta. */
export function accionIdentidad(l: LecturaPerfil): string {
  const m = modoIdentidad(l);
  if (m === 'error') return 'Reintentar';
  if (l.identidad.nombre.trim() === '') return 'Poner mi nombre';
  return m === 'por-completar' ? 'Completar mi perfil' : 'Editar perfil';
}

/**
 * El tamaño del nombre. El display de marca son 44 px; un nombre largo no puede
 * ganar una tercera línea (Swift: `minimumScaleFactor(0.7)`). Es mecanismo de
 * maquetación, no método: no depende de ningún coach.
 */
export function tamNombre(texto: string): number {
  if (texto.length <= 22) return 44;
  if (texto.length <= 30) return 36;
  return 30;
}

// ---------------------------------------------------------------------------
// Lo que reclama al atleta («Pendiente»)
// ---------------------------------------------------------------------------

export type Pendiente =
  /** Una actividad nueva de COROS que puede ser el entreno previsto de hoy. */
  | { clave: 'coros'; inicio: string | null }
  /** La suscripción necesita al atleta: pago pendiente o cancelada. */
  | { clave: 'suscripcion'; estado: 'pago-pendiente' | 'cancelada' }
  /** Dobles sin compañero/a y sin invitación viva: invitar es un acto. */
  | { clave: 'pareja'; estado: 'sin-pareja' | 'caducada' | 'rechazada'; email: string | null };

/**
 * Lo que espera una respuesta suya, en el orden en que CADUCA: la pregunta de
 * COROS (ligada a la sesión de hoy) primero, el pago después, la pareja al final.
 *
 * Solo entran ACTOS. Una suscripción que termina o una invitación enviada no
 * reclaman nada: son un estado, y viven en la puerta. En frío o con la identidad
 * caída no se sabe qué reclama: no se pinta nada (aparece cuando llega).
 */
export function pendientesDe(l: LecturaPerfil): Pendiente[] {
  if (l.cargando || l.errorCarga) return [];
  const out: Pendiente[] = [];
  if (l.corosPendiente) out.push({ clave: 'coros', inicio: l.corosPendiente.inicio });
  if (l.conCoach && l.suscripcion) {
    if (l.suscripcion.tipo === 'pago-pendiente' || l.suscripcion.tipo === 'cancelada') {
      out.push({ clave: 'suscripcion', estado: l.suscripcion.tipo });
    }
  }
  const d = l.dobles;
  if (d) {
    if (d.tipo === 'sin-pareja') out.push({ clave: 'pareja', estado: 'sin-pareja', email: null });
    if (d.tipo === 'invitacion' && d.estado !== 'pendiente') {
      out.push({ clave: 'pareja', estado: d.estado, email: d.email });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Las puertas
// ---------------------------------------------------------------------------

export type ClavePuerta = 'identidad' | 'entreno' | 'dispositivos' | 'cuenta' | 'privacidad' | 'ayuda';

/** El color va en la marca, nunca en el texto. `invita` = el atleta puede hacer algo; `neutro` = una decisión suya. */
export type TonoMarca = 'ok' | 'aviso' | 'peligro' | 'invita' | 'neutro';

export interface EstadoPuerta {
  texto: string;
  tono: TonoMarca;
}

export interface Puerta {
  clave: ClavePuerta;
  titulo: string;
  /** El nombre en minúsculas, para decir qué hay tras el pliegue («cuenta, privacidad y ayuda»). */
  corto: string;
  /** El subtítulo REAL de Swift; solo se enseña cuando la puerta no tiene un estado mejor que decir. */
  descripcion: string;
  estado: EstadoPuerta | null;
  /** El estado pide al atleta (aviso o peligro): la puerta no se pliega. */
  atencion: boolean;
}

const GRAVEDAD: Record<TonoMarca, number> = { neutro: 0, ok: 1, invita: 2, aviso: 3, peligro: 4 };
const peor = (a: TonoMarca, b: TonoMarca): TonoMarca => (GRAVEDAD[b] > GRAVEDAD[a] ? b : a);

function textoSuscripcion(s: Suscripcion): { texto: string; tono: TonoMarca } {
  switch (s.tipo) {
    case 'activa':
      return { texto: 'Suscripción activa', tono: 'ok' };
    case 'termina':
      return { texto: `Suscripción: termina el ${s.el}`, tono: 'aviso' };
    case 'prueba':
      return { texto: s.hasta ? unir('En prueba', `hasta ${s.hasta}`) : 'En prueba', tono: 'ok' };
    case 'pago-pendiente':
      return { texto: 'Pago pendiente', tono: 'peligro' };
    case 'cancelada':
      return { texto: 'Suscripción cancelada', tono: 'peligro' };
    case 'pausada':
      return { texto: 'Suscripción pausada', tono: 'neutro' };
  }
}

function estadoIdentidad(l: LecturaPerfil): EstadoPuerta | null {
  const partes: string[] = [];
  let tono: TonoMarca = 'neutro';
  const d = l.dobles;
  if (d) {
    if (d.tipo === 'con-pareja') partes.push(unir('Dobles', `con ${d.nombre}`));
    else if (d.tipo === 'sin-pareja') {
      partes.push(unir('Dobles', 'sin compañero/a'));
      tono = peor(tono, 'invita');
    } else if (d.estado === 'pendiente') {
      partes.push(unir('Dobles', d.caduca ? `invitación enviada, caduca ${d.caduca}` : 'invitación enviada'));
    } else {
      partes.push(unir('Dobles', d.estado === 'caducada' ? 'la invitación caducó' : 'invitación rechazada'));
      tono = peor(tono, 'aviso');
    }
  }
  if (l.conCoach && l.suscripcion) {
    const s = textoSuscripcion(l.suscripcion);
    // Una suscripción al día no es noticia: solo se dice si no hay nada más que contar.
    if (s.tono !== 'ok' || partes.length === 0) {
      partes.push(s.texto);
      tono = peor(tono, s.tono);
    }
  }
  return partes.length > 0 ? { texto: partes.join(SEP), tono } : null;
}

export function listaConY(nombres: string[]): string {
  if (nombres.length <= 1) return nombres.join('');
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
}

/** Las seis puertas, en el orden de Swift (Identidad, Entreno, Dispositivos, Cuenta, Privacidad, Ayuda). */
export function puertasDe(l: LecturaPerfil): Puerta[] {
  // En frío o con la identidad caída no se sabe el estado de nada: se dice lo que hay dentro.
  const sabe = !l.cargando && !l.errorCarga;

  const identidadDesc = l.identidad.objetivo
    ? `Modalidad, objetivo${SEP}${ETIQUETA_OBJETIVO[l.identidad.objetivo]}`
    : l.conCoach
      ? 'Modalidad, suscripción, objetivo e idioma'
      : 'Modalidad, objetivo e idioma';

  const estadoDispositivos: EstadoPuerta | null = !sabe
    ? null
    : l.dispositivos.length === 0
      ? { texto: 'Ningún dispositivo conectado', tono: 'invita' }
      : {
          texto: `${listaConY(l.dispositivos.map((d) => NOMBRE_DISPOSITIVO[d]))} ${l.dispositivos.length === 1 ? 'conectado' : 'conectados'}`,
          tono: 'ok',
        };

  // Permitir o retirar es una decisión suya, no un fallo: ni verde ni rojo.
  const estadoPrivacidad: EstadoPuerta | null =
    sabe && l.movimientoReloj !== 'sin-preguntar'
      ? { texto: `Movimiento del reloj: ${l.movimientoReloj === 'permitido' ? 'permitido' : 'retirado'}`, tono: 'neutro' }
      : null;

  const puertas: Omit<Puerta, 'atencion'>[] = [
    { clave: 'identidad', titulo: 'Identidad', corto: 'identidad', descripcion: identidadDesc, estado: sabe ? estadoIdentidad(l) : null },
    {
      clave: 'entreno',
      titulo: 'Entreno',
      corto: 'entreno',
      descripcion: 'Días, molestias, avisos de voz y pruebas del reloj',
      estado: null,
    },
    {
      clave: 'dispositivos',
      titulo: 'Dispositivos y apps',
      corto: 'dispositivos',
      descripcion: 'Apple Health, reloj, Garmin, Polar, COROS y más',
      estado: estadoDispositivos,
    },
    {
      clave: 'cuenta',
      titulo: 'Cuenta',
      corto: 'cuenta',
      descripcion: l.conCoach ? 'Apariencia, metodología y eliminar tu cuenta' : 'Apariencia y eliminar tu cuenta',
      estado: null,
    },
    {
      clave: 'privacidad',
      titulo: 'Privacidad',
      corto: 'privacidad',
      descripcion: 'Movimiento del reloj, tus datos y la política de privacidad',
      estado: estadoPrivacidad,
    },
    { clave: 'ayuda', titulo: 'Ayuda y legal', corto: 'ayuda', descripcion: 'Sugerencias y términos', estado: null },
  ];

  return puertas.map((p) => ({
    ...p,
    atencion: p.estado !== null && (p.estado.tono === 'aviso' || p.estado.tono === 'peligro'),
  }));
}

/**
 * Se queda a la vista lo que se usa (Identidad, Entreno, Dispositivos) y TODA puerta
 * que dice algo del atleta: un dispositivo conectado o no, una decisión tomada sobre
 * su privacidad, una suscripción que termina. Se pliega lo que no tiene nada que
 * decir (Cuenta, Ayuda y legal, y Privacidad mientras no se le haya preguntado
 * nada). Una puerta que pide al atleta NUNCA se pliega: es un caso de la misma regla.
 * El orden interno es el de Swift.
 */
const SIEMPRE_A_LA_VISTA: readonly ClavePuerta[] = ['identidad', 'entreno', 'dispositivos'];

export function agruparPuertas(puertas: Puerta[]): { visibles: Puerta[]; plegadas: Puerta[] } {
  const visible = (p: Puerta) => SIEMPRE_A_LA_VISTA.includes(p.clave) || p.estado !== null;
  return { visibles: puertas.filter(visible), plegadas: puertas.filter((p) => !visible(p)) };
}
