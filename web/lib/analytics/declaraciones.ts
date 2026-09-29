import 'server-only';

// DECLARAR UN UMBRAL DE UN TOQUE — escribir en `athlete_declared_thresholds`
// (0277) y devolver las anclas ya resueltas, para que la pantalla vea al
// instante qué peldaño gana (un test sigue ganando a lo declarado).

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import type { AnclasAtleta, DeclaradoPor } from '@fahybrid/shared/domain/analytics/anclas';
import type { DeclaracionUmbral } from '@fahybrid/shared/domain/analytics/declaracion';
import { loadAnclasAtleta, loadDeclaraciones } from './anclas';
import type { AtletaVerificado } from './atleta-verificado';

export interface UmbralesAtleta {
  anclas: AnclasAtleta;
  /** Lo declarado de un toque, la más reciente por clave (para que el editor lo enseñe y lo pueda retirar). */
  declaraciones: Array<{ kind: string; value: number; declared_by: DeclaradoPor; declared_at_iso: string }>;
}

/** Lo que pintan las dos rutas: las anclas resueltas y lo declarado. */
export async function getUmbralesAtleta(atleta: AtletaVerificado, client: Sql = defaultSql): Promise<UmbralesAtleta> {
  const [anclas, declaraciones] = await Promise.all([loadAnclasAtleta(atleta, client), loadDeclaraciones(atleta, client)]);
  return { anclas, declaraciones };
}

/**
 * Declara (una fila nueva: la más reciente manda; el historial se queda) o
 * retira (`value: null`: se borran las declaraciones de esa clave — el atleta ya
 * no sostiene ese número).
 */
export async function declararUmbral(
  atleta: AtletaVerificado,
  d: DeclaracionUmbral,
  client: Sql = defaultSql,
): Promise<UmbralesAtleta> {
  const declared_by: DeclaradoPor = atleta.por === 'coach' ? 'coach' : 'athlete';
  if (d.value == null) {
    // tenancy: verified-owner
    await client`
      delete from athlete_declared_thresholds
      where athlete_id = ${atleta.athlete_id} and kind = ${d.kind}
    `;
  } else {
    // tenancy: verified-owner
    await client`
      insert into athlete_declared_thresholds (athlete_id, kind, value, declared_by, declared_by_coach_id, note)
      values (${atleta.athlete_id}, ${d.kind}, ${d.value}, ${declared_by}, ${atleta.coach_id}, ${d.note ?? null})
    `;
  }
  return getUmbralesAtleta(atleta, client);
}
