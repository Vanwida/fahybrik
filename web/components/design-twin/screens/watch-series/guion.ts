// (2) SERIES DE CALLE — la vista donde el modo cambia dos veces por tramo.
//
// ── QUÉ MIDE EL RELOJ AQUÍ ─────────────────────────────────────────────────
// Todo lo suyo, igual que el rodaje: pulso, ritmo y distancia por GPS. Nada
// repetido por el móvil y nada declarado por el atleta… salvo UNA cosa, y de
// ahí sale la vista entera: **cuándo se acaba el tramo**.
//
// Las cinco repeticiones medidas de la ejecución 104 salieron 1600 · 1176 ·
// 1200 · 1220 · 950 m. Cinco tramos que deberían medir lo mismo y salen entre
// 950 y 1600 no los cerró un hito de distancia — los cerró el atleta. Así que
// el reloj sólo sabe cuánto falta cuando el coach escribió una distancia, y
// por eso esta vista tiene dos escenarios y no uno.
//
// (De cara al atleta cada repetición es UNA SERIE: «cinco series de 1.200» es
// como se dice y como ya lo escribe la app de hoy. `medidasM` las llama
// repeticiones porque así llegan de `segment_executions`.)
//
// ── QUÉ PUEDE HACER EL ATLETA, Y AQUÍ ESTÁ EL GIRO ─────────────────────────
// Dentro de la serie va a tope y con el brazo en movimiento: `ojeada`. Un dato
// gigante y CERO controles anunciados.
//
// Esto CORRIGE la vista de hoy (`screens/watch-vivo/serie.tsx`), que durante la
// serie ofrece «Toca · serie hecha» a plena luz: le está pidiendo al atleta que
// decida mientras esprinta. El gesto sigue existiendo aquí donde hace falta
// (toda la pantalla es el blanco, no hay que apuntar), pero no se anuncia, y
// esos 15 pt de franja vuelven al numeral.
//
// En la recuperación el atleta está de pie, jadeando y mirando el reloj:
// `mando`. Ahí sí van la cuenta atrás, lo que viene y «empezar ya».
//
// ── EL SUJETO, Y POR QUÉ CAMBIA DE SENTIDO ─────────────────────────────────
// Con objetivo prescrito el sujeto son LOS METROS QUE FALTAN, y drenan hacia
// cero: corriendo, la única pregunta es «cuánto me queda».
//
// Sin objetivo esa pregunta NO TIENE RESPUESTA, y fabricarla sería inventar la
// mitad de una prescripción que el coach no escribió (§7). Lo único que el
// reloj sabe entonces son los metros que LLEVAS, y crecen. El sujeto no cambia
// de tamaño ni de sitio: cambia de sentido.
//
// ── DÓNDE VA CADA CIFRA, Y POR QUÉ SIN SEPARADOR DE MILLAR ─────────────────
// Los metros se escriben `1200`, no `1.200`. No es descuido: el punto de millar
// es un glifo más, y en un lienzo de 188 pt eso baja el numeral de 51 a 41 pt
// de cifra — por debajo del suelo de legibilidad del kit. Un separador que
// cuesta el 20 % de la altura del dato en la única pantalla que se lee de reojo
// no se paga.
//
// Y tampoco se usa `distanciaMedida`, que a partir de 1.000 m salta a km: en un
// tramo que drena de 1200 a 0 la unidad cambiaría sola a mitad de serie, y un
// numeral que muda de unidad mientras lo miras es peor que uno grande.

import {
  countdown,
  pace,
  paginaPulso,
  tonoUrgente,
  type Ancla,
  type PaginaReloj,
} from '../../kit-watch';
import { SERIES_CALLE, SIN_ANCLA, rampa } from '../../datos-reloj';

export type Fase = 'trabajo' | 'recupera';

export interface Estado {
  /**
   * Los metros que el coach prescribió por serie. `null` = no los escribió, y
   * entonces NADIE sabe dónde acaba el tramo hasta que el atleta lo cierra.
   */
  objetivoM: number | null;
  /** Hoy es `null` para todos los atletas; el campo existe porque el día que haya umbral, esta vista ya sabe teñirse. */
  ancla: Ancla;
  fase: Fase;
  /** La serie en curso. Durante la recuperación, la que VIENE. */
  serie: number;
  /** Segundos dentro de la fase. */
  t: number;
}

export interface Gestos {
  /** Cerrar la serie corriendo. Sólo existe cuando no hay hito que la cierre. */
  cerrarSerie: () => void;
  /** Adelantar la recuperación. */
  empezarYa: () => void;
}

/**
 * Los metros que arrastra la reproducción antes de enseñarse: se arranca con la
 * serie ya empezada para que el primer fotograma sea el estado de diseño (un
 * sujeto de cuatro cifras) y no un «0 m» recién salido.
 */
export const DESDE_M = 1_000;
export const DESDE_S = Math.round(DESDE_M / SERIES_CALLE.velocidadMs);

/** Lo que tarda el pulso en llegar a su meseta dentro de una serie. */
const SUBIDA_S = 60;

/** Los metros cubiertos dentro de la serie, a 4,0 m/s. */
export function metrosDe(t: number): number {
  return Math.max(0, t) * SERIES_CALLE.velocidadMs;
}

/**
 * DÓNDE SE CIERRA LA SERIE EN CURSO.
 *
 * Con objetivo, en el hito. Sin objetivo, la reproducción usa los metros que el
 * atleta corrió DE VERDAD en esa repetición de la ejecución 104 — y eso no es
 * el reloj adivinando: es el guion reproduciendo el toque del atleta en el
 * segundo en el que lo dio. Por eso el aro no se llena (ver `index.tsx`): lo
 * que el guion sabe de antemano, la muñeca no.
 */
export function cierreM(e: Estado): number {
  const medidas = SERIES_CALLE.medidasM;
  return e.objetivoM ?? medidas[(e.serie - 1) % medidas.length]!;
}

/** El pico de pulso de la serie `n`: 138 en la primera, 178 en la quinta. */
function pico(serie: number): number {
  return rampa(SERIES_CALLE.fcDesde, SERIES_CALLE.fcHasta, serie - 1, SERIES_CALLE.total - 1);
}

/** La serie que acaba de cerrarse, vista desde la recuperación. */
export function anterior(serie: number): number {
  return serie === 1 ? SERIES_CALLE.total : serie - 1;
}

/**
 * El pulso: sube hacia el techo de esta serie mientras corres y baja hacia el
 * pulso de salida mientras recuperas. Los dos extremos son los de la ejecución
 * (138 y 178); lo de en medio es interpolación, no un dato guardado.
 */
export function bpmDe(e: Estado): number {
  return e.fase === 'trabajo'
    ? rampa(SERIES_CALLE.fcDesde, pico(e.serie), e.t, SUBIDA_S)
    : rampa(pico(anterior(e.serie)), SERIES_CALLE.fcDesde, e.t, SERIES_CALLE.recuperacionS);
}

export function paginas(e: Estado, g: Gestos): PaginaReloj[] {
  const pulso = paginaPulso({ bpm: bpmDe(e), ancla: e.ancla });
  const restoDePaginas = pulso ? [pulso] : [];

  if (e.fase === 'recupera') {
    const queda = Math.max(0, SERIES_CALLE.recuperacionS - e.t);
    return [
      {
        id: 'recupera',
        contexto: `Recupera · viene la ${e.serie}`,
        // De pie, jadeando, con las manos libres. Aquí SÍ se decide.
        modo: 'mando',
        sujeto: { texto: countdown(queda), tono: tonoUrgente(queda) },
        // Lo que viene sólo se puede anunciar si el coach lo escribió. Sin
        // objetivo no se pinta «— m» ni un 0: la cuenta de series ya la lleva
        // el contexto, y el resto no lo sabe nadie.
        segundo: e.objetivoM == null ? undefined : { etiqueta: 'Luego', valor: `${e.objetivoM} m` },
        accion: { etiqueta: 'Toca · empezar ya', onToca: g.empezarYa },
      },
      ...restoDePaginas,
    ];
  }

  const objetivo = e.objetivoM;
  const recorridos = metrosDe(e.t);
  // Lo que falta se redondea hacia ARRIBA y lo que llevas hacia abajo: ni se
  // da por acabado un tramo antes de tiempo, ni se apuntan metros sin correr.
  const texto =
    objetivo == null
      ? String(Math.floor(recorridos))
      : String(Math.ceil(Math.max(0, objetivo - recorridos)));

  return [
    {
      id: 'serie',
      contexto: `Serie ${e.serie} / ${SERIES_CALLE.total}`,
      // A tope y con el brazo en movimiento: un dato y ni un control anunciado.
      modo: 'ojeada',
      sujeto: { texto, unidad: 'm' },
      // El ritmo lo mide el GPS del reloj, y la etiqueta lo dice: es el mismo
      // sitio donde una cinta pondría «del móvil» y una serie a pulso no
      // pondría nada porque no habría ritmo que enseñar.
      segundo: { etiqueta: 'GPS', valor: `${pace(SERIES_CALLE.ritmoSecKm)}/km` },
      // EL GESTO EXISTE SÓLO CUANDO NADA MÁS PUEDE CERRAR EL TRAMO. Sin
      // objetivo, el toque es la única forma de cerrar la serie: se declara, y
      // el lienzo no lo anuncia porque el modo es `ojeada`. Con objetivo el
      // hito cierra solo, así que no se declara — con la pantalla entera de
      // blanco y el brazo en movimiento, un toque de más terminaría una serie
      // que iba bien.
      accion: objetivo == null ? { etiqueta: 'Toca · serie hecha', onToca: g.cerrarSerie } : undefined,
    },
    ...restoDePaginas,
  ];
}

// ---------------------------------------------------------------------------
// Los casos que esta vista puede alcanzar — los recorre `kit-watch.test.ts`
// ---------------------------------------------------------------------------

const MUDO: Gestos = { cerrarSerie: () => {}, empezarYa: () => {} };

function caso(nombre: string, e: Estado) {
  return { nombre, paginas: paginas(e, MUDO) };
}

const SIN_OBJETIVO = { objetivoM: null, ancla: SIN_ANCLA } as const;
const CON_OBJETIVO = { objetivoM: SERIES_CALLE.objetivoM, ancla: SIN_ANCLA } as const;

export const CASOS = [
  caso('sin objetivo · a mitad', { ...SIN_OBJETIVO, fase: 'trabajo', serie: 3, t: DESDE_S }),
  // La primera serie de la ejecución 104 se cerró a los 1.600 m: el sujeto más
  // ancho de la vista, y el que decide si el separador de millar cabe o no.
  caso('sin objetivo · el tramo más largo', { ...SIN_OBJETIVO, fase: 'trabajo', serie: 1, t: 400 }),
  caso('sin objetivo · recupera', { ...SIN_OBJETIVO, fase: 'recupera', serie: 4, t: 12 }),
  caso('con objetivo · serie entera', { ...CON_OBJETIVO, fase: 'trabajo', serie: 3, t: 0 }),
  caso('con objetivo · último tramo', { ...CON_OBJETIVO, fase: 'trabajo', serie: 3, t: 290 }),
  // El último segundo de la recuperación, que es cuando el numeral es más
  // grande y el único momento en el que aparece el naranja de aviso.
  caso('con objetivo · último segundo', { ...CON_OBJETIVO, fase: 'recupera', serie: 4, t: 88 }),
] as const;
