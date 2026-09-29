// LAS SESIONES DEL CUMPLIMIENTO, ESCRITAS — cómo se nombra el estado de una
// sesión del plan, contra qué se comparó, y cómo se lee un tramo (su nombre, lo
// pedido, lo hecho, su veredicto y su carga). Solo se escribe lo que los dos
// detalles del servidor ya dijeron (`./detalle`): aquí no se juzga nada.
//
// Puro.

import type { Familia } from '@fahybrid/shared/domain/analytics/lectura';
import { reloj, ritmo500, ritmoKm } from '@/lib/formato';
import { formatear, type UnidadPintable } from './formato';
import type { ComprobacionConsumo, EstadoSesionConsumo, FilaSesionConsumo, FilaTramoConsumo, TramoSesionConsumo, VeredictoTramo } from './detalle';

export const ESTADO_SESION: Record<EstadoSesionConsumo, string> = {
  cumplida: 'dentro',
  desviada: 'desviada',
  fuera: 'fuera de lo pedido',
  no_hecha: 'no hecha',
  hecha_sin_medida: 'hecha, sin medida',
  pendiente: 'pendiente',
  excluida: 'fuera del cómputo',
};

export const VEREDICTO_TRAMO: Record<VeredictoTramo, string> = {
  dentro: 'dentro',
  por_encima: 'más de lo pedido',
  por_debajo: 'menos de lo pedido',
  sin_dato: 'sin dato',
};

/** Por qué un tramo no tiene veredicto, corto (el vocabulario del motor de cumplimiento). */
export const MOTIVO_TRAMO: Record<string, string> = {
  sin_ancla: 'sin umbral',
  sin_medida: 'sin medir',
  sin_anotar: 'sin anotar',
  pendiente: 'cuesta arriba',
  sin_1rm: 'sin 1RM',
  relativo: 'relativo',
  sin_objetivo: 'sin plan',
};

const BASE_NOMBRE: Record<string, string> = { carga: 'carga', duracion: 'duración', distancia: 'distancia' };

/** Una cifra en la unidad de la base de una sesión: la carga entera, la duración en reloj, la distancia en km. */
export function cifraBase(v: number | null, unidad: string | null): string {
  if (v == null) return 'sin dato';
  return unidad ? formatear(v, unidad as UnidadPintable) : String(Math.round(v));
}

/** «dentro · carga 95 de 97», «no hecha», «desviada · duración 42:10 de 50:00». */
export function detalleSesion(s: FilaSesionConsumo): string | null {
  if (s.base == null || s.plan == null) return null;
  const nombre = BASE_NOMBRE[s.base] ?? s.base;
  if (!s.hecha || s.hecho == null) return `${nombre} planificada ${cifraBase(s.plan, s.unidad)}`;
  return `${nombre} ${cifraBase(s.hecho, s.unidad)} de ${cifraBase(s.plan, s.unidad)}${s.plan_minimo ? ' (mínimo)' : ''}`;
}

/** La familia que más pesa en una sesión (la de la mayoría de sus líneas de trabajo). */
export function familiaDeSesion(s: FilaSesionConsumo): Familia | null {
  const cuenta = new Map<Familia, number>();
  for (const l of s.lineas) if (l.rol === 'principal') cuenta.set(l.familia, (cuenta.get(l.familia) ?? 0) + l.tramos.length + 1);
  if (cuenta.size === 0) for (const l of s.lineas) cuenta.set(l.familia, (cuenta.get(l.familia) ?? 0) + 1);
  let mejor: Familia | null = null;
  for (const [f, n] of cuenta) if (mejor == null || n > (cuenta.get(mejor) ?? 0)) mejor = f;
  return mejor;
}

// ---------------------------------------------------------------------------
// Un tramo
// ---------------------------------------------------------------------------

export interface TramoLeido {
  id: string;
  n: number;
  nombre: string;
  trabajo: boolean;
  pedido: string | null;
  hecho: string | null;
  veredicto: VeredictoTramo | null;
  /** Por qué no hay veredicto, cuando no lo hay. */
  motivo: string | null;
  carga: { tss: number | null; peldano: string | null } | null;
}

const PELDANO_NOMBRE: Record<string, string> = { potencia: 'según vatios', ritmo: 'según ritmo', pulso: 'según pulso', esfuerzo: 'según esfuerzo', zona: 'según zona' };

/** Una comprobación, en palabras: «3:45–3:55/km», «Z1–Z2», «RIR 2». */
function objetivoEscrito(c: ComprobacionConsumo): string | null {
  const o = c.objetivo;
  if (!o) return null;
  if (o.zona) return o.zona.desde === o.zona.hasta ? `Z${o.zona.desde}` : `Z${o.zona.desde}–Z${o.zona.hasta}`;
  const u = (c.unidad ?? 'puntos') as UnidadPintable;
  const esc = (v: number) => (u === 's_km' ? reloj(v) : u === 's_500m' ? reloj(v) : formatear(v, u));
  const sufijo = u === 's_km' ? '/km' : u === 's_500m' ? '/500m' : '';
  if (o.min != null && o.max != null) return o.min === o.max ? `${esc(o.min)}${sufijo}` : `${esc(o.min)}–${esc(o.max)}${sufijo}`;
  if (o.min != null) return `desde ${esc(o.min)}${sufijo}`;
  if (o.max != null) return `hasta ${esc(o.max)}${sufijo}`;
  return null;
}

/** Lo hecho de un tramo, con lo que midió el aparato: «3:49/km · 163 ppm · 178 pasos/min». */
function hechoEscrito(h: NonNullable<TramoSesionConsumo['hecho']>): string | null {
  const trozos: string[] = [];
  if (h.avg_pace_s_per_km != null) trozos.push(ritmoKm(h.avg_pace_s_per_km));
  else if (h.avg_pace_s_per_500m != null) trozos.push(ritmo500(h.avg_pace_s_per_500m));
  else if (h.duration_seconds != null) trozos.push(reloj(h.duration_seconds));
  if (h.avg_power_w != null) trozos.push(`${Math.round(h.avg_power_w)} W`);
  if (h.reps_completed != null) trozos.push(`${h.reps_completed} reps`);
  if (h.weight_used_kg != null) trozos.push(formatear(h.weight_used_kg, 'kg'));
  if (h.avg_hr != null) trozos.push(`${Math.round(h.avg_hr)} ppm`);
  if (h.run_cadence_spm != null) trozos.push(`${Math.round(h.run_cadence_spm)} pasos/min`);
  return trozos.length > 0 ? trozos.join(' · ') : null;
}

/** El nombre de un tramo: «Calentamiento», «Serie 2 de 4», «Recuperación», «Vuelta a la calma», o el ejercicio. */
function nombreTramo(t: FilaTramoConsumo | null, s: TramoSesionConsumo | null, total: number): string {
  const fase = t?.fase ?? (s?.fase === 'warmup' ? 'calentamiento' : s?.fase === 'cooldown' ? 'vuelta' : 'principal');
  const papel = t?.papel ?? (s?.papel === 'recovery' ? 'recuperacion' : 'trabajo');
  if (fase === 'calentamiento') return 'Calentamiento';
  if (fase === 'vuelta') return 'Vuelta a la calma';
  if (papel === 'recuperacion') return 'Recuperación';
  const ejercicio = s?.ejercicio_es ?? null;
  if (t?.ordinal != null && total > 1) return `${ejercicio ? `${ejercicio} · ` : ''}Serie ${t.ordinal} de ${total}`;
  return ejercicio ?? 'Trabajo';
}

/**
 * Los tramos de una sesión, cruzando los dos detalles por el id del tramo
 * ejecutado: del de sesión, lo pedido (su texto), lo hecho (lo que midió el
 * aparato) y la carga con su peldaño; del de cumplimiento, el veredicto contra
 * su banda. Cualquiera de los dos puede faltar: se pinta lo que hay.
 */
export function tramosLeidos(cumplimiento: FilaSesionConsumo | null, sesion: { tramos: TramoSesionConsumo[] } | null): TramoLeido[] {
  const filas = new Map<string, FilaTramoConsumo>();
  const totalPorLinea = new Map<string, number>();
  for (const l of cumplimiento?.lineas ?? []) {
    const trabajo = l.tramos.filter((t) => t.papel === 'trabajo' && t.fase === 'principal').length;
    for (const t of l.tramos) {
      filas.set(t.segment_execution_id, t);
      totalPorLinea.set(t.segment_execution_id, trabajo);
    }
  }
  if (sesion && sesion.tramos.length > 0) {
    return [...sesion.tramos]
      .sort((a, b) => a.posicion - b.posicion)
      .map((s, i) => {
        const t = filas.get(s.id) ?? null;
        const pedidoCumplimiento = t ? t.comprobaciones.map(objetivoEscrito).filter(Boolean).join(' a ') : '';
        return {
          id: s.id,
          n: i + 1,
          nombre: nombreTramo(t, s, totalPorLinea.get(s.id) ?? 0),
          trabajo: (t?.papel ?? (s.papel === 'recovery' ? 'recuperacion' : 'trabajo')) === 'trabajo',
          pedido: s.prescrito?.texto_es ?? (pedidoCumplimiento || null),
          hecho: s.hecho ? hechoEscrito(s.hecho) : null,
          veredicto: t?.veredicto ?? null,
          motivo: t?.motivo ? (MOTIVO_TRAMO[t.motivo] ?? null) : null,
          carga: s.carga ? { tss: s.carga.tss, peldano: s.carga.peldano ? (PELDANO_NOMBRE[s.carga.peldano] ?? s.carga.peldano) : null } : null,
        };
      });
  }
  // Solo el cumplimiento: los tramos en el orden de sus líneas, con lo pedido de sus bandas.
  const out: TramoLeido[] = [];
  for (const l of cumplimiento?.lineas ?? []) {
    for (const t of [...l.tramos].sort((a, b) => a.posicion - b.posicion)) {
      out.push({
        id: t.segment_execution_id,
        n: out.length + 1,
        nombre: nombreTramo(t, null, totalPorLinea.get(t.segment_execution_id) ?? 0),
        trabajo: t.papel === 'trabajo',
        pedido: t.comprobaciones.map(objetivoEscrito).filter(Boolean).join(' a ') || null,
        hecho: t.comprobaciones.filter((c) => c.hecho != null).map((c) => formatear(c.hecho!, (c.unidad ?? 'puntos') as UnidadPintable)).join(' · ') || null,
        veredicto: t.veredicto,
        motivo: t.motivo ? (MOTIVO_TRAMO[t.motivo] ?? null) : null,
        carga: null,
      });
    }
  }
  return out;
}

/** «3 de 4 series dentro de lo pedido» — el resumen de los tramos de trabajo que el motor juzgó. */
export function resumenTramos(s: FilaSesionConsumo): string | null {
  const t = s.tramos;
  if (!t || t.evaluables === 0) return null;
  const fuera: string[] = [];
  if (t.por_encima > 0) fuera.push(`${t.por_encima} por encima`);
  if (t.por_debajo > 0) fuera.push(`${t.por_debajo} por debajo`);
  if (t.sin_ejecutar > 0) fuera.push(`${t.sin_ejecutar} sin hacer`);
  return `${t.dentro} de ${t.evaluables} ${t.evaluables === 1 ? 'tramo' : 'tramos'} de trabajo dentro de lo pedido${fuera.length ? ` · ${fuera.join(' · ')}` : ''}.`;
}
