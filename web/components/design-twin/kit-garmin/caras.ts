// LAS CARAS DEL VIVO, DISPUESTAS — funciones PURAS: de lo que decide
// `kit-reloj` (la lámina, el héroe, lo que viene) a una `Disposicion` sobre la
// rejilla del círculo. Una por lo que haces (§7):
//
//   disponerPaso       G09  el paso de correr: contexto · nota · héroe · banda
//                           ▲▼ (o la instrucción) · lo que falta · el pulso.
//                           TODO sale de `laminaDelPaso`: la vista no decide.
//                           El contexto nunca pierde la posición (`contextoSinPerderPosicion`).
//   disponerRecupera   G11  monocromo: la cuenta atrás, «Luego · …», el pulso.
//   disponerDescanso   G12  la fase común: cuenta atrás, «Viene: …», el pulso.
//   disponerCuenta     G08  3-2-1 y GO antes de un paso de trabajo.
//   disponerKm              la vuelta automática recién hecha.
//   disponerPausa      G20  en pausa: el crono de la sesión quieto y dónde estabas.
//   disponerDeshacer   G21  «Serie 3 cerrada · ↶ UP · deshacer», en la franja del pie.
//   disponerCompletada G27  sello, título, el tiempo total, completa/parcial.
//
// Qué NO hacer: elegir aquí el número grande (P3 vive en `laminaDelPaso`);
// pintar el pulso en otra fila que el pie; teñir nada (el tinte lo decide la
// vista con `tinteDeFondo`, y solo en AMOLED).

import { type Completitud } from '../kit-reloj/despues';
import { lineaCompletitud } from '../kit-reloj/fin';
import { heroeDelPaso, laminaDelPaso, lineaPulso, type BandaVista, type Lamina } from '../kit-reloj/lamina';
import type { Lecturas, Paso, PasoBase, ReglasAviso, ZonasCoach } from '../kit-reloj/paso';
import { REGLAS_AVISO_DEFECTO } from '../kit-reloj/paso';
import { textoCuenta } from '../kit-reloj/pasos';
import { textoViene } from '../kit-reloj/posicion';
import { contextoDe, fmtReloj } from '../kit-reloj/reglas';
import {
  altoLinea,
  altoNota,
  chica,
  colocar,
  heroeEn,
  lineaDeDato,
  lineaDePartes,
  lineaDeTexto,
  vacia,
  type Disposicion,
  type LineaG,
  type PistaG,
} from './disponer';
import { CONTEXTO_EN_DOS, FRANJA_DESHACER, PISTA, REJILLA, SELLO, caja, cajaEnFila, type Caja } from './geometria';
import { ajustarPartes, anchoPiezas, partirEnLineas, type Pieza } from './medir';
import { AIRE, TG, cuerpoPx } from './tokens';

// ---------------------------------------------------------------------------
// Filas comunes
// ---------------------------------------------------------------------------

const ALTO_NOTA = altoLinea(TG.nota, 'nota');

/**
 * El contexto: una línea pegada al fondo de su franja, que baja de cuerpo y
 * luego pierde partes por el final. Si una sola parte no cabe ni al suelo
 * (un nombre largo del coach), va en dos líneas (`CONTEXTO_EN_DOS`).
 */
export function lineasContexto(partes: readonly string[], D: number, tono: 'tinta' | 'tinta2' = 'tinta'): LineaG[] {
  const una = cajaEnFila('contexto', altoLinea(TG.contexto, 'texto'));
  const a = ajustarPartes(partes, 'texto', TG.contexto, D, Math.floor(una.ancho * D));
  const pieza = (texto: string, cuerpo: number): Pieza[] => [{ texto, cara: 'texto', cuerpo, tono }];
  if (a.cabe) return [colocar('contexto', pieza(a.texto, a.cuerpo), una, D)];
  const [desde, hasta] = CONTEXTO_EN_DOS;
  const abajo = caja(hasta - ALTO_NOTA, ALTO_NOTA);
  const arriba = caja(Math.max(desde, abajo.y - ALTO_NOTA), ALTO_NOTA);
  const suelo = cuerpoPx(TG.suelo, D);
  const partido = partirEnLineas(a.texto, 'texto', suelo, [Math.floor(arriba.ancho * D), Math.floor(abajo.ancho * D)]);
  if (!partido) return [colocar('contexto', pieza(a.texto, suelo), una, D, 'centro', false)];
  return [colocar('contexto', pieza(partido[0], suelo), arriba, D), colocar('contexto', pieza(partido[1], suelo), abajo, D)];
}

/** Una nota (cue, honestidad) apilada desde `y`: una línea o, si no cabe, dos. */
function lineasNota(rol: string, texto: string, y: number, D: number, tono: 'tinta' | 'tinta2' = 'tinta2'): LineaG[] {
  const c = caja(y, ALTO_NOTA);
  return lineaDeTexto(rol, texto, TG.nota, D, { una: c, arriba: c, abajo: caja(y + altoNota, ALTO_NOTA) }, { tono });
}

/**
 * Lo que viene («Luego · …», «Viene: …»): en la franja de la banda si cabe
 * en una línea; si no, en dos, con la segunda justo en la secundaria. Así el
 * deshacer, que tapa desde la secundaria, se lleva la línea entera y nunca la
 * corta por la mitad.
 */
export function lineasApoyo(rol: string, prefijo: string, texto: string, D: number): LineaG[] {
  const [corte] = REJILLA.secundaria;
  const una = cajaEnFila('banda', ALTO_NOTA);
  return lineaDeTexto(rol, texto, TG.nota, D, { una, arriba: caja(corte - ALTO_NOTA, ALTO_NOTA), abajo: caja(corte, ALTO_NOTA) }, { prefijo, tono: 'tinta' });
}

/** Cuánto se come de la franja del héroe lo que va encima de él (líneas apiladas). */
const bajo = (lineas: LineaG[], D: number, desde: number) =>
  lineas.length === 0 ? desde : Math.max(...lineas.map((l) => (l.y + l.alto) / D)) + AIRE.lineas;

// ---------------------------------------------------------------------------
// La banda del objetivo
// ---------------------------------------------------------------------------

/**
 * La banda: rótulo a la izquierda, palabra a la derecha (solo fuera, o
 * siempre si no es a zona, como en la muñeca) y la pista debajo. La palabra
 * fuera va en tinta; dentro, en tinta2. Sin cambiar de color (P6).
 */
export function disponerBanda(b: BandaVista, D: number): { linea: LineaG; pista: PistaG } {
  const total = ALTO_NOTA + PISTA.hueco + PISTA.alto;
  const c = cajaEnFila('banda', total);
  const texto = caja(c.y, ALTO_NOTA);
  const fuera = b.veredicto != null && b.veredicto !== 'dentro';
  const palabra = b.palabra && (fuera || !b.zonas) ? b.palabra : null;
  const piezas: Pieza[] = [chica(b.rotulo, D)];
  if (palabra) {
    piezas.push({
      texto: palabra.marca ? `${palabra.marca} ${palabra.texto}` : palabra.texto,
      cara: fuera ? 'texto' : 'nota',
      cuerpo: cuerpoPx(TG.nota, D),
      tono: fuera ? 'tinta' : 'tinta2',
      antes: AIRE.piezas * D,
    });
  }
  const linea = colocar('banda', piezas, texto, D, 'extremos');
  const yPista = c.y + ALTO_NOTA + PISTA.hueco;
  const pista = caja(yPista, PISTA.alto);
  return { linea, pista: { banda: b, y: yPista * D, alto: PISTA.alto * D, ancho: Math.floor(Math.min(texto.ancho, pista.ancho) * D) } };
}

// ---------------------------------------------------------------------------
// G09 · el paso
// ---------------------------------------------------------------------------

/** EL PASO: la lámina entera, colocada. Recibe la lámina (no el paso): la decisión es de `laminaDelPaso`. */
export function disponerPaso(l: Lamina, D: number): Disposicion {
  const lineas: LineaG[] = [...lineasContexto(l.contexto, D)];
  const encima: LineaG[] = [];
  let y = Math.max(REJILLA.heroe[0], bajo(lineas, D, REJILLA.heroe[0]));
  if (l.nota) {
    encima.push(...lineasNota('nota', l.nota, y, D));
    y = bajo(encima, D, y);
  }
  if (l.heroe.etiqueta) {
    encima.push(colocar('etiqueta', [chica(l.heroe.etiqueta, D)], caja(y, ALTO_NOTA), D));
    y = bajo(encima, D, y);
  }
  lineas.push(...encima);
  const heroe = heroeEn(l.heroe.texto, l.heroe.unidad, y, REJILLA.heroe[1], D);
  let pista: PistaG | null = null;
  if (l.banda) {
    const b = disponerBanda(l.banda, D);
    lineas.push(b.linea);
    pista = b.pista;
  } else if (l.instruccion) {
    lineas.push(...lineaDePartes('instruccion', [l.instruccion], TG.tercero, cajaEnFila('banda', altoLinea(TG.tercero, 'texto')), D));
  }
  if (l.segundo) lineas.push(lineaDeDato('secundaria', l.segundo, TG.segundo, 'secundaria', D));
  if (l.tercero) lineas.push(lineaDeDato('pie', l.tercero, TG.tercero, 'pie', D));
  return { D, lineas, heroe, pista };
}

/** ¿Es esta parte del contexto una posición («Serie 3/6», «Tanda 2/3», «tramo 3/8», «Estación 3/4»)? */
const esPosicion = (parte: string) => /\d+\/\d+/.test(parte);

/**
 * El contexto de un paso SIN PERDER SU POSICIÓN. En una línea, el contexto
 * quita partes por el final; eso está bien con lo prescrito («Serie 3/6 ·
 * 1000 m» → «Serie 3/6»: «quedan 616 m» ya lo dice), pero en una posición
 * anidada se llevaría la serie en la que estás («Tanda 2/3 · Serie 4/6 · 1′» →
 * «Tanda 2/3»), y en un progresivo el tramo («Progresivo · tramo 3/8» →
 * «Progresivo»). Como todo es fracción de D, no cabe entero en NINGÚN reloj:
 * va en dos líneas, la corta arriba (la cuerda es estrecha) y la larga debajo.
 * Si ni así cabe, o no se pierde ninguna posición, queda como estaba.
 */
export function contextoSinPerderPosicion(partes: string[], D: number): string[] {
  const una = cajaEnFila('contexto', altoLinea(TG.contexto, 'texto'));
  const cabidas = ajustarPartes(partes, 'texto', TG.contexto, D, Math.floor(una.ancho * D)).partes;
  if (partes.filter(esPosicion).every((x) => cabidas.includes(x))) return partes;
  const ultima = partes.map(esPosicion).lastIndexOf(true);
  // Con todo lo prescrito detrás; y si así no cabe, hasta la última posición.
  for (const hasta of [partes.length, ultima + 1]) {
    const unido = [partes.slice(0, hasta).join(' · ')];
    if (lineasContexto(unido, D).every((x) => x.cabe)) return unido;
  }
  return partes;
}

/** Atajo: la lámina de `kit-reloj` y su disposición (con la posición del contexto a salvo). */
export function disponerPasoDe(p: PasoBase, l: Lecturas, zonas: ZonasCoach | null, D: number, reglas: ReglasAviso = REGLAS_AVISO_DEFECTO) {
  const lamina = laminaDelPaso(p, l, zonas, reglas);
  return { lamina, disposicion: disponerPaso({ ...lamina, contexto: contextoSinPerderPosicion(lamina.contexto, D) }, D) };
}

// ---------------------------------------------------------------------------
// G11 · recupera, G12 · descanso
// ---------------------------------------------------------------------------

/** RECUPERA — monocromo: aquí no se juzga nada. Lo que falta manda, «Luego · …» y el pulso bajando (sin zona). */
export function disponerRecupera(p: Paso, l: Lecturas, zonas: ZonasCoach | null, D: number): Disposicion {
  const lamina = laminaDelPaso(p, l, zonas);
  const h = heroeDelPaso(p, l, zonas);
  const lineas: LineaG[] = [...lineasContexto(lamina.contexto, D)];
  const heroe = heroeEn(h.texto, h.unidad, bajo(lineas, D, REJILLA.heroe[0]), REJILLA.heroe[1], D);
  if (p.siguiente) lineas.push(...lineasApoyo('luego', 'Luego ·', textoViene(p.siguiente), D));
  if (lamina.tercero) lineas.push(lineaDeDato('pie', lamina.tercero, TG.tercero, 'pie', D, true));
  return { D, lineas, heroe, pista: null };
}

/**
 * EL DESCANSO — la fase común a todas las familias (P8): cuenta atrás,
 * «Viene: …» con su objetivo y el pulso (monocromo). El +30 s está en
 * Controles y «Empezar ya» es BACK/LAP: no hay botones en la esfera.
 * `viene` lo cambia una familia (null = nada que decir).
 */
export function disponerDescanso(p: Paso, l: Lecturas, D: number, viene?: string | null): Disposicion {
  const h = heroeDelPaso(p, l, null);
  const lineas: LineaG[] = [...lineasContexto(contextoDe(p), D)];
  const heroe = heroeEn(h.texto, h.unidad, bajo(lineas, D, REJILLA.heroe[0]), REJILLA.heroe[1], D);
  const que = viene === undefined ? (p.siguiente ? textoViene(p.siguiente) : null) : viene;
  if (que) lineas.push(...lineasApoyo('viene', 'Viene:', que, D));
  if (l.ppm != null) lineas.push(lineaDeDato('pie', { ...lineaPulso(p, l, null), zona: undefined }, TG.tercero, 'pie', D, true));
  return { D, lineas, heroe, pista: null };
}

// ---------------------------------------------------------------------------
// G08 · 3-2-1 y GO, y la vuelta automática
// ---------------------------------------------------------------------------

/** LA CUENTA ATRÁS a pantalla entera: a qué entras, contra qué, y el número (0 = GO). */
export function disponerCuenta(n: number, paso: PasoBase, D: number): Disposicion {
  const lineas: LineaG[] = [...lineasContexto(contextoDe(paso), D)];
  const texto = textoCuenta(paso);
  let y = bajo(lineas, D, REJILLA.heroe[0]);
  if (texto) {
    const l = lineaDePartes('instruccion', texto.split(' · '), TG.tercero, caja(y, altoLinea(TG.tercero, 'texto')), D, { tono: 'tinta2' });
    lineas.push(...l);
    y = bajo(l, D, y);
  }
  return { D, lineas, heroe: heroeEn(n > 0 ? String(n) : 'GO', undefined, y, REJILLA.heroe[1], D), pista: null };
}

/** EL KM RECIÉN HECHO (la vuelta automática), unos segundos sobre el paso: qué, cuánto y de qué. */
export function disponerKm(banner: { titulo: string; valor: string; pie: string }, D: number): Disposicion {
  const lineas: LineaG[] = [...lineasContexto([banner.titulo], D)];
  const heroe = heroeEn(banner.valor, undefined, bajo(lineas, D, REJILLA.heroe[0]), REJILLA.heroe[1], D);
  lineas.push(colocar('pie-km', [chica(banner.pie, D)], cajaEnFila('banda', ALTO_NOTA), D));
  return { D, lineas, heroe, pista: null };
}

// ---------------------------------------------------------------------------
// G20 · pausa, G21 · deshacer, G27 · completada
// ---------------------------------------------------------------------------

/**
 * EN PAUSA — su propia cara, no un velo: en un MIP no existe la media luz.
 * «En pausa», el crono de la sesión quieto y dónde estabas.
 */
export function disponerPausa(sesionT: number, paso: PasoBase, D: number): Disposicion {
  const lineas: LineaG[] = [...lineasContexto(['En pausa'], D, 'tinta2')];
  const heroe = heroeEn(fmtReloj(sesionT), undefined, bajo(lineas, D, REJILLA.heroe[0]), REJILLA.heroe[1], D);
  lineas.push(...lineaDePartes('donde', contextoDe(paso), TG.nota, cajaEnFila('banda', ALTO_NOTA), D, { cara: 'nota', tono: 'tinta2' }));
  return { D, lineas, heroe, pista: null };
}

/** La franja del deshacer (fracción de D): la ocupa entera, con su fondo, y nunca sube al héroe. */
export const CAJA_DESHACER: Caja = caja(FRANJA_DESHACER[0], FRANJA_DESHACER[1] - FRANJA_DESHACER[0]);

/** El texto de la acción de deshacer, con su tecla: lo que el atleta tiene que hacer, en naranja. */
export const TEXTO_DESHACER = '↶ UP · deshacer';

/**
 * Las dos líneas del deshacer, pegadas al borde de arriba de la franja (bajo
 * la barra que drena): abajo la cuerda se estrecha deprisa, y «↶ UP ·
 * deshacer» tiene que caber entero a 218.
 */
const Y_AVISO = FRANJA_DESHACER[0] + PISTA.drena;
const Y_ACCION = Y_AVISO + ALTO_NOTA;

/** ¿Cabe el aviso de cierre en la franja? Si no, se dice el genérico (nunca a medias). */
export function avisoQueCabe(aviso: string, D: number, generico = 'Paso cerrado'): string {
  const c = caja(Y_AVISO, ALTO_NOTA);
  return anchoPiezas([chica(aviso, D, 'tinta')]) <= Math.floor(c.ancho * D) ? aviso : generico;
}

/** EL DESHACER: qué se cerró y «↶ UP · deshacer», en la franja del pie (la barra que drena la pinta la vista). */
export function disponerDeshacer(aviso: string, D: number): Disposicion {
  const lineas = [
    colocar('aviso', [chica(avisoQueCabe(aviso, D), D, 'tinta')], caja(Y_AVISO, ALTO_NOTA), D),
    colocar('deshacer', [{ texto: TEXTO_DESHACER, cara: 'texto', cuerpo: cuerpoPx(TG.nota, D), tono: 'accion' }], caja(Y_ACCION, ALTO_NOTA), D),
  ];
  return { ...vacia(D), lineas };
}

/**
 * SESIÓN COMPLETADA (o terminada a mano): el sello, el título, el tiempo
 * total, completa/parcial (lo decide lo hecho, `completitud` de kit-reloj) y,
 * si es parcial, por qué; si no, que está guardada en el reloj (G8: escribir
 * primero; el envío honesto es G31, de la familia de después).
 */
export function disponerCompletada(natural: boolean, t: number, c: Completitud, metros: number | null, D: number): Disposicion {
  const [, hC] = REJILLA.contexto;
  const sello = { y: (hC - SELLO / 2) * D, talla: SELLO * D };
  const titulo = natural ? 'Sesión completada' : 'Sesión terminada';
  const y0 = REJILLA.heroe[0];
  const lineas = lineaDePartes('titulo', [titulo], TG.contexto, caja(y0, altoLinea(TG.contexto, 'texto')), D);
  const heroe = heroeEn(fmtReloj(t), undefined, bajo(lineas, D, y0), REJILLA.heroe[1], D);
  lineas.push(colocar('completitud', [chica(lineaCompletitud(c, metros), D, 'tinta')], cajaEnFila('banda', ALTO_NOTA), D));
  const [dS] = REJILLA.secundaria;
  const detalle = c.motivo ?? 'Guardado en el reloj';
  lineas.push(...lineaDeTexto('detalle', detalle, TG.nota, D, { una: caja(dS, ALTO_NOTA), arriba: caja(dS, ALTO_NOTA), abajo: caja(dS + altoNota, ALTO_NOTA) }, { tono: 'tinta2' }));
  return { D, lineas, heroe, pista: null, sello };
}
