import 'server-only';

// Cycle proposal (card 128 · hueco 6). ONE floor above the week importer:
// a document in, a typed stretch out. Saves nothing. Reuses
// `buildImportProposal` — there is no second grammar.

import { z } from 'zod';
import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  CYCLE_IMPORT_COVERAGE_RATCHET_PCT,
  CYCLE_IMPORT_STRETCH_MAX,
  CYCLE_IMPORT_STRETCH_MIN,
  coverageAllowsConfirm,
  coveragePct,
  sliceCycleWeeks,
} from '@fahybrid/shared/domain/import/cycle-delivery';
import { buildImportProposal, type ImportProposal, type LlmAssist } from './build-proposal';
import { foldUntypedToDeclaredNotes } from './cycle-notes';
import { CYCLE_DOCUMENT_MAX_CHARS, readCycleDocument } from './cycle-source';
import { ImportError } from './import-shared';
import { buildLlmAssist } from './llm-assist';

export const importCycleProposalRequestSchema = z
  .object({
    mode: z.literal('cycle'),
    document_text: z.string().min(1).max(CYCLE_DOCUMENT_MAX_CHARS),
    week_from: z.number().int().min(1).max(52).optional(),
    week_to: z.number().int().min(1).max(52).optional(),
    name: z.string().min(1).max(200).optional(),
  })
  .strict();

export type ImportCycleProposalRequest = z.infer<typeof importCycleProposalRequestSchema>;

export function isCycleRequest(body: unknown): boolean {
  return (
    typeof body === 'object' && body !== null && (body as { mode?: unknown }).mode === 'cycle'
  );
}

export type CycleDeliveryMeta = {
  week_from: number;
  week_to: number;
  source_week_count: number;
  stretch_min: number;
  stretch_max: number;
  coverage_pct: number;
  coverage_ratchet_pct: number;
  can_confirm: boolean;
  source_kind: 'json' | 'markdown';
};

export type CycleImportProposal = ImportProposal & {
  delivery: CycleDeliveryMeta;
};

export async function buildCycleProposal(params: {
  coach_id: number | bigint;
  body: unknown;
  client?: Sql;
  llmAssist?: LlmAssist | null;
}): Promise<CycleImportProposal> {
  const parsed = importCycleProposalRequestSchema.safeParse(params.body);
  if (!parsed.success) {
    throw new ImportError('invalid_request', parsed.error.message, 400);
  }
  const req = parsed.data;
  const client = params.client ?? defaultSql;

  const read = readCycleDocument(req.document_text);
  if (read.weeks.length === 0) {
    throw new ImportError(
      'empty_source',
      'No se ha reconocido ninguna semana de entreno en este documento.',
      422,
    );
  }

  const sliced = sliceCycleWeeks({
    weeks: read.weeks,
    week_from: req.week_from,
    week_to: req.week_to,
  });
  if ('code' in sliced) {
    throw new ImportError(sliced.code, sliced.message, 400);
  }

  const assist =
    params.llmAssist === null
      ? undefined
      : (params.llmAssist ?? buildLlmAssist(params.coach_id));

  const raw = await buildImportProposal({
    coach_id: Number(params.coach_id),
    weeks: sliced.weeks,
    llmAssist: assist,
    client,
  });
  const proposal = foldUntypedToDeclaredNotes(raw);
  const summary = proposal.summary;

  return {
    ...proposal,
    delivery: {
      week_from: sliced.week_from,
      week_to: sliced.week_to,
      source_week_count: read.weeks.length,
      stretch_min: CYCLE_IMPORT_STRETCH_MIN,
      stretch_max: CYCLE_IMPORT_STRETCH_MAX,
      coverage_pct: coveragePct(summary),
      coverage_ratchet_pct: CYCLE_IMPORT_COVERAGE_RATCHET_PCT,
      can_confirm: coverageAllowsConfirm(summary),
      source_kind: read.kind,
    },
  };
}
