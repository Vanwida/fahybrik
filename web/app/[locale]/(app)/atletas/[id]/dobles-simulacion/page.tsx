import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { sql } from '@/lib/db';
import { SimulationEditor } from '@/components/dashboard/dobles/SimulationEditor';
import {
  defaultStationSplits,
  type DoblesStationSplit,
  type DoblesSimulationCoachResponse,
} from '@fahybrid/shared/schema/dobles-simulation';
import {
  STATION_INDEX_STATION,
  HYROX_STATION_LABELS,
} from '@fahybrid/shared/schema/race-plan';

export const dynamic = 'force-dynamic';

// Coach Dobles SIMULATION editor page (self-contained route — NOT yet wired
// into the athlete-detail nav; see report's nav-hook TODO). The route athlete
// is "self" / athlete A; their linked Dobles partner is athlete B. The page
// resolves the saved simulation (or a prefilled 50/50 default) server-side and
// hands it to the client editor. Coach-scoped: a foreign athlete 404s.

interface PairRow {
  a_user_id: string;
  a_name: string;
  b_user_id: string | null;
  b_name: string | null;
}

interface SimRow {
  target_event_id: string | null;
  station_splits: DoblesStationSplit[];
  running_note: string | null;
  roxzone_note: string | null;
  tactical_note: string | null;
  updated_at: string;
}

function labelFor(station_index: number): string {
  return HYROX_STATION_LABELS[station_index] ?? `Estación ${station_index}`;
}

function withLabels(
  splits: DoblesStationSplit[],
): Array<DoblesStationSplit & { label: string }> {
  return STATION_INDEX_STATION.map((station_index) => {
    const found = splits.find((s) => s.station_index === station_index);
    const base: DoblesStationSplit = found ?? {
      station_index,
      assigned_to: 'split',
      self_share: 0.5,
    };
    return { ...base, label: labelFor(station_index) };
  });
}

export default async function DoblesSimulationPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  const athleteId = Number(id);
  if (!Number.isFinite(athleteId)) notFound();

  const pairRows = await sql<PairRow[]>`
    select
      ua.id::text                  as a_user_id,
      a.full_name                  as a_name,
      ub.id::text                  as b_user_id,
      ab.full_name                 as b_name
    from athletes a
    join users ua on ua.id = a.user_id
    left join users ub on ub.id = ua.partner_id and ub.deleted_at is null
    left join athletes ab on ab.user_id = ub.id
    where a.id = ${athleteId} and a.coach_id = ${session.coach_id}
    limit 1
  `;
  const pair = pairRows[0];
  if (!pair) notFound();

  const hasPartner = pair.b_user_id !== null;

  let sim: SimRow | undefined;
  if (hasPartner) {
    const rows = await sql<SimRow[]>`
      select
        target_event_id::text as target_event_id,
        station_splits,
        running_note,
        roxzone_note,
        tactical_note,
        updated_at::text as updated_at
      from dobles_simulations
      where athlete_a_user_id = ${BigInt(pair.a_user_id)}
        and athlete_b_user_id = ${BigInt(pair.b_user_id as string)}
      order by updated_at desc
      limit 1
    `;
    sim = rows[0];
  }

  const initial: DoblesSimulationCoachResponse = sim
    ? {
        exists: true,
        athlete_a_name: pair.a_name,
        athlete_b_name: pair.b_name,
        has_partner: hasPartner,
        target_event_id: sim.target_event_id ? Number(sim.target_event_id) : null,
        station_splits: withLabels(sim.station_splits),
        running_note: sim.running_note,
        roxzone_note: sim.roxzone_note,
        tactical_note: sim.tactical_note,
        updated_at: sim.updated_at,
      }
    : {
        exists: false,
        athlete_a_name: pair.a_name,
        athlete_b_name: pair.b_name,
        has_partner: hasPartner,
        target_event_id: null,
        station_splits: withLabels(defaultStationSplits()),
        running_note: null,
        roxzone_note: null,
        tactical_note: null,
        updated_at: null,
      };

  return (
    <div className="mx-auto flex w-full max-w-[var(--container-max)] flex-col gap-6 py-2">
      <SimulationEditor athleteId={athleteId} initial={initial} />
    </div>
  );
}
