// VINCULAR EL RELOJ (G06) Y LA SESIÓN INTERRUMPIDA (G07) — dos caras de «fuera de
// la sesión». PURAS.
//
// G06 · VINCULAR (§8). El reloj no pide nunca una contraseña. Muestra un código de
// dispositivo de 6 caracteres, GRANDE y en grupos de tres para leerlo de una vez, y
// dice dónde escribirlo: «Escríbelo en la app del móvil», donde el atleta ya tiene
// su sesión. Sustituye a teclear el email y un código en los ajustes de Garmin
// Connect. Tres estados: espera (con lo que le queda al código), caducado (START
// pide otro) y vinculado ✓ (trae el plan y entra solo).
//
// G07 · SESIÓN INTERRUMPIDA (G10). La app murió grabando. El último punto de control
// (cada cambio de paso y cada 30 s) dice cuánto se grabó y dónde iba. Garmin NO
// permite reanudar un FIT: «Seguir» abre OTRA grabación de la misma sesión (el
// servidor las une) y así se dice, sin prometer lo que la plataforma no da.
// «Guardar lo hecho» lo deja como parcial.
//
// Qué NO hacer: pedir un email o una contraseña en el reloj; agrupar el código de
// otra forma que con `agruparCodigo`; prometer que «Seguir» reanuda el FIT.

import { lineasContexto } from '../../kit-garmin/caras';
import { altoLinea, chica, colocar, type Disposicion, type LineaG } from '../../kit-garmin/disponer';
import { REJILLA, SELLO, caja } from '../../kit-garmin/geometria';
import { ajustarPartes, anchoEn } from '../../kit-garmin/medir';
import { AIRE, CAJA, TG, cuerpoPx } from '../../kit-garmin/tokens';
import { fmtReloj } from '../../kit-reloj';
import { agruparCodigo } from './estado';
import { marcoDe } from './faces';
import { finDe, lineaAccion, textoEn } from './filas';

// ---------------------------------------------------------------------------
// G06 · vincular
// ---------------------------------------------------------------------------

export type EstadoVinculo =
  | { tipo: 'espera'; codigo: string; restanteS: number }
  | { tipo: 'caducado' }
  | { tipo: 'vinculado' };

export const TEXTO_VINCULAR = {
  titulo: 'Vincular reloj',
  donde: 'Escríbelo en la app del móvil',
  caduca: 'caduca en',
  caducado: 'Código caducado',
  otro: 'START · Otro código',
  vinculado: 'Reloj vinculado',
  trayendo: 'Trayendo tu plan',
} as const;

/** Dónde empieza el código, en fracción de D: justo bajo el contexto. */
const Y_CODIGO = REJILLA.heroe[0];
/**
 * El cuerpo máximo del código, en fracción de D: dentro de 0,20–0,26 D (grande y
 * legible), y el que deja sitio, en los cuatro relojes, a «Escríbelo en la app del
 * móvil» y a lo que le queda al código (medido: a 0,26 D la cuenta atrás se caía a la
 * franja donde la cuerda ya no la deja leer).
 */
const CUERPO_CODIGO = 0.22;

/**
 * El código en DOS líneas de tres caracteres, al mayor cuerpo entre `CUERPO_CODIGO` y
 * 0,20 D al que cabe cada grupo en su fila. Una sola línea de seis o siete caracteres no cabe
 * a 0,20 D en ningún reloj (las letras de la sans son anchas), y un código pequeño se
 * teclea mal en el móvil: en dos grupos se lee de una vez y se copia de dos miradas.
 * Un código de otra longitud (lo decide el servidor) reparte sus grupos igual.
 */
export function lineasDeCodigo(codigo: string, D: number): LineaG[] {
  const grupos = agruparCodigo(codigo).split(' ');
  const max = Math.round(CUERPO_CODIGO * D);
  const min = Math.round(TG.heroe.min * D);
  const altoDe = (cuerpo: number) => (cuerpo * CAJA.cifras) / D;
  const cajasDe = (cuerpo: number) => grupos.map((_, k) => caja(Y_CODIGO + k * (altoDe(cuerpo) + AIRE.lineas), altoDe(cuerpo)));
  let cuerpo = min;
  for (let c = max; c >= min; c--) {
    const cajas = cajasDe(c);
    if (grupos.every((g, k) => anchoEn('texto', g, c) <= Math.floor(cajas[k]!.ancho * D))) {
      cuerpo = c;
      break;
    }
  }
  const cajas = cajasDe(cuerpo);
  return grupos.map((g, k) => colocar('codigo', [{ texto: g, cara: 'texto', cuerpo, tono: 'tinta' }], cajas[k]!, D));
}

/** Lo que se lee y lo que se hace en cada estado del vínculo. */
export function disponerVincular(e: EstadoVinculo, D: number): Disposicion {
  if (e.tipo === 'vinculado') return disponerVinculado(D);
  const lineas: LineaG[] = [...lineasContexto([TEXTO_VINCULAR.titulo], D, 'tinta2')];
  if (e.tipo === 'espera') {
    const codigo = lineasDeCodigo(e.codigo, D);
    lineas.push(...codigo);
    const donde = textoEn('donde', TEXTO_VINCULAR.donde, finDe(codigo, D, Y_CODIGO) + AIRE.piezas, D, { tono: 'tinta' });
    lineas.push(...donde.lineas);
    // «caduca en 9:41»: la cuenta atrás, en la cara de cifras.
    const cuenta = colocar(
      'caduca',
      [chica(TEXTO_VINCULAR.caduca, D), { texto: fmtReloj(e.restanteS), cara: 'cifras', cuerpo: cuerpoPx(TG.nota, D), tono: 'tinta', antes: AIRE.piezas * D }],
      caja(donde.fin + AIRE.lineas, altoLinea(TG.nota, 'cifras')),
      D,
    );
    lineas.push(cuenta);
    return { D, lineas, heroe: null, pista: null };
  }
  // Caducado: se dice, y START pide otro.
  const titulo = textoEn('titulo', TEXTO_VINCULAR.caducado, REJILLA.heroe[0] + AIRE.piezas, D, { frac: TG.segundo });
  lineas.push(...titulo.lineas, lineaAccion(TEXTO_VINCULAR.otro, titulo.fin + AIRE.piezas * 2, D));
  return { D, lineas, heroe: null, pista: null };
}

/** Vinculado: el sello ✓ ocupa el sitio del contexto (como en «Sesión completada»), sin título encima. */
function disponerVinculado(D: number): Disposicion {
  const [, hC] = REJILLA.contexto;
  const titulo = textoEn('titulo', TEXTO_VINCULAR.vinculado, REJILLA.heroe[0] + AIRE.piezas, D, { frac: TG.segundo });
  const trayendo = textoEn('trayendo', TEXTO_VINCULAR.trayendo, titulo.fin, D, { tono: 'tinta2' });
  return { D, lineas: [...titulo.lineas, ...trayendo.lineas], heroe: null, pista: null, sello: { y: (hC - SELLO / 2) * D, talla: SELLO * D } };
}


// ---------------------------------------------------------------------------
// G07 · sesión interrumpida
// ---------------------------------------------------------------------------

export const OPCIONES_INTERRUMPIDA = [
  { id: 'seguir', texto: 'Seguir' },
  { id: 'guardar', texto: 'Guardar lo hecho' },
] as const;
export type IdInterrumpida = (typeof OPCIONES_INTERRUMPIDA)[number]['id'];

export const TEXTO_INTERRUMPIDA = {
  titulo: 'Sesión interrumpida',
  grabado: 'grabado',
  honesto: ['Garmin no puede reanudarla.', 'Seguir abre otra grabación.'],
} as const;

export interface DatosInterrumpida {
  /** Segundos grabados hasta el último punto de control. */
  sesionT: number;
  /** Dónde iba, en las palabras del contexto («Serie 4/6»); `null` si el paso no tiene posición. */
  donde: string | null;
  /** Qué opción está enfocada. */
  foco: number;
}

/**
 * G07: cuánto se grabó, dónde iba, la verdad de la plataforma («Garmin no puede
 * reanudarla») y las dos salidas: Seguir (otra grabación) o Guardar lo hecho.
 */
export function disponerInterrumpida(d: DatosInterrumpida, D: number): Disposicion {
  const lineas: LineaG[] = [...lineasContexto([TEXTO_INTERRUMPIDA.titulo], D)];
  let y = Math.max(REJILLA.heroe[0], finDe(lineas, D, REJILLA.heroe[0]));
  // «grabado 42:10»: lo que hay guardado, en cifras.
  const tiempo = colocar(
    'grabado',
    [chica(TEXTO_INTERRUMPIDA.grabado, D), { texto: fmtReloj(d.sesionT), cara: 'cifras', cuerpo: cuerpoPx(TG.segundo, D), tono: 'tinta', antes: AIRE.piezas * D }],
    caja(y, altoLinea(TG.segundo, 'cifras')),
    D,
  );
  lineas.push(tiempo);
  y = finDe([tiempo], D, y);
  if (d.donde) {
    const donde = textoEn('donde', `hasta ${d.donde}`, y, D, { tono: 'tinta2' });
    lineas.push(...donde.lineas);
    y = donde.fin + AIRE.lineas;
  }
  for (const frase of TEXTO_INTERRUMPIDA.honesto) {
    const f = textoEn('honesto', frase, y, D, { tono: 'tinta' });
    lineas.push(...f.lineas);
    y = f.fin;
  }
  // Las dos salidas, con el marco naranja en la enfocada (la acción del momento).
  const alto = altoLinea(TG.contexto, 'texto');
  let marco: Disposicion['marco'] = null;
  OPCIONES_INTERRUMPIDA.forEach((o, k) => {
    const c = caja(y + AIRE.piezas + k * (alto + AIRE.piezas * 2), alto);
    const a = ajustarPartes([o.texto], 'texto', TG.contexto, D, Math.floor(c.ancho * D) - 4 * AIRE.piezas * D);
    const l = colocar(`opcion:${o.id}`, [{ texto: a.texto, cara: 'texto', cuerpo: a.cuerpo, tono: k === d.foco ? 'tinta' : 'tinta2' }], c, D, 'centro', a.cabe);
    lineas.push(l);
    if (k === d.foco) marco = marcoDe([l], D);
  });
  return { D, lineas, heroe: null, pista: null, marco };
}
