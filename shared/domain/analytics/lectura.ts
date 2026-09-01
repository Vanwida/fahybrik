// UNA LECTURA — la unidad del payload de analíticas del atleta.
//
// POR QUÉ UNA LISTA Y NO CUARENTA CLAVES EN LA RAÍZ
// -------------------------------------------------
// El payload que ya sirve la pantalla de carrera (`running/progress`) tiene su
// forma fijada en la raíz: `history.al_pulso`, `history.cadencia`, `history.por_tipo`…
// Añadir una lectura ahí es tocar el tipo, tocar el ensamblador, tocar el modelo
// Codable de Swift y desplegar las dos superficies a la vez. Es exactamente por
// eso que hoy hay cuatro campos que el servidor calcula, serializa y envía, y que
// iOS decide no decodificar (`umbral`, `zonas_ritmo`, `cadencia`, `por_tipo`): el
// coste de sumar una lectura se paga entero aunque nadie la dibuje.
//
// Aquí una lectura nueva es UN elemento más del array. El cliente recorre la
// lista, dibuja lo que sabe dibujar por `grupo` + forma del dato, e ignora lo que
// no conoce sin romperse. Una lectura puede nacer, y aparecer, sin tocar iOS.
//
// LA REGLA QUE DECIDE SI UNA LECTURA ENTRA
// ----------------------------------------
// O sostiene un veredicto, o pide una acción. Si no hace ninguna de las dos, no
// entra por muchos datos que haya detrás. Un contador de pasos no dice si el
// atleta va bien ni le pide nada: es ruido con forma de dato.
//
// COBERTURA SIEMPRE DECLARADA
// ---------------------------
// Ninguna lectura afirma un número sin decir sobre cuánto lo dice. Sin muestras
// el dato es `null`, JAMÁS cero: cero es una afirmación («durmió cero horas») y
// la ausencia no es una afirmación. Con poca historia se dice cuánta falta.
//
// Puro y sin base de datos, como todo `shared/domain`.

import type { Falta } from '../running/progress';

// ---------------------------------------------------------------------------
// IDENTIDAD
// ---------------------------------------------------------------------------

/**
 * En qué familia vive la lectura. El cliente agrupa por esto; no es estética,
 * es la pregunta que responde el bloque entero.
 *
 *   carga         cuánto trabajo lleva encima y a qué ritmo sube
 *   capacidad     de qué es capaz — velocidad crítica, depósito, umbral
 *   recuperacion  cómo llega — variabilidad, pulso en reposo, sueño
 *   ejecucion     cómo se comportó el cuerpo DENTRO del entreno
 *   volumen       cuánto hizo, y de qué tipo
 *   terreno       dónde lo hizo — subida, llano, bajada
 */
export type GrupoLectura =
  | 'carga'
  | 'capacidad'
  | 'recuperacion'
  | 'ejecucion'
  | 'volumen'
  | 'terreno';

/**
 * La unidad del número, para que el cliente sepa escribirlo sin adivinar.
 *
 * El servidor NO manda el número ya formateado. Es la convención de
 * `running/progress` («el cliente decide cómo se escribe una fecha, el servidor
 * no manda etiquetas») y es la correcta: el mismo 270 se escribe «4:30/km» en
 * una tarjeta y «4:30» en un eje, y esa decisión es del que dibuja.
 */
export type Unidad =
  | 'tss'          // carga, unidad de Banister
  | 'tss_semana'   // ritmo de subida de carga
  | 'ratio'        // adimensional (aguda/crónica)
  | 'ms'           // milisegundos (variabilidad)
  | 'bpm'
  | 'horas'
  | 'pct'
  | 'metros'
  | 'm_s'          // metros por segundo (velocidad crítica)
  | 's_km'
  | 's_500m'
  | 'segundos'
  | 'kcal'
  | 'kg'
  | 'puntos'       // escala 0-100 propia del proveedor (batería corporal, estrés)
  | 'ml_kg_min'
  | 'sesiones';

// ---------------------------------------------------------------------------
// EL DATO
// ---------------------------------------------------------------------------

/**
 * Contra qué se lee el número. Un 48 de variabilidad no dice nada; un 48 contra
 * un basal de 55 dice que lleva tres noches peor.
 */
export interface Referencia {
  valor: number;
  /** `dato.valor - referencia.valor`, precalculado para que nadie lo reste al revés. */
  delta: number;
  /** Clave estable de QUÉ es la referencia — `basal_60_14d`, `umbral`, `objetivo`. */
  de: string;
}

export interface Dato {
  valor: number;
  unidad: Unidad;
  referencia: Referencia | null;
}

/** Un punto de una serie. `v` a null es un HUECO REAL — nunca se interpola ni se rellena con cero. */
export interface PuntoSerie {
  /** ISO. Día (`YYYY-MM-DD`) o lunes de la semana, según `paso`. */
  t: string;
  v: number | null;
}

export interface Serie {
  unidad: Unidad;
  paso: 'dia' | 'semana';
  puntos: PuntoSerie[];
}

/** Una parte de un reparto (zonas, terreno, modalidades). */
export interface Parte {
  code: string;
  etiqueta_es: string;
  valor: number;
  /** Porcentaje sobre el total. Null si el total es cero (no se divide por cero para enseñar un 0 %). */
  pct: number | null;
}

export interface Reparto {
  unidad: Unidad;
  total: number;
  partes: Parte[];
}

// ---------------------------------------------------------------------------
// COBERTURA Y PROCEDENCIA — lo que impide que un número mienta
// ---------------------------------------------------------------------------

export interface Cobertura {
  /** Observaciones REALES detrás del número. Nunca inflado, nunca estimado. */
  muestras: number;
  /** Días que se pidieron. */
  dias_ventana: number;
  /** Días de esa ventana con al menos una muestra. */
  dias_con_dato: number;
  /**
   * Porcentaje 0-100 de días cubiertos. Null si la ventana es cero.
   *
   * En TODO este contrato `pct` significa lo mismo: un número de 0 a 100. El
   * motor de carga usa fracciones 0-1 internamente (`LoadCoverage.pct`) y ese
   * cruce ya estuvo a punto de servir un 0,87 rotulado como porcentaje: quien
   * traiga un número de allí lo multiplica aquí, una vez.
   */
  pct: number | null;
  /**
   * Por qué no alcanza, cuando no alcanza. Null cuando la lectura se sostiene.
   *
   * Reutiliza el vocabulario de `running/progress` a propósito: ya está probado,
   * ya decide con `seCalla()` si la app debe callarse en vez de enseñar un hueco,
   * y ya resuelve con `faltaComun()` que a un atleta sin test no se le pida el
   * test tres veces en la misma pantalla. Un segundo vocabulario para «por qué
   * falta» sería la misma divergencia que costó dos modelos de zonas.
   */
  falta: Falta | null;
}

/**
 * De qué número sale el número. Sin esto, cualquier lectura es un índice
 * propietario: una cifra que el atleta no puede rastrear y el coach no puede
 * discutir.
 */
export interface Procedencia {
  /** Clave estable del mecanismo — `banister_ewma`, `basal_hrv_60_14d`, `ajuste_cs_dprima`. */
  de: string;
  /** Una frase: de qué sale. Prosa del servidor, como `Veredicto.frase`. */
  explica_es: string;
  /**
   * False cuando el ancla o la fuente es ESTIMADA (un umbral derivado de la edad,
   * un basal de tres noches). El número puede enseñarse; no puede presentarse como
   * medido, y no debería sostener un veredicto duro.
   */
  medida: boolean;
  /** Quién lo midió, cuando hay un aparato detrás. `garmin`, `polar`, `healthkit`. */
  proveedor: string | null;
}

// ---------------------------------------------------------------------------
// LA LECTURA
// ---------------------------------------------------------------------------

/**
 * `medida` — hay número.
 * `sin_dato` — no lo hay, y `cobertura.falta` dice por qué (SIEMPRE no-nulo aquí).
 *
 * No hay un tercer estado para «no aplica»: eso ya lo decide `seCalla(falta)`
 * sobre la falta. Dos campos que responden a la misma pregunta acaban
 * contradiciéndose; uno solo, no.
 */
export type EstadoLectura = 'medida' | 'sin_dato';

export interface Lectura {
  /** Estable y único. El cliente puede reconocer una lectura concreta por él. */
  id: string;
  grupo: GrupoLectura;
  titulo_es: string;
  estado: EstadoLectura;
  /** El número de portada. Null si `estado` es `sin_dato`. */
  dato: Dato | null;
  /** Para dibujar. Null cuando la lectura no tiene forma de serie. */
  serie: Serie | null;
  /** Bandas o partes. Null cuando la lectura no reparte nada. */
  reparto: Reparto | null;
  cobertura: Cobertura;
  procedencia: Procedencia;
}

// ---------------------------------------------------------------------------
// CONSTRUCTORES — para que ninguna lectura nazca incoherente
// ---------------------------------------------------------------------------

/**
 * Una lectura QUE SE SOSTIENE. Exige el dato, así que es imposible emitir
 * `medida` sin número.
 */
export function lecturaMedida(args: {
  id: string;
  grupo: GrupoLectura;
  titulo_es: string;
  dato: Dato;
  serie?: Serie | null;
  reparto?: Reparto | null;
  cobertura: Omit<Cobertura, 'falta'> & { falta?: Falta | null };
  procedencia: Procedencia;
}): Lectura {
  return {
    id: args.id,
    grupo: args.grupo,
    titulo_es: args.titulo_es,
    estado: 'medida',
    dato: args.dato,
    serie: args.serie ?? null,
    reparto: args.reparto ?? null,
    cobertura: { ...args.cobertura, falta: args.cobertura.falta ?? null },
    procedencia: args.procedencia,
  };
}

/**
 * Una lectura QUE NO SE PUEDE DAR. Exige la falta, así que es imposible emitir
 * un hueco mudo — el motivo viaja siempre, y con él la salida que el cliente
 * ofrece (o el silencio, si `seCalla`).
 */
export function lecturaSinDato(args: {
  id: string;
  grupo: GrupoLectura;
  titulo_es: string;
  falta: Falta;
  cobertura?: Partial<Omit<Cobertura, 'falta'>>;
  procedencia: Procedencia;
}): Lectura {
  return {
    id: args.id,
    grupo: args.grupo,
    titulo_es: args.titulo_es,
    estado: 'sin_dato',
    dato: null,
    serie: null,
    reparto: null,
    cobertura: {
      muestras: args.cobertura?.muestras ?? 0,
      dias_ventana: args.cobertura?.dias_ventana ?? 0,
      dias_con_dato: args.cobertura?.dias_con_dato ?? 0,
      pct: args.cobertura?.pct ?? null,
      falta: args.falta,
    },
    procedencia: args.procedencia,
  };
}

/**
 * Porcentaje 0-100 de días cubiertos, o null si no hay ventana. Un solo sitio lo
 * divide, y un solo sitio decide la escala.
 */
export function pctCobertura(dias_con_dato: number, dias_ventana: number): number | null {
  if (!Number.isFinite(dias_ventana) || dias_ventana <= 0) return null;
  return (dias_con_dato / dias_ventana) * 100;
}
