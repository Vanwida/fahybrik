// LOS DETALLES POR FAMILIA (A9): el «¿mejoro?» a fondo, con la forma del
// contrato. Cada familia tiene su métrica clave, su tabla o curva de mejores y
// su veredicto con el MISMO mecanismo que la portada (A3): el mismo atleta y
// la misma ventana producen el mismo dato en la portada y en el detalle.
//
//   correr      ritmo umbral, mejores esfuerzos (400 m → media), Motor,
//               desacople, velocidad crítica, VDOT, lo que te piden, volumen
//   ergo        una pantalla, la máquina como variante: umbral de potencia,
//               mejores por pieza estándar (Concept2), vatios al mismo pulso,
//               volumen; la bici en /1000 m y rpm
//   fuerza      1RM estimado por ejercicio (fórmula del coach), mejores por
//               nº de reps, volumen por patrón y semana, cumplimiento de RIR
//   estaciones  mejores por estación, historial de los WOD de referencia y de
//               las simulaciones, parciales de carrera oficiales
//
// Datos de ejemplo plausibles, deterministas, jamás de la base (A10).

import { medida, serie, sinDato, type Ancla, type Familia, type LecturaPanel, type ProcedenciaPanel, type PuntoSerie, type TramoCarrera, type Ventana } from '../contrato';
import { comparar, rangoDe } from '../mecanismo';
import { METODO_DEFECTO, type MetodoAnaliticas } from '../metodo';
import { HOY, azar, cubosDe, tendencia } from './generador';
import { panelDe, unaRmDe, type EscenarioPortada } from './atletas';

type Escenario = EscenarioPortada;

function proc(de: string, explica_es: string, ancla: Ancla): ProcedenciaPanel {
  return { de, explica_es, medida: ancla === 'medida', proveedor: null, ancla };
}

const FALTA_HISTORIA = (llevas: number, hacen: number) => ({ por: 'historia' as const, llevas, hacen });

/** Cuántas semanas de la ventana tiene el atleta, y desde cuándo (para las series semanales). */
function semanasDe(escenario: Escenario, ventana: Ventana) {
  const p = panelDe(escenario, ventana);
  const cubos = cubosDe({ ...p.ventana, paso: 'semana' });
  const desde = p.historia.desde;
  return { p, semanas: cubos.map((c) => c.t).filter((t) => desde == null || t >= desde || t === cubos[0]!.t), rango: p.ventana };
}

// ---------------------------------------------------------------------------
// CORRER
// ---------------------------------------------------------------------------

export interface MejorEsfuerzo {
  metros: number;
  segundos: number;
  fecha: string;
}

export interface DetalleCorrer {
  umbral: LecturaPanel;
  mejores: { hoy: MejorEsfuerzo[]; antes: MejorEsfuerzo[] };
  motor: LecturaPanel;
  desacople: LecturaPanel;
  velocidadCritica: LecturaPanel;
  deposito: LecturaPanel;
  vdot: LecturaPanel;
  /** Cumplimiento de las series pedidas en la ventana; null sin series con objetivo. */
  pedido: { dentro: number; menos: number; mas: number; sesiones: number } | null;
  volumen: LecturaPanel;
  /** Media de km por semana en la ventana, y en la anterior. */
  kmSemana: { actual: number; anterior: number | null };
}

const ESFUERZOS_BASE: Array<{ metros: number; s_km: number }> = [
  { metros: 400, s_km: 200 },
  { metros: 1000, s_km: 218 },
  { metros: 1609, s_km: 228 },
  { metros: 3000, s_km: 240 },
  { metros: 5000, s_km: 252 },
  { metros: 10000, s_km: 268 },
  { metros: 21097, s_km: 288 },
];

export function detalleCorrerDe(escenario: Escenario, ventana: Ventana, metodo: MetodoAnaliticas = METODO_DEFECTO): DetalleCorrer | null {
  if (escenario === 'vacio') return null;
  const { p, semanas, rango } = semanasDe(escenario, ventana);
  const fila = p.progreso.find((l) => l.familia === 'correr');
  if (!fila || fila.estado === 'sin_dato') return null;
  const rnd = azar(escenario === 'lleno' ? 401 : escenario === 'viejo' ? 403 : escenario === 'poco' ? 405 : 407);
  const umbralAhora = fila.dato!.valor;
  const ancla = fila.procedencia.ancla;
  const ultimo = fila.cobertura.ultimo_dato;
  const muestras = fila.cobertura.muestras;
  const poco = muestras < metodo.muestras_minimas || escenario === 'poco';
  const factor = umbralAhora / 252;
  const hoyEsf: MejorEsfuerzo[] = ESFUERZOS_BASE.filter((e) => !poco || e.metros <= 5000).map((e, i) => ({ metros: e.metros, segundos: Math.round((e.s_km * factor * e.metros) / 1000), fecha: escenario === 'viejo' ? '2026-07-22' : ['2026-09-22', '2026-09-22', '2026-09-12', '2026-09-12', '2026-09-12', '2026-05-16', '2026-04-19'][i]! }));
  const antesEsf: MejorEsfuerzo[] = escenario === 'poco' ? [] : ESFUERZOS_BASE.map((e) => ({ metros: e.metros, segundos: Math.round((e.s_km * factor * 1.035 * e.metros) / 1000), fecha: rango.anterior.hasta }));
  const cob = (m = muestras) => ({ muestras: m, dias_ventana: rango.dias, dias_con_dato: m, pct: null, estimada_pct: ancla === 'estimada' ? 100 : 0, ultimo_dato: ultimo });
  const motorAhora = Math.round(umbralAhora * 1.1);
  const motorAntes = Math.round(motorAhora * 1.03);
  const desac = Math.round((3.2 + rnd() * 2) * 10) / 10;
  const vc = Math.round((1000 / umbralAhora) * 0.985 * 100) / 100;
  const vdot = Math.round((60 - (umbralAhora - 210) * 0.12) * 10) / 10;
  const kmSemanaActual = escenario === 'poco' ? 18 : 42 * (escenario === 'viejo' ? 0.4 : 1);
  const km = tendencia({ semanas, desde: kmSemanaActual * 0.9, hasta: kmSemanaActual, semilla: 411, ruido: 6 });
  return {
    umbral: fila,
    mejores: { hoy: hoyEsf, antes: antesEsf },
    motor: poco
      ? sinDato({ id: 'correr.motor', bloque: 'progreso', familia: 'correr', titulo_es: 'Motor · ritmo al mismo pulso', falta: FALTA_HISTORIA(muestras, metodo.muestras_minimas), cobertura: cob(), procedencia: proc('motor_ef', 'El ritmo que llevas a un pulso de referencia (150 ppm) en rodajes.', ancla) })
      : medida({ id: 'correr.motor', bloque: 'progreso', familia: 'correr', titulo_es: 'Motor · ritmo al mismo pulso', dato: { valor: motorAhora, unidad: 's_km', comparacion: comparar({ actual: motorAhora, referencia: motorAntes, contra: 'periodo_anterior', umbral: metodo.umbrales_cambio.motor_s_km, etiqueta_es: 'vs periodo anterior · a 150 ppm' }) }, serie: serie('s_km', 'semana', tendencia({ semanas, desde: motorAntes, hasta: motorAhora, semilla: 421, ruido: 4 }).map((q) => ({ t: q.t, hecho: q.v }))), cobertura: cob(), procedencia: proc('motor_ef', 'El ritmo que llevas a 150 ppm en rodajes de más de 40 min.', 'medida') }),
    desacople: poco
      ? sinDato({ id: 'correr.desacople', bloque: 'progreso', familia: 'correr', titulo_es: 'Desacople en tiradas largas', falta: FALTA_HISTORIA(muestras, metodo.muestras_minimas), cobertura: cob(), procedencia: proc('desacople', 'Cuánto sube el pulso al mismo ritmo en la segunda mitad de una tirada.', 'medida') })
      : medida({ id: 'correr.desacople', bloque: 'progreso', familia: 'correr', titulo_es: 'Desacople en tiradas largas', dato: { valor: desac, unidad: 'pct', comparacion: comparar({ actual: desac, referencia: 5, contra: 'objetivo', umbral: 1, etiqueta_es: 'por debajo del 5 % = base aeróbica sólida' }) }, serie: null, cobertura: cob(), procedencia: proc('desacople', 'Cuánto sube el pulso al mismo ritmo en la segunda mitad de una tirada.', 'medida') }),
    velocidadCritica: poco
      ? sinDato({ id: 'correr.vc', bloque: 'progreso', familia: 'correr', titulo_es: 'Velocidad crítica', falta: FALTA_HISTORIA(1, metodo.cs_min_efforts), cobertura: cob(1), procedencia: proc('velocidad_critica', `Ajuste sobre ${metodo.cs_min_efforts} esfuerzos máximos de 2 a 15 min.`, 'medida') })
      : medida({ id: 'correr.vc', bloque: 'progreso', familia: 'correr', titulo_es: 'Velocidad crítica', dato: { valor: vc, unidad: 'm_s', comparacion: comparar({ actual: vc, referencia: vc - 0.06, contra: 'periodo_anterior', umbral: 0.05, etiqueta_es: 'vs periodo anterior' }) }, serie: null, cobertura: cob(4), procedencia: proc('velocidad_critica', `Ajuste sobre 4 esfuerzos máximos de 2 a 15 min (R² 0,97).`, 'medida') }),
    deposito: medida({ id: 'correr.dprima', bloque: 'progreso', familia: 'correr', titulo_es: 'Depósito por encima de la crítica', dato: { valor: 185, unidad: 'metros', comparacion: null }, serie: null, cobertura: cob(4), procedencia: proc('d_prima', 'Metros que puedes correr por encima de tu velocidad crítica antes de reventar.', 'medida') }),
    vdot: medida({ id: 'correr.vdot', bloque: 'progreso', familia: 'correr', titulo_es: 'VDOT', dato: { valor: vdot, unidad: 'ml_kg_min', comparacion: comparar({ actual: vdot, referencia: vdot - 1.2, contra: 'periodo_anterior', umbral: 1, etiqueta_es: 'vs periodo anterior · desde tu 5 km' }) }, serie: null, cobertura: cob(), procedencia: proc('vdot', 'La tabla de Daniels sobre tu mejor 5 km de la ventana.', ancla) }),
    pedido: escenario === 'poco' ? null : { dentro: 38, menos: 5, mas: 3, sesiones: Math.max(1, Math.round(muestras / 2)) },
    volumen: medida({ id: 'correr.volumen', bloque: 'semanas', familia: 'correr', titulo_es: 'Kilómetros por semana', dato: { valor: kmSemanaActual * 1000, unidad: 'metros', comparacion: null }, serie: serie('metros', 'semana', km.map((q, i) => ({ t: q.t, hecho: q.v == null ? null : Math.round(q.v * 1000), plan: escenario === 'viejo' && i > km.length - 4 ? Math.round(kmSemanaActual * 2500) : Math.round((q.v ?? kmSemanaActual) * 1000 * 1.05) }))), cobertura: cob(), procedencia: proc('volumen_km', 'Metros de cada sesión de correr; el plan, desde la prescripción.', 'medida') }),
    kmSemana: { actual: kmSemanaActual, anterior: escenario === 'poco' ? null : Math.round(kmSemanaActual * 0.93) },
  };
}

// ---------------------------------------------------------------------------
// ERGO — una pantalla, la máquina como variante
// ---------------------------------------------------------------------------

export type Maquina = 'remo' | 'ski' | 'bici';

export const MAQUINA_NOMBRE: Record<Maquina, string> = { remo: 'Remo', ski: 'SkiErg', bici: 'BikeErg' };

export interface PiezaErgo {
  pieza: string;
  /** Segundos de la pieza (o metros en las de tiempo). */
  valor: number | null;
  unidad: 'segundos' | 'metros';
  /** El split de esa pieza, /500 m (o /1000 m en la bici). */
  split: number | null;
  fecha: string | null;
  nuevo: boolean;
  anterior: number | null;
}

export interface DetalleErgo {
  maquina: Maquina;
  umbral: LecturaPanel;
  vatiosAlPulso: LecturaPanel;
  piezas: PiezaErgo[];
  volumen: LecturaPanel;
  cadencia: LecturaPanel;
  sesiones: number;
}

const PIEZAS_C2 = ['100 m', '500 m', '1000 m', '2000 m', '5000 m', '1 min', '4 min', '30 min'] as const;

export function detalleErgoDe(escenario: Escenario, ventana: Ventana, maquina: Maquina, metodo: MetodoAnaliticas = METODO_DEFECTO): DetalleErgo | null {
  if (escenario === 'vacio') return null;
  const { p, semanas, rango } = semanasDe(escenario, ventana);
  const fila = p.progreso.find((l) => l.familia === maquina);
  if (!fila) return null;
  const nunca = fila.estado === 'sin_dato' && fila.cobertura.falta?.por === 'ocasion';
  if (nunca) return null;
  const rnd = azar(511 + (maquina === 'remo' ? 1 : maquina === 'ski' ? 2 : 3) + (escenario === 'viejo' ? 10 : 0));
  const ancla = fila.procedencia.ancla;
  const ultimo = fila.cobertura.ultimo_dato;
  const muestras = fila.cobertura.muestras;
  const poco = fila.estado === 'sin_dato' || muestras < metodo.muestras_minimas;
  const cob = (m = muestras) => ({ muestras: m, dias_ventana: rango.dias, dias_con_dato: m, pct: null, estimada_pct: ancla === 'estimada' ? 100 : 0, ultimo_dato: ultimo });
  // El split de 2000 m (remo) o 1000 m (ski) en s/500; la bici, /1000.
  const split = fila.dato?.valor ?? (maquina === 'bici' ? 122 : 112);
  // Vatios desde el split (fórmula de Concept2: W = 2,8 / (s/500 m)³ × 1000³... simplificada al pace).
  const vatiosDe = (s500: number) => Math.round(2.8 / Math.pow(s500 / 500, 3));
  const umbralW = maquina === 'bici' ? vatiosDe(split / 2) : vatiosDe(split);
  const anteriorW = Math.round(umbralW * 0.97);
  const div = maquina === 'bici' ? 2 : 1;
  const piezas: PiezaErgo[] = PIEZAS_C2.map((pieza, i) => {
    const porTiempo = pieza.endsWith('min');
    const hecha = poco ? i === 1 || i === 3 : rnd() > (i === 7 ? 0.65 : 0.22);
    if (!hecha) return { pieza, valor: null, unidad: porTiempo ? 'metros' : 'segundos', split: null, fecha: null, nuevo: false, anterior: null };
    const factorPieza = [0.86, 0.93, 0.965, 1, 1.05, 0.9, 0.98, 1.08][i]!;
    const s500 = Math.round(split * factorPieza * 10) / 10;
    const metros = porTiempo ? Math.round((Number(pieza.split(' ')[0]) * 60 * 500) / s500) : Number(pieza.split(' ')[0]);
    const segundos = porTiempo ? null : Math.round((metros / 500) * s500 * 10) / 10;
    const fecha = escenario === 'viejo' ? ['2026-06-30', '2026-07-14', '2026-08-20', '2026-06-30', '2026-05-02', '2026-07-14', '2026-08-20', '2026-04-11'][i]! : ['2026-09-20', '2026-09-06', '2026-09-12', '2026-06-21', '2026-08-02', '2026-09-06', '2026-08-30', '2026-05-24'][i]!;
    const nuevo = fecha >= rango.desde;
    return { pieza, valor: porTiempo ? metros : segundos, unidad: porTiempo ? 'metros' : 'segundos', split: Math.round((s500 / div) * 10) / 10, fecha, nuevo, anterior: nuevo && rnd() > 0.3 ? (porTiempo ? metros - 40 : Math.round((segundos! * 1.02) * 10) / 10) : null };
  });
  const vatiosPulso = Math.round(umbralW * 0.82);
  return {
    maquina,
    umbral: poco
      ? sinDato({ id: `ergo.umbral.${maquina}`, bloque: 'progreso', familia: maquina, titulo_es: 'Umbral de potencia', falta: fila.cobertura.falta ?? FALTA_HISTORIA(muestras, metodo.muestras_minimas), cobertura: cob(), procedencia: proc('umbral_potencia', 'Vatios de tu test de 2000 m (o 20 min), o los que declaras.', ancla) })
      : medida({ id: `ergo.umbral.${maquina}`, bloque: 'progreso', familia: maquina, titulo_es: 'Umbral de potencia', dato: { valor: umbralW, unidad: 'w', comparacion: comparar({ actual: umbralW, referencia: anteriorW, contra: 'periodo_anterior', umbral: metodo.umbrales_cambio.vatios_umbral_w, etiqueta_es: 'vs periodo anterior' }) }, serie: serie('w', 'semana', tendencia({ semanas, desde: anteriorW, hasta: umbralW, semilla: 531, ruido: 5, huecos: 0.15 }).map((q) => ({ t: q.t, hecho: q.v == null ? null : Math.round(q.v) }))), cobertura: cob(), procedencia: proc('umbral_potencia', ancla === 'medida' ? `Tu test de ${maquina === 'ski' ? '1000' : '2000'} m (${ultimo ?? ''}).` : 'Lo declaraste tú; con un test pasa a medido.', ancla) }),
    vatiosAlPulso: poco
      ? sinDato({ id: `ergo.vatios_pulso.${maquina}`, bloque: 'progreso', familia: maquina, titulo_es: 'Vatios al mismo pulso', falta: FALTA_HISTORIA(muestras, metodo.muestras_minimas), cobertura: cob(), procedencia: proc('vatios_pulso', 'Los vatios que sostienes a 150 ppm en piezas continuas.', 'medida') })
      : medida({ id: `ergo.vatios_pulso.${maquina}`, bloque: 'progreso', familia: maquina, titulo_es: 'Vatios al mismo pulso', dato: { valor: vatiosPulso, unidad: 'w', comparacion: comparar({ actual: vatiosPulso, referencia: Math.round(vatiosPulso * 0.96), contra: 'periodo_anterior', umbral: metodo.umbrales_cambio.vatios_umbral_w, etiqueta_es: 'vs periodo anterior · a 150 ppm' }) }, serie: serie('w', 'semana', tendencia({ semanas, desde: vatiosPulso * 0.96, hasta: vatiosPulso, semilla: 541, ruido: 6, huecos: 0.2 }).map((q) => ({ t: q.t, hecho: q.v == null ? null : Math.round(q.v) }))), cobertura: cob(), procedencia: proc('vatios_pulso', 'Los vatios que sostienes a 150 ppm en piezas continuas de más de 10 min.', 'medida') }),
    piezas,
    volumen: medida({ id: `ergo.volumen.${maquina}`, bloque: 'semanas', familia: maquina, titulo_es: 'Metros por semana', dato: { valor: 9000, unidad: 'metros', comparacion: null }, serie: serie('metros', 'semana', tendencia({ semanas, desde: 7000, hasta: 10000, semilla: 551, ruido: 2500, huecos: poco ? 0.6 : 0.15 }).map((q) => ({ t: q.t, hecho: q.v == null ? null : Math.round(q.v / 100) * 100, plan: Math.round(((q.v ?? 9000) * 1.06) / 100) * 100 }))), cobertura: cob(), procedencia: proc('volumen_m', 'Metros de cada pieza; el plan, desde la prescripción.', 'medida') }),
    cadencia: medida({ id: `ergo.cadencia.${maquina}`, bloque: 'progreso', familia: maquina, titulo_es: maquina === 'bici' ? 'Cadencia en piezas' : 'Paladas por minuto en piezas', dato: { valor: maquina === 'bici' ? 92 : maquina === 'ski' ? 42 : 30, unidad: maquina === 'bici' ? 'rpm' : 'spm', comparacion: null }, serie: null, cobertura: cob(), procedencia: proc('cadencia', 'Media de las piezas de trabajo de la ventana.', 'medida') }),
    sesiones: muestras,
  };
}

// ---------------------------------------------------------------------------
// FUERZA
// ---------------------------------------------------------------------------

export interface EjercicioFuerza {
  nombre: string;
  patron: string;
  rm: LecturaPanel;
  /** Mejor carga por número de reps (1 · 3 · 5 · 8 · 10), con su fecha; null si nunca hizo esa serie. */
  mejoresPorReps: Array<{ reps: number; kg: number | null; fecha: string | null; nuevo: boolean }>;
}

export interface DetalleFuerza {
  ejercicios: EjercicioFuerza[];
  tonelaje: LecturaPanel;
  seriesSemana: LecturaPanel;
  patrones: Array<{ patron: string; series: number; tonelaje_kg: number; seriesAnterior: number | null }>;
  rir: { dentro: number; mas: number; menos: number; series: number } | null;
  sesiones: number;
}

const EJERCICIOS: Array<{ nombre: string; patron: string; factor: number; reps: number }> = [
  { nombre: 'Sentadilla', patron: 'Sentadilla', factor: 1, reps: 5 },
  { nombre: 'Peso muerto', patron: 'Bisagra', factor: 1.25, reps: 3 },
  { nombre: 'Press banca', patron: 'Empuje', factor: 0.68, reps: 5 },
  { nombre: 'Press militar', patron: 'Empuje', factor: 0.45, reps: 8 },
  { nombre: 'Remo con barra', patron: 'Tracción', factor: 0.62, reps: 8 },
];

export function detalleFuerzaDe(escenario: Escenario, ventana: Ventana, metodo: MetodoAnaliticas = METODO_DEFECTO): DetalleFuerza | null {
  if (escenario === 'vacio') return null;
  const { p, semanas, rango } = semanasDe(escenario, ventana);
  const fila = p.progreso.find((l) => l.familia === 'fuerza');
  if (!fila || fila.estado === 'sin_dato') return null;
  const rnd = azar(escenario === 'viejo' ? 613 : escenario === 'poco' ? 617 : 611);
  const base = fila.dato!.valor;
  const ultimo = fila.cobertura.ultimo_dato;
  const muestras = fila.cobertura.muestras;
  const poco = escenario === 'poco' || muestras < metodo.muestras_minimas;
  const cob = (m = muestras) => ({ muestras: m, dias_ventana: rango.dias, dias_con_dato: m, pct: null, estimada_pct: 0, ultimo_dato: ultimo });
  const ejercicios: EjercicioFuerza[] = EJERCICIOS.filter((e) => !poco || e.nombre === 'Sentadilla' || e.nombre === 'Press banca').map((e, i) => {
    const rmAhora = Math.round(base * e.factor * 2) / 2;
    const rmAntes = Math.round(rmAhora * 0.95 * 2) / 2;
    const fecha = escenario === 'viejo' ? '2026-08-28' : ['2026-09-20', '2026-06-30', '2026-09-08', '2026-09-15', '2026-09-22'][i]!;
    const kgSerie = Math.round((rmAhora / (1 + e.reps / 30)) * 2) / 2;
    return {
      nombre: e.nombre,
      patron: e.patron,
      rm: medida({
        id: `fuerza.rm.${e.nombre}`,
        bloque: 'progreso',
        familia: 'fuerza',
        titulo_es: `${e.nombre} · 1RM est.`,
        dato: { valor: unaRmDe(kgSerie, e.reps, metodo), unidad: 'kg', comparacion: poco ? null : comparar({ actual: rmAhora, referencia: rmAntes, contra: 'periodo_anterior', umbral: metodo.umbrales_cambio.rm_kg, etiqueta_es: 'vs periodo anterior' }) },
        serie: serie('kg', 'semana', tendencia({ semanas, desde: rmAntes, hasta: rmAhora, semilla: 621 + i, ruido: 3, huecos: 0.3 }).map((q) => ({ t: q.t, hecho: q.v == null ? null : Math.round(q.v * 2) / 2 }))),
        cobertura: cob(),
        procedencia: proc('rm_estimado', `${e.reps} × ${kgSerie} kg el ${fecha}, con la fórmula de ${metodo.formula_1rm === 'epley' ? 'Epley' : 'Brzycki'} (la de tu coach).`, 'declarada'),
      }),
      mejoresPorReps: [1, 3, 5, 8, 10].map((reps) => {
        const hecha = reps === e.reps || rnd() > 0.45;
        if (!hecha) return { reps, kg: null, fecha: null, nuevo: false };
        const kg = Math.round((rmAhora / (1 + reps / 30)) * (reps === e.reps ? 1 : 0.98) * 2) / 2;
        const f = reps === e.reps ? fecha : escenario === 'viejo' ? '2026-07-10' : rnd() > 0.5 ? '2026-08-19' : '2026-06-03';
        return { reps, kg, fecha: f, nuevo: f >= rango.desde };
      }),
    };
  });
  const tonBase = escenario === 'poco' ? 6000 : 11500;
  const ton = tendencia({ semanas, desde: tonBase * 0.9, hasta: tonBase, semilla: 631, ruido: 1800, huecos: escenario === 'viejo' ? 0 : 0.1 }).map((q) => ({ t: q.t, hecho: escenario === 'viejo' && q.t > '2026-09-06' ? null : q.v == null ? null : Math.round(q.v / 50) * 50, plan: Math.round((tonBase * 1.03) / 50) * 50 }));
  const ser = tendencia({ semanas, desde: 40, hasta: 46, semilla: 641, ruido: 8 }).map((q) => ({ t: q.t, hecho: escenario === 'viejo' && q.t > '2026-09-06' ? null : q.v == null ? null : Math.round(q.v), plan: 48 }));
  return {
    ejercicios,
    tonelaje: medida({ id: 'fuerza.tonelaje', bloque: 'semanas', familia: 'fuerza', titulo_es: 'Tonelaje por semana', dato: { valor: tonBase, unidad: 'kg', comparacion: comparar({ actual: tonBase, referencia: tonBase * 0.92, contra: 'periodo_anterior', umbral: 500, etiqueta_es: 'vs periodo anterior' }) }, serie: serie('kg', 'semana', ton), cobertura: cob(), procedencia: proc('tonelaje', 'Σ reps × kg de las series hechas; el plan, desde la prescripción.', 'declarada') }),
    seriesSemana: medida({ id: 'fuerza.series', bloque: 'semanas', familia: 'fuerza', titulo_es: 'Series por semana', dato: { valor: 46, unidad: 'reps', comparacion: null }, serie: serie('reps', 'semana', ser), cobertura: cob(), procedencia: proc('series', 'Series de trabajo hechas; el plan, desde la prescripción.', 'medida') }),
    patrones: [
      { patron: 'Sentadilla', series: 14, tonelaje_kg: 4200, seriesAnterior: 12 },
      { patron: 'Bisagra', series: 10, tonelaje_kg: 3600, seriesAnterior: 10 },
      { patron: 'Empuje', series: 12, tonelaje_kg: 2100, seriesAnterior: 14 },
      { patron: 'Tracción', series: 8, tonelaje_kg: 1400, seriesAnterior: 8 },
      { patron: 'Acarreo', series: 4, tonelaje_kg: 0, seriesAnterior: 2 },
    ].filter((x) => !poco || x.patron === 'Sentadilla' || x.patron === 'Empuje'),
    rir: poco ? null : { dentro: 61, mas: 9, menos: 12, series: 82 },
    sesiones: muestras,
  };
}

// ---------------------------------------------------------------------------
// ESTACIONES Y WOD
// ---------------------------------------------------------------------------

export interface MejorEstacion {
  estacion: TramoCarrera;
  dosis_es: string;
  carga_es: string | null;
  mejor_s: number | null;
  fecha: string | null;
  anterior_s: number | null;
  nuevo: boolean;
  ancla: Ancla;
}

export interface DetalleEstaciones {
  estaciones: MejorEstacion[];
  wods: Array<{ id: string; nombre_es: string; unidad: 'segundos' | 'reps'; serie: PuntoSerie[]; ultimo: { valor: number; fecha: string } | null; mejor: number | null }>;
  /** Los parciales de la última carrera oficial: null si no la hay. */
  oficial: { nombre_es: string; fecha: string; total_s: number; tramos: Array<{ tramo: TramoCarrera; s: number }> } | null;
  sesiones: number;
}

const ESTACIONES: Array<{ estacion: TramoCarrera; dosis: string; carga: string | null; base: number }> = [
  { estacion: 'ski', dosis: '1000 m', carga: null, base: 236 },
  { estacion: 'sled_push', dosis: '50 m', carga: '152 kg', base: 184 },
  { estacion: 'sled_pull', dosis: '50 m', carga: '103 kg', base: 226 },
  { estacion: 'burpee_broad_jump', dosis: '80 m', carga: null, base: 262 },
  { estacion: 'row', dosis: '1000 m', carga: null, base: 244 },
  { estacion: 'farmers', dosis: '200 m', carga: '2 × 24 kg', base: 118 },
  { estacion: 'lunges', dosis: '100 m', carga: '20 kg', base: 258 },
  { estacion: 'wall_balls', dosis: '100 reps', carga: '6 kg', base: 318 },
];

export function detalleEstacionesDe(escenario: Escenario, ventana: Ventana): DetalleEstaciones | null {
  if (escenario === 'vacio') return null;
  const { p, semanas, rango } = semanasDe(escenario, ventana);
  const fila = p.progreso.find((l) => l.familia === 'estaciones');
  const filaWod = p.progreso.find((l) => l.familia === 'wod');
  if (!fila || fila.estado === 'sin_dato') return null;
  const rnd = azar(escenario === 'viejo' ? 713 : escenario === 'mixto' ? 715 : 711);
  const muestras = fila.cobertura.muestras;
  const factor = fila.dato!.valor / 72;
  const estaciones: MejorEstacion[] = ESTACIONES.map((e, i) => {
    const hecha = escenario === 'mixto' ? i === 1 || i === 5 || i === 0 : true;
    if (!hecha) return { estacion: e.estacion, dosis_es: e.dosis, carga_es: e.carga, mejor_s: null, fecha: null, anterior_s: null, nuevo: false, ancla: 'poblacional' };
    const mejor = Math.round(e.base * factor * (0.97 + rnd() * 0.06));
    const fecha = escenario === 'viejo' ? '2026-08-14' : ['2026-09-12', '2026-09-18', '2026-09-19', '2026-09-19', '2026-06-21', '2026-09-19', '2026-09-19', '2026-06-14'][i]!;
    return { estacion: e.estacion, dosis_es: e.dosis, carga_es: e.carga, mejor_s: mejor, fecha, anterior_s: rnd() > 0.35 ? Math.round(mejor * 1.06) : null, nuevo: fecha >= rango.desde, ancla: fila.procedencia.ancla === 'estimada' ? 'estimada' : i === 2 || i === 6 ? 'estimada' : 'medida' };
  });
  const simulacion = filaWod && filaWod.estado === 'medida' ? filaWod : null;
  const wods: DetalleEstaciones['wods'] = [];
  if (simulacion) {
    wods.push({ id: 'simulacion', nombre_es: 'Simulación HYROX completa', unidad: 'segundos', serie: simulacion.serie?.hecho ?? [], ultimo: { valor: simulacion.dato!.valor, fecha: simulacion.cobertura.ultimo_dato ?? HOY }, mejor: simulacion.dato!.valor });
    const media = tendencia({ semanas, desde: 1860, hasta: 1700, semilla: 731, ruido: 60, huecos: 0.6 });
    wods.push({ id: 'media', nombre_es: 'Media simulación · 4 carreras + 4 estaciones', unidad: 'segundos', serie: media.map((q) => ({ t: q.t, v: q.v == null ? null : Math.round(q.v) })), ultimo: { valor: 1700, fecha: '2026-09-05' }, mejor: 1700 });
    wods.push({ id: 'amrap', nombre_es: 'AMRAP 12′ del coach · rondas + reps', unidad: 'reps', serie: tendencia({ semanas, desde: 118, hasta: 131, semilla: 741, ruido: 6, huecos: 0.55 }).map((q) => ({ t: q.t, v: q.v == null ? null : Math.round(q.v) })), ultimo: { valor: 131, fecha: '2026-09-26' }, mejor: 131 });
  }
  const oficial =
    escenario === 'lleno'
      ? {
          nombre_es: 'HYROX Barcelona',
          fecha: '2026-03-14',
          total_s: 4713,
          tramos: [
            { tramo: 'run1' as const, s: 279 }, { tramo: 'ski' as const, s: 246 }, { tramo: 'run2' as const, s: 286 }, { tramo: 'sled_push' as const, s: 198 },
            { tramo: 'run3' as const, s: 294 }, { tramo: 'sled_pull' as const, s: 241 }, { tramo: 'run4' as const, s: 299 }, { tramo: 'burpee_broad_jump' as const, s: 276 },
            { tramo: 'run5' as const, s: 305 }, { tramo: 'row' as const, s: 252 }, { tramo: 'run6' as const, s: 309 }, { tramo: 'farmers' as const, s: 124 },
            { tramo: 'run7' as const, s: 316 }, { tramo: 'lunges' as const, s: 274 }, { tramo: 'run8' as const, s: 308 }, { tramo: 'wall_balls' as const, s: 334 }, { tramo: 'roxzone' as const, s: 372 },
          ],
        }
      : null;
  return { estaciones, wods, oficial, sesiones: muestras };
}

export { rangoDe };
export type { Familia };
