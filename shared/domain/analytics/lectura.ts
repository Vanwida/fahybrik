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
// TODA CIFRA DICE DE DÓNDE SALE, Y CONTRA QUÉ (docs/analiticas/modelo.md, A2 y A3)
// -----------------------------------------------------------------------------
// Desde el 29-09-2026 el sobre lleva además:
//   · `procedencia.ancla` — de qué peldaño salió el umbral contra el que se
//     calculó (medida | declarada | estimada | poblacional). Un fondo construido
//     sobre un umbral que sale de un cumpleaños es otra afirmación que uno
//     construido sobre un test, y el sobre tiene que poder decirlo.
//   · `comparacion` — el mismo número en el periodo anterior de igual longitud,
//     con el delta EN LA MISMA UNIDAD que el umbral del coach que lo juzga. Es lo
//     que arregla el rótulo que mentía (P1): un delta en puntos juzgado por un
//     umbral en porcentaje.
//   · `serie.plan` — lo planificado sobre el MISMO eje que lo hecho, punto a
//     punto, para que plan y hecho no puedan dibujarse contra dos escalas.
//   · `familia` — en qué familia de entreno vive (correr, remo, fuerza…), o null
//     cuando cruza todas.
//   · `veredicto` — la palabra, cuando la cobertura la sostiene. Se RETIRA (null)
//     cuando no, y `cobertura.falta` dice por qué; el número se queda.
//
// CÓMO SE AÑADE UNA LECTURA (la lista de control, en orden)
// ---------------------------------------------------------
//   1. Pregunta primero: ¿sostiene un veredicto o pide una acción? Si no, no entra.
//   2. Un `id` estable y único con prefijo de bloque (`forma.frescura`,
//      `semanas.carga.correr`). El cliente la reconoce por él: no se renombra.
//   3. `grupo` = el bloque del panel donde vive (ver `BloquePanel` en ./panel.ts).
//   4. La unidad del dato en `Unidad`. Si no existe, se añade AQUÍ (una vez) —
//      nunca se manda un número «ya formateado».
//   5. Se construye SOLO con `lecturaMedida` / `lecturaSinDato`: es imposible
//      emitir `medida` sin número o `sin_dato` sin motivo.
//   6. `cobertura` real (muestras, días, pct 0-100) y `procedencia` con su
//      `ancla` (null cuando el número no depende de ningún umbral del atleta).
//   7. Si el número se compara con el periodo anterior, `comparacionDe(...)` con
//      el umbral del coach en la MISMA unidad que el delta.
//   8. Si lleva serie, `serieDe(...)`: `puntos` = hecho, `plan` = lo planificado
//      en el mismo eje (o null), `referencias` = las líneas de referencia en
//      unidades reales (bandas del coach), nunca series normalizadas 0..1.
//   9. Un test unitario por camino: con dato, sin dato (cada `Falta` que pueda
//      emitir) y con el veredicto retirado.
//  10. Se mete en su bloque en `web/lib/analytics/panel.ts`. Nada más: el
//      cliente la pinta si la conoce y la ignora si no.
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
 * Los seis primeros son los grupos del contrato de agosto (la pantalla de carrera
 * y `/analytics/lecturas`); los ocho siguientes son los bloques del panel único
 * (docs/analiticas/modelo.md §3): una lectura nueva del panel lleva como grupo el
 * bloque en el que vive.
 *
 *   carga         cuánto trabajo lleva encima y a qué ritmo sube
 *   capacidad     de qué es capaz — velocidad crítica, depósito, umbral
 *   recuperacion  cómo llega — variabilidad, pulso en reposo, sueño
 *   ejecucion     cómo se comportó el cuerpo DENTRO del entreno
 *   volumen       cuánto hizo, y de qué tipo
 *   terreno       dónde lo hizo — subida, llano, bajada
 *   estado        cómo está hoy (palabra + forma/fatiga/frescura + readiness)
 *   forma         gana forma o se pasa; llega fresco
 *   semanas       hace lo que toca: carga y horas por familia, plan frente a hecho
 *   intensidad    entrena a la intensidad que toca (zonas, reparto)
 *   progreso      mejora, por familia
 *   records       qué marcas tiene
 *   carrera       llega a su carrera
 */
export type GrupoLectura =
  | 'carga'
  | 'capacidad'
  | 'recuperacion'
  | 'ejecucion'
  | 'volumen'
  | 'terreno'
  | 'estado'
  | 'forma'
  | 'semanas'
  | 'intensidad'
  | 'progreso'
  | 'records'
  | 'carrera';

/**
 * La familia de entreno de una lectura (modelo §3, A9): cada una tiene su
 * métrica clave y su «¿mejoro?» con la misma regla. `null` en la lectura
 * significa que cruza todas (la forma, el readiness).
 *
 *   correr · remo · ski · bici — cada máquina la suya (el umbral es por máquina)
 *   fuerza                    — barra, mancuernas, peso corporal
 *   estaciones                — las ocho estaciones HYROX y sus derivadas
 *   wod                       — metcons con puntuación (AMRAP, for time, EMOM…)
 *   otro                      — calentamiento, core, movilidad: cuenta el tiempo
 */
export type Familia = 'correr' | 'remo' | 'ski' | 'bici' | 'fuerza' | 'estaciones' | 'wod' | 'otro';

export const FAMILIAS: readonly Familia[] = ['correr', 'remo', 'ski', 'bici', 'fuerza', 'estaciones', 'wod', 'otro'];

/** Cómo se llama cada familia delante del atleta. Un solo sitio. */
export const FAMILIA_ETIQUETA_ES: Record<Familia, string> = {
  correr: 'Correr',
  remo: 'Remo',
  ski: 'Ski',
  bici: 'Bici',
  fuerza: 'Fuerza',
  estaciones: 'Estaciones',
  wod: 'WOD',
  otro: 'Otro',
};

/**
 * De qué peldaño salió el umbral contra el que se calculó una cifra (modelo §4,
 * y la escalera de zonas decidida el 28/29-07-2026):
 *
 *   medida       un test (`lthr_30min`, un test de umbral de carrera o de ergo)
 *   declarada    el atleta o el coach lo escribieron; un toque
 *   estimada     lo inferimos de un dato SUYO (0,88 × FC máxima medida; el ritmo
 *                umbral desde el VDOT de una marca; el split de un 2K)
 *   poblacional  lo inferimos de la población (la edad, Tanaka)
 *
 * Cuentan para la carga las tres primeras, cada cifra marcada con la suya; la
 * poblacional NO cuenta: una carga anclada en un cumpleaños es evidencia
 * fabricada. `null` en una procedencia = el número no depende de ningún umbral
 * del atleta (un RPE, unas horas de sueño, una zona relativa al umbral).
 */
export type Ancla = 'medida' | 'declarada' | 'estimada' | 'poblacional';

export const ANCLAS: readonly Ancla[] = ['medida', 'declarada', 'estimada', 'poblacional'];

/** Las que CUENTAN como evidencia para la carga. La poblacional se pinta, no puntúa. */
export function anclaCuenta(a: Ancla | null): boolean {
  return a != null && a !== 'poblacional';
}

/** Cómo se llama cada ancla delante del atleta. Un solo sitio. */
export const ANCLA_ETIQUETA_ES: Record<Ancla, string> = {
  medida: 'Medido en un test',
  declarada: 'El que nos diste',
  estimada: 'Estimado de tus datos',
  poblacional: 'Estimado por tu edad',
};

/**
 * La unidad del número, para que el cliente sepa escribirlo sin adivinar.
 *
 * El servidor NO manda el número ya formateado. Es la convención de
 * `running/progress` («el cliente decide cómo se escribe una fecha, el servidor
 * no manda etiquetas») y es la correcta: el mismo 270 se escribe «4:30/km» en
 * una tarjeta y «4:30» en un eje, y esa decisión es del que dibuja.
 */
export type Unidad =
  | 'tss'          // carga, unidad de Banister (1 h en umbral = 100)
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
  | 'puntos'       // escala 0-100 propia del proveedor (batería corporal, estrés) o el readiness
  | 'ml_kg_min'
  | 'sesiones'
  | 'watts'
  | 'reps'
  | 'dias';

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

/**
 * El mismo número en el PERIODO ANTERIOR de igual longitud (modelo A3/A4).
 *
 * El delta va en `unidad`, que es la unidad del UMBRAL del coach que lo juzga —
 * no necesariamente la del dato: una carga en TSS se compara en porcentaje si el
 * coach fija «un 10 % es cambio»; una frescura en TSS se compara en TSS. Es lo
 * que impide que un delta en puntos se juzgue contra un umbral en porcentaje
 * (el rótulo que mentía, P1).
 */
export interface Comparacion {
  /** El número en el periodo anterior. Null cuando no lo hubo (sin dato allí). */
  anterior: number | null;
  /** valor − anterior, en `unidad`. Null cuando no hay anterior (o el anterior es cero y la unidad es pct). */
  delta: number | null;
  unidad: Unidad;
  /** El periodo contra el que se compara, en días LOCALES del atleta (inclusive). */
  periodo: { desde: string; hasta: string };
  /** Cambio mínimo del coach para llamarlo cambio (misma `unidad`). Null si esta métrica no tiene umbral. */
  cambio_minimo: number | null;
  /** |delta| ≥ cambio_minimo. Null cuando falta el delta o el umbral. */
  significativo: boolean | null;
}

/** Un punto de una serie. `v` a null es un HUECO REAL — nunca se interpola ni se rellena con cero. */
export interface PuntoSerie {
  /** ISO. Día (`YYYY-MM-DD`) o lunes de la semana, según `paso`. */
  t: string;
  v: number | null;
}

/** Una línea de referencia en unidades REALES de la serie (una banda del coach, un aviso). */
export interface ReferenciaSerie {
  code: string;
  etiqueta_es: string;
  valor: number;
}

export interface Serie {
  unidad: Unidad;
  paso: 'dia' | 'semana';
  /** Lo HECHO (o lo medido). */
  puntos: PuntoSerie[];
  /**
   * Lo PLANIFICADO, sobre el MISMO eje y con el mismo `paso`. Null cuando la
   * lectura no tiene plan. Puede extenderse más allá del último punto hecho
   * (la proyección de forma hasta la carrera) y puede tener huecos (`v: null` =
   * ese día no hay plan o su carga no se sabe).
   */
  plan: PuntoSerie[] | null;
  /** Líneas de referencia en unidades reales (bandas de frescura, aviso de subida). */
  referencias: ReferenciaSerie[] | null;
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

/**
 * La PALABRA que la lectura se atreve a decir. Se retira (null en la lectura)
 * cuando la cobertura no la sostiene; el número se queda (DECISIONS 2026-07-28,
 * «número sí, sentencia no»).
 */
export interface VeredictoLectura {
  /** Clave estable (`optimo`, `sobrecarga`, `fresco`…). El cliente colorea por ella. */
  code: string;
  etiqueta_es: string;
  /** Una frase, cuando hay algo que añadir («un 30 % de esta carga sale de un umbral estimado»). */
  frase_es: string | null;
  tono: 'bien' | 'neutro' | 'atencion' | 'aviso';
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
  /**
   * El peldaño del umbral que sostiene la cifra, cuando depende de uno. Es la
   * ancla MÁS DÉBIL de las que entran en el número: un fondo con el 70 % medido
   * y el 30 % estimado lleva `estimada`, y `explica_es` dice cuánto.
   * Null cuando el número no depende de ningún umbral del atleta.
   */
  ancla: Ancla | null;
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
  /** En qué familia de entreno vive; null cuando cruza todas. */
  familia: Familia | null;
  titulo_es: string;
  estado: EstadoLectura;
  /** El número de portada. Null si `estado` es `sin_dato`. */
  dato: Dato | null;
  /** Contra el periodo anterior de igual longitud. Null cuando no se compara (o no hay dato). */
  comparacion: Comparacion | null;
  /** Para dibujar. Null cuando la lectura no tiene forma de serie. */
  serie: Serie | null;
  /** Bandas o partes. Null cuando la lectura no reparte nada. */
  reparto: Reparto | null;
  /** La palabra, cuando la cobertura la sostiene. Null = retirada o no aplica. */
  veredicto: VeredictoLectura | null;
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
  familia?: Familia | null;
  comparacion?: Comparacion | null;
  serie?: Serie | null;
  reparto?: Reparto | null;
  veredicto?: VeredictoLectura | null;
  cobertura: Omit<Cobertura, 'falta'> & { falta?: Falta | null };
  procedencia: Procedencia;
}): Lectura {
  return {
    id: args.id,
    grupo: args.grupo,
    familia: args.familia ?? null,
    titulo_es: args.titulo_es,
    estado: 'medida',
    dato: args.dato,
    comparacion: args.comparacion ?? null,
    serie: args.serie ?? null,
    reparto: args.reparto ?? null,
    veredicto: args.veredicto ?? null,
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
  familia?: Familia | null;
  cobertura?: Partial<Omit<Cobertura, 'falta'>>;
  procedencia: Procedencia;
}): Lectura {
  return {
    id: args.id,
    grupo: args.grupo,
    familia: args.familia ?? null,
    titulo_es: args.titulo_es,
    estado: 'sin_dato',
    dato: null,
    comparacion: null,
    serie: null,
    reparto: null,
    veredicto: null,
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
 * Una serie con plan y referencias explícitos. Existe para que ninguna serie
 * nazca sin decidir si tiene plan: `plan` a null es «esta lectura no tiene
 * plan», no un olvido.
 */
export function serieDe(args: {
  unidad: Unidad;
  paso: 'dia' | 'semana';
  puntos: PuntoSerie[];
  plan?: PuntoSerie[] | null;
  referencias?: ReferenciaSerie[] | null;
}): Serie {
  return {
    unidad: args.unidad,
    paso: args.paso,
    puntos: args.puntos,
    plan: args.plan ?? null,
    referencias: args.referencias ?? null,
  };
}

/**
 * La comparación con el periodo anterior, calculada UNA vez y en la unidad del
 * umbral. Con `unidad: 'pct'` el delta es relativo al anterior (y es null si el
 * anterior es cero: de cero a algo no es un porcentaje, es empezar); con
 * cualquier otra, es la resta.
 */
export function comparacionDe(args: {
  valor: number;
  anterior: number | null;
  unidad: Unidad;
  periodo: { desde: string; hasta: string };
  cambio_minimo: number | null;
}): Comparacion {
  const { valor, anterior, unidad, cambio_minimo } = args;
  let delta: number | null = null;
  if (anterior != null && Number.isFinite(anterior)) {
    if (unidad === 'pct') {
      delta = anterior !== 0 ? ((valor - anterior) / Math.abs(anterior)) * 100 : null;
    } else {
      delta = valor - anterior;
    }
  }
  const significativo =
    delta == null || cambio_minimo == null ? null : Math.abs(delta) >= Math.abs(cambio_minimo);
  return { anterior, delta, unidad, periodo: args.periodo, cambio_minimo, significativo };
}

/**
 * Porcentaje 0-100 de días cubiertos, o null si no hay ventana. Un solo sitio lo
 * divide, y un solo sitio decide la escala.
 */
export function pctCobertura(dias_con_dato: number, dias_ventana: number): number | null {
  if (!Number.isFinite(dias_ventana) || dias_ventana <= 0) return null;
  return (dias_con_dato / dias_ventana) * 100;
}
