import 'server-only';

// La lista de PRIMEROS PASOS de un coach (setup checklist, plan §6 Ajustes/Hoy):
// qué le falta para que el panel trabaje por él. Se CALCULA de datos reales —
// no hay casillas que marcar a mano, así que no puede mentir: un paso está hecho
// cuando existe lo que el paso pide. Una consulta.
//
// DOS CAMINOS (DECISIONS 2026-09-23 «Primeros pasos: empieza con un atleta»):
//
//   · «Empieza con un atleta» — lo ÚNICO obligatorio: invitar → darle un
//     programa → que vea su semana. Es lo mínimo para que el panel trabaje, y
//     vale igual para un coach 1:1 que para un club de 100.
//   · «Monta tu método» — club, cómo entrenas, niveles, biblioteca, grupos,
//     tests, agenda. Todo OPCIONAL y en cualquier orden: grupos y tests son
//     MÉTODO de cada coach (HARD RULE Nº0), no requisitos del producto; nada de
//     esto bloquea invitar al primer atleta.
//
// `complete` = el primer camino hecho (≥ 1 atleta que ya ve una semana). Desde
// ahí «Primeros pasos n/3» sale de la barra lateral: un club en marcha no lo
// arrastra para siempre. «Agenda y cupo» solo sale con el add-on Negocio.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';

export type SetupStepKey =
  | 'primer_atleta'
  | 'primer_plan'
  | 'primera_semana'
  | 'club'
  | 'metodo'
  | 'niveles'
  | 'primer_entreno'
  | 'primer_grupo'
  | 'tests'
  | 'agenda';

export type SetupTrack = 'empieza' | 'metodo';

export interface SetupStep {
  key: SetupStepKey;
  track: SetupTrack;
  /** «Invita a tu primer atleta», «Cómo entrenas»… */
  label: string;
  /** Una línea: qué hay (si está hecho) o qué falta. */
  detail: string;
  done: boolean;
  optional: boolean;
  /** Ruta del panel SIN locale, donde se hace el paso. */
  href: string;
}

export interface SetupChecklist {
  /** Todos los pasos: primero los de «Empieza con un atleta», luego el método. */
  steps: SetupStep[];
  /** Hechos / total del camino obligatorio («Empieza con un atleta»). */
  done: number;
  total: number;
  /** El camino obligatorio hecho: hay al menos un atleta que ve su semana. */
  complete: boolean;
  /** «Monta tu método» (opcional): hechos / total. */
  method: { done: number; total: number };
}

/** Lo que se mira en la base para decidir cada paso. */
export interface SetupFacts {
  club_named: boolean;
  club_logo: boolean;
  method_written: boolean;
  levels: number;
  library_entrenos: number;
  programs: number;
  groups_with_plan: number;
  tests: number;
  negocio: boolean;
  availability_slots: number;
  max_athletes: number | null;
  athletes: number;
  invitations: number;
  /** Atletas (no el propio coach) con algún entreno puesto por el coach. */
  athletes_with_plan: number;
  /** De esos, cuántos tienen alguna semana que ya pueden ver (no oculta). */
  athletes_with_visible_week: number;
}

function n(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Puro: los pasos, en orden — el camino corto primero, el método después. */
export function buildSetupChecklist(f: SetupFacts): SetupChecklist {
  const invited = f.athletes + f.invitations;
  const empieza: SetupStep[] = [
    {
      key: 'primer_atleta',
      track: 'empieza',
      label: 'Invita a tu primer atleta',
      done: invited > 0,
      optional: false,
      href: '/atletas',
      detail:
        f.athletes > 0
          ? n(f.athletes, 'atleta', 'atletas')
          : f.invitations > 0
            ? 'Invitación enviada'
            : 'Por email o pegando una lista',
    },
    {
      key: 'primer_plan',
      track: 'empieza',
      label: 'Dale un programa',
      done: f.athletes_with_plan > 0,
      optional: false,
      // Sin programas, primero hay que escribir uno; con programas, se asigna desde Atletas.
      href: f.athletes_with_plan > 0 || f.programs > 0 ? '/atletas' : '/programar/programas',
      detail:
        f.athletes_with_plan > 0
          ? `${n(f.athletes_with_plan, 'atleta', 'atletas')} con programa`
          : f.programs > 0
            ? `Asígnale uno de tus ${n(f.programs, 'programa', 'programas')}`
            : 'Escribe un programa y asígnaselo',
    },
    {
      key: 'primera_semana',
      track: 'empieza',
      label: 'Publica su primera semana',
      done: f.athletes_with_visible_week > 0,
      optional: false,
      href: '/atletas',
      detail:
        f.athletes_with_visible_week > 0
          ? `${n(f.athletes_with_visible_week, 'atleta ve', 'atletas ven')} su semana`
          : 'Hasta que la publiques, no la ve en su app',
    },
  ];

  const metodo: SetupStep[] = [
    {
      key: 'club',
      track: 'metodo',
      label: 'Tu club',
      done: f.club_named,
      optional: true,
      href: '/ajustes/club',
      detail: f.club_named
        ? f.club_logo
          ? 'Nombre y logo puestos'
          : 'Nombre puesto · falta el logo'
        : 'Nombre, logo y color que ven tus atletas',
    },
    {
      key: 'metodo',
      track: 'metodo',
      label: 'Cómo entrenas',
      done: f.method_written,
      optional: true,
      href: '/ajustes/metodo',
      detail: f.method_written ? 'Tu método está escrito' : 'Cuéntale al panel cómo programas',
    },
    {
      key: 'primer_entreno',
      track: 'metodo',
      label: 'Tu biblioteca',
      done: f.library_entrenos > 0,
      optional: true,
      href: '/programar/biblioteca',
      detail:
        f.library_entrenos > 0
          ? `${n(f.library_entrenos, 'entreno', 'entrenos')} en tu biblioteca`
          : 'Entrenos que reutilizas en tus programas',
    },
    {
      key: 'niveles',
      track: 'metodo',
      label: 'Niveles',
      done: f.levels > 0,
      optional: true,
      href: '/ajustes/metodo',
      detail: f.levels > 0 ? n(f.levels, 'nivel', 'niveles') : 'Si agrupas a tus atletas por nivel',
    },
    {
      key: 'primer_grupo',
      track: 'metodo',
      label: 'Grupos',
      done: f.groups_with_plan > 0,
      optional: true,
      href: '/programar/grupos',
      detail:
        f.groups_with_plan > 0
          ? `${n(f.groups_with_plan, 'grupo', 'grupos')} con plan`
          : 'Varios atletas que siguen los mismos programas',
    },
    {
      key: 'tests',
      track: 'metodo',
      label: 'Batería de tests',
      done: f.tests > 0,
      optional: true,
      href: '/programar/tests',
      detail: f.tests > 0 ? n(f.tests, 'test', 'tests') : 'Los tests con los que calculas zonas y cargas',
    },
  ];
  if (f.negocio) {
    metodo.push({
      key: 'agenda',
      track: 'metodo',
      label: 'Agenda y cupo',
      done: f.availability_slots > 0,
      optional: true,
      href: '/ajustes/agenda',
      detail:
        f.availability_slots > 0
          ? f.max_athletes != null
            ? `${n(f.availability_slots, 'franja', 'franjas')} · cupo ${f.max_athletes}`
            : `${n(f.availability_slots, 'franja', 'franjas')} · sin cupo`
          : 'Cuándo pueden reservar llamada tus leads',
    });
  }

  const done = empieza.filter((s) => s.done).length;
  return {
    steps: [...empieza, ...metodo],
    done,
    total: empieza.length,
    complete: done === empieza.length,
    method: { done: metodo.filter((s) => s.done).length, total: metodo.length },
  };
}

interface FactsRow {
  club_named: boolean;
  club_logo: boolean;
  method_written: boolean;
  levels: number;
  library_entrenos: number;
  programs: number;
  groups_with_plan: number;
  tests: number;
  negocio: boolean;
  availability_slots: number;
  max_athletes: number | null;
  athletes: number;
  invitations: number;
  athletes_with_plan: number;
  athletes_with_visible_week: number;
}

/** Los hechos de un coach, en una consulta. */
export async function loadSetupFacts(coach_id: bigint | number, client: Sql = defaultSql): Promise<SetupFacts | null> {
  const id = Number(coach_id);
  const rows = await client<FactsRow[]>`
    select
      coalesce(btrim(c.club_skin_name), '') <> ''                         as club_named,
      c.club_logo_url is not null                                          as club_logo,
      exists (
        select 1 from coach_method_interview mi
        where mi.coach_id = c.id
          and coalesce(nullif(btrim(mi.mirror_text), ''), nullif(btrim(mi.generated_mirror), '')) is not null
      )                                                                    as method_written,
      (select count(*)::int from athlete_levels l where l.coach_id = c.id) as levels,
      (
        select count(*)::int from templates t
        where t.coach_id = c.id and t.archived_at is null
          and t.instance_athlete_id is null and t.is_draft = false
      )                                                                    as library_entrenos,
      (
        select count(*)::int from program_month_templates p
        where p.coach_id = c.id and p.athlete_id is null
      )                                                                    as programs,
      (
        select count(*)::int from program_sequences ps
        where ps.coach_id = c.id
          and exists (select 1 from program_sequence_items i where i.sequence_id = ps.id)
      )                                                                    as groups_with_plan,
      (
        select count(*)::int from coach_calibration_tests ct
        where ct.coach_id = c.id and ct.archived_at is null
      )                                                                    as tests,
      exists (
        select 1 from coach_entitlements e
        where e.coach_id = c.id and e.feature = 'negocio' and e.status = 'active'
      )                                                                    as negocio,
      (
        select count(*)::int from coach_availability av
        where av.coach_id = c.id and av.activo
      )                                                                    as availability_slots,
      c.max_athletes                                                       as max_athletes,
      (
        select count(*)::int from athletes a
        where a.coach_id = c.id and a.user_id is distinct from c.user_id
      )                                                                    as athletes,
      (
        select count(*)::int from athlete_invitations ai
        where ai.created_by_coach_id = c.id
      )                                                                    as invitations,
      (
        select count(distinct wa.athlete_id)::int
        from workout_assignments wa
        join athletes a on a.id = wa.athlete_id
        where a.coach_id = c.id and a.user_id is distinct from c.user_id
          and wa.origin = 'coach'
      )                                                                    as athletes_with_plan,
      -- Una semana se ve salvo que su fila de weekly_plans diga «draft» (sin fila,
      -- se ve): la misma y única puerta de visibilidad (week-publishing).
      (
        select count(distinct wa.athlete_id)::int
        from workout_assignments wa
        join athletes a on a.id = wa.athlete_id
        where a.coach_id = c.id and a.user_id is distinct from c.user_id
          and wa.origin = 'coach'
          and not exists (
            select 1 from weekly_plans wp
            where wp.athlete_id = wa.athlete_id
              and wp.week_start = date_trunc('week', wa.scheduled_for)::date
              and wp.status = 'draft'
          )
      )                                                                    as athletes_with_visible_week
    from coaches c
    where c.id = ${id}
  `;
  return rows[0] ?? null;
}

export async function loadSetupChecklist(
  coach_id: bigint | number,
  client: Sql = defaultSql,
): Promise<SetupChecklist | null> {
  const facts = await loadSetupFacts(coach_id, client);
  return facts ? buildSetupChecklist(facts) : null;
}
