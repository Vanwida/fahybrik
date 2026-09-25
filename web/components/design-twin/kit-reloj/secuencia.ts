'use client';

// LA SECUENCIA — el motor mínimo del doble: pasos anclados, cierres, eventos.
//
// P1 dice que los relojes se calculan en la muñeca desde anclas y que los
// hápticos salen de las TRANSICIONES del estado. Esto es eso, en pequeño y
// puro: `avanzar` recibe el estado de un segundo y devuelve el del siguiente
// más los eventos que la transición produce; `cerrar` hace lo mismo cuando el
// atleta cierra a mano. La pantalla solo pone el cuerpo (el `Simulador`: qué
// ritmo y qué pulso da el atleta en cada segundo) y pinta.
//
// Sirve a todas las familias: un descanso de fuerza, una estación de HYROX o
// una serie de 1000 m son pasos con su medida; cambia quién los mide y quién
// los cierra, no el motor.
//
// Lo que hace, y por qué:
//   · cierre por medida (tiempo o metros) o por el atleta (hasta pulsar);
//   · preaviso a 10 s / 100 m en pasos que no son cortos (dato del coach);
//   · 3-2-1 a pantalla completa SOLO al entrar en un paso de trabajo de la
//     parte principal desde algo que no es trabajo (recuperación, descanso,
//     calentamiento): cortar un progresivo con una cuenta atrás a pantalla
//     completa sería tapar el reloj corriendo;
//   · la serie cerrada deja su vuelta y su frase («Serie 3: 3:48, dentro.»);
//   · vuelta automática por km donde el coach la pide;
//   · aviso fuera de objetivo con histéresis y cadencia (`decidirAviso`);
//   · deshacer: el cierre manual guarda el estado de antes y el tiempo sigue.

import { useEffect, useRef, useState } from 'react';
import { useTicker } from '../sim';
import {
  AVISO_INICIAL,
  decidirAviso,
  type EstadoAviso,
  type EventoVivo,
  type Eventos,
} from './eventos';
import type {
  CampoVivo,
  EstadoGps,
  Lecturas,
  Paso,
  PasoBase,
  ReglasAviso,
  Vuelta,
  ZonasCoach,
} from './paso';
import {
  RITMO_TECHO_S,
  faltaDe,
  fmtReloj,
  fmtRitmo,
  holguraDe,
  objetivoDe,
  principal,
  veredictoDe,
  veredictoDelPaso,
  veredictoPrincipal,
} from './reglas';
import { VOZ_SESION, vozDescanso, vozFinSerie, vozInicio, vozKm, vozPreaviso, vozRecupera } from './voz';

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
}

export type Simulador = (paso: PasoBase, i: number, t: number, sesionT: number) => LecturaSim;

export interface EstadoSecuencia {
  i: number;
  t: number;
  metros: number;
  /** ¿Alguien ha medido metros en este paso? Si no, lo hecho es null, no cero. */
  midio: boolean;
  extraS: number;
  sesionT: number;
  sesionM: number;
  ppmSuma: number;
  ppmN: number;
  pasoPpmSuma: number;
  pasoPpmN: number;
  /**
   * Segundos del paso juzgados contra una zona o un pulso, tras la gracia:
   * dentro, por encima, por debajo. Una serie a zona se juzga por aquí, no por
   * la media (que castiga el retraso del pulso al arrancar).
   */
  pasoZonaS: [number, number, number];
  kmN: number;
  kmDesdeT: number;
  /** La vuelta manual (el control «Vuelta»): desde cuándo y desde qué metro. */
  tramosN: number;
  tramoDesdeT: number;
  tramoDesdeM: number;
  vueltas: Vuelta[];
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
  sesionT?: number;
  sesionM?: number;
  vueltas?: Vuelta[];
  /** Media de pulso de lo que ya se corrió (para la página Datos). */
  ppmMedio?: number;
  /** Segundo de sesión en que empezó el km en curso (si no, se estima a ritmo uniforme). */
  kmDesdeT?: number;
  /** Arranca en pausa (escenarios de la pausa). */
  pausado?: boolean;
}

type Salida = { estado: EstadoSecuencia; eventos: Array<{ evento: EventoVivo; voz?: string }> };

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

// ---------------------------------------------------------------------------
// El motor puro
// ---------------------------------------------------------------------------

export function estadoInicial(plan: PlanSesion, sim: Simulador, ini: InicioSecuencia): EstadoSecuencia {
  const p = plan.pasos[ini.i]!;
  const t = ini.t ?? 0;
  const sesionT = ini.sesionT ?? t;
  const sesionM = ini.sesionM ?? ini.metros ?? 0;
  const kmN = Math.floor(sesionM / 1000);
  return {
    i: ini.i,
    t,
    metros: ini.metros ?? 0,
    midio: (ini.metros ?? 0) > 0,
    extraS: 0,
    sesionT,
    sesionM,
    ppmSuma: (ini.ppmMedio ?? 0) * sesionT,
    ppmN: ini.ppmMedio ? sesionT : 0,
    pasoPpmSuma: 0,
    pasoPpmN: 0,
    pasoZonaS: [0, 0, 0],
    kmN,
    kmDesdeT: ini.kmDesdeT ?? sesionT - Math.round(((sesionM - kmN * 1000) / Math.max(1, sesionM)) * sesionT),
    tramosN: 0,
    tramoDesdeT: sesionT,
    tramoDesdeM: sesionM,
    vueltas: ini.vueltas ?? [],
    aviso: AVISO_INICIAL,
    preavisado: false,
    goHasta: 0,
    banner: null,
    terminado: false,
    lect: sim(p, ini.i, t, sesionT),
  };
}

/** Un segundo de motor. */
export function avanzar(s: EstadoSecuencia, plan: PlanSesion, sim: Simulador): Salida {
  if (s.terminado) return { estado: s, eventos: [] };
  const p = pasoVivo(plan, s);
  const t = s.t + 1;
  const sesionT = s.sesionT + 1;
  const lect = sim(p, s.i, t, sesionT);
  const dm = lect.ritmo != null && lect.ritmo > 0 && lect.ritmo < RITMO_TECHO_S ? 1000 / lect.ritmo : 0;
  const eventos: Salida['eventos'] = [];
  let n: EstadoSecuencia = {
    ...s,
    t,
    sesionT,
    lect,
    metros: s.metros + dm,
    midio: s.midio || dm > 0,
    sesionM: s.sesionM + dm,
    ppmSuma: s.ppmSuma + (lect.ppm ?? 0),
    ppmN: s.ppmN + (lect.ppm != null ? 1 : 0),
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
 * A ritmo: su ritmo medio. A zona o pulso: donde pasó MÁS tiempo tras la
 * gracia; si la serie fue más corta que la gracia, no se juzga (null): el
 * pulso aún no había llegado.
 */
function veredictoDeVuelta(
  o: NonNullable<ReturnType<typeof principal>>,
  ritmo: number | null,
  zonaS: [number, number, number],
  plan: PlanSesion,
): Vuelta['veredicto'] {
  if (o.eje === 'ritmo') return ritmo == null ? null : veredictoDe(o, ritmo, holguraDe('ritmo', plan.reglas), plan.zonas);
  if (o.eje !== 'zona' && o.eje !== 'ppm') return null;
  const [dentro, encima, debajo] = zonaS;
  if (dentro + encima + debajo === 0) return null;
  if (dentro >= encima && dentro >= debajo) return 'dentro';
  return encima >= debajo ? 'por-encima' : 'por-debajo';
}

/** Cierra el paso en curso — solo (por medida) o a mano (el atleta). */
export function cerrar(s: EstadoSecuencia, plan: PlanSesion, quien: 'medida' | 'atleta'): Salida {
  const p = pasoVivo(plan, s);
  const eventos: Salida['eventos'] = [];
  if (quien === 'atleta') eventos.push({ evento: 'accion' });
  let vueltas = s.vueltas;
  const cuenta = p.posicion?.serie ?? p.posicion?.tramo;
  if (p.rol === 'trabajo' && p.fase === 'principal' && cuenta) {
    const ritmo = s.midio && s.metros > 50 ? s.t / (s.metros / 1000) : null;
    const ppm = s.pasoPpmN > 0 ? Math.round(s.pasoPpmSuma / s.pasoPpmN) : null;
    const o = principal(p);
    const v: Vuelta = {
      n: cuenta.n,
      tanda: p.posicion?.tanda?.n,
      clase: p.posicion?.tramo ? 'tramo' : 'serie',
      segundos: s.t,
      metros: s.midio ? Math.round(s.metros) : null,
      ritmo,
      ppm,
      veredicto: o ? veredictoDeVuelta(o, ritmo, s.pasoZonaS, plan) : null,
      eje: o?.eje,
    };
    vueltas = [...vueltas, v];
    // La frase del resultado solo si dice algo: un veredicto, o el tiempo de
    // una serie por metros. «Stride 3: 0:20» no le cuenta nada a nadie.
    if (o && (v.veredicto != null || p.medida.tipo === 'distancia')) {
      eventos.push({ evento: 'fin-serie', voz: vozFinSerie(p, v) });
    }
  }

  const sig = plan.pasos[s.i + 1];
  if (!sig) {
    eventos.push({ evento: 'sesion', voz: VOZ_SESION });
    return { estado: { ...s, vueltas, terminado: true }, eventos };
  }
  if (sig.bloque != null && p.bloque != null && sig.bloque !== p.bloque) eventos.push({ evento: 'bloque' });
  if (sig.rol === 'trabajo') eventos.push({ evento: 'go', voz: vozInicio(sig) });
  else if (sig.rol === 'recuperacion') eventos.push({ evento: 'recupera', voz: vozRecupera(sig, plan.pasos[s.i + 2] ?? null) });
  else eventos.push({ evento: 'recupera', voz: vozDescanso(sig) });

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
      vueltas,
      aviso: AVISO_INICIAL,
      preavisado: false,
      goHasta: verGo ? s.sesionT + 1 : 0,
    },
    eventos,
  };
}

// ---------------------------------------------------------------------------
// El gancho
// ---------------------------------------------------------------------------

export interface Secuencia {
  estado: EstadoSecuencia;
  paso: Paso;
  lecturas: Lecturas;
  /** 3, 2, 1 durante la cuenta atrás a pantalla completa; si no, null. */
  cuenta: number | null;
  /** El GO del primer segundo de un paso de trabajo. */
  go: boolean;
  pausado: boolean;
  pausar: (si: boolean) => void;
  /** Cierre a mano (doble toque, Acción, «Empezar ya»). Guarda el estado para deshacer. */
  cerrar: () => void;
  deshacer: () => void;
  /** +30 s al descanso en curso. */
  sumar30: () => void;
  /** Vuelta manual (el control «Vuelta» de un rodaje): parte sin cerrar el paso. */
  vuelta: () => void;
  terminar: () => void;
}

/**
 * El motor de un escenario. `corriendo: false` lo congela (escenarios
 * estáticos como «color y tipo»). Los eventos van a `eventos.emitir`, que los
 * junta por instante y los escribe en la cronología.
 */
export function useSecuencia(
  plan: PlanSesion,
  sim: Simulador,
  inicio: InicioSecuencia,
  eventos: Eventos,
  corriendo = true,
): Secuencia {
  const [s, setS] = useState(() => estadoInicial(plan, sim, inicio));
  const [pausado, setPausado] = useState(inicio.pausado ?? false);
  // El estado MÁS RECIENTE y el de antes del último cierre a mano, en refs:
  // el aviso de deshacer guarda la función 5 s, y un cierre de hace 5 s no
  // puede leer el estado de su render (sería el de antes de cerrar).
  const ultimo = useRef(s);
  const antes = useRef<EstadoSecuencia | null>(null);
  useEffect(() => {
    ultimo.current = s;
  });

  const aplicar = (nuevo: EstadoSecuencia) => {
    ultimo.current = nuevo;
    setS(nuevo);
  };

  useTicker(corriendo && !pausado && !s.terminado, () => {
    const r = avanzar(ultimo.current, plan, sim);
    aplicar(r.estado);
    r.eventos.forEach((e) => eventos.emitir(e.evento, e.voz));
  });

  const paso = pasoVivo(plan, s);
  return {
    estado: s,
    paso,
    lecturas: lecturasDe(paso, s),
    cuenta: cuentaDe(plan, s),
    go: s.goHasta > s.sesionT,
    pausado,
    pausar: (si) => {
      setPausado(si);
      eventos.emitir('accion');
    },
    cerrar: () => {
      const actual = ultimo.current;
      if (actual.terminado) return;
      const r = cerrar(actual, plan, 'atleta');
      antes.current = actual;
      aplicar(r.estado);
      r.eventos.forEach((e) => eventos.emitir(e.evento, e.voz));
    },
    deshacer: () => {
      const a = antes.current;
      const actual = ultimo.current;
      if (!a) return;
      // El tiempo no se deshace: el paso reabierto sigue contando desde donde iba.
      const pasado = actual.sesionT - a.sesionT;
      aplicar({ ...a, t: a.t + pasado, sesionT: actual.sesionT, sesionM: actual.sesionM, lect: actual.lect, goHasta: 0 });
      antes.current = null;
      eventos.emitir('accion');
    },
    sumar30: () => {
      const actual = ultimo.current;
      aplicar({ ...actual, extraS: actual.extraS + 30, preavisado: false });
      eventos.emitir('accion');
    },
    vuelta: () => {
      const actual = ultimo.current;
      const seg = actual.sesionT - actual.tramoDesdeT;
      const m = actual.sesionM - actual.tramoDesdeM;
      const ritmo = m > 50 ? seg / (m / 1000) : null;
      const n = actual.tramosN + 1;
      const v: Vuelta = { n, clase: 'tramo', segundos: seg, metros: Math.round(m), ritmo, ppm: actual.lect.ppm, veredicto: null };
      aplicar({
        ...actual,
        tramosN: n,
        tramoDesdeT: actual.sesionT,
        tramoDesdeM: actual.sesionM,
        vueltas: [...actual.vueltas, v],
        banner: { titulo: `Vuelta ${n}`, valor: fmtReloj(seg), pie: `${fmtRitmo(ritmo)} /km`, hasta: actual.sesionT + 4 },
      });
      eventos.emitir('accion');
    },
    terminar: () => {
      aplicar({ ...ultimo.current, terminado: true });
    },
  };
}
