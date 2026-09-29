import 'server-only';

// LAS FILAS DE LA RECUPERACIÓN — variabilidad, pulso en reposo, sueño y
// readiness del atleta, cada muestra en SU día local, para la basal única
// (`shared/domain/analytics/basal.ts`) y el bloque `recuperacion` del panel.
//
// Aquí no se calcula nada: se traen las muestras y se atribuyen a su día (la
// variabilidad al día en que se tomó, el sueño al día en que se despierta, el
// pulso en reposo por su resolvedor, que ya elige la última revisión). Lo que
// hace falta leer va desde la basal del primer día que se compara: la basal
// de ese día mira `basal_dias` atrás.
//
// El atleta viene verificado (`AtletaVerificado`): la sesión del atleta o el
// guard del coach. Es lo que sostiene el `// tenancy: verified-owner`.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { diaDeSueno, diaLocal, nochesDeSueno, type MuestraDia } from '@fahybrid/shared/domain/analytics/basal';
import { loadRestingHrDays } from '@fahybrid/shared/domain/biometrics/resting-hr';
import { addDays, parseIsoDate, zonedWallClockToUtc } from '@fahybrid/shared/domain/dates';
import type { AtletaVerificado } from './atleta-verificado';

const SEGUNDOS_POR_HORA = 3600;

export interface MuestrasRecuperacion {
  vfc: MuestraDia[];
  pulso_reposo: MuestraDia[];
  sueno: MuestraDia[];
  /** Quién midió cada señal, cuando fue un solo aparato. */
  proveedor: { vfc: string | null; pulso_reposo: string | null; sueno: string | null };
}

/** El único proveedor de unas filas, o null si hubo varios (no se corona al primero). */
function unico(fuentes: Iterable<string | null>): string | null {
  const s = new Set<string>();
  for (const f of fuentes) if (f) s.add(f);
  return s.size === 1 ? [...s][0]! : null;
}

/**
 * Las muestras de las tres señales entre dos días locales (ambos incluidos). El
 * borde de abajo se lee con la tarde anterior incluida: una noche que empieza a
 * las 23:00 del día anterior es del primer día.
 */
export async function loadMuestrasRecuperacion(
  atleta: AtletaVerificado,
  args: { tz: string; desde: string; hasta: string },
  client: Sql = defaultSql,
): Promise<MuestrasRecuperacion> {
  const desdeUtc = zonedWallClockToUtc(addDays(parseIsoDate(args.desde), -1), args.tz);
  const hastaUtc = zonedWallClockToUtc(addDays(parseIsoDate(args.hasta), 1), args.tz);

  const [filas, reposo] = await Promise.all([
    // tenancy: verified-owner
    client<Array<{ metric: string; at: Date; v: number; source: string | null }>>`
      select metric_type::text as metric, recorded_at as at, value_numeric::float8 as v, source::text as source
      from biometric_streams
      where athlete_id = ${atleta.athlete_id}
        and metric_type::text in ('hrv', 'sleep_duration')
        and value_numeric is not null
        and recorded_at >= ${desdeUtc}
        and recorded_at < ${hastaUtc}
      order by recorded_at
    `,
    loadRestingHrDays({ athlete_id: atleta.athlete_id, from_iso: args.desde, to_iso: args.hasta, client }),
  ]);

  const vfc: MuestraDia[] = [];
  const sueno: MuestraDia[] = [];
  const fuentesVfc: Array<string | null> = [];
  const fuentesSueno: Array<string | null> = [];
  for (const f of filas) {
    const at = new Date(f.at);
    if (f.metric === 'hrv') {
      const dia = diaLocal(at, args.tz);
      if (dia < args.desde || dia > args.hasta) continue;
      vfc.push({ dia, valor: f.v });
      fuentesVfc.push(f.source);
    } else {
      const dia = diaDeSueno(at, args.tz);
      if (dia == null || dia < args.desde || dia > args.hasta) continue;
      sueno.push({ dia, valor: f.v / SEGUNDOS_POR_HORA });
      fuentesSueno.push(f.source);
    }
  }

  return {
    vfc,
    pulso_reposo: reposo.map((d) => ({ dia: d.on, valor: d.bpm })),
    // Una noche, un número: el lote más completo de los que subió el teléfono.
    sueno: nochesDeSueno(sueno),
    // El resolvedor de reposo no dice de qué aparato viene cada día.
    proveedor: { vfc: unico(fuentesVfc), pulso_reposo: null, sueno: unico(fuentesSueno) },
  };
}

/** Los readiness GUARDADOS entre dos días locales (el de hoy lo trae el cómputo fresco). */
export async function loadSerieReadiness(
  atleta: AtletaVerificado,
  args: { desde: string; hasta: string },
  client: Sql = defaultSql,
): Promise<Array<{ dia: string; puntos: number }>> {
  // tenancy: verified-owner
  const rows = await client<Array<{ dia: string; puntos: number }>>`
    select to_char(recorded_for, 'YYYY-MM-DD') as dia, score::int as puntos
    from athlete_daily_readiness_snapshots
    where athlete_id = ${atleta.athlete_id}
      and recorded_for >= ${args.desde}::date
      and recorded_for <= ${args.hasta}::date
    order by recorded_for
  `;
  return rows;
}
