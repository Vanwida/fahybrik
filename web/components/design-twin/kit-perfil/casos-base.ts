// LA BASE DE LOS CASOS DE «PERFIL»: los constructores y los tres atletas de
// partida (el que lo tiene todo, el recién dado de alta y el que no tiene coach).
// Cada caso de `casos.ts` parte de `BASE` y pisa solo lo que ejercita. Los atletas
// son INVENTADOS (CONTRATO-UI §7; memoria «no hay atletas reales»).

import type {
  CasoPerfil,
  Fuente,
  FuentesRendimiento,
  Identidad,
  LecturaPerfil,
} from './contrato';

export const contesto = <V,>(valor: V): Fuente<V> => ({ tipo: 'contesto', valor });
export const CARGANDO: Fuente<never> = { tipo: 'cargando' };
export const SIN_RESPUESTA: Fuente<never> = { tipo: 'sin-respuesta' };

/** Una identidad vacía: lo único que sabe la app de quien acaba de crear la cuenta es su nombre. */
export const IDENTIDAD_VACIA: Identidad = {
  nombre: '',
  foto: false,
  division: null,
  edad: null,
  anosEntrenando: null,
  alturaCm: null,
  pesoKg: null,
  fcMax: null,
  objetivo: null,
};

export const identidad = (id: Partial<Identidad>): Identidad => ({ ...IDENTIDAD_VACIA, ...id });

/** Todo con dato: el atleta que lleva un año. */
export const FUENTES_LLENAS: FuentesRendimiento = {
  bateria: contesto({ total: 4, completados: 4, aMedias: 0 }),
  marcas: contesto({ conRecord: 9, catalogo: 12 }),
  vo2: contesto({ valor: 52.8, fuente: 'reloj' }),
  zonas: contesto({ umbralPpm: 163, origen: 'Medido en tu test de umbral' }),
  fuerza: contesto([
    { etiqueta: 'Sentadilla', kg: 140 },
    { etiqueta: 'Peso muerto', kg: 165 },
    { etiqueta: 'Press banca', kg: 82.5 },
  ]),
};

/** Nada medido: el que acaba de darse de alta. Los contadores se pintan en cero. */
export const FUENTES_VACIAS: FuentesRendimiento = {
  bateria: contesto({ total: 4, completados: 0, aMedias: 0 }),
  marcas: contesto({ conRecord: 0, catalogo: 12 }),
  vo2: contesto(null),
  zonas: contesto(null),
  fuerza: contesto([]),
};

export const fuentes = (base: FuentesRendimiento, pisa: Partial<FuentesRendimiento> = {}): FuentesRendimiento => ({
  ...base,
  ...pisa,
});

/** El atleta de partida: con coach, con todo, individual, con reloj. Se le pisa lo que cada caso ejercita. */
export const BASE: LecturaPerfil = {
  cargando: false,
  errorCarga: false,
  conCoach: true,
  coach: 'Mar',
  identidad: identidad({
    nombre: 'Nora Ramos',
    foto: true,
    division: 'Open',
    edad: 34,
    anosEntrenando: 6,
    alturaCm: 172,
    pesoKg: 64.5,
    fcMax: 188,
    objetivo: 'improve_hyrox_mark',
  }),
  rendimiento: FUENTES_LLENAS,
  suscripcion: { tipo: 'activa' },
  dobles: null,
  dispositivos: ['salud', 'watch', 'coros'],
  movimientoReloj: 'permitido',
  corosPendiente: null,
  corosAviso: null,
  version: 'Versión 1.8.0 (312)',
};

/** El recién dado de alta con coach: solo el nombre, nada medido, sin foto ni reloj. */
export const ALTA: Partial<LecturaPerfil> = {
  identidad: identidad({ nombre: 'Marc Puig' }),
  rendimiento: FUENTES_VACIAS,
  suscripcion: { tipo: 'activa' },
  dispositivos: [],
  movimientoReloj: 'sin-preguntar',
};

/** Sin coach (tier libre): sin suscripción y sin las fuentes de coach (batería y zonas no se piden). */
export const LIBRE: Partial<LecturaPerfil> = {
  conCoach: false,
  coach: null,
  suscripcion: null,
  rendimiento: fuentes(FUENTES_LLENAS, { bateria: contesto(null), zonas: contesto(null) }),
};

export const caso = (id: string, titulo: string, mira: string, pisa: Partial<LecturaPerfil>): CasoPerfil => ({
  id,
  titulo,
  mira,
  lectura: { ...BASE, ...pisa },
});
