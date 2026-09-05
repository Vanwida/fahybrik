import { z } from 'zod';

/**
 * Contrato FH-79 — dos primitivas en el mismo PATCH de día:
 *   · día     `{ kind: 'rest' }`
 *   · sesión  `{ kind: 'rest', assignment_id }`
 *
 * Mezclar rest con `template_id` / `segments` es 400: no se reescribe la
 * instancia fingiendo un descanso. `assignment_id` inválido es 400, no un
 * wipe silencioso del día.
 */

const assignmentIdSchema = z.union([z.number(), z.string()]).transform((value, ctx) => {
  if (typeof value === 'string' && !/^\d+$/.test(value)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'assignment_id inválido' });
    return z.NEVER;
  }
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n) || n <= 0 || !Number.isSafeInteger(n)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'assignment_id inválido' });
    return z.NEVER;
  }
  return n;
});

export type RestWrite =
  | { status: 'content' }
  | { status: 'day' }
  | { status: 'session'; assignment_id: number }
  | { status: 'mixed' }
  | { status: 'bad_assignment' };

export function parseRestWrite(payload: unknown): RestWrite {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { status: 'content' };
  }
  const rec = payload as Record<string, unknown>;
  if (rec.kind !== 'rest') return { status: 'content' };
  if ('template_id' in rec || 'segments' in rec) return { status: 'mixed' };
  if ('assignment_id' in rec) {
    const parsed = assignmentIdSchema.safeParse(rec.assignment_id);
    if (!parsed.success) return { status: 'bad_assignment' };
    return { status: 'session', assignment_id: parsed.data };
  }
  return { status: 'day' };
}
