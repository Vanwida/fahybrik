// Lo que el conector devuelve DESPUÉS de tocar el plan: la lectura de vuelta.
//
// POR QUÉ ESTO ES LA MITAD DEL TRABAJO. El humano ya está en el bucle: el cliente
// MCP le pide al coach que confirme cada escritura. Lo que confirma es lo que
// nosotros le contamos, así que una frase vaga («sesión creada») convierte su
// confirmación en un cheque en blanco. La respuesta dice, siempre: de QUIÉN, QUÉ
// DÍA, QUÉ QUEDÓ ESCRITO (con la dosis en la grafía del dominio) y, sobre todo, SI
// EL ATLETA LO VE.
//
// LA VISIBILIDAD NO SE INVENTA: SE LEE. El conector no estrena ningún estado. Quien
// decide si el atleta ve una semana es `weekly_plans` para (atleta, lunes de esa
// semana), exactamente como lo lee el endpoint del atleta
// (`lib/athlete/week-plan.ts`: `not exists (… wp.status = 'draft')`). Y de ahí sale
// la consecuencia que hay que decir en voz alta: SIN FILA, la semana es VISIBLE.
// Tocar el día de una semana ya publicada le llega al atleta al momento; solo un
// 'draft' explícito lo esconde. Por eso cada escritura vuelve con esa frase — es
// lo primero que desmonta un «pensaba que estaba en borrador».

import { longDateEs, isoDateString, mondayOfWeek, parseIsoDate } from '@fahybrid/shared/domain/dates';
import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { DELIVERY_MODE, type DeliveryMode } from '@/lib/coach/publish-week';

/** Lo que `weekly_plans.status` puede decir, más el caso de que no haya fila. */
export type WeekPublishState = 'draft' | 'published' | 'archived' | 'sin_marcar';

export interface WeekVisibility {
  /** El lunes de la semana del día tocado — la clave con la que se decide. */
  week_start: string;
  state: WeekPublishState;
  /** Solo en 'draft': quién lo suelta (el sábado el cron, o el coach a mano). */
  delivery_mode: DeliveryMode | null;
  /** ¿El atleta lo ve YA en su app? La respuesta, sin matices. */
  athlete_sees_it: boolean;
  /** La frase que lee el coach. */
  text: string;
}

/** Lo que `weekly_plans` dice de UNA semana, sin interpretar todavía. */
export interface WeekState {
  state: WeekPublishState;
  /** Solo en 'draft': quién lo suelta (el sábado el cron, o el coach a mano). */
  delivery_mode: DeliveryMode | null;
  /**
   * El foco CRUDO de esta semana (`weekly_plans.focus`, migración 0180): lo que
   * hay en la fila, sin fundir con el de la plantilla y SIN aplicar el portón
   * de borrador — eso lo tiene que decidir cada llamante según a quién se lo
   * enseña. El coach ve su propio borrador (panel, MCP); el atleta no ve NADA
   * de una semana en `draft`, foco incluido, y ese portón lo aplica el lector
   * del atleta (`lib/athlete/week-plan.ts`), no este. `null` cuando no hay fila
   * o la fila no tiene override.
   */
  focus: string | null;
}

/** El lunes de la semana en que cae `iso_date` — la clave de `weekly_plans`. */
export function weekStartOf(iso_date: string): string {
  return isoDateString(mondayOfWeek(parseIsoDate(iso_date)));
}

/**
 * Lo que `weekly_plans` dice de N semanas de un atleta, de UNA consulta.
 *
 * Devuelve entrada para TODAS las semanas pedidas, no solo para las que tienen
 * fila: la ausencia de fila es un estado del dominio (`sin_marcar`, y se VE), y
 * dejarla fuera del mapa obligaría a cada llamante a recordar esa doctrina por su
 * cuenta. Aquí se recuerda una vez.
 */
export async function weekStates(params: {
  athlete_id: number | bigint;
  week_starts: string[];
  client?: Sql;
}): Promise<Map<string, WeekState>> {
  const client = params.client ?? defaultSql;
  const weeks = [...new Set(params.week_starts)];

  const rows =
    weeks.length === 0
      ? []
      : await client<
          Array<{ week_start: string; status: string; delivery_mode: string; focus: string | null }>
        >`
          select to_char(week_start, 'YYYY-MM-DD') as week_start,
                 status::text as status,
                 delivery_mode,
                 focus
          from weekly_plans
          where athlete_id = ${Number(params.athlete_id)}
            and week_start = any(${weeks}::date[])
        `;

  const byWeek = new Map(rows.map((r) => [r.week_start, r]));
  return new Map(
    weeks.map((week): [string, WeekState] => {
      const row = byWeek.get(week);
      if (!row) return [week, { state: 'sin_marcar', delivery_mode: null, focus: null }];
      const state = row.status as Exclude<WeekPublishState, 'sin_marcar'>;
      return [
        week,
        {
          state,
          delivery_mode:
            state !== 'draft'
              ? null
              : row.delivery_mode === DELIVERY_MODE.manual
                ? DELIVERY_MODE.manual
                : DELIVERY_MODE.scheduled,
          focus: row.focus,
        },
      ];
    }),
  );
}

/** El estado de una semana, dicho como lo lee el coach. */
export function visibilityOf(week_start: string, week: WeekState): WeekVisibility {
  if (week.state === 'sin_marcar') {
    return {
      week_start,
      state: 'sin_marcar',
      delivery_mode: null,
      athlete_sees_it: true,
      text: 'publicado: lo ve ya en su app (esa semana no está marcada como borrador)',
    };
  }

  if (week.state === 'draft') {
    return {
      week_start,
      state: 'draft',
      delivery_mode: week.delivery_mode,
      athlete_sees_it: false,
      text:
        week.delivery_mode === DELIVERY_MODE.manual
          ? 'borrador: el atleta NO lo ve hasta que publiques esa semana'
          : 'borrador: el atleta NO lo ve todavía; esa semana se le abre sola el sábado',
    };
  }

  return {
    week_start,
    state: week.state,
    delivery_mode: null,
    athlete_sees_it: true,
    // 'archived' no esconde nada: el portón del móvil solo esconde 'draft'.
    text:
      week.state === 'published'
        ? 'publicado: lo ve ya en su app'
        : 'semana archivada, pero el atleta la sigue viendo (solo el borrador la esconde)',
  };
}

/**
 * Si el atleta ve la semana de `iso_date`, leído de `weekly_plans`. El lunes se
 * calcula con el mismo `mondayOfWeek` que usan los escritores del ciclo
 * (`publish-week.ts`), así que la clave es exactamente la misma fila que mira el
 * cron y que mira el móvil.
 */
export async function weekVisibility(params: {
  athlete_id: number | bigint;
  iso_date: string;
  client?: Sql;
}): Promise<WeekVisibility> {
  const weekStart = weekStartOf(params.iso_date);
  const states = await weekStates({
    athlete_id: params.athlete_id,
    week_starts: [weekStart],
    ...(params.client ? { client: params.client } : {}),
  });
  return visibilityOf(weekStart, states.get(weekStart)!);
}

// ── Resúmenes de una línea ───────────────────────────────────────────────────

/** «Marc · 18 de agosto · Rodaje largo: 1 bloque, 1 línea — publicado: lo ve ya…» */
export function writeResumen(params: {
  athlete_name: string;
  iso_date: string;
  title: string;
  block_count: number;
  item_count: number;
  visibility: WeekVisibility;
  verb: string;
}): string {
  const bloques = `${params.block_count} ${params.block_count === 1 ? 'bloque' : 'bloques'}`;
  const lineas = `${params.item_count} ${params.item_count === 1 ? 'línea' : 'líneas'}`;
  return (
    `${params.athlete_name} · ${longDateEs(params.iso_date)} · ${params.verb} «${params.title}»: ` +
    `${bloques}, ${lineas} — ${params.visibility.text}.`
  );
}

/** «Marc: la sesión «Series» pasa del 6 de agosto al 8 de agosto — publicado…» */
export function moveResumen(params: {
  athlete_name: string;
  title: string;
  from_iso: string;
  to_iso: string;
  visibility: WeekVisibility;
}): string {
  return (
    `${params.athlete_name}: «${params.title}» pasa del ${longDateEs(params.from_iso)} ` +
    `al ${longDateEs(params.to_iso)} — ${params.visibility.text}.`
  );
}

/** «Marc · semana del 18 de agosto: foco «Series de umbral» — publicado: lo ve ya…»
 *  o, al borrarlo: «Marc · semana del 18 de agosto: foco borrado — publicado…» */
export function focusResumen(params: {
  athlete_name: string;
  week_start: string;
  focus: string | null;
  visibility: WeekVisibility;
}): string {
  const que = params.focus ? `foco «${params.focus}»` : 'foco borrado';
  return (
    `${params.athlete_name} · semana del ${longDateEs(params.week_start)}: ${que} — ` +
    `${params.visibility.text}.`
  );
}
