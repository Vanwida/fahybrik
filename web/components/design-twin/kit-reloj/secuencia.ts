// LA SECUENCIA — el motor mínimo del doble: pasos anclados, cierres, eventos.
//
// P1 dice que los relojes se calculan en la muñeca desde anclas y que los
// hápticos salen de las TRANSICIONES del estado. Esto es eso, en pequeño y
// puro: `avanzar` recibe el estado de un segundo y devuelve el del siguiente
// más los eventos que la transición produce; `cerrar` hace lo mismo cuando el
// atleta cierra a mano. La pantalla solo pone el cuerpo (el `Simulador`: qué
// ritmo, qué /500 y qué pulso da el atleta en cada segundo) y pinta. El gancho
// que lo mueve en React vive en `gancho.ts`.
//
// Sirve a todas las familias: un descanso de fuerza, una estación de HYROX o
// una serie de 1000 m son pasos con su medida; cambia quién los mide y quién
// los cierra, no el motor.
//
// Lo que hace, y por qué:
//   · cierre por medida (tiempo o metros), por el atleta (hasta pulsar) o por
//     DETECCIÓN (un paso abierto que mide el sensor: la Roxzone de salida se
//     cierra sola al ver que vuelves a correr);
//   · un PARCIAL por paso cerrado (estación, km, Roxzone: P10);
//   · el PM5 da su /500 y sus metros directos: cuentan para el paso, no para
//     los km corridos de la sesión (un remo no es una carrera);
//   · preaviso a 10 s / 100 m en pasos que no son cortos (dato del coach);
//   · 3-2-1 a pantalla completa SOLO al entrar en un paso de trabajo de la
//     parte principal desde algo que no es trabajo;
//   · la serie cerrada deja su vuelta y su frase («Serie 3: 3:48, dentro.»);
//   · vuelta automática por km donde el coach la pide;
//   · aviso fuera de objetivo con histéresis y cadencia (`decidirAviso`), en
//     cualquier eje que se lea en vivo (ritmo, pulso, /500, vatios);
//   · el tiempo en cada zona del coach y el pulso máximo (el resumen los pide).

import { AVISO_INICIAL, decidirAviso, type EstadoAviso, type EventoVivo } from './eventos';
import type { CampoVivo, EstadoGps, Lecturas, Parcial, Paso, PasoBase, ReglasAviso, Vuelta, ZonasCoach } from './paso';
import {
  RITMO_TECHO_S,
  faltaDe,
  fmtReloj,
  holguraDe,
  objetivoDe,
  principal,
  veredictoDe,
  veredictoDelPaso,
  veredictoPrincipal,
  zonaDe,
} from './reglas';
import { VOZ_SESION, vozDescanso, vozFinSerie, vozInicio, vozKm, vozPreaviso, vozRecupera, vozTransicion } from './voz';

export interface PlanSesion {
  /** Los pasos en orden, planos. El anidado vive en la `posicion` de cada uno (M4). */
  pasos: PasoBase[];
  zonas: ZonasCoach | null;
  reglas: ReglasAviso;
}

/** Lo que dan el cuerpo y los sensores en un segundo. */
export interface LecturaSim {
  /** s/km de lo que mide el GPS o la cinta; null = nadie mide ritmo ahora. */
  ritmo: number | null;
  ppm: number | null;
  ppmTendencia?: Lecturas['ppmTendencia'];
  gps?: EstadoGps;
  viejos?: CampoVivo[];
  /** Para pasos de reps o calorías: lo hecho, si alguien lo cuenta. */
  hecho?: number | null;
  /** El /500 del PM5 (remo, SkiErg), s. De él salen los metros del ergómetro. */
  split500?: number | null;
  vatios?: number | null;
  /** Paladas o pasos por minuto. */
  cadencia?: number | null;
  /** Metros del PM5 en este segundo, si los da directos (si no, salen del /500). */
  metros?: number | null;
}

export type Simulador = (paso: PasoBase, i: number, t: number, sesionT: number) => LecturaSim;

export interface EstadoSecuencia {
  i: number;
  t: number;
  /** Metros de ESTE paso, midiera quien midiera (GPS, cinta o PM5). */
  metros: number;
  /** ¿Alguien ha medido metros en este paso? Si no, lo hecho es null, no cero. */
  midio: boolean;
  extraS: number;
  sesionT: number;
  /** Metros CORRIDOS de la sesión (GPS o cinta): los km, el ritmo medio. */
  sesionM: number;
  /** Metros de ergómetro de la sesión (PM5): cuentan aparte, no son km corridos. */
  sesionErgoM: number;
  ppmSuma: number;
  ppmN: number;
  /** Segundos en cada zona del coach (Z1..ZN) y el pulso más alto: el resumen los pide. */
  zonasS: number[];
  ppmMax: number;
  pasoPpmSuma: number;
  pasoPpmN: number;
  /**
   * Segundos del paso juzgados contra una zona o un pulso, tras la gracia:
   * dentro, por encima, por debajo. Una serie a zona se juzga por aquí, no por
   * la media (que castiga el retraso del pulso al arrancar).
   */
  pasoZonaS: [number, number, number];
  /** Segundos seguidos corriendo en un paso que se cierra por detección. */
  corriendoS: number;
  kmN: number;
  kmDesdeT: number;
  /** La vuelta manual (el control «Vuelta»): desde cuándo y desde qué metro. */
  tramosN: number;
  tramoDesdeT: number;
  tramoDesdeM: number;
  vueltas: Vuelta[];
  /** Un parcial por paso cerrado, en orden (P10). */
  parciales: Parcial[];
  aviso: EstadoAviso;
  preavisado: boolean;
  /** Hasta qué segundo de sesión se ve el GO (0 = no se ve). */
  goHasta: number;
  /** La vuelta automática recién hecha, visible unos segundos. */
  banner: { titulo: string; valor: string; pie: string; hasta: number } | null;
  terminado: boolean;
  lect: LecturaSim;
}

export interface InicioSecuencia {
  i: number;
  t?: number;
  metros?: number;
  /** Si falta: la suma de los parciales de lo ya hecho más `t`. */
  sesionT?: number;
  /** Km corridos de la sesión, con los de este paso. Si falta: `metros`, salvo que los mida la máquina. */
  sesionM?: number;
  /** Metros de ergómetro de la sesión, con los de este paso. Si falta: `metros` si los mide la máquina (PM5). */
  sesionErgoM?: number;
  vueltas?: Vuelta[];
  /** Los pasos ya hechos, con su parcial. */
  parciales?: Parcial[];
  /** Media de pulso de lo que ya se corrió (para la página Datos). */
  ppmMedio?: number;
  /** Segundo de sesión en que empezó el km en curso (si no, se estima a ritmo uniforme). */
  kmDesdeT?: number;
  /** Arranca en pausa (escenarios de la pausa). */
  pausado?: boolean;
  /**
   * ¿Ya sonó el preaviso de este paso? Si falta, se deduce: un escenario que
   * arranca dentro de los últimos 10 s (o 100 m) ya lo oyó, y no se repite
   * con otra cifra.
   */
  preavisado?: boolean;
}

/** Lo que emite una transición: un evento del vocabulario y, si toca, su frase. */
export interface Emitido {
  evento: EventoVivo;
  voz?: string;
}

export type Salida = { estado: EstadoSecuencia; eventos: Emitido[] };

/**
 * DETECCIÓN (mecanismo nuestro, no método del coach): más rápido que 8:00/km
 * durante 3 s seguidos es volver a correr. Cierra la Roxzone de salida. A
 * VALIDAR EN APARATO.
 */
export const DETECCION = { ritmoCorrerS: 480, seguidosS: 3 } as const;

// ---------------------------------------------------------------------------
// Proyecciones: del estado del motor al contrato del pintor
// ---------------------------------------------------------------------------

/** El paso en curso con lo añadido por el atleta (+30 s) y su siguiente. */
export function pasoVivo(plan: PlanSesion, s: EstadoSecuencia): Paso {
  const base = plan.pasos[s.i]!;
  const pr = base.medida.prescrito;
  return {
    ...base,
    medida: { ...base.medida, prescrito: pr != null && s.extraS > 0 ? pr + s.extraS : pr },
    siguiente: plan.pasos[s.i + 1] ?? null,
  };
}

export function lecturasDe(p: PasoBase, s: EstadoSecuencia): Lecturas {
  const tipo = p.medida.tipo;
  const hecho =
    tipo === 'distancia' ? (s.midio ? s.metros : null) : tipo === 'tiempo' ? s.t : (s.lect.hecho ?? null);
  return {
    t: s.t,
    hecho,
    ritmo: s.lect.ritmo,
    ppm: s.lect.ppm,
    ppmTendencia: s.lect.ppmTendencia,
    split500: s.lect.split500 ?? null,
    vatios: s.lect.vatios ?? null,
    cadencia: s.lect.cadencia ?? null,
    gps: s.lect.gps ?? 'no-aplica',
    viejos: s.lect.viejos,
  };
}

/** ¿Se ve la cuenta atrás a pantalla completa? Devuelve 3, 2, 1 o null. */
export function cuentaDe(plan: PlanSesion, s: EstadoSecuencia): number | null {
  const p = pasoVivo(plan, s);
  if (!entraConCuenta(p, p.siguiente) || p.medida.tipo !== 'tiempo') return null;
  const f = faltaDe(p, lecturasDe(p, s));
  return f != null && f > 0 && f <= 3 ? Math.ceil(f) : null;
}

function entraConCuenta(p: PasoBase, sig: PasoBase | null): boolean {
  return !!sig && sig.rol === 'trabajo' && sig.fase === 'principal' && (p.rol !== 'trabajo' || p.fase !== 'principal');
}

/** El tiempo total de lo ya hecho y de lo de ahora: la suma de los parciales más el paso en curso. */
export const segundosDeParciales = (ps: Parcial[]) => ps.reduce((a, x) => a + x.segundos, 0);

/** Metros de este segundo: los del GPS/cinta (corridos) y los del PM5 (ergómetro). */
function metrosDelSegundo(l: LecturaSim): { corridos: number; ergo: number } {
  const corridos = l.ritmo != null && l.ritmo > 0 && l.ritmo < RITMO_TECHO_S ? 1000 / l.ritmo : 0;
  const ergo = l.metros != null ? Math.max(0, l.metros) : l.split500 != null && l.split500 > 0 ? 500 / l.split500 : 0;
  return { corridos, ergo };
}

/** Suma un segundo de pulso a las zonas del coach. */
function conZona(zonasS: number[], ppm: number | null, zonas: ZonasCoach | null): number[] {
  if (ppm == null || !zonas || zonasS.length === 0) return zonasS;
  const z = zonaDe(ppm, zonas) - 1;
  return zonasS.map((s, k) => (k === z ? s + 1 : s));
}

// ---------------------------------------------------------------------------
// El motor puro
// ---------------------------------------------------------------------------

export function estadoInicial(plan: PlanSesion, sim: Simulador, ini: InicioSecuencia): EstadoSecuencia {
  const p = plan.pasos[ini.i]!;
  const t = ini.t ?? 0;
  const parciales = ini.parciales ?? [];
  const sesionT = ini.sesionT ?? segundosDeParciales(parciales) + t;
  const lect = sim(p, ini.i, t, sesionT);
  // Los metros ya hechos del paso son de la máquina si la máquina los mide
  // (PM5): no son km corridos ni cuentan para la vuelta automática.
  const deMaquina = lect.split500 != null || lect.metros != null;
  const sesionM = ini.sesionM ?? (deMaquina ? 0 : (ini.metros ?? 0));
  const kmN = Math.floor(sesionM / 1000);
  const n = plan.zonas?.techos.length ?? 0;
  const s: EstadoSecuencia = {
    i: ini.i,
    t,
    metros: ini.metros ?? 0,
    midio: (ini.metros ?? 0) > 0,
    extraS: 0,
    sesionT,
    sesionM,
    sesionErgoM: ini.sesionErgoM ?? (deMaquina ? (ini.metros ?? 0) : 0),
    ppmSuma: (ini.ppmMedio ?? 0) * sesionT,
    ppmN: ini.ppmMedio ? sesionT : 0,
    zonasS: conZona(Array.from({ length: n }, () => 0), lect.ppm, plan.zonas),
    ppmMax: lect.ppm != null ? Math.round(lect.ppm) : 0,
    pasoPpmSuma: 0,
    pasoPpmN: 0,
    pasoZonaS: [0, 0, 0],
    corriendoS: 0,
    kmN,
    kmDesdeT: ini.kmDesdeT ?? sesionT - Math.round(((sesionM - kmN * 1000) / Math.max(1, sesionM)) * sesionT),
    tramosN: 0,
    tramoDesdeT: sesionT,
    tramoDesdeM: sesionM,
    vueltas: ini.vueltas ?? [],
    parciales,
    aviso: AVISO_INICIAL,
    preavisado: false,
    goHasta: 0,
    banner: null,
    terminado: false,
    lect,
  };
  if (ini.preavisado != null) return { ...s, preavisado: ini.preavisado };
  // Si el escenario arranca ya dentro del preaviso, ese preaviso ya sonó.
  const f = faltaDe(p, lecturasDe(p, s));
  const r = plan.reglas;
  const ya = f != null && ((p.medida.tipo === 'distancia' && f <= r.preavisoM) || (p.medida.tipo === 'tiempo' && f <= r.preavisoS));
  return { ...s, preavisado: ya };
}

/** Un segundo de motor. */
export function avanzar(s: EstadoSecuencia, plan: PlanSesion, sim: Simulador): Salida {
  if (s.terminado) return { estado: s, eventos: [] };
  const p = pasoVivo(plan, s);
  const t = s.t + 1;
  const sesionT = s.sesionT + 1;
  const lect = sim(p, s.i, t, sesionT);
  const dm = metrosDelSegundo(lect);
  const eventos: Emitido[] = [];
  let n: EstadoSecuencia = {
    ...s,
    t,
    sesionT,
    lect,
    metros: s.metros + dm.corridos + dm.ergo,
    midio: s.midio || dm.corridos + dm.ergo > 0,
    sesionM: s.sesionM + dm.corridos,
    sesionErgoM: s.sesionErgoM + dm.ergo,
    ppmSuma: s.ppmSuma + (lect.ppm ?? 0),
    ppmN: s.ppmN + (lect.ppm != null ? 1 : 0),
    zonasS: conZona(s.zonasS, lect.ppm, plan.zonas),
    ppmMax: lect.ppm != null ? Math.max(s.ppmMax, Math.round(lect.ppm)) : s.ppmMax,
    pasoPpmSuma: s.pasoPpmSuma + (lect.ppm ?? 0),
    pasoPpmN: s.pasoPpmN + (lect.ppm != null ? 1 : 0),
    banner: s.banner && s.banner.hasta > sesionT ? s.banner : null,
  };

  // Enlace perdido: un dato que dependía del móvil deja de llegar (P1, §3).
  if (!(s.lect.viejos?.length ?? 0) && (lect.viejos?.length ?? 0) > 0) eventos.push({ evento: 'enlace' });

  // Vuelta automática por km (dato del coach).
  if (p.vueltaAutoM && Math.floor(n.sesionM / p.vueltaAutoM) > s.kmN) {
    const km = Math.floor(n.sesionM / p.vueltaAutoM);
    const seg = sesionT - s.kmDesdeT;
    const v: Vuelta = { n: km, clase: 'km', segundos: seg, metros: p.vueltaAutoM, ritmo: seg, ppm: lect.ppm, veredicto: null };
    n = { ...n, kmN: km, kmDesdeT: sesionT, vueltas: [...n.vueltas, v], banner: { titulo: `Kilómetro ${km}`, valor: fmtReloj(seg), pie: 'ritmo del km', hasta: sesionT + 4 } };
    eventos.push({ evento: 'vuelta', voz: vozKm(km, seg) });
  }

  const l = lecturasDe(p, n);
  const f = faltaDe(p, l);
  const pr = p.medida.prescrito ?? 0;

  // Preaviso: 10 s o 100 m, solo en pasos que no son cortos.
  if (!n.preavisado && f != null && f > 0) {
    const r = plan.reglas;
    const porTiempo = p.medida.tipo === 'tiempo' && f <= r.preavisoS && pr >= r.preavisoMinimoS;
    const porMetros = p.medida.tipo === 'distancia' && f <= r.preavisoM && pr >= 4 * r.preavisoM;
    if (porTiempo || porMetros) {
      n = { ...n, preavisado: true };
      eventos.push({ evento: 'preaviso', voz: vozPreaviso(p, porMetros ? r.preavisoM : r.preavisoS) });
    }
  }

  // 3-2-1: un tic por segundo antes de un paso de trabajo de la parte principal.
  if (p.medida.tipo === 'tiempo' && entraConCuenta(p, p.siguiente) && f != null && f > 0 && f <= 3) {
    eventos.push({ evento: 'cuenta' });
  }

  // Fuera de objetivo, con holgura y cadencia. UN veredicto (el techo pasado
  // manda) para lo que vibra y lo que pinta la banda.
  const o = principal(p);
  if (p.rol === 'trabajo' && (o || objetivoDe(p, 'techo'))) {
    const ver = veredictoDelPaso(p, l, plan.zonas, plan.reglas);
    const d = decidirAviso(n.aviso, ver, t, p, o?.eje ?? null, plan.reglas);
    n = { ...n, aviso: d.estado };
    if (d.evento) eventos.push({ evento: d.evento });
  }

  // El tiempo en zona de una serie a pulso, pasada la gracia.
  if (o && p.rol === 'trabajo' && (o.eje === 'zona' || o.eje === 'ppm') && t > plan.reglas.graciaZonaS) {
    const ver = veredictoPrincipal(p, l, plan.zonas, plan.reglas);
    if (ver != null) {
      const [d, a, b] = n.pasoZonaS;
      n = { ...n, pasoZonaS: ver === 'dentro' ? [d + 1, a, b] : ver === 'por-encima' ? [d, a + 1, b] : [d, a, b + 1] };
    }
  }

  // Cierre por detección: un paso abierto que mide el sensor se cierra cuando
  // la muñeca ve que vuelves a correr unos segundos seguidos.
  if (p.cierre === 'medida' && p.medida.tipo === 'abierta' && p.medida.mide === 'sensor') {
    const corre = lect.ritmo != null && lect.ritmo <= DETECCION.ritmoCorrerS;
    n = { ...n, corriendoS: corre ? n.corriendoS + 1 : 0 };
    if (n.corriendoS >= DETECCION.seguidosS) {
      const c = cerrar(n, plan, 'medida');
      return { estado: c.estado, eventos: [...eventos, ...c.eventos] };
    }
  }

  // Cierre por medida.
  if (p.cierre === 'medida' && f != null && f <= 0) {
    const c = cerrar(n, plan, 'medida');
    return { estado: c.estado, eventos: [...eventos, ...c.eventos] };
  }
  return { estado: n, eventos };
}

/**
 * El veredicto de una serie cerrada, con la holgura con la que juzgó el motor
 * en vivo (la frase no canta «rápida» una serie que la banda dio por buena).
 * A ritmo o a /500: su media. A zona o pulso: donde pasó MÁS tiempo tras la
 * gracia; si la serie fue más corta que la gracia, no se juzga (null): el
 * pulso aún no había llegado.
 */
function veredictoDeVuelta(
  o: NonNullable<ReturnType<typeof principal>>,
  v: Pick<Vuelta, 'ritmo' | 'segundos' | 'metros'>,
  zonaS: [number, number, number],
  plan: PlanSesion,
): Vuelta['veredicto'] {
  if (o.eje === 'ritmo') return v.ritmo == null ? null : veredictoDe(o, v.ritmo, holguraDe('ritmo', plan.reglas), plan.zonas);
  if (o.eje === 'split500') {
    if (v.metros == null || v.metros <= 0) return null;
    return veredictoDe(o, (v.segundos * 500) / v.metros, holguraDe('split500', plan.reglas), plan.zonas);
  }
  if (o.eje !== 'zona' && o.eje !== 'ppm') return null;
  const [dentro, encima, debajo] = zonaS;
  if (dentro + encima + debajo === 0) return null;
  if (dentro >= encima && dentro >= debajo) return 'dentro';
  return encima >= debajo ? 'por-encima' : 'por-debajo';
}

/** Lo que emite la entrada en el paso siguiente: GO, recupera o la transición. */
function entradaEn(plan: PlanSesion, j: number): Emitido {
  const sig = plan.pasos[j]!;
  const tras = plan.pasos[j + 1] ?? null;
  if (sig.rol === 'trabajo') return { evento: 'go', voz: vozInicio(sig) };
  if (sig.rol === 'recuperacion') return { evento: 'recupera', voz: vozRecupera(sig, tras) };
  if (sig.rol === 'descanso') return { evento: 'recupera', voz: vozDescanso(sig) };
  // La Roxzone es parte de la carrera (P10): se entra con .start×2, como a una
  // estación. Colocarse o dar la puntuación es dejar de trabajar: .stop.
  return { evento: sig.roxzone ? 'go' : 'recupera', voz: vozTransicion(sig, tras) };
}

/** Cierra el paso en curso — solo (por medida o por detección) o a mano (el atleta). */
export function cerrar(s: EstadoSecuencia, plan: PlanSesion, quien: 'medida' | 'atleta'): Salida {
  const p = pasoVivo(plan, s);
  const eventos: Emitido[] = [];
  if (quien === 'atleta') eventos.push({ evento: 'accion' });
  const ppm = s.pasoPpmN > 0 ? Math.round(s.pasoPpmSuma / s.pasoPpmN) : null;
  const parcial: Parcial = {
    i: s.i,
    segundos: s.t,
    metros: s.midio ? Math.round(s.metros) : null,
    ppm,
    hecho: p.medida.tipo === 'reps' || p.medida.tipo === 'cal' ? (s.lect.hecho ?? null) : null,
  };
  let vueltas = s.vueltas;
  const cuenta = p.posicion?.serie ?? p.posicion?.tramo;
  if (p.rol === 'trabajo' && p.fase === 'principal' && cuenta) {
    const ritmo = s.midio && s.metros > 50 ? s.t / (s.metros / 1000) : null;
    const o = principal(p);
    const base = { segundos: s.t, metros: s.midio ? Math.round(s.metros) : null, ritmo };
    const v: Vuelta = {
      n: cuenta.n,
      tanda: p.posicion?.tanda?.n,
      clase: p.posicion?.tramo ? 'tramo' : 'serie',
      ...base,
      ppm,
      veredicto: o ? veredictoDeVuelta(o, base, s.pasoZonaS, plan) : null,
      eje: o?.eje,
    };
    vueltas = [...vueltas, v];
    // La frase del resultado solo si dice algo: un veredicto, o el tiempo de
    // una serie por metros. «Stride 3: 0:20» no le cuenta nada a nadie.
    if (o && (v.veredicto != null || p.medida.tipo === 'distancia')) {
      eventos.push({ evento: 'fin-serie', voz: vozFinSerie(p, v) });
    }
  }
  const parciales = [...s.parciales, parcial];

  const sig = plan.pasos[s.i + 1];
  if (!sig) {
    eventos.push({ evento: 'sesion', voz: VOZ_SESION });
    return { estado: { ...s, vueltas, parciales, terminado: true }, eventos };
  }
  if (sig.bloque != null && p.bloque != null && sig.bloque !== p.bloque) eventos.push({ evento: 'bloque' });
  eventos.push(entradaEn(plan, s.i + 1));

  const verGo = sig.rol === 'trabajo' && sig.fase === 'principal' && (p.rol !== 'trabajo' || quien === 'atleta');
  return {
    estado: {
      ...s,
      i: s.i + 1,
      t: 0,
      metros: 0,
      midio: false,
      extraS: 0,
      pasoPpmSuma: 0,
      pasoPpmN: 0,
      pasoZonaS: [0, 0, 0],
      corriendoS: 0,
      vueltas,
      parciales,
      aviso: AVISO_INICIAL,
      preavisado: false,
      goHasta: verGo ? s.sesionT + 1 : 0,
    },
    eventos,
  };
}
