/**
 * Seed initial 20 HYROX events for the 2025–2026 season (Pro division
 * available at every venue). Curated from public hyrox.com calendar listings.
 *
 * Idempotent: upsert by `slug`. Re-running this script updates the row in
 * place — safe to run after every release. Visibility defaults to TRUE so
 * Pablo's athletes see the calendar immediately on first deploy; he can
 * then untoggle the ones he doesn't want surfaced.
 *
 * Run: pnpm --filter @fahybrid/infra seed:events
 *
 * Source notes:
 *  - All dates and venues are placeholder until cross-checked against the
 *    live HYROX calendar at runtime. Pablo will edit individual rows from
 *    the dashboard if a date shifts.
 *  - All events list HYROX's six headline divisions (Pro / Open / Doubles
 *    / Mixed Doubles / Relay / Masters). Pro is always the headline
 *    `division` field.
 *  - Region buckets are EU / NA / APAC / LATAM / MEA — the same five used
 *    by the events filter UI.
 */
import { getSql } from './_db.js';

interface SeedEvent {
  slug: string;
  name: string;
  location: string;
  country: string;       // ISO 3166-1 alpha-2
  region: 'EU' | 'NA' | 'APAC' | 'LATAM' | 'MEA';
  start_date: string;    // YYYY-MM-DD
  end_date: string | null;
  source_url: string;
}

const HYROX_DIVISIONS_HEADLINE = 'Pro';
const HYROX_DIVISION_BOUQUET = [
  'Pro',
  'Open',
  'Doubles',
  'Mixed Doubles',
  'Relay',
  'Masters',
];

const EVENTS: SeedEvent[] = [
  // ----- Europe (12) -----
  {
    slug: 'hyrox-barcelona-2026',
    name: 'HYROX Barcelona',
    location: 'Fira de Barcelona, Barcelona',
    country: 'ES',
    region: 'EU',
    start_date: '2026-02-14',
    end_date: '2026-02-15',
    source_url: 'https://hyrox.com/event/barcelona/',
  },
  {
    slug: 'hyrox-madrid-2026',
    name: 'HYROX Madrid',
    location: 'IFEMA, Madrid',
    country: 'ES',
    region: 'EU',
    start_date: '2026-03-21',
    end_date: '2026-03-22',
    source_url: 'https://hyrox.com/event/madrid/',
  },
  {
    slug: 'hyrox-london-2026',
    name: 'HYROX London',
    location: 'ExCeL, London',
    country: 'GB',
    region: 'EU',
    start_date: '2026-04-25',
    end_date: '2026-04-26',
    source_url: 'https://hyrox.com/event/london/',
  },
  {
    slug: 'hyrox-paris-2026',
    name: 'HYROX Paris',
    location: 'Paris Expo Porte de Versailles, Paris',
    country: 'FR',
    region: 'EU',
    start_date: '2026-05-09',
    end_date: '2026-05-10',
    source_url: 'https://hyrox.com/event/paris/',
  },
  {
    slug: 'hyrox-amsterdam-2026',
    name: 'HYROX Amsterdam',
    location: 'RAI Amsterdam',
    country: 'NL',
    region: 'EU',
    start_date: '2026-05-30',
    end_date: '2026-05-31',
    source_url: 'https://hyrox.com/event/amsterdam/',
  },
  {
    slug: 'hyrox-berlin-2026',
    name: 'HYROX Berlin',
    location: 'Messe Berlin',
    country: 'DE',
    region: 'EU',
    start_date: '2026-09-12',
    end_date: '2026-09-13',
    source_url: 'https://hyrox.com/event/berlin/',
  },
  {
    slug: 'hyrox-hamburg-2026',
    name: 'HYROX Hamburg',
    location: 'Messe Hamburg',
    country: 'DE',
    region: 'EU',
    start_date: '2026-10-17',
    end_date: '2026-10-18',
    source_url: 'https://hyrox.com/event/hamburg/',
  },
  {
    slug: 'hyrox-vienna-2026',
    name: 'HYROX Vienna',
    location: 'Messe Wien, Vienna',
    country: 'AT',
    region: 'EU',
    start_date: '2026-11-07',
    end_date: '2026-11-08',
    source_url: 'https://hyrox.com/event/vienna/',
  },
  {
    slug: 'hyrox-milan-2026',
    name: 'HYROX Milan',
    location: 'MiCo, Milan',
    country: 'IT',
    region: 'EU',
    start_date: '2026-11-21',
    end_date: '2026-11-22',
    source_url: 'https://hyrox.com/event/milan/',
  },
  {
    slug: 'hyrox-stockholm-2026',
    name: 'HYROX Stockholm',
    location: 'Stockholmsmässan',
    country: 'SE',
    region: 'EU',
    start_date: '2026-03-07',
    end_date: '2026-03-08',
    source_url: 'https://hyrox.com/event/stockholm/',
  },
  {
    slug: 'hyrox-copenhagen-2026',
    name: 'HYROX Copenhagen',
    location: 'Bella Center',
    country: 'DK',
    region: 'EU',
    start_date: '2026-04-11',
    end_date: '2026-04-12',
    source_url: 'https://hyrox.com/event/copenhagen/',
  },
  {
    slug: 'hyrox-european-championships-2026',
    name: 'HYROX European Championships',
    location: 'Maimarkthalle, Mannheim',
    country: 'DE',
    region: 'EU',
    start_date: '2026-06-13',
    end_date: '2026-06-14',
    source_url: 'https://hyrox.com/event/european-championships/',
  },

  // ----- North America (3) -----
  {
    slug: 'hyrox-new-york-2026',
    name: 'HYROX New York',
    location: 'Javits Center, New York',
    country: 'US',
    region: 'NA',
    start_date: '2026-02-28',
    end_date: '2026-03-01',
    source_url: 'https://hyrox.com/event/new-york/',
  },
  {
    slug: 'hyrox-los-angeles-2026',
    name: 'HYROX Los Angeles',
    location: 'Long Beach Convention Center',
    country: 'US',
    region: 'NA',
    start_date: '2026-04-04',
    end_date: '2026-04-05',
    source_url: 'https://hyrox.com/event/los-angeles/',
  },
  {
    slug: 'hyrox-toronto-2026',
    name: 'HYROX Toronto',
    location: 'Enercare Centre, Toronto',
    country: 'CA',
    region: 'NA',
    start_date: '2026-10-03',
    end_date: '2026-10-04',
    source_url: 'https://hyrox.com/event/toronto/',
  },

  // ----- Asia-Pacific (2) -----
  {
    slug: 'hyrox-sydney-2026',
    name: 'HYROX Sydney',
    location: 'ICC Sydney',
    country: 'AU',
    region: 'APAC',
    start_date: '2026-08-29',
    end_date: '2026-08-30',
    source_url: 'https://hyrox.com/event/sydney/',
  },
  {
    slug: 'hyrox-singapore-2026',
    name: 'HYROX Singapore',
    location: 'Singapore Expo',
    country: 'SG',
    region: 'APAC',
    start_date: '2026-11-14',
    end_date: '2026-11-15',
    source_url: 'https://hyrox.com/event/singapore/',
  },

  // ----- LATAM (1) -----
  {
    slug: 'hyrox-mexico-city-2026',
    name: 'HYROX Mexico City',
    location: 'Centro Citibanamex, Mexico City',
    country: 'MX',
    region: 'LATAM',
    start_date: '2026-09-26',
    end_date: '2026-09-27',
    source_url: 'https://hyrox.com/event/mexico-city/',
  },

  // ----- MEA (2) -----
  {
    slug: 'hyrox-dubai-2026',
    name: 'HYROX Dubai',
    location: 'Coca-Cola Arena, Dubai',
    country: 'AE',
    region: 'MEA',
    start_date: '2026-01-31',
    end_date: '2026-02-01',
    source_url: 'https://hyrox.com/event/dubai/',
  },
  {
    slug: 'hyrox-cape-town-2026',
    name: 'HYROX Cape Town',
    location: 'CTICC, Cape Town',
    country: 'ZA',
    region: 'MEA',
    start_date: '2026-10-31',
    end_date: '2026-11-01',
    source_url: 'https://hyrox.com/event/cape-town/',
  },
];

async function upsertEvent(
  sql: ReturnType<typeof getSql>,
  spec: SeedEvent,
): Promise<{ id: string; updated: boolean }> {
  const rows = await sql<{ id: string; xmax: string }[]>`
    insert into events (
      slug,
      name,
      type,
      location,
      country,
      region,
      start_date,
      end_date,
      division,
      division_options,
      source_url,
      is_visible_to_athletes,
      created_by_coach_id
    ) values (
      ${spec.slug},
      ${spec.name},
      'hyrox',
      ${spec.location},
      ${spec.country},
      ${spec.region},
      ${spec.start_date},
      ${spec.end_date},
      ${HYROX_DIVISIONS_HEADLINE},
      ${HYROX_DIVISION_BOUQUET},
      ${spec.source_url},
      true,
      null
    )
    on conflict (slug) do update set
      name                   = excluded.name,
      type                   = excluded.type,
      location               = excluded.location,
      country                = excluded.country,
      region                 = excluded.region,
      start_date             = excluded.start_date,
      end_date               = excluded.end_date,
      division               = excluded.division,
      division_options       = excluded.division_options,
      source_url             = excluded.source_url,
      is_visible_to_athletes = events.is_visible_to_athletes,
      updated_at             = now()
    returning id::text as id, xmax::text as xmax
  `;
  const row = rows[0];
  if (!row) throw new Error(`upsert returned no row for slug=${spec.slug}`);
  // xmax = '0' indicates an INSERT; non-zero indicates an UPDATE.
  return { id: row.id, updated: row.xmax !== '0' };
}

async function main(): Promise<void> {
  const sql = getSql();
  try {
    process.stdout.write(`Seeding ${EVENTS.length} HYROX events...\n\n`);

    let inserted = 0;
    let updated = 0;
    for (const spec of EVENTS) {
      const res = await upsertEvent(sql, spec);
      if (res.updated) updated++;
      else inserted++;
      process.stdout.write(
        `  [${spec.region}] ${spec.start_date}  ${spec.name.padEnd(34)} → id=${res.id} ${res.updated ? '(updated)' : '(inserted)'}\n`,
      );
    }

    const counts = await sql<{ region: string; count: string }[]>`
      select coalesce(region, 'unknown') as region, count(*)::text as count
      from events
      where type = 'hyrox'
      group by region
      order by region
    `;
    process.stdout.write('\nHYROX event counts by region:\n');
    for (const { region, count } of counts) {
      process.stdout.write(`  ${region.padEnd(8)} ${count}\n`);
    }

    process.stdout.write(
      `\nDone. Inserted: ${inserted}, updated: ${updated}.\n`,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  process.stderr.write(
    `Seed failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
  );
  process.exit(1);
});
