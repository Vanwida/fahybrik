import 'server-only';

// LA COMPARATIVA DE UNA NOTA, RESUELTA EN EL MOMENTO DE SERVIRLA.
//
// El gemelo de `grafica.ts` para la otra forma que come de los segundos por zona.
// Lo consume la sección `comparativa` de una nota del coach (migración 0170),
// pero no es del comunicado: es de las ZONAS, así que la suma la hace el motor
// (`lib/zones/compare`) y el contrato vive en `@fahybrid/shared/domain/zone-compare`.
//
// SE RESUELVE Y NO SE GUARDA, por lo mismo que el camino y la gráfica: unos
// totales guardados seguirían contando lo que se sabía el día que se escribió la
// nota, ni el entreno que llegó tarde por la ingesta ni el histórico recomputado
// el día que el atleta se midió el umbral de verdad. Lo que se guarda son los dos
// trozos de calendario, que no se mueven.
//
// LAS FECHAS QUE PONEN NOMBRE A CADA LADO se leen UNA vez por atleta y se pasan a
// las dos sumas: una nota con dos comparativas no tiene por qué preguntar dos
// veces cuándo entró.

import type { Sql, TransactionClient } from '@/lib/db';
import type { CommunicationItemDTO } from '@fahybrid/shared/domain/coach-communications';
import type { ZoneComparisonDTO } from '@fahybrid/shared/domain/zone-compare';
import { loadCompareContext, loadZoneComparison } from '@/lib/zones/compare';

type DbClient = Sql | TransactionClient;

/** Dos secciones que enfrentan los MISMOS dos periodos son una sola suma. Es lo
 *  que evita que una bandeja con cuatro notas del mismo feedback dispare cuatro
 *  agregaciones idénticas. */
function claveDeComparacion(c: ZoneComparisonDTO): string {
  return `${c.a.week_start}|${c.b.week_start}|${c.weeks}`;
}

/**
 * Los totales de cada sección con comparativa de UNA tanda de comunicados, para
 * EL atleta que está mirando.
 *
 * Devuelve un mapa por id de sección, no por comunicado: la misma nota puede
 * llevar dos comparativas de periodos distintos, y la misma nota publicada a diez
 * atletas enfrenta diez pares de totales distintos.
 *
 * Sin `athlete_id` no se llama: en la biblioteca del coach no hay a quién
 * resolvérsela, y ahí la sección viaja con su config y sin totales — que es lo
 * que necesita el compositor para volver a abrirla.
 */
export async function resolveComparativas(args: {
  grupos: Iterable<CommunicationItemDTO[]>;
  athlete_id: number | bigint;
  sql: DbClient;
}): Promise<Map<string, ZoneComparisonDTO>> {
  const resueltas = new Map<string, ZoneComparisonDTO>();

  // Una pasada para juntar qué pares de periodos distintos hay y qué secciones
  // cuelgan de cada uno.
  const porPar = new Map<string, ZoneComparisonDTO>();
  const parDe = new Map<string, ZoneComparisonDTO>();
  for (const items of args.grupos) {
    for (const item of items) {
      if (item.display !== 'comparativa' || item.comparativa == null) continue;
      parDe.set(item.id, item.comparativa);
      const clave = claveDeComparacion(item.comparativa);
      if (!porPar.has(clave)) porPar.set(clave, item.comparativa);
    }
  }
  if (porPar.size === 0) return resueltas;

  const athlete_id = Number(args.athlete_id);
  // `loadZoneComparison` y `loadCompareContext` sólo LEEN, así que sirven tanto
  // el pool como una transacción en curso.
  const client = args.sql as Sql;
  const contexto = await loadCompareContext(athlete_id, client);
  const anclas = { alta: contexto.alta, plan: contexto.plan };

  const pares = [...porPar.values()];
  const sumas = await Promise.all(
    pares.map((p) =>
      loadZoneComparison({
        athlete_id,
        a_start: p.a.week_start,
        b_start: p.b.week_start,
        weeks: p.weeks,
        anclas,
        client,
      }),
    ),
  );
  const porClave = new Map(pares.map((p, i) => [claveDeComparacion(p), sumas[i]!] as const));

  for (const [itemId, config] of parDe) {
    const suma = porClave.get(claveDeComparacion(config));
    if (suma) resueltas.set(itemId, suma);
  }
  return resueltas;
}
