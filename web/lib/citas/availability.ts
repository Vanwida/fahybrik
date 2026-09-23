// The coach's citas AGENDA (weekly windows + blocked days) and the presencial address —
// per coach since 0220. The slot engine reading them lives in ./store (computeSlots).

import { sql } from '@/lib/db';
import type { CitaModality } from '@fahybrid/shared/schema';

/** #40: the presencial location of ONE coach (coaches.studio_name + location, the profile
 *  fields — no new column). `coach_id` null = nobody's → null. Name/address individually
 *  null when unset. No implicit "the coach" pick: the caller names the coach whose calendar
 *  the cita is on (the lead's owner, the athlete's coach, or the acting session). */
export async function getStudioLocation(
  coach_id: bigint | number | null,
): Promise<{ name: string | null; address: string | null } | null> {
  if (coach_id == null) return null;
  const rows = await sql<{ studio_name: string | null; location: string | null }[]>`
    select studio_name, location from coaches where id = ${Number(coach_id)} limit 1
  `;
  const c = rows[0];
  return c ? { name: c.studio_name, address: c.location } : null;
}

// ── Availability (coach) — per coach since 0220 ──────────────────────────────────
export interface AvailabilityRow {
  id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  /** #40: which of the two independent schedules this window belongs to. */
  modality: CitaModality;
}
export interface ExceptionRow {
  id: string;
  fecha: string;
  motivo: string | null;
}

export async function getAvailability(
  coach_id: bigint | number,
): Promise<{ windows: AvailabilityRow[]; exceptions: ExceptionRow[] }> {
  const [windows, exceptions] = await Promise.all([
    sql<AvailabilityRow[]>`
      select id::text as id, weekday, to_char(start_time, 'HH24:MI') as start_time,
             to_char(end_time, 'HH24:MI') as end_time, modality::text as modality
      from coach_availability
      where coach_id = ${Number(coach_id)} and activo
      order by modality, weekday, start_time
    `,
    sql<{ id: string; fecha: Date; motivo: string | null }[]>`
      select id::text as id, fecha, motivo from coach_availability_exceptions
      where coach_id = ${Number(coach_id)}
        and fecha >= (now() at time zone 'Europe/Madrid')::date
      order by fecha
    `,
  ]);
  return {
    windows,
    exceptions: exceptions.map((e) => ({
      id: e.id,
      fecha: e.fecha.toISOString().slice(0, 10),
      motivo: e.motivo,
    })),
  };
}

/** Replace THIS coach's full weekly availability with the given windows (transactional).
 *  Each window carries its modality (#40): the two schedules (video | presencial) live in the
 *  same table and can overlap. Never touches another coach's rows. */
export async function setAvailability(
  coach_id: bigint | number,
  windows: { weekday: number; start_time: string; end_time: string; modality: CitaModality }[],
): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`delete from coach_availability where coach_id = ${Number(coach_id)}`;
    for (const w of windows) {
      await tx`
        insert into coach_availability (coach_id, weekday, start_time, end_time, activo, modality)
        values (${Number(coach_id)}, ${w.weekday}, ${w.start_time}, ${w.end_time}, true,
                ${w.modality}::appointment_modality)
      `;
    }
  });
}

/** Block a calendar day for THIS coach (upsert on (coach_id, fecha)). */
export async function addException(
  coach_id: bigint | number,
  fecha: string,
  motivo: string | null,
): Promise<ExceptionRow> {
  const rows = await sql<{ id: string; fecha: Date; motivo: string | null }[]>`
    insert into coach_availability_exceptions (coach_id, fecha, motivo)
    values (${Number(coach_id)}, ${fecha}, ${motivo})
    on conflict (coach_id, fecha) do update set motivo = excluded.motivo
    returning id::text as id, fecha, motivo
  `;
  const e = rows[0]!;
  return { id: e.id, fecha: e.fecha.toISOString().slice(0, 10), motivo: e.motivo };
}

/** Unblock a day. Ownership travels in the WHERE: another coach's id deletes nothing and
 *  reads as not found (false → the route 404s). */
export async function removeException(coach_id: bigint | number, id: bigint): Promise<boolean> {
  const rows = await sql<{ id: string }[]>`
    delete from coach_availability_exceptions
    where id = ${Number(id)} and coach_id = ${Number(coach_id)}
    returning id::text as id
  `;
  return rows.length > 0;
}
