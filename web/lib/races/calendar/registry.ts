// Race-catalog scraper — the source registry.
//
// The single list the weekly cron iterates. Adding a new official site = write
// one adapter and append it here; nothing else changes (agnostic by construction).

import type { CatalogSource } from './types';
import { hyroxSource } from './hyrox';
import { athxSource } from './athx';
import { dekaSource } from './deka';
import { deadlyDozenSource } from './deadlydozen';

export const CATALOG_SOURCES: CatalogSource[] = [
  hyroxSource,
  athxSource,
  dekaSource,
  deadlyDozenSource,
];
