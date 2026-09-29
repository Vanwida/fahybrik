// EL GENERADOR DE CASOS — datos de ejemplo PLAUSIBLES, deterministas, con la
// forma del contrato. NADA sale de la base de producción (es de prueba, A10):
// un atleta se describe por su patrón semanal, su periodización y sus anclas,
// y de ahí se derivan día a día la carga por familia, los segundos, las zonas
// y la biometría. Forma, fatiga y frescura NO se inventan: las calcula el
// Banister de `shared/domain/training-load` sobre esta carga diaria, igual
// que hará el motor.
//
// Determinista a propósito (un generador congruencial con semilla): el
// servidor y el cliente del doble tienen que producir el mismo panel, y una
// captura de hoy tiene que ser la misma mañana.

import type { DailyTss } from '@fahybrid/shared/domain/training-load';
import { FAMILIAS_GRANDES, type Ancla, type FamiliaGrande } from '../contrato';
import { diasEntre, lunesDe, sumarDias } from '../mecanismo';

/** El «hoy» de todos los casos: el día del modelo. */
export const HOY = '2026-09-29';

// ---------------------------------------------------------------------------
// Azar con semilla
// ---------------------------------------------------------------------------

export function azar(semilla: number): () => number {
  let s = semilla >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// El patrón semanal — qué toca cada día, por familia
// ---------------------------------------------------------------------------

export interface DiaPatron {
  /** 1 = lunes … 7 = domingo. */
  dia: number;
  familia: FamiliaGrande;
  /** Carga base de la sesión (unidades TSS) a factor 1. */
  tss: number;
  /** Duración de la sesión, en segundos. */
  segundos: number;
  /** Reparto del tiempo por zona (fracciones que suman 1). Sin pulso, vacío. */
  zonas: readonly number[];
  /** Cómo se prescribe la intensidad: decide si la carga planificada existe. */
  intensidadPrescrita: boolean;
  titulo: string;
}

/** La semana tipo de un atleta híbrido: dos carreras, dos de fuerza, un ergo, un circuito, domingo libre. */
export const PATRON_HIBRIDO: readonly DiaPatron[] = [
  { dia: 1, familia: 'fuerza', tss: 52, segundos: 3600, zonas: [0.55, 0.3, 0.12, 0.03, 0], intensidadPrescrita: true, titulo: 'Fuerza A · sentadilla y empuje' },
  { dia: 2, familia: 'correr', tss: 74, segundos: 3300, zonas: [0.18, 0.22, 0.2, 0.3, 0.1], intensidadPrescrita: true, titulo: 'Series 6 × 1000 m' },
  { dia: 3, familia: 'ergo', tss: 48, segundos: 2700, zonas: [0.2, 0.35, 0.3, 0.15, 0], intensidadPrescrita: true, titulo: 'Remo 5 × 500 m' },
  { dia: 4, familia: 'fuerza', tss: 58, segundos: 3900, zonas: [0.5, 0.3, 0.15, 0.05, 0], intensidadPrescrita: true, titulo: 'Fuerza B · bisagra y tracción' },
  { dia: 5, familia: 'estaciones-wod', tss: 62, segundos: 3000, zonas: [0.1, 0.2, 0.3, 0.3, 0.1], intensidadPrescrita: true, titulo: 'Circuito de estaciones' },
  { dia: 6, familia: 'correr', tss: 88, segundos: 4800, zonas: [0.25, 0.55, 0.15, 0.05, 0], intensidadPrescrita: true, titulo: 'Tirada larga 80′ a Z2' },
];

/** Un patrón más corto: tres días (quien empieza). */
export const PATRON_TRES_DIAS: readonly DiaPatron[] = [
  { dia: 1, familia: 'fuerza', tss: 40, segundos: 3000, zonas: [0.6, 0.3, 0.1, 0, 0], intensidadPrescrita: true, titulo: 'Fuerza · básicos' },
  { dia: 3, familia: 'correr', tss: 55, segundos: 2700, zonas: [0.3, 0.5, 0.2, 0, 0], intensidadPrescrita: true, titulo: 'Rodaje 45′' },
  { dia: 6, familia: 'correr', tss: 62, segundos: 3300, zonas: [0.25, 0.5, 0.2, 0.05, 0], intensidadPrescrita: true, titulo: 'Rodaje largo 55′' },
];

// ---------------------------------------------------------------------------
// Día a día
// ---------------------------------------------------------------------------

export interface DiaHecho {
  fecha: string;
  familia: FamiliaGrande;
  titulo: string;
  /** Carga planificada (desde la prescripción), null sin intensidad prescrita. */
  plan_tss: number | null;
  /** Carga hecha; null si no se hizo o no se pudo calcular. */
  tss: number | null;
  segundos: number;
  ancla: Ancla;
  /** Si la carga salió de un aparato (ritmo/vatios/pulso) o del esfuerzo declarado. */
  medido: boolean;
  /** Segundos por zona Z1…Z5 (vacío sin pulso). */
  zonasS: number[];
  hecha: boolean;
}

export interface PerfilAtleta {
  patron: readonly DiaPatron[];
  /** ISO de la primera sesión. */
  desde: string;
  /** Última sesión hecha (para el «dato viejo»). Por defecto, hoy o antes. */
  ultimaSesion?: string;
  /** Factor de carga por semana desde `desde` (periodización). */
  factorSemana: (semana: number) => number;
  /** Ancla de la carga por familia. */
  ancla: Record<FamiliaGrande, Ancla>;
  /** Con pulso medido: las zonas existen. */
  pulso: boolean;
  /** Sesiones saltadas (fracción). */
  saltadas: number;
  semilla: number;
}

/** Periodización 3 + 1: tres semanas subiendo y una de descarga, con subida de fondo lenta. */
export function periodizacion31(base = 0.78, subida = 0.012, tope = 1.3): (semana: number) => number {
  return (semana) => {
    const ciclo = semana % 4;
    const dentro = ciclo === 3 ? 0.58 : 0.82 + ciclo * 0.17;
    return Math.min(tope, base + semana * subida) * dentro;
  };
}

/** Todos los días desde `desde` hasta `hasta`, hechos o no. */
export function diasHechos(perfil: PerfilAtleta, hasta = HOY): DiaHecho[] {
  const rnd = azar(perfil.semilla);
  const out: DiaHecho[] = [];
  const lunes0 = lunesDe(perfil.desde);
  const ultima = perfil.ultimaSesion ?? hasta;
  for (let d = perfil.desde; d <= hasta; d = sumarDias(d, 1)) {
    const dow = ((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
    const semana = Math.floor(diasEntre(lunes0, d) / 7);
    const factor = perfil.factorSemana(semana);
    for (const p of perfil.patron) {
      if (p.dia !== dow) continue;
      const ruido = 0.9 + rnd() * 0.22;
      const plan = p.intensidadPrescrita ? Math.round(p.tss * factor) : null;
      const saltada = rnd() < perfil.saltadas || d > ultima;
      const tss = saltada ? null : Math.round(p.tss * factor * ruido);
      const segundos = saltada ? 0 : Math.round(p.segundos * (0.92 + rnd() * 0.16));
      const ancla = perfil.ancla[p.familia];
      out.push({
        fecha: d,
        familia: p.familia,
        titulo: p.titulo,
        plan_tss: plan,
        tss,
        segundos,
        ancla,
        medido: perfil.pulso && p.familia !== 'fuerza',
        zonasS: perfil.pulso && !saltada ? p.zonas.map((z) => Math.round(z * segundos)) : [],
        hecha: !saltada,
      });
    }
  }
  return out;
}

/** El plan futuro: de mañana a la carrera, con la descarga de las dos últimas semanas (taper). */
export function planFuturo(perfil: PerfilAtleta, desde: string, hastaCarrera: string): DiaHecho[] {
  const out: DiaHecho[] = [];
  const lunes0 = lunesDe(perfil.desde);
  for (let d = desde; d <= hastaCarrera; d = sumarDias(d, 1)) {
    const dow = ((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
    const semana = Math.floor(diasEntre(lunes0, d) / 7);
    const faltan = diasEntre(d, hastaCarrera);
    const taper = faltan <= 14 ? 0.55 + (faltan / 14) * 0.35 : 1;
    for (const p of perfil.patron) {
      if (p.dia !== dow) continue;
      const plan = p.intensidadPrescrita ? Math.round(p.tss * perfil.factorSemana(semana) * taper) : null;
      out.push({ fecha: d, familia: p.familia, titulo: p.titulo, plan_tss: plan, tss: null, segundos: 0, ancla: perfil.ancla[p.familia], medido: false, zonasS: [], hecha: false });
    }
  }
  return out;
}

/** La serie diaria de carga para el Banister, un punto por día (sin sesión = 0, que en carga sí es un cero real). */
export function diarioDe(dias: DiaHecho[], desde: string, hasta: string, usar: 'hecho' | 'plan'): DailyTss[] {
  const porDia = new Map<string, number>();
  for (const d of dias) {
    const v = usar === 'hecho' ? d.tss : d.plan_tss;
    if (v == null) continue;
    porDia.set(d.fecha, (porDia.get(d.fecha) ?? 0) + v);
  }
  const out: DailyTss[] = [];
  for (let d = desde; d <= hasta; d = sumarDias(d, 1)) out.push({ date: d, tss: porDia.get(d) ?? 0 });
  return out;
}

// ---------------------------------------------------------------------------
// Semana a semana
// ---------------------------------------------------------------------------

/** Un cubo de la ventana: un día (7 d) o una semana (el resto). */
export interface Cubo {
  t: string;
  desde: string;
  hasta: string;
}

export function cubosDe(rango: { desde: string; hasta: string; paso: 'dia' | 'semana' }): Cubo[] {
  const out: Cubo[] = [];
  if (rango.paso === 'dia') {
    for (let d = rango.desde; d <= rango.hasta; d = sumarDias(d, 1)) out.push({ t: d, desde: d, hasta: d });
    return out;
  }
  let lunes = lunesDe(rango.desde);
  const ultimo = lunesDe(rango.hasta);
  while (lunes <= ultimo) {
    out.push({ t: lunes, desde: lunes, hasta: sumarDias(lunes, 6) });
    lunes = sumarDias(lunes, 7);
  }
  return out;
}

export interface CuboAgregado {
  t: string;
  /** Plan total y por familia; null cuando no hay ninguna sesión planificada. */
  plan_tss: number | null;
  plan_por_familia: Record<FamiliaGrande, number | null>;
  hecho_tss: Record<FamiliaGrande, number>;
  segundos: Record<FamiliaGrande, number>;
  zonasS: number[];
  sesiones: DiaHecho[];
}

const porFamilia = <T,>(v: T): Record<FamiliaGrande, T> => Object.fromEntries(FAMILIAS_GRANDES.map((f) => [f, v])) as Record<FamiliaGrande, T>;

export function agregar(dias: DiaHecho[], cubos: Cubo[]): CuboAgregado[] {
  return cubos.map((c) => {
    const dentro = dias.filter((d) => d.fecha >= c.desde && d.fecha <= c.hasta);
    const hecho = porFamilia(0);
    const segundos = porFamilia(0);
    const planFam = porFamilia<number | null>(null);
    const zonasS = [0, 0, 0, 0, 0];
    let plan: number | null = null;
    for (const d of dentro) {
      if (d.plan_tss != null) {
        plan = (plan ?? 0) + d.plan_tss;
        planFam[d.familia] = (planFam[d.familia] ?? 0) + d.plan_tss;
      }
      if (d.tss != null) hecho[d.familia] += d.tss;
      segundos[d.familia] += d.segundos;
      d.zonasS.forEach((s, i) => {
        zonasS[i] = (zonasS[i] ?? 0) + s;
      });
    }
    return { t: c.t, plan_tss: plan, plan_por_familia: planFam, hecho_tss: hecho, segundos, zonasS, sesiones: dentro };
  });
}

// ---------------------------------------------------------------------------
// Biometría — una basal y lo reciente, con noches que faltan
// ---------------------------------------------------------------------------

export interface Noche {
  fecha: string;
  vfc: number | null;
  fc_reposo: number | null;
  sueno_h: number | null;
}

export function noches(args: { desde: string; hasta: string; vfcBasal: number; fcBasal: number; suenoBasal: number; semilla: number; deriva?: number; huecos?: number }): Noche[] {
  const rnd = azar(args.semilla);
  const out: Noche[] = [];
  const total = diasEntre(args.desde, args.hasta);
  for (let d = args.desde; d <= args.hasta; d = sumarDias(d, 1)) {
    const i = diasEntre(args.desde, d);
    const t = total > 0 ? i / total : 1;
    const falta = rnd() < (args.huecos ?? 0.06);
    const deriva = (args.deriva ?? 0) * t;
    out.push({
      fecha: d,
      vfc: falta ? null : Math.round(args.vfcBasal + deriva + (rnd() - 0.5) * 12),
      fc_reposo: falta ? null : Math.round(args.fcBasal - deriva / 3 + (rnd() - 0.5) * 4),
      sueno_h: falta ? null : Math.round((args.suenoBasal + (rnd() - 0.5) * 1.6) * 10) / 10,
    });
  }
  return out;
}

export function mediaDe(vals: Array<number | null>): number | null {
  const v = vals.filter((x): x is number => x != null);
  return v.length === 0 ? null : v.reduce((a, b) => a + b, 0) / v.length;
}

/** Una serie semanal de una métrica que mejora (o empeora) despacio con ruido: la tendencia de un umbral, un 1RM, una previsión. */
export function tendencia(args: { semanas: string[]; desde: number; hasta: number; semilla: number; ruido?: number; huecos?: number }): Array<{ t: string; v: number | null }> {
  const rnd = azar(args.semilla);
  const n = args.semanas.length;
  return args.semanas.map((t, i) => {
    if (rnd() < (args.huecos ?? 0)) return { t, v: null };
    const f = n > 1 ? i / (n - 1) : 1;
    const v = args.desde + (args.hasta - args.desde) * f + (rnd() - 0.5) * (args.ruido ?? 0);
    return { t, v: Math.round(v * 10) / 10 };
  });
}
