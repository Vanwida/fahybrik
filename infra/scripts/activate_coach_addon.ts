// Alta manual de un add-on. Sin --apply solo comprueba el estado en lectura.
// Lee la .env.local de raíz: --apply requiere autorización para esa base.
// Ejecutar desde web con tsx --tsconfig tsconfig.json y --conditions=react-server.
import './_load_web_env.ts';
import { z } from 'zod';

// Import dinámico: mismo cargador que los scripts que reutilizan servicios web.
const { sql } = await import('@/lib/db');
const { activateFounderEntitlement, hasEntitlement } = await import('@/lib/coach/entitlements');

const argsSchema = z.object({
  coach_id: z.coerce.number().int().positive().safe(),
  feature: z.enum(['mcp_connector', 'negocio']),
  apply: z.boolean(),
});

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2 || args.length > 3 || (args[2] && args[2] !== '--apply')) {
    throw new Error('Uso: activate_coach_addon.ts <coach_id> <feature> [--apply]');
  }
  const parsed = argsSchema.parse({ coach_id: args[0], feature: args[1], apply: args[2] === '--apply' });
  const [coach] = await sql<Array<{ id: bigint }>>`select id from coaches where id = ${parsed.coach_id}`;
  if (!coach) throw new Error('El club no existe.');

  const before = await hasEntitlement(parsed);
  const result = parsed.apply ? await activateFounderEntitlement(parsed) : null;
  const after = await hasEntitlement(parsed);
  process.stdout.write(`${JSON.stringify({ coach_id: parsed.coach_id, feature: parsed.feature, apply: parsed.apply, before, after, result })}\n`);
}

try {
  await main();
} catch (err) {
  // No imprimir el objeto del error: una excepción de conexión puede contener la URL.
  process.stderr.write(`No se ha completado la activación (${err instanceof z.ZodError ? 'argumentos no válidos' : (err as { code?: string }).code ?? 'error'}).\n`);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
