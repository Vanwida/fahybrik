/**
 * verify-hyresult.ts — breaks the hyresult import model against LIVE data.
 *
 * Hits hyresult.com for two known athletes, parses the RSC race history, maps
 * each race through mapToRaceRow, prints a compact per-race table, and asserts
 * the model holds. NO database writes — this exercises fetch → parse → map only.
 *
 * Run (web context: @/ alias + server-only condition):
 *   cd web && NODE_OPTIONS=--conditions=react-server \
 *     ../infra/node_modules/.bin/tsx --tsconfig ./tsconfig.json \
 *     scripts/verify-hyresult.ts
 */
import { fetchAthleteRaces } from '@/lib/hyrox/hyresult/parse';
import { mapToRaceRow } from '@/lib/hyrox/hyresult/map';

interface Expect {
  slug: string;
  races: number;
}

const TARGETS: Expect[] = [
  { slug: 'pablo-amigo', races: 6 },
  { slug: 'gerard-fabregas', races: 4 },
];

const TODAY = new Date().toISOString().slice(0, 10);

function hms(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

async function verifyAthlete(target: Expect): Promise<string[]> {
  const failures: string[] = [];
  const races = await fetchAthleteRaces(target.slug);

  console.log(`\n=== ${target.slug} — ${races.length} race(s) (expected ${target.races}) ===`);
  if (races.length !== target.races) {
    failures.push(`${target.slug}: expected ${target.races} races, got ${races.length}`);
  }

  console.log(
    [
      pad('EVENT', 22),
      pad('DATE', 11),
      pad('FORMAT/LEVEL/GENDER', 26),
      pad('AGEGRP', 7),
      pad('TOTAL', 9),
      pad('RUN', 4),
      pad('STN', 4),
      pad('ROXZ', 6),
      'PARTNERS',
    ].join(' '),
  );

  for (const race of races) {
    const { row, partners } = mapToRaceRow(race, 0, target.slug);
    const runs = row.run_splits.length;
    const stations = row.station_splits.length;
    const cat = `${row.format}/${row.division}/${row.gender_category}`;
    const rox = row.roxzone_seconds != null ? hms(row.roxzone_seconds) : '—';
    const partnerNames = partners.map((p) => p.name).join(', ') || '—';

    console.log(
      [
        pad(row.name, 22),
        pad(row.race_date ?? '—', 11),
        pad(cat, 26),
        pad(row.age_group ?? '—', 7),
        pad(hms(row.result_time_seconds), 9),
        pad(String(runs), 4),
        pad(String(stations), 4),
        pad(rox, 6),
        partnerNames,
      ].join(' '),
    );

    // --- assertions ---
    if (runs !== 8) failures.push(`${target.slug} ${row.name} ${row.race_date}: ${runs} runs (≠8)`);
    if (stations !== 8) {
      failures.push(`${target.slug} ${row.name} ${row.race_date}: ${stations} stations (≠8)`);
    }
    if (row.format === 'doubles' || row.format === 'relay') {
      if (partners.length < 1) {
        failures.push(`${target.slug} ${row.name}: ${row.format} but 0 partners`);
      }
    }
    // hyresult rows MUST carry a real date (map.ts stores the true date_start);
    // null is reserved for the official single-URL import (0072), never here.
    if (row.race_date == null) {
      failures.push(`${target.slug} ${row.name}: race_date is null — hyresult must carry a real date`);
    } else {
      if (row.race_date === TODAY) {
        failures.push(`${target.slug} ${row.name}: race_date is TODAY (${TODAY}) — not a real date`);
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(row.race_date)) {
        failures.push(`${target.slug} ${row.name}: race_date "${row.race_date}" is malformed`);
      }
    }
  }

  return failures;
}

async function main(): Promise<void> {
  const allFailures: string[] = [];
  for (const target of TARGETS) {
    try {
      allFailures.push(...(await verifyAthlete(target)));
    } catch (err) {
      allFailures.push(`${target.slug}: threw ${(err as Error).message}`);
    }
  }

  console.log('\n----------------------------------------');
  if (allFailures.length === 0) {
    console.log('PASS — all assertions held (10 races: 6 + 4, every race 8 runs + 8 stations,');
    console.log('       doubles ≥1 partner, real past dates).');
    process.exit(0);
  } else {
    console.log(`FAIL — ${allFailures.length} assertion(s):`);
    for (const f of allFailures) console.log(`  ✗ ${f}`);
    process.exit(1);
  }
}

void main();
