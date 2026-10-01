import 'server-only';
import { sql as defaultSql, type Sql } from '@/lib/db';
import { ProgramMonthError } from '@/lib/dashboard/coach/program-months';

/** La rejilla cambia contenido. Cambiar duración exige conservar las fechas de los recibos. */
export async function assertProgramStructureEditable(params: { coach_id: number | bigint; program_id: number; client?: Sql }): Promise<void> {
  const client = params.client ?? defaultSql;
  const rows = await client<Array<{ athlete_id: string | null; assigned: boolean }>>`
    select m.athlete_id::text,
      exists (select 1 from athlete_month_assignments a where a.month_template_id = m.id) as assigned
    from program_month_templates m
    where m.id = ${params.program_id} and m.coach_id = ${Number(params.coach_id)}
      and (m.athlete_id is null or exists (select 1 from athletes a where a.id = m.athlete_id and a.coach_id = ${Number(params.coach_id)}))
  `;
  const program = rows[0];
  if (!program) throw new ProgramMonthError('not_found', 'Programa no encontrado', 404);
  if (program.athlete_id != null) throw new ProgramMonthError('personal_structure', 'Cambia la duración desde la estructura del plan del atleta: allí se recolocan sus programas y se conserva lo entrenado.', 409);
  if (program.assigned) throw new ProgramMonthError('assigned_structure', 'Este programa ya está asignado. Para cambiar su número de semanas, duplica el programa y asigna la copia; sus días sí se pueden editar aquí.', 409);
}
