// v2 · FICHA DEL ATLETA — tipos del cliente y el resolutor de URL (puro, sin BD).
//
// La ficha es un COCKPIT con tres pestañas (DECISIONS 2026-09-23, informe C §4):
//   Plan (por defecto)  — por qué está marcado, su estado y el calendario editable
//   Rendimiento         — un solo scroll ordenado por la pregunta del coach
//   Perfil              — datos, clasificación, días, lesiones, 1:1, pagos y UNA
//                         línea de tiempo
// Los cargadores con BD viven en ./atleta-detalle.ts y ./ficha-*.ts; este módulo lo
// importan tanto el servidor como los componentes de cliente.

import type { MessageDTO } from '@/lib/chat/schema';
import type {
  AthleteLifecycleStatus,
  PauseReason,
} from '@fahybrid/shared/domain/coach/athlete-lifecycle';
import type { AthleteStatus } from '@fahybrid/shared/domain/coach/athlete-state';
import type { AthleteWeekState } from '@fahybrid/shared/schema/week-publishing';
import type { WeekdayKey } from '@fahybrid/shared/domain/coach/intake-availability';
import type { AthleteReviewState } from '@/lib/citas/reviews';
import type { AthleteBilling, AthleteInvoice } from '@/lib/coach/billing';
import type { SessionReportView } from '@/lib/coach/session-reports';
import type { IntakePlanMode } from '@fahybrid/shared/schema/coach-intake';
import type { AthleteKeyMarker } from '@/lib/coach/key-markers';
import type { PeekDay } from '@/lib/coach/athlete-peek';

export type { AthleteReviewState, MessageDTO, AthleteKeyMarker, AthleteWeekState };

/** Un valor que no se sabe: «—» atenuado, nunca un número inventado. */
export const EM_DASH = '—';

// ── URL ──────────────────────────────────────────────────────────────────────

export const FICHA_TABS = ['plan', 'rendimiento', 'perfil'] as const;
export type FichaTab = (typeof FICHA_TABS)[number];

/** Zoom del calendario: una semana, tres (por defecto) o el plan entero. */
export const CAL_ZOOMS = ['semana', '3sem', 'plan'] as const;
export type CalZoom = (typeof CAL_ZOOMS)[number];
export const DEFAULT_CAL_ZOOM: CalZoom = '3sem';

/** Secciones de Rendimiento, en el orden de la pregunta del coach. */
export const RENDIMIENTO_SECCIONES = ['zonas', 'running', 'fuerza', 'fisiologia', 'carreras'] as const;
export type RendimientoSeccion = (typeof RENDIMIENTO_SECCIONES)[number];

export const PERFIL_SECCIONES = ['datos', 'lesiones', 'revisiones', 'pagos', 'historial'] as const;
export type PerfilSeccion = (typeof PERFIL_SECCIONES)[number];

export type FichaSeccion = RendimientoSeccion | PerfilSeccion;

/** Filtros de la línea de tiempo de Perfil. */
export const TIMELINE_KINDS = [
  'mensaje',
  'comunicado',
  'checkin',
  'revision',
  'test',
  'lesion',
  'plan',
] as const;
export type TimelineKind = (typeof TIMELINE_KINDS)[number];

export interface FichaUrl {
  tab: FichaTab;
  seccion: FichaSeccion | null;
  /** Abrir la conversación al cargar (enlaces viejos `?tab=mensajes`). */
  chat: boolean;
  /** `?comunicado=nuevo` (el «+ Nuevo» del shell): abrir el compositor. */
  comunicado: boolean;
  /** `?sesion=<assignment_id>`: abrir ese entreno en el panel. */
  sesion: string | null;
  zoom: CalZoom;
  /** Filtro inicial de la línea de tiempo (enlaces viejos a «Del coach»). */
  historial: TimelineKind | null;
  /** La URL venía en el formato viejo: el servidor redirige a la canónica. */
  legacy: boolean;
}

// Pestañas y vistas del mapa viejo (5 pestañas → 12 hojas) y adónde van ahora.
const OLD_TAB: Record<string, { tab: FichaTab; seccion?: FichaSeccion; chat?: true; historial?: TimelineKind }> = {
  resumen: { tab: 'plan' },
  mensajes: { tab: 'plan', chat: true },
  'del-coach': { tab: 'perfil', seccion: 'historial', historial: 'comunicado' },
  atleta: { tab: 'perfil', seccion: 'datos' },
  // Pestañas aún más viejas (antes de 2026-08-13).
  perfil: { tab: 'perfil', seccion: 'datos' },
  sesiones: { tab: 'perfil', seccion: 'revisiones' },
  pagos: { tab: 'perfil', seccion: 'pagos' },
  ritmos: { tab: 'rendimiento', seccion: 'zonas' },
  carreras: { tab: 'rendimiento', seccion: 'carreras' },
  historico: { tab: 'rendimiento', seccion: 'fuerza' },
  biometria: { tab: 'rendimiento', seccion: 'fisiologia' },
  correr: { tab: 'rendimiento', seccion: 'running' },
};

// `?vista=` de Rendimiento (anclas y capas) y de Atleta (subsecciones).
const OLD_VISTA: Record<string, FichaSeccion> = {
  carrera: 'running',
  aterrizaje: 'running',
  correr: 'running',
  'en-zonas': 'running',
  zonas: 'running',
  diagnostico: 'running',
  ritmos: 'zonas',
  carreras: 'carreras',
  fuerza: 'fuerza',
  historico: 'fuerza',
  cuerpo: 'fisiologia',
  biometria: 'fisiologia',
  perfil: 'datos',
  sesiones: 'revisiones',
  pagos: 'pagos',
};

function isOneOf<T extends string>(list: readonly T[], v: string | undefined | null): v is T {
  return v != null && (list as readonly string[]).includes(v);
}

/**
 * La URL de la ficha → qué pintar. Acepta las URLs viejas (`?tab=resumen`,
 * `?tab=rendimiento&vista=ritmos`, `?tab=atleta&vista=pagos`, `?tab=mensajes`…)
 * y las marca `legacy` para que el servidor redirija a la canónica.
 */
export function resolveAtletaUrl(q: {
  tab?: string | null;
  vista?: string | null;
  seccion?: string | null;
  sesion?: string | null;
  zoom?: string | null;
  comunicado?: string | null;
  historial?: string | null;
  chat?: string | null;
}): FichaUrl {
  let tab: FichaTab = 'plan';
  let seccion: FichaSeccion | null = null;
  let chat = q.chat === '1';
  let historial: TimelineKind | null = isOneOf(TIMELINE_KINDS, q.historial) ? q.historial : null;
  let legacy = false;

  if (isOneOf(FICHA_TABS, q.tab)) {
    tab = q.tab;
  } else if (q.tab) {
    const old = OLD_TAB[q.tab];
    legacy = true;
    if (old) {
      tab = old.tab;
      seccion = old.seccion ?? null;
      chat = chat || (old.chat ?? false);
      historial = old.historial ?? historial;
    }
  }

  if (q.vista) {
    legacy = true;
    const s = OLD_VISTA[q.vista];
    if (s && (tab === 'rendimiento' || tab === 'perfil')) {
      const fits = tab === 'rendimiento' ? isOneOf(RENDIMIENTO_SECCIONES, s) : isOneOf(PERFIL_SECCIONES, s);
      if (fits) seccion = s;
    }
  }

  if (q.seccion) {
    if (tab === 'rendimiento' && isOneOf(RENDIMIENTO_SECCIONES, q.seccion)) seccion = q.seccion;
    if (tab === 'perfil' && isOneOf(PERFIL_SECCIONES, q.seccion)) seccion = q.seccion;
  }

  const sesion = q.sesion && /^\d{1,18}$/.test(q.sesion.trim()) ? q.sesion.trim() : null;
  // Un entreno enlazado se abre en el calendario.
  if (sesion && tab !== 'plan') {
    tab = 'plan';
    legacy = true;
  }

  return {
    tab,
    seccion,
    chat,
    comunicado: q.comunicado === 'nuevo',
    sesion,
    zoom: isOneOf(CAL_ZOOMS, q.zoom) ? q.zoom : DEFAULT_CAL_ZOOM,
    historial,
    legacy,
  };
}

/** La query canónica de una ficha resuelta (para redirigir las URLs viejas). */
export function canonicalFichaQuery(u: FichaUrl, desde?: string | null): string {
  const p = new URLSearchParams();
  if (u.tab !== 'plan') p.set('tab', u.tab);
  if (u.seccion) p.set('seccion', u.seccion);
  if (u.sesion) p.set('sesion', u.sesion);
  if (u.zoom !== DEFAULT_CAL_ZOOM) p.set('zoom', u.zoom);
  if (u.historial) p.set('historial', u.historial);
  if (u.chat) p.set('chat', '1');
  if (u.comunicado) p.set('comunicado', 'nuevo');
  if (desde) p.set('desde', desde);
  const s = p.toString();
  return s ? `?${s}` : '';
}

// ── Ciclo de vida (pausa / baja) ─────────────────────────────────────────────
export interface DetalleLifecycle {
  status: AthleteLifecycleStatus;
  pause_reason: PauseReason | null;
  paused_since: string | null;
  planned_return: string | null;
  paused_by_name: string | null;
  paused_by_kind: 'coach' | 'athlete' | null;
  baja_at: string | null;
  baja_reason: PauseReason | null;
  baja_by_name: string | null;
  pending_request: { request_id: string; reason: PauseReason } | null;
  /** Se va en esa fecha (fin de lo pagado, 0137); sigue activo hasta entonces. */
  baja_scheduled_for: string | null;
  baja_scheduled_in_days: number | null;
  pause_days_available: number | null;
}

// ── Cabecera + estado (lo que ven las tres pestañas) ─────────────────────────

export interface FichaRace {
  name: string;
  /** YYYY-MM-DD */
  date: string;
  days: number;
  /** «Individual · Pro», null si no hay formato ni división. */
  category_label: string | null;
  goal_time_seconds: number | null;
}

export interface FichaShell {
  athlete_id: string;
  name: string;
  avatar_url: string | null;
  email: string | null;
  /** El nivel con el nombre del eje del coach, o null. */
  level: { id: string; label: string } | null;
  /** «Individual», «Dobles», «División Pro»… null si no se sabe. */
  division_label: string | null;
  race: FichaRace | null;
  program: { id: string; name: string; week: number; weeks: number } | null;
  group: { id: string; name: string } | null;
  status: AthleteStatus;
  lifecycle: DetalleLifecycle;
  unread: number;
  awaiting_reply: boolean;
  /** Hoy en el huso del atleta (YYYY-MM-DD). */
  today: string;
  /** Readiness 0–100 frente a su base de 28 días (el mismo del roster). */
  readiness: FichaEstado['readiness'];
  /** La semana en curso en 7 puntos (móvil y resumen). */
  week_days: PeekDay[];
  /** Adherencia due-only de 14 días (la misma que el roster). */
  adherence: { pct: number | null; due: number; done: number; window_days: number } | null;
  /** Alta pendiente (cuestionario terminado sin revisar). */
  intake_pending: boolean;
  /** Tiene algún entreno del coach programado de hoy en adelante. */
  has_upcoming_plan: boolean;
  /** La primera semana oculta con entrenos entre esta y las dos siguientes. */
  /** La primera semana oculta (no retenida) con entrenos. `due` = ya tocaba verla
   *  (su día de publicación automática pasó, o no tiene): solo entonces es «hacer
   *  ahora»; antes, publicarla es adelantarse, no una tarea. */
  publish_target: { week_start: string; sessions: number; due: boolean; opens_on: string | null } | null;
  /** Comunicados publicados que el atleta aún tiene pendientes. */
  pending_comunicados: number;
  /** La debida sin hacer más reciente de los últimos 14 días (para «Ajustar …»). */
  last_missed: { id: string; date: string; title: string } | null;
  /** Último check-in y si el coach ya escribió después. */
  last_checkin: { on: string; notes: string | null; score: number; answered: boolean } | null;
  /** Programa en curso y si es un plan personal (solo para él) que puede volver al de su grupo. */
  personal_plan: { current_name: string; is_personal: boolean; can_revert: boolean } | null;
  /** El nombre con el que el atleta ve firmados los comunicados (el del club). */
  club_name: string;
}

// ── Calendario (pestaña Plan) ────────────────────────────────────────────────

export type CalModality = 'fuerza' | 'ergo' | 'carrera' | 'circuito' | 'calentamiento';

export interface CalSession {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  title: string;
  /** Eje de color; null = mixta o sin ejercicios que leer. */
  modality: CalModality | null;
  modality_label: string;
  status: 'scheduled' | 'completed' | 'partial' | 'missed' | 'skipped';
  /** Hecho (estado terminal hecho o ejecución registrada). */
  done: boolean;
  /** Debida sin hacer (día pasado, semana visible, sin excluir). */
  missed: boolean;
  /** Día en pausa o reposo por lesión: no cuenta. */
  excluded: boolean;
  /** Minutos que ESCRIBE la prescripción (null = no escrita). */
  planned_min: number | null;
  /** La prescripción no escribe el reloj entero: dura «al menos». */
  planned_open: boolean;
  /** Tiene contenido (bloques con ejercicios). */
  has_content: boolean;
  /** Se puede mover/editar/quitar (solo lo programado sin hacer). */
  editable: boolean;
  rpe: number | null;
}

export interface CalDay {
  date: string;
  sessions: CalSession[];
}

export interface CalWeek {
  week_start: string;
  days: CalDay[];
  state: AthleteWeekState;
  /** Minutos escritos de la semana y si hay entrenos «abiertos». */
  planned_min: number;
  planned_open: number;
  /** Lo debido y lo hecho de esa semana (due-only). */
  due: number;
  done: number;
}

export interface FichaCalendar {
  zoom: CalZoom;
  from: string;
  to: string;
  today: string;
  weeks: CalWeek[];
}

// ── Columna «Estado» ─────────────────────────────────────────────────────────

export interface FichaEstado {
  readiness: {
    value: number;
    baseline: number | null;
    /** Lecturas previas de su base — la del vistazo: «aún sin su base (1 de 7 lecturas)». */
    baseline_readings: number;
    trend_14d: (number | null)[];
    observed_at: string;
    band: 'ok' | 'caution' | 'low';
  } | null;
  sleep: { avg_7d_hours: number; baseline_hours: number | null; nights: number } | null;
  last_checkin: {
    on: string;
    score: number;
    notes: string | null;
    soreness: number | null;
    fatigue: number | null;
    /** El coach ya escribió después del check-in. */
    answered: boolean;
  } | null;
  injury: {
    id: string;
    zone_label: string;
    severity_label: string;
    status: string;
    onset_date: string;
  } | null;
  note: { body: string; created_at: string } | null;
  markers: AthleteKeyMarker[];
}

// ── Perfil ───────────────────────────────────────────────────────────────────

export interface ClasificacionLevelOption {
  id: string;
  /** Código interno (N1…); el coach ve `label`. */
  name: string;
  label: string;
}

export interface ClasificacionData {
  level_id: string | null;
  level_name: string | null;
  suggested_level_id: string | null;
  suggested_level_name: string | null;
  /** El porqué de la sugerencia (solo lo trae la revisión del alta). */
  suggested_level_reason: string | null;
  training_days_per_week: number | null;
  levels: ClasificacionLevelOption[];
  days_band: { min: number; max: number };
  /** Cómo llama el coach a su eje («Nivel» por defecto; `coaches.level_axis_label`). */
  level_axis_label: string;
}

export interface TrainingDayCell {
  key: WeekdayKey;
  label: string;
  full_label: string;
  trains: boolean;
}

export interface TrainingDaysData {
  days: TrainingDayCell[];
  /** Los días marcados (derivado), o el objetivo del coach si no marcó ninguno. */
  training_days_per_week: number | null;
  has_availability: boolean;
}

export interface TimelineEntry {
  id: string;
  kind: TimelineKind;
  /** ISO instante (para ordenar) */
  at: string;
  title: string;
  detail: string | null;
  /** Quién: el atleta, el coach o el sistema. */
  who: 'atleta' | 'coach' | 'sistema';
  /** Para abrir algo relacionado (un entreno). */
  sesion_id?: string | null;
}

export interface FichaPerfil {
  email: string | null;
  plan_mode: IntakePlanMode;
  onboarded_at: string | null;
  classification: ClasificacionData;
  training_days: TrainingDaysData;
  review: AthleteReviewState | null;
  sessions: SessionReportView[];
  billing: AthleteBilling | null;
  invoices: AthleteInvoice[];
  timeline: TimelineEntry[];
  /** Entrenos pendientes de hoy a 4 semanas (para adaptar por lesión). */
  upcoming: { id: string; date: string; title: string }[];
  /** Qué partes no se pudieron cargar (se pintan como error, no como vacío). */
  errors: Array<'clasificacion' | 'dias' | 'revisiones' | 'pagos' | 'historial'>;
}
