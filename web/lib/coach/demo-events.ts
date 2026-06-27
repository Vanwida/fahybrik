// Demo events fall-through. Used when the events table is empty so the
// Pablo demo never shows the empty-state placeholder. Mirrors the
// `is_demo` pattern in demo-data.ts: every row carries a synthetic ID
// outside the bigint sequence space ("demo-evt-…").

import type { EventListItem } from './events';

interface DemoSeed {
  slug: string;
  name: string;
  type: 'hyrox' | 'crossfit' | 'other';
  location: string | null;
  country: string | null;
  region: 'EU' | 'NA' | 'APAC' | 'LATAM' | 'MEA' | null;
  start_date: string;
  end_date: string | null;
  division: string | null;
  division_options: string[];
  source_url: string | null;
  is_visible_to_athletes: boolean;
  target_count: number;
}

// Plausible HYROX 2026 calendar — Pablo's cohort would pin most of these.
// Past races included so the "Pasados" filter has content too.
const SEEDS: ReadonlyArray<DemoSeed> = [
  {
    slug: 'hyrox-bcn-2026',
    name: 'HYROX Barcelona 2026',
    type: 'hyrox',
    location: 'Fira Gran Via',
    country: 'España',
    region: 'EU',
    start_date: '2026-06-13',
    end_date: '2026-06-14',
    division: 'Pro',
    division_options: ['Open', 'Pro', 'Doubles', 'Relay'],
    source_url: 'https://hyrox.com/event/barcelona/',
    is_visible_to_athletes: true,
    target_count: 8,
  },
  {
    slug: 'hyrox-mad-2026',
    name: 'HYROX Madrid 2026',
    type: 'hyrox',
    location: 'IFEMA',
    country: 'España',
    region: 'EU',
    start_date: '2026-09-12',
    end_date: '2026-09-13',
    division: null,
    division_options: ['Open', 'Pro', 'Doubles', 'Relay'],
    source_url: 'https://hyrox.com/event/madrid/',
    is_visible_to_athletes: true,
    target_count: 5,
  },
  {
    slug: 'hyrox-marseille-2026',
    name: 'HYROX Marseille 2026',
    type: 'hyrox',
    location: 'Parc Chanot',
    country: 'Francia',
    region: 'EU',
    start_date: '2026-04-18',
    end_date: '2026-04-19',
    division: null,
    division_options: ['Open', 'Pro', 'Doubles'],
    source_url: 'https://hyrox.com/event/marseille/',
    is_visible_to_athletes: true,
    target_count: 2,
  },
  {
    slug: 'hyrox-lon-2026',
    name: 'HYROX London 2026',
    type: 'hyrox',
    location: 'ExCeL London',
    country: 'Reino Unido',
    region: 'EU',
    start_date: '2026-11-07',
    end_date: '2026-11-08',
    division: 'Pro',
    division_options: ['Open', 'Pro', 'Doubles', 'Relay'],
    source_url: 'https://hyrox.com/event/london/',
    is_visible_to_athletes: true,
    target_count: 3,
  },
  {
    slug: 'hyrox-world-2026',
    name: 'HYROX World Championships 2026',
    type: 'hyrox',
    location: 'OVB Arena',
    country: 'Alemania',
    region: 'EU',
    start_date: '2026-06-04',
    end_date: '2026-06-07',
    division: 'Pro',
    division_options: ['Pro'],
    source_url: 'https://hyrox.com/world-championships/',
    is_visible_to_athletes: false,
    target_count: 1,
  },
  {
    slug: 'crossfit-open-2026',
    name: 'CrossFit Open 2026',
    type: 'crossfit',
    location: 'Online',
    country: null,
    region: null,
    start_date: '2026-02-26',
    end_date: '2026-03-19',
    division: null,
    division_options: ['Rx', 'Scaled', 'Masters'],
    source_url: 'https://games.crossfit.com/the-open',
    is_visible_to_athletes: true,
    target_count: 4,
  },
  {
    slug: 'hyrox-nyc-2026',
    name: 'HYROX New York 2026',
    type: 'hyrox',
    location: 'Brooklyn Navy Yard',
    country: 'Estados Unidos',
    region: 'NA',
    start_date: '2026-10-24',
    end_date: '2026-10-25',
    division: null,
    division_options: ['Open', 'Pro', 'Doubles'],
    source_url: 'https://hyrox.com/event/new-york/',
    is_visible_to_athletes: false,
    target_count: 0,
  },
  {
    slug: 'hyrox-bcn-2025',
    name: 'HYROX Barcelona 2025',
    type: 'hyrox',
    location: 'Fira Gran Via',
    country: 'España',
    region: 'EU',
    start_date: '2025-06-14',
    end_date: '2025-06-15',
    division: 'Pro',
    division_options: ['Open', 'Pro', 'Doubles', 'Relay'],
    source_url: null,
    is_visible_to_athletes: true,
    target_count: 6,
  },
];

export interface DemoEventsOptions {
  now?: Date;
}

export function buildDemoEvents(opts: DemoEventsOptions = {}): EventListItem[] {
  const now = opts.now ?? new Date();
  const todayIso = now.toISOString().slice(0, 10);
  return SEEDS.map((seed, idx) => {
    const isPast = seed.end_date != null
      ? seed.end_date < todayIso
      : seed.start_date < todayIso;
    return {
      event_id: `demo-evt-${idx + 1}`,
      slug: seed.slug,
      name: seed.name,
      type: seed.type,
      location: seed.location,
      country: seed.country,
      region: seed.region,
      start_date: seed.start_date,
      end_date: seed.end_date,
      division: seed.division,
      division_options: seed.division_options,
      source_url: seed.source_url,
      is_visible_to_athletes: seed.is_visible_to_athletes,
      // Catalog metadata — demo seeds are HYROX, confirmed, and unverified.
      series: seed.type === 'hyrox' ? 'hyrox' : 'other',
      is_tentative: false,
      source: null,
      source_ref: null,
      is_verified: false,
      verified_at: null,
      is_past: isPast,
      target_count: seed.target_count,
    };
  });
}
