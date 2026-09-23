import 'server-only';

// La lista de PRIMEROS PASOS de un coach (setup checklist, plan §6 Ajustes/Hoy):
// qué le falta para que el panel trabaje por él. Se CALCULA de datos reales —
// no hay casillas que marcar a mano, así que no puede mentir: un paso está hecho
// cuando existe lo que el paso pide (un entreno en la biblioteca, un grupo con
// plan…). Una consulta.
//
// Los pasos son MECANISMO del producto (qué necesita el panel para funcionar);
// nada de aquí es método del coach. «Niveles» es opcional: se enseña para que el
// coach sepa que existe, pero no bloquea `complete` — quien no usa niveles no
// está a medias. «Agenda y cupo» solo sale con el add-on Negocio.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';

export type SetupStepKey =
  | 'club'
  | 'metodo'
  | 'niveles'
  | 'primer_entreno'
  | 'primer_programa'
  | 'primer_grupo'
  | 'tests'
  | 'agenda'
  | 'primer_atleta';

export interface SetupStep {
  key: SetupStepKey;
  /** «Tu club», «Cómo entrenas»… */
  label: string;
  /** Una línea: qué hay (si está hecho) o qué falta. */
  detail: string;
  done: boolean;
  optional: boolean;
  /** Ruta del panel SIN locale, donde se hace el paso. */
  href: string;
}

export interface SetupChecklist {
  steps: SetupStep[];
  done: number;
  total: number;
  /** Todos los pasos obligatorios hechos (los opcionales no bloquean). */
  complete: boolean;
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
}

function n(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Puro: los pasos, en orden de montaje (lo que desbloquea lo siguiente, primero). */
export function buildSetupChecklist(f: SetupFacts): SetupChecklist {
  const steps: SetupStep[] = [
    {
      key: 'club',
      label: 'Tu club',
      done: f.club_named,
      optional: false,
      href: '/ajustes/club',
      detail: f.club_named
        ? f.club_logo
          ? 'Nombre y logo puestos'
          : 'Nombre puesto · falta el logo'
        : 'Nombre, logo y color que ven tus atletas',
    },
    {
      key: 'metodo',
      label: 'Cómo entrenas',
      done: f.method_written,
      optional: false,
      href: '/ajustes/metodo',
      detail: f.method_written ? 'Tu método está escrito' : 'Cuéntale al panel cómo programas',
    },
    {
      key: 'niveles',
      label: 'Niveles',
      done: f.levels > 0,
      optional: true,
      href: '/ajustes/metodo',
      detail: f.levels > 0 ? n(f.levels, 'nivel', 'niveles') : 'Si agrupas a tus atletas por nivel',
    },
    {
      key: 'primer_entreno',
      label: 'Primer entreno',
      done: f.library_entrenos > 0,
      optional: false,
      href: '/programar/biblioteca',
      detail:
        f.library_entrenos > 0
          ? `${n(f.library_entrenos, 'entreno', 'entrenos')} en tu biblioteca`
          : 'Escribe o importa un entreno',
    },
    {
      key: 'primer_programa',
      label: 'Primer programa',
      done: f.programs > 0,
      optional: false,
      href: '/programar/programas',
      detail: f.programs > 0 ? n(f.programs, 'programa', 'programas') : 'Semanas de entrenos con un nombre',
    },
    {
      key: 'primer_grupo',
      label: 'Primer grupo con plan',
      done: f.groups_with_plan > 0,
      optional: false,
      href: '/programar/grupos',
      detail:
        f.groups_with_plan > 0
          ? `${n(f.groups_with_plan, 'grupo', 'grupos')} con plan`
          : 'Un grupo de atletas y los programas que siguen',
    },
    {
      key: 'tests',
      label: 'Batería de tests',
      done: f.tests > 0,
      optional: false,
      href: '/programar/tests',
      detail: f.tests > 0 ? n(f.tests, 'test', 'tests') : 'Los tests con los que calculas zonas y cargas',
    },
  ];
  if (f.negocio) {
    steps.push({
      key: 'agenda',
      label: 'Agenda y cupo',
      done: f.availability_slots > 0,
      optional: false,
      href: '/ajustes/agenda',
      detail:
        f.availability_slots > 0
          ? f.max_athletes != null
            ? `${n(f.availability_slots, 'franja', 'franjas')} · cupo ${f.max_athletes}`
            : `${n(f.availability_slots, 'franja', 'franjas')} · sin cupo`
          : 'Cuándo pueden reservar llamada tus leads',
    });
  }
  const invited = f.athletes + f.invitations;
  steps.push({
    key: 'primer_atleta',
    label: 'Invitar a tu primer atleta',
    done: invited > 0,
    optional: false,
    href: '/atletas',
    detail:
      f.athletes > 0
        ? n(f.athletes, 'atleta', 'atletas')
        : f.invitations > 0
          ? 'Invitación enviada'
          : 'Por email o pegando una lista',
  });

  const done = steps.filter((s) => s.done).length;
  // Completo = todo lo obligatorio hecho: quien no usa niveles no se queda «a medias».
  const complete = steps.every((s) => s.done || s.optional);
  return { steps, done, total: steps.length, complete };
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
      )                                                                    as invitations
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
