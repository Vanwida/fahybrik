// LAS CARAS DEL CIRCUITO EN EL RELOJ GARMIN (P10) — funciones PURAS: de un
// paso y sus lecturas a una `Disposicion` sobre la rejilla del círculo.
//
//   carrera       LA MISMA cara de correr del kit (`disponerPaso`: el objetivo
//                 del coach manda, con su banda y su ▲▼), con la posición y el
//                 crono TOTAL (la puntuación) en el contexto. Con un RPE que
//                 habla de ritmo, el ritmo ACTUAL debajo: sin él no se cumple.
//   estación      nombre, dosis y carga. Nadie la mide (G7): el héroe es el
//                 crono de la estación, «lo dices tú · LAP», y el objetivo va
//                 como INSTRUCCIÓN, no como veredicto.
//   Roxzone       paso propio, y también la cierra el atleta (sin detección por
//                 movimiento en la v1): «entras a / sales a», con su destino.
//   AMRAP         lo que queda de la ventana y la tarea; las reps, en la campana.
//   campana       las reps se dicen con UP/DOWN y se guardan con START (`anotar`).
//   descanso      el común del kit (P8), con «Viene:» del circuito.
//   relevo        dobles: la estación de tu pareja es una espera que cierras tú.
//
// El crono total sale del CONTEXTO, nunca de una línea aparte: el héroe no
// cede ni un píxel. Si no cabe junto a la posición, va en dos líneas; jamás se
// quita (la puntuación no se va de la pantalla) y jamás se trunca.
//
// Qué NO hacer: elegir aquí el número grande (es de `laminaDelPaso`); pintar
// una zona en la estación o en la Roxzone; quitar el total para que quepa el resto.

import { formatoDobles, heroeRelevo, NOTA_RELEVO, pactoDe, textoTurno } from '../../kit-reloj/dobles';
import { laminaDelPaso, lineaPulso, type Lamina } from '../../kit-reloj/lamina';
import type { Lecturas, Paso, PasoBase, ReglasAviso, ZonasCoach } from '../../kit-reloj/paso';
import { esCarrera, faltaDe, fmtDuracion, fmtReloj, fmtRitmo } from '../../kit-reloj/reglas';
import type { Dial } from '../../kit-reloj/tarea';
import {
  AIRE,
  CONTEXTO_EN_DOS,
  ESPACIO_EM,
  REJILLA,
  TG,
  ajustarPartes,
  altoLinea,
  caja,
  cajaEnFila,
  chica,
  colocar,
  cuerpoPx,
  cuerpoQueCabe,
  disponerDescanso,
  disponerPaso,
  heroeEn,
  lineaDePartes,
  lineasApoyo,
  lineasContexto,
  type Disposicion,
  type LineaG,
  type Pieza,
} from '../../kit-garmin';
import { esPuntuacion, type Circuito } from '../reloj-circuito/planes';
import { cortoDe, dosisCompleta, posicionDe, vieneDe } from '../reloj-circuito/texto';

/** Cómo se cierra a mano un paso que nadie mide: «lo dices tú», y con qué tecla (G7). */
export const DILO_TU = 'lo dices tú · LAP';
/** En la campana: lo que hay que hacer para decir las reps, y para guardarlas. */
export const DECIR_REPS = 'UP/DOWN · reps';
export const GUARDAR_REPS = 'START · guardar';

/** Todo lo que una cara necesita saber: el paso vivo, el circuito y el crono total. */
export interface DatosCara {
  paso: Paso;
  lecturas: Lecturas;
  zonas: ZonasCoach | null;
  reglas: ReglasAviso;
  c: Circuito;
  /** El crono total (la puntuación); `null` = aún en el calentamiento. */
  total: number | null;
  /** Las reps dichas en la campana del AMRAP; `null` fuera de ella. */
  dial: Dial | null;
  D: number;
}

// ---------------------------------------------------------------------------
// El contexto con el total
// ---------------------------------------------------------------------------

const ALTO_NOTA = altoLinea(TG.nota, 'nota');

/** Las dos líneas del contexto cuando la posición y el total no caben en una: el total arriba, la posición abajo. */
const [DESDE_DOS, HASTA_DOS] = CONTEXTO_EN_DOS;

/**
 * El contexto de una cara del circuito: la posición y el crono total. Baja de
 * cuerpo hasta el suelo antes de perder una parte de la posición; y si ni
 * «primera parte + total» caben, van en dos líneas. El total no se quita.
 */
export function lineasContextoTotal(partes: readonly string[], total: number | null, D: number): LineaG[] {
  if (total == null) return lineasContexto(partes, D);
  const t = fmtReloj(total);
  const una = cajaEnFila('contexto', altoLinea(TG.contexto, 'texto'));
  const ancho = Math.floor(una.ancho * D);
  const construir =
    (usadas: readonly string[]) =>
    (cuerpo: number): Pieza[] => [
      { texto: usadas.join(' · '), cara: 'texto', cuerpo, tono: 'tinta' },
      { texto: '·', cara: 'texto', cuerpo, tono: 'tinta2', antes: cuerpo * ESPACIO_EM },
      { texto: t, cara: 'cifras', cuerpo, tono: 'tinta', antes: cuerpo * ESPACIO_EM },
    ];
  for (let k = partes.length; k >= 1; k--) {
    const r = cuerpoQueCabe(construir(partes.slice(0, k)), TG.contexto, D, ancho);
    if (r.cabe) return [colocar('contexto', r.piezas, una, D)];
  }
  const suelo = cuerpoPx(TG.suelo, D);
  const abajo = caja(HASTA_DOS - ALTO_NOTA - AIRE.lineas, ALTO_NOTA);
  const arriba = caja(Math.max(DESDE_DOS, abajo.y - ALTO_NOTA), ALTO_NOTA);
  const posicion = ajustarPartes(partes.slice(0, 1), 'texto', TG.suelo, D, Math.floor(abajo.ancho * D));
  return [
    colocar('contexto', [{ texto: t, cara: 'cifras', cuerpo: suelo, tono: 'tinta' }], arriba, D),
    colocar('contexto', [{ texto: posicion.texto, cara: 'texto', cuerpo: posicion.cuerpo, tono: 'tinta' }], abajo, D, 'centro', posicion.cabe),
  ];
}

/** Cambia el contexto de una disposición por el del circuito (posición + total). */
export function conContexto(d: Disposicion, partes: readonly string[], total: number | null, D: number): Disposicion {
  const nuevas = lineasContextoTotal(partes, total, D);
  return { ...d, lineas: [...nuevas, ...d.lineas.filter((l) => l.rol !== 'contexto')] };
}

const conLineas = (d: Disposicion, lineas: LineaG[]): Disposicion => ({ ...d, lineas: [...d.lineas, ...lineas] });

/** Lo que baja de la franja del héroe lo que va encima (líneas apiladas): para poner lo siguiente justo debajo. */
const bajoDe = (lineas: LineaG[], D: number, desde: number) => (lineas.length === 0 ? desde : Math.max(...lineas.map((l) => (l.y + l.alto) / D)) + AIRE.lineas);

/** Los pasos de la posición, primero lo que hay que decir siempre (`disponerPaso` lleva solo la primera parte al kit). */
const primera = (partes: readonly string[]) => partes.slice(0, 1);

// ---------------------------------------------------------------------------
// La dosis y la nota
// ---------------------------------------------------------------------------

/** La dosis con su carga y su objetivo, en la franja de lo que falta: «50 m · 152 kg», «500 m · RPE 8,5». En tinta: es lo que hay que cargar. */
export function lineasDosis(paso: PasoBase, D: number, partes: readonly string[] = dosisCompleta(paso)): LineaG[] {
  if (partes.length === 0) return [];
  return lineaDePartes('dosis', partes, TG.tercero, cajaEnFila('secundaria', altoLinea(TG.tercero, 'texto')), D);
}

/** Una nota que cabe en UNA línea (la de encima del héroe): quita partes por el final antes que pasar a dos. */
function notaEnUna(partes: readonly string[], D: number): string {
  const c = caja(REJILLA.heroe[0], ALTO_NOTA);
  return ajustarPartes(partes, 'nota', TG.nota, D, Math.floor(c.ancho * D)).texto;
}

/** Lo que dicen los dobles de la estación que es tuya: «Dobles · te toca», o el pacto del reparto. */
function notaDobles(paso: PasoBase, D: number): string | null {
  const d = paso.dobles;
  if (!d || d.turno === 'pareja') return null;
  if (d.turno === 'tuyo') return formatoDobles(d);
  return notaEnUna((pactoDe(d) ?? '').split(' · '), D);
}

// ---------------------------------------------------------------------------
// Las caras
// ---------------------------------------------------------------------------

/** LA CARRERA: la cara de correr del kit, con la posición y el total. El ritmo actual bajo un RPE (lo pide su palabra). */
function disponerCarrera(x: DatosCara): Disposicion {
  const { paso, lecturas, zonas, reglas, c, total, D } = x;
  const partes = posicionDe(paso, c);
  const l = laminaDelPaso(paso, lecturas, zonas, reglas);
  const ritmo = l.instruccion && !l.segundo && esCarrera(paso) ? { valor: fmtRitmo(lecturas.ritmo), unidad: '/km' } : null;
  const lam: Lamina = { ...l, contexto: primera(partes), segundo: l.segundo ?? ritmo };
  return conContexto(disponerPaso(lam, D), partes, total, D);
}

/**
 * LA ESTACIÓN. Nadie la mide: el héroe es el crono de la estación (la lámina
 * lo dice: sin nada que medir, «llevas»), con «lo dices tú · LAP»; su nombre
 * en la franja del objetivo y la dosis con su carga donde iría «lo que falta».
 */
function disponerEstacion(x: DatosCara): Disposicion {
  const { paso, lecturas, zonas, reglas, c, total, D } = x;
  const partes = posicionDe(paso, c);
  const l = laminaDelPaso(paso, lecturas, zonas, reglas);
  const lam: Lamina = {
    ...l,
    contexto: primera(partes),
    heroe: { ...l.heroe, etiqueta: DILO_TU },
    banda: null,
    instruccion: paso.nombre ?? null,
    segundo: null,
    nota: l.nota ?? notaDobles(paso, D),
  };
  return conContexto(conLineas(disponerPaso(lam, D), lineasDosis(paso, D)), partes, total, D);
}

/** El destino de una Roxzone: la estación a la que entras, o el tramo al que sales. */
function destinoDe(paso: Paso, c: Circuito): { nombre: string; dosis: string[] } | null {
  const sig = paso.siguiente;
  if (!sig) return null;
  if (paso.roxzone === 'entrada') return { nombre: sig.nombre ?? '', dosis: dosisCompleta(sig) };
  const r = sig.posicion?.ronda;
  return { nombre: c.formato === 'hyrox' && r ? `Run ${r.n}/${r.de}` : 'Run', dosis: dosisCompleta(sig) };
}

/** LA ROXZONE: «entras a» / «sales a», su destino con su dosis, y su crono (que la cierras tú). */
function disponerRoxzone(x: DatosCara): Disposicion {
  const { paso, lecturas, zonas, reglas, c, total, D } = x;
  const destino = destinoDe(paso, c);
  const l = laminaDelPaso(paso, lecturas, zonas, reglas);
  const lam: Lamina = {
    ...l,
    contexto: ['Roxzone'],
    heroe: { ...l.heroe, etiqueta: DILO_TU },
    banda: null,
    instruccion: destino?.nombre ?? null,
    segundo: null,
    nota: l.nota ?? (paso.roxzone === 'entrada' ? 'entras a' : 'sales a'),
  };
  const d = conLineas(disponerPaso(lam, D), destino ? lineasDosis(paso, D, destino.dosis) : []);
  return conContexto(d, ['Roxzone'], total, D);
}

/** EL AMRAP dentro de un circuito: lo que queda de la ventana y la tarea. Las reps se dicen en la campana. */
function disponerAmrap(x: DatosCara): Disposicion {
  const { paso, lecturas, zonas, reglas, c, total, D } = x;
  const partes = posicionDe(paso, c);
  const l = laminaDelPaso(paso, lecturas, zonas, reglas);
  const lam: Lamina = { ...l, contexto: primera(partes), banda: null, instruccion: paso.nombre ?? null, segundo: null };
  const aviso = lineaDePartes('dosis', ['reps al final'], TG.tercero, cajaEnFila('secundaria', altoLinea(TG.tercero, 'texto')), D, { tono: 'tinta2' });
  return conContexto(conLineas(disponerPaso(lam, D), aviso), partes, total, D);
}

/**
 * LA CAMPANA del AMRAP: las reps se dicen aquí (`—` mientras no se digan,
 * nunca 0) con UP/DOWN y se guardan con START. En un chipper el reloj no
 * para: lo que viene y en cuánto.
 */
function disponerCampana(x: DatosCara): Disposicion {
  const { paso, lecturas, zonas, total, dial, D } = x;
  const reps = dial?.reps ?? null;
  const tarea = paso.wod && 'tareas' in paso.wod ? paso.wod.tareas[0]?.nombre : undefined;
  const falta = faltaDe(paso, lecturas);
  const tras = paso.siguiente?.rol === 'trabajo' ? paso.siguiente : null;
  const lam: Lamina = {
    contexto: ['Puntuación'],
    heroe: { clase: 'crono', texto: reps == null ? '—' : String(reps), unidad: 'reps', etiqueta: tarea },
    banda: null,
    instruccion: reps == null ? DECIR_REPS : GUARDAR_REPS,
    segundo: falta != null && tras ? { etiqueta: `${tras.clase === 'carrera' ? 'Run' : (tras.nombre ?? 'Siguiente')} en`, valor: fmtReloj(Math.ceil(falta)) } : null,
    // La campana es «deja de trabajar»: monocroma, como la recuperación (P6).
    tercero: { ...lineaPulso(paso, lecturas, zonas), zona: undefined },
    nota: null,
    tinte: null,
  };
  const d = conContexto(disponerPaso(lam, D), ['Puntuación', `AMRAP ${fmtDuracion(paso.wod && 'duracionS' in paso.wod ? paso.wod.duracionS : 0)}`], total, D);
  // Mientras no se diga, el número espera en tinta2: «—» no puede leerse como un valor.
  return reps == null && d.heroe ? { ...d, heroe: { ...d.heroe, tono: 'tinta2' } } : d;
}

/** Cómo separa `vieneDe` las partes de lo que viene: pegadas por dentro (no se parte «25 m»), y aquí sí se puede cortar. */
const SEPARADOR_VIENE = '\u00A0· ';

/**
 * Lo que viene, en el «Viene:» del descanso, en la versión más completa que
 * CABE (una línea o dos, sin cortar a medias): «Ronda 5/5 · Sled Push · 25 m ·
 * 180 kg» y, si no, sin la ronda (es lo primero que sobra: ya la dirá el
 * contexto al entrar), y luego sin lo último (objetivo, carga). Jamás un texto
 * que se salga del círculo.
 */
export function vieneQueCabe(sig: PasoBase, c: Circuito, D: number): string {
  const partes = vieneDe(sig, c).split(SEPARADOR_VIENE);
  const sinRonda = /^Ronda\s\d/.test(partes[0] ?? '') ? partes.slice(1) : partes;
  const candidatas = [partes, sinRonda];
  for (let k = sinRonda.length - 1; k >= 1; k--) candidatas.push(sinRonda.slice(0, k));
  const texto = (p: string[]) => p.join(SEPARADOR_VIENE);
  return texto(candidatas.find((p) => lineasApoyo('viene', 'Viene:', texto(p), D).every((l) => l.cabe)) ?? candidatas[candidatas.length - 1]!);
}

/** EL DESCANSO: el común de todas las familias (P8), con «Viene:» del circuito y el total en el contexto. */
function disponerDescansoC(x: DatosCara): Disposicion {
  const { paso, lecturas, c, total, D } = x;
  const viene = paso.siguiente ? vieneQueCabe(paso.siguiente, c, D) : null;
  return conContexto(disponerDescanso(paso, lecturas, D, viene), ['Descanso'], total, D);
}

/**
 * EL RELEVO (dobles): la estación de tu pareja es UNA espera, y nadie la mide.
 * El héroe es lo que llevas esperando («recuperas»), sin zona (no trabajas), y
 * el cambio lo dices tú. Nunca «sales en ~40 s»: no hay con qué calcularlo.
 */
function disponerRelevo(x: DatosCara): Disposicion {
  const { paso, lecturas, total, D } = x;
  const d = paso.dobles!;
  const turno = textoTurno(d);
  const lam: Lamina = {
    contexto: [turno.charAt(0).toUpperCase() + turno.slice(1)],
    heroe: heroeRelevo(lecturas.t),
    banda: null,
    instruccion: paso.nombre ?? null,
    segundo: null,
    tercero: { ...lineaPulso(paso, lecturas, null), zona: undefined },
    nota: NOTA_RELEVO,
    tinte: null,
  };
  return conContexto(disponerPaso(lam, D), [turno.charAt(0).toUpperCase() + turno.slice(1), 'Dobles'], total, D);
}

// ---------------------------------------------------------------------------
// Qué cara lleva cada paso
// ---------------------------------------------------------------------------

/** La cara del paso vivo. Un solo sitio decide cuál (y ninguna elige su héroe). */
export function disponerCaraCircuito(x: DatosCara): Disposicion {
  const { paso, D } = x;
  if (esPuntuacion(paso)) return disponerCampana(x);
  if (paso.dobles?.turno === 'pareja' && paso.rol === 'recuperacion') return disponerRelevo(x);
  if (paso.rol === 'descanso') return disponerDescansoC(x);
  if (paso.roxzone) return disponerRoxzone(x);
  if (paso.clase === 'estacion') return disponerEstacion(x);
  if (paso.clase === 'amrap') return disponerAmrap(x);
  if (paso.clase === 'carrera') return disponerCarrera(x);
  // El calentamiento (antes de que empiece a correr el total): la cara de correr, tal cual.
  return disponerPaso(laminaDelPaso(paso, x.lecturas, x.zonas, x.reglas), D);
}

// ---------------------------------------------------------------------------
// Los momentos de cambio: 3-2-1, GO y «entras a»
// ---------------------------------------------------------------------------

/** EL 3-2-1 (n > 0) y EL GO (n = 0) antes de un paso de trabajo: a qué entras (con su posición) y contra qué. */
export function disponerCuentaC(n: number, paso: PasoBase, c: Circuito, D: number): Disposicion {
  const lineas: LineaG[] = [...lineasContexto(posicionDe(paso, c), D)];
  let y = bajoDe(lineas, D, REJILLA.heroe[0]);
  const texto = cortoDe(paso);
  if (texto) {
    const l = lineaDePartes('instruccion', texto.split(' · '), TG.tercero, caja(y, altoLinea(TG.tercero, 'texto')), D, { tono: 'tinta2' });
    lineas.push(...l);
    y = bajoDe(l, D, y);
  }
  return { D, lineas, heroe: heroeEn(n > 0 ? String(n) : 'GO', undefined, y, REJILLA.heroe[1], D), pista: null };
}

/** Cuánto ocupa «entras a», su nombre y su dosis, centrados en la franja del héroe (fracción de D). */
const ENTRAS_Y = 0.3;

/**
 * «ENTRAS A…» — la llegada a una estación cuando nada la anuncia (ni una
 * Roxzone ni el GO de un descanso): sin voz en Garmin, el nombre en grande
 * unos segundos, con su dosis. Sin héroe: el crono ya corre debajo.
 */
export function disponerEntrasC(paso: PasoBase, c: Circuito, total: number | null, D: number): Disposicion {
  const partes = posicionDe(paso, c);
  const alto = altoLinea(TG.segundo, 'texto');
  const yNombre = ENTRAS_Y + ALTO_NOTA + AIRE.lineas;
  const lineas: LineaG[] = [
    ...lineasContextoTotal(partes, total, D),
    colocar('entras', [chica('entras a', D)], caja(ENTRAS_Y, ALTO_NOTA), D),
    ...lineaDePartes('nombre', [paso.nombre ?? ''], TG.segundo, caja(yNombre, alto), D),
  ];
  const yDosis = yNombre + alto + AIRE.lineas;
  const dosis = dosisCompleta(paso);
  if (dosis.length) lineas.push(...lineaDePartes('dosis', dosis, TG.tercero, caja(yDosis, altoLinea(TG.tercero, 'texto')), D, { tono: 'tinta2' }));
  return { D, lineas, heroe: null, pista: null };
}
