// (4) ERGO — el reloj no ve el monitor, y encima es el peor sitio para leer.
//
// ── QUÉ MIDE EL RELOJ AQUÍ ─────────────────────────────────────────────────
// FC y tiempo. El `/500`, los metros, la potencia y las paladas los mide el PM5,
// los lee el móvil por BLE y al reloj llegan REPETIDOS: se pintan marcados `del
// móvil` y jamás con cara de medida propia. Sin monitor emparejado no llega
// ninguno de los cuatro, y entonces en la muñeca queda lo que el reloj tiene
// suyo — el pulso y el crono.
//
// De la ejecución 179 (remo, atleta 64) sale además el recordatorio de que ni
// siquiera lo que se guarda es lo prescrito: la plantilla dice «5×500 m» y lo
// capturado fueron 1.014,30 m en 392 s con UN solo split explícito, porque las
// dos primeras repeticiones llegaron fundidas.
//
// ── QUÉ PUEDE HACER EL ATLETA ──────────────────────────────────────────────
// Remando: mirar sin tocar (`ojeada`), y es la peor lectura de toda la app —
// el brazo describe un arco de medio metro cada dos segundos, así que lo que no
// se lea de un vistazo no se lee. Un dato gigante por página y cero controles
// anunciados. Con PM5 no hace falta ni el gesto: los 500 m los cierra la
// máquina. Sin PM5 el gesto existe (sin anunciarse) porque la serie no la puede
// cerrar nadie más que el atleta.
//
// En el descanso —120 s prescritos, y aquí sí están en el dato— estás sentado en
// el asiento con las manos libres: `mando`. Ahí van la cuenta atrás, lo que
// viene y el único control a plena luz.
//
// ── EL SUJETO SON DOS COSAS, Y EN LA MUÑECA DOS COSAS SON DOS PÁGINAS ──────
// El handoff pide «lo que queda + tu FC». Eso no cabe en un sujeto y no se
// encoge para que quepa: página 1 lo que falta de la serie, página 2 tu pulso,
// página 3 el `/500`.
//
// ── DONDE ESTO ME CHIRRÍA, Y LO DEJO ESCRITO EN VEZ DE ARREGLARLO SOLO ─────
// Remando, el monitor del PM5 está a treinta centímetros de la cara y ya canta
// los metros, el `/500`, los vatios y las paladas. Lo ÚNICO que ese monitor no
// enseña es tu pulso (salvo que le hayas emparejado una banda, que casi nadie
// hace). Así que las páginas 1 y 3 de esta vista duplican lo que el atleta ya
// tiene delante, y la 2 es la que aporta algo que no está en ningún otro sitio.
// Mi lectura: con PM5 emparejado, la página 1 debería ser el pulso y los metros
// caer a la 2 — la muñeca complementa la máquina, no la repite. Los metros
// siguen mereciendo su página porque son la prueba de que la app y la máquina
// van al mismo compás (y de que la serie se cerrará sola donde toca), pero eso
// se comprueba una vez, no de un vistazo cada dos paladas. Respeto el orden del
// handoff y no lo cambio por mi cuenta; queda dicho aquí y en el informe.
//
// ── Y UNA COSA QUE NO ESTÁ, POR MUCHO QUE LA PIDA EL LAYOUT ────────────────
// «El /500 CONTRA EL OBJETIVO» no se puede pintar: la plantilla 507 prescribe
// distancia (5×500 m) y NINGÚN ritmo objetivo, y en la base no hay un solo
// `/500` prescrito que comparar. Los 119,2 s del dato son el split MEDIDO, no
// una meta. Inventar un «2:00 /500» de referencia sería exactamente el valor por
// defecto con cara de dato que prohíbe el §7 — el mismo error que el «162 ppm»
// que circula por el doble. La página 3 pinta tu ritmo y calla lo que no sabe.

import {
  NOTA,
  countdown,
  distanciaMedida,
  pace,
  paginaPulso,
  paginaTiempo,
  tonoUrgente,
  unidadDistancia,
  type Ancla,
  type PaginaReloj,
} from '../../kit-watch';
import { ANCLA_MEDIDA, ERGO, SIN_ANCLA, rampa } from '../../datos-reloj';

export type Fase = 'remando' | 'descanso';

export interface Estado {
  /** ¿El móvil tiene el PM5 emparejado y leyendo? */
  maquina: boolean;
  ancla: Ancla;
  fase: Fase;
  /** La serie en curso. Durante el descanso, la que VIENE. */
  serie: number;
  /** Metros de la serie que ha contado EL PM5. Sin él no existen. */
  hechosM: number;
  /** Segundos dentro de la fase. */
  t: number;
}

export interface Gestos {
  /** Cerrar la serie. Sin PM5 emparejado es la única forma de cerrarla. */
  cerrarSerie: () => void;
  /** Adelantar el descanso y volver al asiento. */
  empezarYa: () => void;
}

/** Metros por segundo al ritmo del único split que se guardó: 500 m en 119,2 s. */
export const METROS_POR_SEGUNDO = ERGO.tramoM / ERGO.ritmoSec500;

/** Dónde arranca la reproducción: los 286 m de `ERGO.desdeM`, en segundos. */
export const DESDE_S = Math.round(ERGO.desdeM / METROS_POR_SEGUNDO);

/** La prescripción de la serie, con la grafía del kit: «500 m». */
const SERIE = `${distanciaMedida(ERGO.tramoM)} ${unidadDistancia(ERGO.tramoM)}`;

/** «Pulso» a secas no dice dónde estás, y aquí es la página que más se mira. */
const CONTEXTO_PULSO = 'Remo · tu pulso';

/** La FC sube hacia la máxima remando y baja hacia la media durante el descanso. */
export function bpmDe(e: Estado): number {
  return e.fase === 'remando'
    ? rampa(ERGO.fcDesde, ERGO.fcHasta, e.t, 90)
    : rampa(ERGO.fcHasta, ERGO.fcDesde, e.t, ERGO.descansoS);
}

/** Los metros que faltan de la serie. Sólo los sabe el PM5. */
export function faltanM(e: Estado): number {
  return Math.max(0, ERGO.tramoM - e.hechosM);
}

export function paginas(e: Estado, g: Gestos): PaginaReloj[] {
  const pulso = paginaPulso({ bpm: bpmDe(e), ancla: e.ancla, contexto: CONTEXTO_PULSO });
  const restoDePaginas = pulso ? [pulso] : [];

  if (e.fase === 'descanso') {
    const queda = Math.max(0, ERGO.descansoS - e.t);
    return [
      {
        id: 'descanso',
        contexto: `Descanso · viene la ${e.serie}`,
        // Sentado, manos libres, mirando el reloj. Aquí SÍ se decide.
        modo: 'mando',
        sujeto: { texto: countdown(queda), tono: tonoUrgente(queda) },
        segundo: { etiqueta: 'Luego', valor: SERIE },
        accion: { etiqueta: 'Toca · empezar ya', onToca: g.empezarYa },
      },
      ...restoDePaginas,
    ];
  }

  if (!e.maquina) {
    // EL MÍNIMO. Sin PM5 emparejado no hay metros, ni `/500`, ni potencia, ni
    // paladas: se caen DOS de las tres páginas de la vista. Y entonces la página
    // 1 es necesariamente tu FC, porque es lo único que queda que no venga de
    // una máquina que no está.
    const tiempo = paginaTiempo({
      segundos: e.t,
      contexto: 'Remo · en la serie',
      nota: NOTA.sinMaquina,
    });
    // El gesto no se anuncia (`ojeada` no pinta franja) pero existe, y va en la
    // primera página, que es la que el atleta tiene delante: sin metros que
    // canten el final, la serie la cierra él.
    const conGesto = (p: PaginaReloj): PaginaReloj => ({
      ...p,
      accion: { etiqueta: 'Toca al acabar la serie', onToca: g.cerrarSerie },
    });
    return pulso ? [conGesto(pulso), tiempo] : [conGesto(tiempo)];
  }

  const faltan = faltanM(e);
  return [
    {
      id: 'faltan',
      contexto: 'Remo · te faltan',
      modo: 'ojeada',
      sujeto: { texto: distanciaMedida(faltan), unidad: unidadDistancia(faltan) },
      // La serie que va cabe aquí sin costarle un punto al numeral (a este ancho
      // manda el ancho, no el presupuesto vertical), y sin ella un «214 m» a
      // secas no dice si es la primera o la última.
      segundo: { etiqueta: 'Serie', valor: `${e.serie} de ${ERGO.total}` },
      nota: NOTA.delMovil,
    },
    ...restoDePaginas,
    {
      id: 'ritmo',
      contexto: 'Remo · tu ritmo',
      modo: 'ojeada',
      sujeto: { texto: pace(ERGO.ritmoSec500) },
      // «/500 m» va de segundo nivel y no pegada a la cifra: pegada son 5,8
      // glifos de ancho y el numeral cae a 38 pt, por debajo del suelo de 43 del
      // kit. Aquí no es una preferencia, es que no cabe. Y va sola, sin objetivo
      // al lado, porque no hay ninguno prescrito (ver la cabecera).
      segundo: { valor: '/500 m' },
      nota: NOTA.delMovil,
    },
  ];
}

// ---------------------------------------------------------------------------
// Los casos que esta vista puede alcanzar — los recorre `kit-watch.test.ts`
// ---------------------------------------------------------------------------

const MUDO: Gestos = { cerrarSerie: () => {}, empezarYa: () => {} };

function caso(nombre: string, e: Estado) {
  return { nombre, paginas: paginas(e, MUDO) };
}

export const CASOS = [
  caso('sin PM5 · remando', {
    maquina: false,
    ancla: SIN_ANCLA,
    fase: 'remando',
    serie: ERGO.actual,
    hechosM: 0,
    t: DESDE_S,
  }),
  caso('sin PM5 · descanso', {
    maquina: false,
    ancla: SIN_ANCLA,
    fase: 'descanso',
    serie: ERGO.actual + 1,
    hechosM: 0,
    t: 8,
  }),
  caso('con PM5 · a mitad', {
    maquina: true,
    ancla: SIN_ANCLA,
    fase: 'remando',
    serie: ERGO.actual,
    hechosM: ERGO.desdeM,
    t: DESDE_S,
  }),
  // El arranque de la serie: «500 m» de tres glifos, el caso más ancho.
  caso('con PM5 · arranque', {
    maquina: true,
    ancla: SIN_ANCLA,
    fase: 'remando',
    serie: ERGO.actual,
    hechosM: 0,
    t: 0,
  }),
  // Y los últimos metros, cuando el numeral crece solo hasta su techo.
  caso('con PM5 · últimos metros', {
    maquina: true,
    ancla: SIN_ANCLA,
    fase: 'remando',
    serie: ERGO.actual,
    hechosM: 496,
    t: 118,
  }),
  // El día que un test escriba un umbral: aparecen la zona y el lienzo teñido.
  caso('con PM5 · con umbral', {
    maquina: true,
    ancla: ANCLA_MEDIDA,
    fase: 'remando',
    serie: ERGO.actual,
    hechosM: ERGO.desdeM,
    t: DESDE_S,
  }),
  // El último segundo del descanso, que es cuando el numeral es más grande y
  // cuando el naranja de aviso aparece.
  caso('descanso · último segundo', {
    maquina: true,
    ancla: SIN_ANCLA,
    fase: 'descanso',
    serie: ERGO.actual + 1,
    hechosM: 0,
    t: ERGO.descansoS - 1,
  }),
] as const;
