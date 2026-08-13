// LOS HECHOS — lo que la pantalla DICE, en lenguaje de atleta.
//
// UN HECHO NO ES UNA NOTA
// -----------------------
//   «Tu carga es 72»            → índice. No dice de qué sale, no se puede
//                                 comprobar y no pide nada. Hay que creérselo.
//   «Has subido un 30 % en dos
//    semanas»                   → hecho. Se rastrea hasta las semanas de las que
//                                 sale, y permite una acción.
//
// La pantalla decidió no leer la carga como puntuación. Un hecho que se calcula
// aquí y se sirve como frase entraría por la puerta de atrás justo lo que se
// echó por delante — salvo que se cumpla la regla de abajo.
//
// LA REGLA QUE LO HACE AUDITABLE: UN HECHO SÓLO SALE DE LECTURAS
// --------------------------------------------------------------
// `hechosDe` no recibe la base de datos ni recalcula nada: recibe la LISTA DE
// LECTURAS ya construida y lee de ella. Por eso cada hecho puede declarar en
// `de[]` los ids exactos de los que sale, y por eso esa declaración no puede
// mentir: si la lectura no está o no está medida, el hecho no nace. La
// trazabilidad es estructural, no una promesa del comentario.
//
// EL CRUCE ES LO QUE NO EXISTE EN NINGUNA OTRA PARTE
// --------------------------------------------------
// La carga sola dice cuánto. El sueño solo dice cuánto duerme. Cruzarlos dice lo
// único que pide algo: «has subido un 30 % en dos semanas y duermes menos de lo
// tuyo — aprieta menos esta». Ni TrainingPeaks ni Whoop lo hacen: uno tiene la
// carga y el otro la recuperación, y cada uno enseña la mitad.
//
// Puro y sin base de datos.

import type { CoachAnalyticsMethod } from './metodo';
import type { Lectura } from './lectura';

/**
 * Una afirmación que la pantalla puede escribir.
 *
 * `tono` ordena: un aviso va antes que una nota. No es un color, es cuánto
 * apremia — el cliente decide cómo se pinta.
 */
export interface Hecho {
  id: string;
  /** En lenguaje de atleta. Sin jerga, sin siglas, sin unidades de motor. */
  frase_es: string;
  /** Lo que pide. Null cuando el hecho sólo informa y no hay nada que hacer. */
  pide_es: string | null;
  /** Los ids de las lecturas de las que sale. La auditoría del atleta. */
  de: string[];
  tono: 'aviso' | 'nota';
}

function lecturaPorId(lecturas: readonly Lectura[], id: string): Lectura | null {
  return lecturas.find((l) => l.id === id) ?? null;
}

/** Sólo una lectura MEDIDA sostiene un hecho. Una apagada no afirma nada. */
function medida(lecturas: readonly Lectura[], id: string): Lectura | null {
  const l = lecturaPorId(lecturas, id);
  return l != null && l.estado === 'medida' && l.dato != null ? l : null;
}

function redondear(v: number): number {
  return Math.round(v);
}

/**
 * Cuánto ha subido el fondo en `dias`, en porcentaje y en unidades.
 *
 * Sale de la SERIE de `carga.fondo`, que es la misma que el atleta ve dibujada:
 * puede seguir la afirmación con el dedo por la gráfica. Null cuando la serie no
 * llega a esos días, o cuando el punto de partida es cero — de cero a algo no es
 * «un porcentaje de subida», es empezar.
 */
function subidaDelFondo(
  lecturas: readonly Lectura[],
  dias: number,
): { pct: number; absoluta: number; dias: number } | null {
  const fondo = medida(lecturas, 'carga.fondo');
  const puntos = fondo?.serie?.puntos;
  if (fondo == null || puntos == null || puntos.length <= dias) return null;

  const ahora = puntos[puntos.length - 1]?.v;
  const antes = puntos[puntos.length - 1 - dias]?.v;
  if (ahora == null || antes == null || !Number.isFinite(ahora) || !Number.isFinite(antes)) {
    return null;
  }
  if (antes <= 0) return null;

  return { pct: ((ahora - antes) / antes) * 100, absoluta: ahora - antes, dias };
}

/** ¿Duerme por debajo de lo suyo? Sale de la lectura, con su referencia. */
function duermeMenos(lecturas: readonly Lectura[]): { horas: number; objetivo: number } | null {
  const sueno = medida(lecturas, 'recuperacion.sueno');
  const ref = sueno?.dato?.referencia;
  if (sueno?.dato == null || ref == null) return null;
  return sueno.dato.valor < ref.valor ? { horas: sueno.dato.valor, objetivo: ref.valor } : null;
}

/** ¿La variabilidad está por debajo de su basal? Misma disciplina. */
function variabilidadBaja(lecturas: readonly Lectura[]): { delta: number } | null {
  const v = medida(lecturas, 'recuperacion.variabilidad');
  const ref = v?.dato?.referencia;
  if (ref == null) return null;
  return ref.delta < 0 ? { delta: ref.delta } : null;
}

/**
 * Los hechos que la pantalla puede afirmar hoy, ordenados: primero lo que pide
 * algo. Lista vacía es una respuesta legítima — no hay nada que decirle, y
 * inventar una frase para llenar el hueco sería el ruido que esto evita.
 */
export function hechosDe(lecturas: readonly Lectura[], metodo: CoachAnalyticsMethod): Hecho[] {
  const hechos: Hecho[] = [];
  const subida = subidaDelFondo(lecturas, metodo.subida_dias);
  const semanasDeSubida = metodo.subida_dias / 7;
  const enCuanto =
    semanasDeSubida === 2 ? 'en dos semanas' : `en ${metodo.subida_dias} días`;

  // EL DISPARO ES ABSOLUTO, LA FRASE ES RELATIVA — y las dos cosas a propósito.
  //
  // Un +30 % sobre un fondo de 3 no es noticia: es que empezó el martes. El
  // umbral del coach está en unidades de carga por semana, así que dispara sobre
  // la subida ABSOLUTA sostenida dos semanas (2 × su umbral semanal), que es lo
  // que no salta con una base pequeña. Lo que se ESCRIBE es el porcentaje,
  // porque es lo que un atleta entiende sin traducción.
  const disparo = metodo.ramp_alert_tss_per_week * semanasDeSubida;
  const subeDeMas =
    subida != null && subida.absoluta >= disparo && subida.pct >= metodo.subida_minima_pct;

  if (subeDeMas && subida != null) {
    const sueno = duermeMenos(lecturas);
    const hrv = variabilidadBaja(lecturas);

    // EL CRUCE. Es el único que pide algo, porque es el único que sabe que la
    // subida está cayendo sobre alguien que no la está asimilando.
    if (sueno != null || hrv != null) {
      // La frase dice TODO lo que cita. Si `de[]` nombrara la variabilidad y la
      // prosa sólo hablara del sueño, el atleta no podría rastrear la mitad de
      // la afirmación — que es justo lo que `de[]` existe para permitir.
      const senales: string[] = [];
      if (sueno != null) {
        senales.push(
          `duermes ${sueno.horas.toFixed(1).replace('.', ',')} h, por debajo de tus ${redondear(sueno.objetivo)}`,
        );
      }
      if (hrv != null) senales.push('tu variabilidad está por debajo de lo tuyo');
      const senal = senales.join(' y ');
      hechos.push({
        id: 'cruce.subida_sin_descanso',
        frase_es: `Has subido un ${redondear(subida.pct)} % ${enCuanto} y ${senal}.`,
        pide_es: 'Aprieta menos esta semana.',
        de: [
          'carga.fondo',
          ...(sueno != null ? ['recuperacion.sueno'] : []),
          ...(hrv != null ? ['recuperacion.variabilidad'] : []),
        ],
        tono: 'aviso',
      });
    } else {
      hechos.push({
        id: 'carga.sube_rapido',
        frase_es: `Has subido un ${redondear(subida.pct)} % ${enCuanto}.`,
        pide_es: 'Sostén esta semana antes de volver a subir.',
        de: ['carga.fondo'],
        tono: 'aviso',
      });
    }
  } else if (subida != null && subida.pct <= -metodo.subida_minima_pct) {
    // Bajar no es un aviso: puede ser descarga buscada, una lesión o un viaje.
    // Se dice el hecho y no se le manda nada — quien decide es el coach.
    hechos.push({
      id: 'carga.baja',
      frase_es: `Has bajado un ${Math.abs(redondear(subida.pct))} % ${enCuanto}.`,
      pide_es: null,
      de: ['carga.fondo'],
      tono: 'nota',
    });
  }

  // La carga que NO se ve. Va la última porque no habla del entrenamiento sino
  // de lo que la pantalla no sabe de él — pero pide lo más accionable de todo.
  const cobertura = medida(lecturas, 'carga.cobertura');
  const sinPrecio = cobertura?.reparto?.partes.find((p) => p.code === 'sin_precio');
  if (sinPrecio != null && sinPrecio.pct != null && sinPrecio.pct >= metodo.cobertura_ciega_alerta_pct) {
    hechos.push({
      id: 'carga.mitad_a_ciegas',
      frase_es: `Un ${redondear(sinPrecio.pct)} % de lo que entrenas no entra en estos números: nadie midió ni puntuó ese rato.`,
      pide_es: 'Puntúa el esfuerzo al terminar, o haz un test de umbral.',
      de: ['carga.cobertura'],
      tono: 'aviso',
    });
  }

  return hechos.sort((a, b) => (a.tono === b.tono ? 0 : a.tono === 'aviso' ? -1 : 1));
}
