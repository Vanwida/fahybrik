import 'server-only';

// Entrada de las rutas del coach de programar (grupos, asignar, semanas, vistas,
// acciones en bloque): leer el JSON y convertir un error de zod en UNA frase que
// diga qué corregir. El detalle completo va en `details` para quien lo necesite.

import type { ZodError, ZodType, ZodTypeDef } from 'zod';
import type { NextResponse } from 'next/server';
import { jsonError, type ApiError } from '@/lib/api/responses';

export type Parsed<T> = { ok: true; data: T } | { ok: false; response: NextResponse<ApiError> };

/** Lee el cuerpo JSON. Cuerpo vacío → `{}` (para POST sin opciones). */
export async function readJsonBody(req: Request): Promise<Parsed<unknown>> {
  let text: string;
  try {
    text = await req.text();
  } catch {
    return { ok: false, response: jsonError('bad_request', 'No se pudo leer la petición.', 400) };
  }
  if (text.trim().length === 0) return { ok: true, data: {} };
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return {
      ok: false,
      response: jsonError('invalid_json', 'El cuerpo no es JSON válido. Envía un objeto JSON.', 400),
    };
  }
}

const EXPECTED_ES: Record<string, string> = {
  number: 'un número',
  string: 'un texto',
  boolean: 'verdadero o falso',
  array: 'una lista',
  object: 'un objeto',
  bigint: 'un número',
};

/**
 * La frase del primer problema. Los tipos, campos que faltan, sobrantes y listas
 * cerradas se traducen aquí; el resto (rangos, formatos, reglas) llega con el
 * mensaje en castellano que le pone cada esquema.
 */
function firstIssueMessage(error: ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'Datos inválidos.';
  const where = issue.path.length > 0 ? issue.path.join('.') : null;
  switch (issue.code) {
    case 'invalid_type':
      if (issue.received === 'undefined') {
        return where ? `Falta el campo «${where}».` : 'Falta el cuerpo de la petición.';
      }
      return `«${where ?? 'valor'}» tiene que ser ${EXPECTED_ES[issue.expected] ?? issue.expected}.`;
    case 'unrecognized_keys':
      return `Campo no admitido: ${issue.keys.map((k) => `«${k}»`).join(', ')}. Quítalo y vuelve a enviar.`;
    case 'invalid_enum_value':
      return `«${where ?? 'valor'}» tiene que ser uno de: ${issue.options.join(', ')}.`;
    case 'invalid_union_discriminator':
      return `«${where ?? 'action'}» tiene que ser uno de: ${issue.options.map(String).join(', ')}.`;
    case 'too_small':
    case 'too_big': {
      // Mensaje propio del esquema → tal cual; el genérico de zod se traduce.
      if (!/^(Number|String|Array|Set|Date|BigInt) must/.test(issue.message)) return issue.message;
      const bound = issue.code === 'too_small' ? issue.minimum : issue.maximum;
      const side = issue.code === 'too_small' ? 'como mínimo' : 'como máximo';
      if (issue.type === 'array' || issue.type === 'string') {
        const unit = issue.type === 'array' ? 'elementos' : 'caracteres';
        return `«${where ?? 'valor'}» tiene que tener ${side} ${String(bound)} ${unit}.`;
      }
      return `«${where ?? 'valor'}» tiene que ser ${side} ${String(bound)}.`;
    }
    default:
      return issue.message;
  }
}

export function parseWith<T>(schema: ZodType<T, ZodTypeDef, unknown>, raw: unknown): Parsed<T> {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };
  return {
    ok: false,
    response: jsonError('validation_error', firstIssueMessage(parsed.error), 422, parsed.error.flatten()),
  };
}

export async function parseBody<T>(req: Request, schema: ZodType<T, ZodTypeDef, unknown>): Promise<Parsed<T>> {
  const body = await readJsonBody(req);
  if (!body.ok) return body;
  return parseWith(schema, body.data);
}

/** Un id de ruta (`[id]`) → número positivo, o 400 que dice qué pasa. */
export function parseRouteId(raw: string, what: string): Parsed<number> {
  const n = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(n) || n <= 0) {
    return { ok: false, response: jsonError('bad_request', `El id de ${what} no es válido: «${raw}».`, 400) };
  }
  return { ok: true, data: n };
}
