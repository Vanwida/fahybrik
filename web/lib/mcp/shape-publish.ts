// Lo que el conector devuelve cuando PUBLICA y cuando AVISA — la lectura de vuelta
// de la Fase 4.
//
// La misma ley que en `shape-write.ts`, aplicada a actos que ya no son reversibles
// con un segundo mensaje: publicar una semana la pone en el móvil del atleta, y un
// comunicado publicado ya lo ha leído alguien. El cliente MCP le pide al coach que
// confirme ANTES, y lo que confirma es lo que aquí se cuenta, así que la respuesta
// dice siempre: a QUIÉN llegó, QUÉ verá él, y qué NO ha cambiado.
//
// Y dos cosas que solo se pueden decir mirando el estado ANTERIOR:
//   · una semana que YA estaba publicada no es un error, pero tampoco es un
//     cambio: se dice, para que el coach no crea que acaba de soltar algo nuevo.
//   · una semana sin ninguna sesión se publica igual (el dominio lo permite) y no
//     le muestra NADA: eso es un aviso, no un rechazo.

import { longDateEs } from '@fahybrid/shared/domain/dates';
import {
  ANCHOR_LABEL,
  KIND_DEMANDS_ACTION,
  KIND_LABEL,
  type CoachCommunicationDetailDTO,
} from '@fahybrid/shared/domain/coach-communications';
import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { weekStartOf, type WeekPublishState, type WeekState } from './shape-write';

/** Cuánto cuerpo de mensaje cabe en una frase de una línea antes de cortarlo. */
const PREVIEW_MAX_CHARS = 120;

// ── Semanas publicadas ───────────────────────────────────────────────────────

/** Cómo estaba una semana ANTES de publicarla, dicho para el coach. */
const WAS_TEXT: Record<WeekPublishState, string> = {
  draft: 'estaba en borrador',
  sin_marcar: 'no estaba marcada (el atleta ya la veía)',
  published: 'ya estaba publicada',
  archived: 'estaba archivada (el atleta la seguía viendo)',
};

export interface PublishedWeek {
  week_start: string;
  /** El estado que tenía la fila de `weekly_plans` antes de esta llamada. */
  was: WeekPublishState;
  was_text: string;
  /** true si esta llamada no ha cambiado nada porque ya estaba publicada. */
  already_published: boolean;
  /** Cuántas sesiones tiene el atleta esa semana. Cero = no le muestra nada. */
  sessions: number;
  athlete_sees_it: true;
}

/**
 * Cuántas sesiones tiene el atleta en cada una de esas semanas, de una consulta.
 * `date_trunc('week')` de Postgres corta en LUNES, igual que el `mondayOfWeek` con
 * el que se calculan las claves, así que las dos puntas hablan de la misma semana.
 */
export async function weekSessionCounts(params: {
  athlete_id: number | bigint;
  week_starts: string[];
  client?: Sql;
}): Promise<Map<string, number>> {
  const client = params.client ?? defaultSql;
  const weeks = [...new Set(params.week_starts)];
  if (weeks.length === 0) return new Map();

  const rows = await client<Array<{ week_start: string; n: number }>>`
    select to_char(date_trunc('week', scheduled_for)::date, 'YYYY-MM-DD') as week_start,
           count(*)::int as n
    from workout_assignments
    where athlete_id = ${Number(params.athlete_id)}
      and date_trunc('week', scheduled_for)::date = any(${weeks}::date[])
    group by 1
  `;

  const counts = new Map(rows.map((r) => [r.week_start, r.n]));
  return new Map(weeks.map((week) => [week, counts.get(week) ?? 0]));
}

export function publishedWeeks(params: {
  week_starts: string[];
  before: Map<string, WeekState>;
  sessions: Map<string, number>;
}): PublishedWeek[] {
  return params.week_starts.map((week) => {
    const was = params.before.get(week)?.state ?? 'sin_marcar';
    return {
      week_start: week,
      was,
      was_text: WAS_TEXT[was],
      already_published: was === 'published',
      sessions: params.sessions.get(week) ?? 0,
      athlete_sees_it: true as const,
    };
  });
}

/**
 * Un día a mitad de semana no es un error: se publica SU semana, y se dice cuál.
 * Sin esta frase, un coach que pidió «publica el miércoles» leería «publicado» y
 * creería que soltó un día, cuando lo que se abrió fueron siete.
 */
export function anchoredAvisos(asked: string[]): string[] {
  const moved = [...new Set(asked.filter((iso) => weekStartOf(iso) !== iso))];
  if (moved.length === 0) return [];
  return [
    `${joinEs(moved.map(longDateEs))} ${moved.length === 1 ? 'no es lunes' : 'no son lunes'}: ` +
      `he publicado la semana entera en la que ${moved.length === 1 ? 'cae' : 'caen'} ` +
      `(${listDates([...new Set(moved.map(weekStartOf))])}).`,
  ];
}

/** Lo que hay que decir en voz alta aunque la publicación haya ido bien. */
export function publishAvisos(weeks: PublishedWeek[]): string[] {
  const avisos: string[] = [];
  const empty = weeks.filter((w) => w.sessions === 0);
  if (empty.length > 0) {
    avisos.push(
      `${listDates(empty.map((w) => w.week_start))}: ${empty.length === 1 ? 'esa semana no tiene' : 'esas semanas no tienen'} ` +
        'ninguna sesión puesta, así que publicarla no le muestra nada nuevo.',
    );
  }
  const already = weeks.filter((w) => w.already_published);
  if (already.length > 0) {
    avisos.push(
      `${listDates(already.map((w) => w.week_start))}: ya ${already.length === 1 ? 'estaba publicada' : 'estaban publicadas'}, ` +
        'así que ahí no ha cambiado nada.',
    );
  }
  return avisos;
}

/** «Marc · semana del 10 de agosto publicada: ya la ve en su app (6 sesiones).» */
export function publishResumen(params: {
  athlete_name: string;
  weeks: PublishedWeek[];
  notified: boolean;
}): string {
  const { athlete_name, weeks } = params;
  const nuevas = weeks.filter((w) => !w.already_published);
  const sessions = weeks.reduce((n, w) => n + w.sessions, 0);
  const cabecera =
    weeks.length === 1
      ? `${athlete_name} · semana del ${longDateEs(weeks[0]!.week_start)}`
      : `${athlete_name} · ${weeks.length} semanas (${listDates(weeks.map((w) => w.week_start))})`;

  const cuerpo =
    nuevas.length === 0
      ? `ya ${weeks.length === 1 ? 'estaba publicada' : 'estaban publicadas'}: no ha cambiado nada`
      : `${weeks.length === 1 ? 'publicada' : 'publicadas'}: ${weeks.length === 1 ? 'ya la ve' : 'ya las ve'} en su app` +
        ` (${sessions} ${sessions === 1 ? 'sesión' : 'sesiones'})`;

  const aviso = nuevas.length > 0 && params.notified ? ' Le ha llegado el aviso al móvil.' : '';
  return `${cabecera} ${cuerpo}.${aviso}`;
}

/** «10, 17 y 24 de agosto» — las fechas de un lote, dichas como se dicen. */
function listDates(weekStarts: string[]): string {
  return joinEs(weekStarts.map(longDateEs));
}

function joinEs(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
}

// ── Comunicados publicados ───────────────────────────────────────────────────

/**
 * Qué le aparece al atleta, por FORMA del comunicado — que es lo que decide qué se
 * le pide (`KIND_DEMANDS_ACTION`) y cómo se lee. Se dice en la voz del atleta: el
 * coach tiene que poder confirmar «sí, eso es lo que quiero que le salga».
 */
function whatTheAthleteGets(c: CoachCommunicationDetailDTO): string {
  switch (c.kind) {
    case 'protocol': {
      const checkable = c.items.filter((i) => i.checkable).length;
      if (checkable > 0) {
        return `un protocolo con ${checkable} ${checkable === 1 ? 'paso que marcar' : 'pasos que marcar'}`;
      }
      return c.items.length > 0
        ? `un protocolo de ${c.items.length} ${c.items.length === 1 ? 'punto' : 'puntos'} para leer`
        : 'un protocolo para leer';
    }
    case 'question': {
      const base = `una pregunta con ${c.items.length} opciones para elegir`;
      return c.blocks ? `${base}, y le tapa la app hasta que conteste` : base;
    }
    case 'task':
      return `una tarea que cerrar antes del ${c.due_date ? longDateEs(c.due_date) : 'día que le pusiste'}`;
    case 'note':
      return `una nota de ${c.items.length} ${c.items.length === 1 ? 'sección' : 'secciones'}`;
    case 'focus':
      return 'un foco: una línea que no se le olvida';
  }
}

export interface PublishedCommunication {
  communication_id: string;
  kind: string;
  kind_label: string;
  title: string;
  /** Dónde le aflora en la app. El ancla no es una etiqueta: decide la pantalla. */
  anchor: { kind: string; ref: string | null; label: string | null };
  /** true = le pide un acto (protocolo, pregunta, tarea); false = solo informa. */
  demands_action: boolean;
  /** Qué le sale al atleta, dicho en su voz. */
  athlete_sees: string;
  published_at: string;
  athletes: Array<{ athlete_id: string; full_name: string }>;
  /** Destinatarios totales del comunicado (puede haber de una publicación previa). */
  recipients_total: number;
  new_recipients: number;
}

export function publishedCommunication(params: {
  communication: CoachCommunicationDetailDTO;
  athletes: Array<{ athlete_id: string; full_name: string }>;
  recipients_total: number;
  new_recipients: number;
  published_at: string;
}): PublishedCommunication {
  const c = params.communication;
  return {
    communication_id: c.id,
    kind: c.kind,
    kind_label: KIND_LABEL[c.kind],
    title: c.title,
    anchor: { kind: c.anchor_kind, ref: c.anchor_ref, label: ANCHOR_LABEL[c.anchor_kind] },
    demands_action: KIND_DEMANDS_ACTION[c.kind],
    athlete_sees: whatTheAthleteGets(c),
    published_at: params.published_at,
    athletes: params.athletes,
    recipients_total: params.recipients_total,
    new_recipients: params.new_recipients,
  };
}

/** «PROTOCOLO «Día de carrera» a Marc y Ana — les sale en Día de carrera: …» */
export function communicationResumen(pub: PublishedCommunication): string {
  const quien =
    pub.athletes.length <= 3
      ? joinEs(pub.athletes.map((a) => a.full_name))
      : `${pub.athletes.length} atletas`;
  const donde = pub.anchor.label ? ` en «${pub.anchor.label}»` : '';
  return `${pub.kind_label} «${pub.title}» publicado a ${quien}: les sale${donde} ${pub.athlete_sees}.`;
}

// ── Chat y notas ─────────────────────────────────────────────────────────────

/** El principio de un texto, para caber en una frase sin perder el sentido. */
export function preview(body: string): string {
  const trimmed = body.trim().replace(/\s+/g, ' ');
  return trimmed.length > PREVIEW_MAX_CHARS
    ? `${trimmed.slice(0, PREVIEW_MAX_CHARS - 1)}…`
    : trimmed;
}

/** «Enviado a Marc: «el jueves…» — le llega el aviso al móvil.» */
export function messageResumen(params: { athlete_name: string; body: string }): string {
  return `Enviado a ${params.athlete_name}: «${preview(params.body)}» — le llega el aviso al móvil.`;
}

/** «Nota en la ficha de Marc (10 ago): «…». El atleta NO la ve.» */
export function noteResumen(params: {
  athlete_name: string;
  date_label: string;
  body: string;
}): string {
  return (
    `Apuntado en la ficha de ${params.athlete_name} (${params.date_label}): «${preview(params.body)}». ` +
    'Es una nota TUYA: el atleta no la ve.'
  );
}
