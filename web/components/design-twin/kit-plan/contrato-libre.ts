// EL CONTRATO DE «PLAN» SIN COACH — la pestaña del tier libre.
//
// Es lo que lee `FreePlanView.swift` (y sus dos tarjetas de evidencia y de marcas):
// el retrato calculado de `GET /api/athlete/free-plan`, el catálogo de marcas de
// `GET /api/athlete/marks`, el VO₂ máx del reloj, las carreras importadas y la
// semana propia (las sesiones libres del atleta, la misma `planWeek`).
//
// LA REGLA QUE LO GOBIERNA (DECISIONS 27-jul, «El Plan del free enseña EVIDENCIA»):
// el tier libre MIDE y COMPARA; el de pago DECIDE. La pantalla tiene que valer
// la pena aunque nadie pague nunca, así que todo lo que enseña son datos SUYOS.
// Un número que no existe no se pinta, lo que falta se dice, y primero se le da
// lo que ya tenemos y solo después se le pide algo.
//
// Sin coach no hay chat, comunicados, revisión ni batería de tests. La única
// pieza «de coach» que queda es la de CONVERSIÓN («Entrena con un coach»), que
// es la superficie de venta, no una función de coach, y no lleva ningún nombre:
// un atleta libre no tiene coach (`coach_name` llega null).
//
// Las estaciones de una carrera de dobles NO se le atribuyen jamás (se reparten
// entre los dos); correr y las transiciones sí (`DECISIONS 27-jul noche`). Eso lo
// decide el servidor: aquí solo se pinta lo que llega y se dice cuándo es un suelo.

import type { SemanaDelPlan } from './contrato';

/** Una carrera terminada, en corto. */
export interface FinalDeCarrera {
  tiempoS: number;
  /** «Berlín». */
  lugar: string;
  /** «may 2025». */
  cuando: string | null;
  /** «dobles pro» · null en individual sin división. */
  categoria: string | null;
  /** El oficial fue el de la PAREJA: nunca se enseña sin decirlo. */
  equipo: boolean;
}

/** Sus 8 km de una carrera. */
export interface OchoKm {
  /** Segundos por kilómetro. */
  ritmoSKm: number;
  totalS: number;
  lugar: string;
  /** En dobles corren juntos: el ritmo lo marca el más lento, así que es un SUELO. */
  suelo: boolean;
}

export interface EvidenciaDeCarreras {
  carreras: number;
  mejorTiempo: FinalDeCarrera | null;
  mejor8km: OchoKm | null;
  /** El último. Solo se enseña si no es el mismo que el mejor. */
  ultimo8km: OchoKm | null;
  transiciones: { segundos: number; lugar: string } | null;
  /** Solo con 3+ carreras INDIVIDUALES: en dobles el ritmo lo marca la pareja. */
  tendencia: { sentido: 'mejora' | 'empeora' | 'estable'; deltaSKm: number; carreras: number } | null;
}

/** Su objetivo contra su realidad (`FreeGoalCheck`). */
export type Comparacion =
  /** `deltaS = objetivo − mejor`. Positivo = el objetivo es MÁS LENTO de lo que ya corrió. */
  | { tipo: 'mejor'; mejor: FinalDeCarrera; deltaS: number }
  | { tipo: 'sin'; motivo: 'sin_carreras' | 'formato_distinto'; categoria: string | null };

export interface CarreraDelPlanLibre {
  nombre: string;
  /** Días que faltan; null si el cable no trae cuenta atrás. */
  dias: number | null;
  /** «Individual · Open · Hombres». */
  categoria: string | null;
  /** «1:12:30». Null si el atleta no fijó objetivo de tiempo. */
  objetivo: string | null;
  comparacion: Comparacion | null;
  /** Marcas que faltan para poder decirle cuánto tardaría. Solo sin evidencia de carreras. */
  faltan: string[];
}

export type CarreraLibre =
  | { tipo: 'fijada'; carrera: CarreraDelPlanLibre }
  /** Sin carrera objetivo: se invita a ponerla (con su salida). */
  | { tipo: 'sin-objetivo' };

/** Una marca del catálogo del servidor. Los rótulos nunca se repiten en cliente. */
export interface MarcaLibre {
  slug: string;
  etiqueta: string;
  /** Su mejor valor ya escrito («3:42»). Null = sin medir. */
  valor: string | null;
  /** «hace 3 semanas». */
  cuando: string | null;
  /** «Calle o cinta, la app lo mide sola · te lleva ~4-5 min». */
  como: string;
  /** Qué gana midiéndola: «Mídelo y tu semana gana la sesión de remo». */
  desbloquea: string;
  /** «te lleva ~4-5 min». */
  dura: string;
}

/** Una fila de la semana bloqueada: REAL, calculada con datos suyos. */
export interface SesionBloqueada {
  /** «LUN». */
  dia: string;
  titulo: string;
  detalle: string;
}

export interface SemanaBloqueada {
  sesiones: SesionBloqueada[];
  /** Cuántas se leen sin desenfocar. El resto son sesiones reales, desenfocadas. */
  visibles: number;
  /** De dónde salen los números: «Calculado con tus 8 km de Berlín». */
  base: string;
}

export interface Vo2Reloj {
  etiqueta: string;
  valor: string;
  unidad: string;
}

export interface LecturaLibre {
  /** Aún sin saber si hay evidencia o no: esqueleto, jamás «sin datos» un instante y luego otra cosa. */
  cargando: boolean;
  hoyIso: string;
  carrera: CarreraLibre;
  vo2: Vo2Reloj | null;
  /** Cuántas carreras suyas están importadas (decide, con las marcas, cuál de los dos estados es). */
  carrerasImportadas: number;
  evidencia: EvidenciaDeCarreras | null;
  semanaBloqueada: SemanaBloqueada | null;
  marcas: {
    medidas: MarcaLibre[];
    faltan: MarcaLibre[];
    /** Las tres de arranque (1 km, remo 500, ski 1.000) que el catálogo ofrece, en orden. */
    arranque: MarcaLibre[];
    /** El catálogo no se pudo leer: se dice y se ofrece reintentar. */
    falloCatalogo: boolean;
  };
  /** Sin carreras importadas todavía: se le ofrece traerlas en un toque. */
  puedeImportar: boolean;
  /** Su semana propia (sesiones libres). Null mientras no llega. */
  semana: SemanaDelPlan | null;
}

export interface CasoLibre {
  tipo: 'libre';
  id: string;
  titulo: string;
  mira: string;
  lectura: LecturaLibre;
}

/** ¿Tiene algo real sobre sí mismo? Una marca medida o una carrera importada. */
export function tieneEvidencia(l: LecturaLibre): boolean {
  return l.marcas.medidas.length > 0 || l.carrerasImportadas > 0;
}
