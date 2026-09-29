// EL AVISO DE SISTEMA (G26) — el GPS o el pulso que se pierden o vuelven en
// mitad de una carrera. Funciones PURAS: qué se dice y cómo se coloca.
//
// El motor de `kit-reloj` NO tiene esta tarjeta (la muñeca la resuelve con una
// nota); el reloj Garmin sí la pide (§7, G26): cuando el sensor se cae, además
// de los tres pulsos largos y el tono de fallo (`avisos.ts`, ya hecho), la
// pantalla tiene que decirlo con palabras. Y decir lo que SIGUE funcionando,
// que es lo que el atleta se pregunta con las manos ocupadas: el crono.
//
//   · `avisoDeSistema`    de lo que leía el reloj a lo que se ha perdido o
//                         recuperado (la misma lectura que `sistemaDe` de
//                         `kit-garmin/avisos.ts`: no hay dos detectores).
//   · `disponerSistema`   la tarjeta: qué pasa · «llevas» el crono de la sesión (sigue) ·
//                         qué queda sin dato.
//
// Una tarjeta tapa la pantalla `SISTEMA_MS` como la del km; pasado ese rato lo
// que queda es la nota del paso («GPS · buscando») o el «—» del pulso. Nada se
// congela: un dato que no llega se pinta «—» (G1, G7), nunca el último valor.
//
// PIEZA GENÉRICA: la usarán todas las familias con GPS o pulso (circuito,
// fuerza con pulso). Tres usos = subirla a `kit-garmin/`; el arquitecto
// consolida.
//
// Qué NO hacer: escribir aquí un umbral (cuánto es «perdido» lo decide la
// lectura del reloj, no la pantalla); dejar la tarjeta más de `SISTEMA_MS`
// (un aviso que no se va acaba tapando la carrera).

import { lineasContexto } from '../../kit-garmin/caras';
import { altoLinea, chica, colocar, heroeEn, lineaDePartes, type Disposicion, type LineaG } from '../../kit-garmin/disponer';
import { REJILLA, caja, cajaEnFila } from '../../kit-garmin/geometria';
import { AIRE, TG } from '../../kit-garmin/tokens';
import { fmtReloj } from '../../kit-reloj/reglas';

/** Cuánto se ve la tarjeta de sistema, ms. Mecanismo (como el km): lo bastante para leerla de reojo, poco para no tapar la carrera. */
export const SISTEMA_MS = 4000;

export type AvisoDeSistema =
  | 'gps-perdido'
  | 'gps-listo'
  | 'gps-recuperado'
  | 'pulso-perdido'
  | 'pulso-recuperado'
  // Los tres de «Garmin · antes y después» (G26): lo que se dice ANTES de empezar y AL TERMINAR.
  | 'pulso-ausente'
  | 'bateria-baja'
  | 'sin-movil';

/** Lo que el reloj lee y decide un aviso: el estado del GPS y si el pulso llega. */
export interface LecturaDeSistema {
  gps: 'buscando' | 'listo' | 'no-aplica';
  /** `true` si el pulso llega (hay lectura). */
  pulso: boolean;
}

/**
 * ¿Qué avisó el cambio de una lectura a otra? El GPS manda sobre el pulso si
 * cambian a la vez. «GPS listo» es el primer fijado de la sesión (aún no había
 * habido GPS); después, un GPS que vuelve es «recuperado». En cinta no hay GPS
 * que perder.
 */
export function avisoDeSistema(antes: LecturaDeSistema, despues: LecturaDeSistema, huboGps: boolean): AvisoDeSistema | null {
  if (antes.gps === 'listo' && despues.gps === 'buscando') return 'gps-perdido';
  if (antes.gps === 'buscando' && despues.gps === 'listo') return huboGps ? 'gps-recuperado' : 'gps-listo';
  if (antes.pulso && !despues.pulso) return 'pulso-perdido';
  if (!antes.pulso && despues.pulso) return 'pulso-recuperado';
  return null;
}

/** Lo que dice cada aviso: el título, lo que sigue y lo que queda sin dato (`null` = nada que decir). */
export const TEXTO_SISTEMA: Record<AvisoDeSistema, { titulo: string; sigue: string; sinDato: string | null }> = {
  'gps-perdido': { titulo: 'GPS perdido', sigue: 'El crono sigue', sinDato: 'Ritmo y distancia: —' },
  'gps-recuperado': { titulo: 'GPS recuperado', sigue: 'Vuelve el ritmo', sinDato: null },
  'gps-listo': { titulo: 'GPS listo', sigue: 'Ya mide el ritmo', sinDato: null },
  'pulso-perdido': { titulo: 'Pulso perdido', sigue: 'El crono sigue', sinDato: 'Pulso: —' },
  'pulso-recuperado': { titulo: 'Pulso recuperado', sigue: 'Vuelve el pulso', sinDato: null },
  // Antes de empezar (pulso, batería) o al terminar (móvil): no hay «llevas» que enseñar.
  'pulso-ausente': { titulo: 'Sin pulso', sigue: 'Puedes empezar igual', sinDato: 'Lo que va a zona: —' },
  'bateria-baja': { titulo: 'Batería baja', sigue: 'Puede no llegar al final', sinDato: null },
  'sin-movil': { titulo: 'Sin móvil', sigue: 'Se graba igual', sinDato: 'Sube con el móvil' },
};

const ALTO_NOTA = altoLinea(TG.nota, 'nota');

/** LA TARJETA: el título, el crono de la sesión (sigue) y lo que sigue / lo que falta. */
export function disponerSistema(aviso: AvisoDeSistema, sesionT: number, D: number): Disposicion {
  const texto = TEXTO_SISTEMA[aviso];
  const lineas: LineaG[] = [...lineasContexto([texto.titulo], D)];
  // Lo de encima del héroe se apila desde el contexto, como en `disponerPaso`.
  const bajo = (hasta: LineaG[], y: number) => Math.max(y, ...hasta.map((l) => (l.y + l.alto) / D + AIRE.lineas));
  const yEtiqueta = Math.max(REJILLA.heroe[0], bajo(lineas, 0));
  const etiqueta = colocar('etiqueta', [chica('llevas', D)], caja(yEtiqueta, ALTO_NOTA), D);
  lineas.push(etiqueta);
  const heroe = heroeEn(fmtReloj(sesionT), undefined, bajo([etiqueta], yEtiqueta), REJILLA.heroe[1], D);
  lineas.push(...lineaDePartes('sigue', [texto.sigue], TG.nota, cajaEnFila('banda', ALTO_NOTA), D, { cara: 'nota', tono: 'tinta' }));
  if (texto.sinDato) {
    const [dS] = REJILLA.secundaria;
    lineas.push(...lineaDePartes('sin-dato', [texto.sinDato], TG.nota, caja(dS, ALTO_NOTA), D, { cara: 'nota', tono: 'tinta2' }));
  }
  return { D, lineas, heroe, pista: null };
}
