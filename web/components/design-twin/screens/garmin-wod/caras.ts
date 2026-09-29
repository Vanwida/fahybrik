// LAS CARAS DEL WOD EN EL RELOJ GARMIN — funciones PURAS: de lo que el motor
// sabe (`VistaWod`: el paso, las lecturas, lo declarado) a una `Disposicion`
// sobre la rejilla del círculo. Una por lo que haces (P12):
//
//   disponerEmom          ¿cuánto queda de este minuto y qué hago en él?
//                         héroe = la ventana; la tarea CON SU CARGA en la banda
//   disponerAmrap         ¿cuántas rondas llevo? héroe = las rondas (o lo que
//                         queda, en un AMRAP de un solo movimiento); lo otro, debajo
//   disponerPuntuacion    la campana: «7+18» rondas + reps, con UP y DOWN
//   disponerForTime       ¿cuánto tiempo llevo? héroe = el crono TOTAL (la
//                         puntuación), con el cap a la vista
//   disponerCarreraForTime  un For Time que es una carrera GPS: la cara de correr
//                         del kit, con el crono total en el contexto
//   disponerErgo          remo, ski y bici SIN lectura de la máquina (modelo §13):
//                         el objetivo se dice como instrucción, jamás como veredicto
//   disponerPared         Tabata y demás relojes de pared: la ventana con su palabra
//   disponerCuentaWod     el 3-2-1 y el GO de un paso de WOD, con su tarea
//   disponerFinalWod      el crono congelado (For Time) o la puntuación (AMRAP)
//
// El héroe no lo decide la vista: sale de `heroeDeFamilia` (las reglas de WOD
// encima de P3) o de `laminaDelPaso` (todo lo que se corre y todo lo que va a
// zona). Lo que nadie mide no se pinta (G7): sin lectura del monitor de la
// máquina, el remo cuenta su crono y dice «lo dices tú». El pulso, siempre en el
// pie. Todo cabe a 218: lo secundario baja de cuerpo o se va por prioridad
// (`filaLuego`, `lineaDePartes`), y la tarea con su carga NUNCA pierde la carga
// (pasa a dos líneas antes que quitarla).
//
// Qué NO hacer: escribir un tamaño, un color o un umbral aquí (TG, CG y el plan);
// pintar «quedan 6:18» con un cero cuando no hay dato; decidir el héroe.

import {
  AIRE,
  REJILLA,
  TG,
  caja,
  cajaEnFila,
  colocar,
  contextoSinPerder,
  cuerpoPx,
  disponerPaso,
  heroeEn,
  lineaDeDato,
  lineaDePartes,
  vacia,
  type Disposicion,
  type LineaG,
  type Pieza,
} from '../../kit-garmin';
import {
  cargaTarea,
  desgloseReps,
  faltaDe,
  fmtDuracion,
  fmtObjetivo,
  fmtPrescrito,
  fmtReloj,
  heroeDeFamilia,
  laminaDelPaso,
  objetivoDe,
  posicionDe,
  principal,
  textoObjetivo,
  textoPasoCorto,
  textoTarea,
  wodDe,
  type Lamina,
  type PasoBase,
} from '../../kit-reloj';
import { dialDe, marcadorDe, textoPuntuacion, tiemposDeRonda, type VistaWod } from './estado';

import { ALTO_NOTA, ALTO_TERCERO, Y_TAREA, cabeza, candidatosDeTarea, filaLuego, filaSegundo, filaTarea, lineaDeAccion, piePulso } from './piezas';

// ---------------------------------------------------------------------------
// EMOM
// ---------------------------------------------------------------------------

/**
 * EL EMOM: manda la ventana (su aro se vacía con el reloj), con «quedan» o, si
 * la tarea ya está hecha, «respiro». La tarea con su carga en la banda; debajo,
 * lo que viene. BACK/LAP la marca (no cierra la ventana: el reloj no se para
 * porque acabes antes). Una ventana entera de remo no tiene nada que marcar: la
 * cierra el reloj.
 */
export function disponerEmom(v: VistaWod, D: number): Disposicion {
  const w = wodDe(v.paso);
  if (w?.formato !== 'emom') return vacia(D);
  const hecha = v.wod.hechas[v.paso.id];
  const h = heroeDeFamilia(v.paso, v.lecturas, v.plan.zonas);
  const { lineas, y } = cabeza(posicionDe(v.paso), hecha != null ? 'respiro' : h.etiqueta, D);
  const heroe = heroeEn(h.texto, h.unidad, y, REJILLA.heroe[1], D);
  const tarea = filaTarea('tarea', hecha != null ? `✓ ${w.tarea.nombre} en ${fmtReloj(hecha)}` : textoTarea(w.tarea, w.ventanaS), D, hecha != null ? 'tinta2' : 'tinta');
  lineas.push(...tarea.lineas);
  const sig = wodDe(v.paso.siguiente);
  if (sig?.formato === 'emom') lineas.push(...filaLuego(candidatosDeTarea(sig.tarea, sig.ventanaS), D, tarea.fin + AIRE.lineas));
  lineas.push(piePulso(v, D));
  return { D, lineas, heroe, pista: null };
}

// ---------------------------------------------------------------------------
// AMRAP
// ---------------------------------------------------------------------------

/**
 * EL AMRAP. Varias tareas: manda lo que cuentas, las RONDAS; lo que queda de la
 * ventana, debajo en cifras. Un solo movimiento no tiene rondas: manda lo que
 * queda y debajo las reps que llevas («—» hasta que las cuentas con UP). En la
 * banda, lo de la ronda en curso: las reps sueltas si las cuentas, si no cuánto
 * llevas de ronda y cuánto tardó la anterior.
 */
export function disponerAmrap(v: VistaWod, D: number): Disposicion {
  const w = wodDe(v.paso);
  if (w?.formato !== 'amrap') return vacia(D);
  const m = marcadorDe(v);
  const multi = w.tareas.length > 1;
  const falta = Math.ceil(faltaDe(v.paso, v.lecturas) ?? 0);
  const ronda = v.paso.posicion?.ronda;
  const formato = `AMRAP ${fmtDuracion(w.duracionS)}`;
  const h = heroeDeFamilia(v.paso, v.lecturas, v.plan.zonas, { rondas: m.cierres.length });
  const { lineas, y } = cabeza(ronda ? [`Ronda ${ronda.n}/${ronda.de}`, formato] : [formato], multi ? null : h.etiqueta, D);
  const heroe = heroeEn(h.texto, h.unidad, y, REJILLA.heroe[1], D);
  if (multi) {
    const t = v.lecturas.t - (m.cierres.at(-1) ?? 0);
    const anterior = tiemposDeRonda(m).at(-1);
    // Las reps de la ronda en curso siempre a la vista: las que llevas, o «—» hasta que las cuentas con UP (nunca 0, G7).
    const partes =
      m.reps != null
        ? [`+${m.reps} reps`, desgloseReps(w.tareas, m.reps)]
        : ['reps —', `ronda ${m.cierres.length + 1} · ${fmtReloj(t)}`, anterior != null ? `ant. ${fmtReloj(anterior)}` : ''];
    lineas.push(...lineaDePartes('instruccion', partes, TG.tercero, caja(Y_TAREA, ALTO_TERCERO), D, { tono: m.reps != null ? 'tinta' : 'tinta2' }));
    lineas.push(lineaDeDato('secundaria', { etiqueta: 'quedan', valor: fmtReloj(falta) }, TG.segundo, 'secundaria', D));
  } else {
    const t = w.tareas[0]!;
    const tarea = filaTarea('tarea', [t.nombre, cargaTarea(t)].filter(Boolean).join(' · '), D);
    lineas.push(...tarea.lineas);
    lineas.push(filaSegundo('secundaria', { etiqueta: 'reps', valor: m.reps == null ? '—' : String(m.reps) }, D, tarea.fin + AIRE.lineas));
  }
  lineas.push(piePulso(v, D));
  return { D, lineas, heroe, pista: null };
}

/**
 * LA CAMPANA: la puntuación es rondas + reps («7+18»), y lo no dicho es «—», nunca
 * 0. Es el MISMO marcador que se cuenta en vivo: si contaste, ya está dicha. UP y
 * DOWN mueven las reps; START la guarda (BACK/LAP, solo una ronda en curso). En un chipper el reloj sigue (unos
 * segundos) y lo que viene con su cuenta atrás ocupa la banda.
 */
export function disponerPuntuacion(v: VistaWod, D: number): Disposicion {
  const w = wodDe(v.paso);
  if (w?.formato !== 'puntuacion') return vacia(D);
  const multi = w.tareas.length > 1;
  const d = dialDe(marcadorDe(v));
  const falta = faltaDe(v.paso, v.lecturas);
  const tras = v.paso.siguiente?.rol === 'trabajo' ? v.paso.siguiente : null;
  const { lineas, y } = cabeza(['Puntuación', `AMRAP ${fmtDuracion(w.duracionS)}`], multi ? 'rondas + reps' : w.tareas[0]!.nombre, D);
  const heroe = heroeEn(textoPuntuacion(d, multi), multi ? undefined : 'reps', y, REJILLA.heroe[1], D, !multi && d.reps == null ? 'tinta2' : 'tinta');
  let fin: number = Y_TAREA;
  if (multi) {
    const sinDecir = d.reps == null || d.reps === 0;
    const f = filaTarea('desglose', sinDecir ? `reps de la ronda ${d.rondas + 1}` : desgloseReps(w.tareas, d.reps!), D, sinDecir ? 'tinta2' : 'tinta');
    lineas.push(...f.lineas);
    fin = f.fin;
  } else if (falta != null && tras) {
    const f = filaTarea('luego', `Luego · ${textoPasoCorto(tras)} en ${fmtReloj(Math.ceil(falta))}`, D);
    lineas.push(...f.lineas);
    fin = f.fin;
  }
  lineas.push(...lineaDeAccion('guardar', 'START · guardar', D, fin + AIRE.lineas));
  lineas.push(piePulso(v, D, true));
  return { D, lineas, heroe, pista: null };
}

// ---------------------------------------------------------------------------
// For Time
// ---------------------------------------------------------------------------

/** «cap en 5:12», o «cap pasado»: el cap como lo que queda hasta él (DECISIONS 28-09), no como el dato del plan. */
export const textoCap = (capS: number, totalS: number): string => (capS - totalS > 0 ? `cap en ${fmtReloj(capS - totalS)}` : 'cap pasado');

/**
 * EL FOR TIME: el crono total ES la puntuación y no se va nunca: es el héroe (la
 * única excepción a «el objetivo manda» de la familia: el objetivo de un For
 * Time ES el tiempo). El cap, en el contexto como lo que queda hasta él. La
 * tarea con su carga en la banda; debajo, lo que viene. BACK/LAP cierra el
 * movimiento y, en el último, el WOD: el crono se congela.
 */
export function disponerForTime(v: VistaWod, D: number): Disposicion {
  const w = wodDe(v.paso);
  if (w?.formato !== 'fortime' || !w.tarea) return vacia(D);
  const total = v.estado.sesionT;
  const ronda = v.paso.posicion?.ronda;
  const h = heroeDeFamilia(v.paso, v.lecturas, v.plan.zonas, { total });
  const partes = [ronda ? `Ronda ${ronda.n}/${ronda.de}` : 'For Time', w.capS != null ? textoCap(w.capS, total) : ''].filter(Boolean);
  const { lineas, y } = cabeza(partes, h.etiqueta, D, () => true);
  const heroe = heroeEn(h.texto, h.unidad, y, REJILLA.heroe[1], D);
  const tarea = filaTarea('tarea', textoTarea(w.tarea), D);
  lineas.push(...tarea.lineas);
  const sig = wodDe(v.paso.siguiente);
  if (sig?.formato === 'fortime' && sig.tarea) {
    const abre = v.paso.siguiente!.posicion?.estacion?.n === 1 && v.paso.siguiente!.posicion.ronda;
    const entera = `${abre ? `Ronda ${abre.n}/${abre.de} · ` : ''}${textoTarea(sig.tarea)}`;
    lineas.push(...filaLuego([entera, ...candidatosDeTarea(sig.tarea)], D, tarea.fin + AIRE.lineas));
  } else {
    lineas.push(...lineaDeAccion('termina', 'BACK · termina', D, tarea.fin + AIRE.lineas));
  }
  lineas.push(piePulso(v, D));
  return { D, lineas, heroe, pista: null };
}

/**
 * UN FOR TIME QUE ES UNA CARRERA (552, 5 km): la cara de correr del kit, sin
 * cambiar un héroe (lo decide `laminaDelPaso`), con el crono total, que es la
 * puntuación, en el contexto. Lo de correr no se reinventa (P10).
 */
export function disponerCarreraForTime(v: VistaWod, D: number): Disposicion {
  const l = laminaDelPaso(v.paso, v.lecturas, v.plan.zonas, v.plan.reglas);
  // El crono es lo esencial del contexto; los 5 km se van antes que él (la lámina ya dice cuánto queda).
  const contexto = contextoSinPerder([`For Time ${fmtReloj(v.estado.sesionT)}`, fmtPrescrito(v.paso.medida)], D, (parte) => parte.startsWith('For Time'));
  return disponerPasoQueCabe({ ...l, contexto }, D, v.paso.cue ?? null);
}

/**
 * La lámina del kit, y si el cue del coach la aprieta tanto que el héroe no cabe
 * en su franja (un cue largo va en dos líneas y con «quedan» encima se come el
 * héroe), la MISMA lámina con el cue sin su «Coach ·»: una línea. El héroe no se
 * toca nunca; el cue nunca se quita. Si ni así, sin la palabra de encima del héroe.
 */
function disponerPasoQueCabe(l: Lamina, D: number, cue: string | null): Disposicion {
  const variantes: Lamina[] = [l, ...(cue && l.nota ? [{ ...l, nota: cue }] : []), { ...l, nota: cue ?? l.nota, heroe: { ...l.heroe, etiqueta: undefined } }];
  for (const x of variantes) {
    const d = disponerPaso(x, D);
    if (d.heroe?.talla.cabe && d.lineas.every((y) => y.cabe)) return d;
  }
  return disponerPaso(variantes[0]!, D);
}

// ---------------------------------------------------------------------------
// Ergo
// ---------------------------------------------------------------------------

/**
 * EL ERGO sin lectura de la máquina (modelo §13: el reloj Garmin no lee el
 * monitor). A ritmo o a distancia que solo dices tú: el héroe es el CRONO del
 * paso con «lo dices tú», y el objetivo («a 2:05 /500») va como instrucción,
 * jamás como veredicto en vivo; BACK/LAP lo cierra. A zona: manda el pulso
 * contra el espectro del coach, con lo que queda debajo. Un techo de pulso («máx
 * 142 ppm») se lee de nota y solo avisa por arriba.
 */
export function disponerErgo(v: VistaWod, D: number): Disposicion {
  const p = v.paso;
  const lam = laminaDelPaso(p, v.lecturas, v.plan.zonas, v.plan.reglas);
  const declarada = p.medida.mide === 'atleta';
  const o = principal(p);
  const techo = objetivoDe(p, 'techo');
  const l: Lamina = {
    ...lam,
    contexto: contextoSinPerder(posicionDe(p), D),
    heroe: heroeDeFamilia(p, v.lecturas, v.plan.zonas),
    // Sin nadie que lea el /500, una banda sin marca sería un calibre roto.
    banda: declarada ? null : lam.banda,
    instruccion: declarada && o ? textoObjetivo(o, p.maquina) : lam.instruccion,
    nota: techo ? fmtObjetivo(techo) : lam.nota,
  };
  return disponerPaso(l, D);
}

// ---------------------------------------------------------------------------
// Reloj de pared (Tabata)
// ---------------------------------------------------------------------------

/** Una marca por ronda con los glifos del kit: las hechas apagadas, la de ahora encendida, las que faltan en aro. */
function lineaDeRondas(total: number, hechas: number, ahora: boolean, D: number): LineaG[] {
  const cuerpo = cuerpoPx(TG.nota, D);
  const piezas: Pieza[] = Array.from({ length: total }, (_, k) => ({
    texto: '',
    cara: 'nota',
    cuerpo,
    tono: 'tinta',
    glifo: k < hechas ? 'hecho' : k === hechas && ahora ? 'ahora' : 'pendiente',
    antes: k === 0 ? 0 : AIRE.piezas * D,
  }));
  const l = colocar('rondas', piezas, cajaEnFila('secundaria', ALTO_NOTA), D);
  return l.cabe ? [l] : [];
}

/**
 * EL RELOJ DE PARED: manda el reloj, no hay nada que cerrar (BACK/LAP no hace
 * nada y no hay +30 s: el reloj no se estira). La palabra sobre el número dice
 * el estado («trabajo» / «descanso»), no un color (P6). Una marca por ronda.
 */
export function disponerPared(v: VistaWod, D: number): Disposicion {
  const w = wodDe(v.paso);
  if (w?.formato !== 'pared') return vacia(D);
  const trabajo = v.paso.rol === 'trabajo';
  const ronda = trabajo ? (v.paso.posicion?.ronda?.n ?? 1) : (v.anterior?.posicion?.ronda?.n ?? 0);
  const cadencia = `${fmtDuracion(w.trabajoS)}/${fmtDuracion(w.descansoS)}`;
  const h = heroeDeFamilia(v.paso, v.lecturas, v.plan.zonas);
  // La palabra la dice el rol del paso («trabajo» / «descanso», nunca «quedan»); el descanso es de su ronda, y las que faltan las dicen las marcas.
  const { lineas, y } = cabeza([`Ronda ${ronda}/${w.rondas}`, cadencia], trabajo ? 'trabajo' : 'descanso', D);
  const heroe = heroeEn(h.texto, h.unidad, y, REJILLA.heroe[1], D);
  const o = trabajo ? principal(v.paso) : null;
  const sig = v.paso.siguiente;
  const texto = trabajo ? [v.paso.nombre, o ? fmtObjetivo(o) : null].filter(Boolean).join(' · ') : sig ? `Viene: Ronda ${ronda + 1}/${w.rondas} · ${sig.nombre ?? ''}` : '';
  if (texto) lineas.push(...filaTarea('tarea', texto, D, trabajo ? 'tinta' : 'tinta2').lineas);
  lineas.push(...lineaDeRondas(w.rondas, trabajo ? ronda - 1 : ronda, trabajo, D));
  lineas.push(piePulso(v, D, !trabajo));
  return { D, lineas, heroe, pista: null };
}

// ---------------------------------------------------------------------------
// Qué cara es la del paso
// ---------------------------------------------------------------------------

/** ¿Tiene este paso cara propia de la familia? Si no (correr, recuperar, descansar) pinta el kit. */
export function hayCaraPropia(p: PasoBase): boolean {
  const w = wodDe(p);
  if (p.clase === 'ergo') return true;
  return w?.formato === 'emom' ? !w.tarea.corre : w != null && w.formato !== 'deathby';
}

/** La cara del paso; `null` si es la del kit. Una sola decisión, para el vivo y para el examen. */
export function disponerCaraWod(v: VistaWod, D: number): Disposicion | null {
  const w = wodDe(v.paso);
  if (!hayCaraPropia(v.paso)) return null;
  if (v.paso.clase === 'ergo') return disponerErgo(v, D);
  switch (w?.formato) {
    case 'emom':
      return disponerEmom(v, D);
    case 'amrap':
      return disponerAmrap(v, D);
    case 'puntuacion':
      return disponerPuntuacion(v, D);
    case 'fortime':
      return w.tarea ? disponerForTime(v, D) : disponerCarreraForTime(v, D);
    case 'pared':
      return disponerPared(v, D);
    default:
      return null;
  }
}

export * from './cuentaYFinal';
