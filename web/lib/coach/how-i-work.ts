import 'server-only';

// Cómo trabaja el coach — lectura/escritura de `coach_how_i_work` (mig 0197).
// Scoped siempre a coach_id. Sin fila = vacío = no imitar.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { isPgMissingRelation } from '@/lib/dashboard/db/pg-errors';
import {
  emptyHowIWork,
  hasHowIWorkMethod,
  normalizeHowIWorkText,
  type HowIWorkPdfMeta,
} from '@fahybrid/shared/domain/coach/how-i-work';
import type { CoachHowIWorkResponse } from '@fahybrid/shared/schema/coach-how-i-work';

const TABLE = 'coach_how_i_work';

interface HowIWorkRow {
  body_text: string | null;
  pdf_filename: string | null;
  pdf_byte_size: number | null;
  pdf_uploaded_at: string | null;
  updated_at: string;
}

export interface HowIWorkPdfBytes {
  filename: string;
  mime: string;
  bytes: Uint8Array;
  byte_size: number;
}

function pdfMeta(row: HowIWorkRow): HowIWorkPdfMeta | null {
  if (!row.pdf_filename || row.pdf_byte_size == null || !row.pdf_uploaded_at) return null;
  return {
    filename: row.pdf_filename,
    byte_size: row.pdf_byte_size,
    uploaded_at: row.pdf_uploaded_at,
  };
}

function toResponse(row: HowIWorkRow | null): CoachHowIWorkResponse {
  if (!row) {
    return { ...emptyHowIWork(), has_method: false, updated_at: null };
  }
  const body_text = normalizeHowIWorkText(row.body_text);
  const pdf = pdfMeta(row);
  return {
    body_text,
    pdf,
    has_method: hasHowIWorkMethod({ body_text, has_pdf: pdf !== null }),
    updated_at: row.updated_at,
  };
}

async function loadRow(
  coach_id: bigint | number,
  client: Sql,
): Promise<HowIWorkRow | null> {
  try {
    const rows = await client<HowIWorkRow[]>`
      select
        body_text,
        pdf_filename,
        pdf_byte_size,
        pdf_uploaded_at::text as pdf_uploaded_at,
        updated_at::text as updated_at
      from coach_how_i_work
      where coach_id = ${coach_id}
      limit 1
    `;
    return rows[0] ?? null;
  } catch (err) {
    if (isPgMissingRelation(err, TABLE)) return null;
    throw err;
  }
}

export async function getHowIWork(
  coach_id: bigint | number,
  client: Sql = defaultSql,
): Promise<CoachHowIWorkResponse> {
  return toResponse(await loadRow(coach_id, client));
}

async function deleteRow(coach_id: bigint | number, client: Sql): Promise<void> {
  await client`
    delete from coach_how_i_work
    where coach_id = ${coach_id}
  `;
}

export async function upsertHowIWorkText(
  coach_id: bigint | number,
  body_text_raw: string,
  client: Sql = defaultSql,
): Promise<CoachHowIWorkResponse> {
  const body_text = normalizeHowIWorkText(body_text_raw);
  const existing = await loadRow(coach_id, client);
  const hasPdf = existing ? pdfMeta(existing) !== null : false;

  if (body_text === null && !hasPdf) {
    if (existing) await deleteRow(coach_id, client);
    return toResponse(null);
  }

  const rows = await client<HowIWorkRow[]>`
    insert into coach_how_i_work (coach_id, body_text, updated_at)
    values (${coach_id}, ${body_text}, now())
    on conflict (coach_id) do update set
      body_text = excluded.body_text,
      updated_at = now()
    returning
      body_text,
      pdf_filename,
      pdf_byte_size,
      pdf_uploaded_at::text as pdf_uploaded_at,
      updated_at::text as updated_at
  `;
  return toResponse(rows[0] ?? null);
}

export async function putHowIWorkPdf(
  coach_id: bigint | number,
  file: { filename: string; bytes: Uint8Array; byte_size: number },
  client: Sql = defaultSql,
): Promise<CoachHowIWorkResponse> {
  const existing = await loadRow(coach_id, client);
  const body_text = existing ? normalizeHowIWorkText(existing.body_text) : null;
  const bytes = Buffer.from(file.bytes);

  const rows = await client<HowIWorkRow[]>`
    insert into coach_how_i_work (
      coach_id,
      body_text,
      pdf_filename,
      pdf_mime,
      pdf_bytes,
      pdf_byte_size,
      pdf_uploaded_at,
      updated_at
    )
    values (
      ${coach_id},
      ${body_text},
      ${file.filename},
      ${'application/pdf'},
      ${bytes},
      ${file.byte_size},
      now(),
      now()
    )
    on conflict (coach_id) do update set
      pdf_filename = excluded.pdf_filename,
      pdf_mime = excluded.pdf_mime,
      pdf_bytes = excluded.pdf_bytes,
      pdf_byte_size = excluded.pdf_byte_size,
      pdf_uploaded_at = now(),
      updated_at = now()
    returning
      body_text,
      pdf_filename,
      pdf_byte_size,
      pdf_uploaded_at::text as pdf_uploaded_at,
      updated_at::text as updated_at
  `;
  return toResponse(rows[0] ?? null);
}

export async function deleteHowIWorkPdf(
  coach_id: bigint | number,
  client: Sql = defaultSql,
): Promise<CoachHowIWorkResponse> {
  const existing = await loadRow(coach_id, client);
  if (!existing) return toResponse(null);

  const body_text = normalizeHowIWorkText(existing.body_text);
  if (body_text === null) {
    await deleteRow(coach_id, client);
    return toResponse(null);
  }

  const rows = await client<HowIWorkRow[]>`
    update coach_how_i_work
    set
      pdf_filename = null,
      pdf_mime = null,
      pdf_bytes = null,
      pdf_byte_size = null,
      pdf_uploaded_at = null,
      updated_at = now()
    where coach_id = ${coach_id}
    returning
      body_text,
      pdf_filename,
      pdf_byte_size,
      pdf_uploaded_at::text as pdf_uploaded_at,
      updated_at::text as updated_at
  `;
  return toResponse(rows[0] ?? null);
}

export async function getHowIWorkPdfBytes(
  coach_id: bigint | number,
  client: Sql = defaultSql,
): Promise<HowIWorkPdfBytes | null> {
  try {
    const rows = await client<
      Array<{
        pdf_filename: string | null;
        pdf_mime: string | null;
        pdf_bytes: Uint8Array | Buffer | null;
        pdf_byte_size: number | null;
      }>
    >`
      select pdf_filename, pdf_mime, pdf_bytes, pdf_byte_size
      from coach_how_i_work
      where coach_id = ${coach_id}
      limit 1
    `;
    const row = rows[0];
    if (!row?.pdf_filename || !row.pdf_bytes || row.pdf_byte_size == null) return null;
    const bytes = row.pdf_bytes instanceof Uint8Array ? row.pdf_bytes : new Uint8Array(row.pdf_bytes);
    return {
      filename: row.pdf_filename,
      mime: row.pdf_mime ?? 'application/pdf',
      bytes,
      byte_size: row.pdf_byte_size,
    };
  } catch (err) {
    if (isPgMissingRelation(err, TABLE)) return null;
    throw err;
  }
}
