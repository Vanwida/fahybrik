import 'server-only';

// Cuestionarios de alta del coach. El preset típico es semilla, no const viva.

import type { Sql, TransactionClient } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { isPgMissingRelation } from '@/lib/dashboard/db/pg-errors';
import {
  TYPICAL_ONBOARDING_NAME,
  definitionIsValid,
  duplicateOnboardingDefinition,
  normalizeDestinationEmail,
  normalizeOnboardingDefinition,
  summarizeOnboardingForm,
  typicalOnboardingPreset,
  validateDestinationEmail,
  type OnboardingFormDefinition,
  type OnboardingFormOrigin,
} from '@fahybrid/shared/domain/coach/onboarding-form';
import type { OnboardingFormRecord } from '@fahybrid/shared/schema/coach-onboarding';

type AnySql = Sql | TransactionClient;

export class OnboardingFormError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'OnboardingFormError';
  }
}

interface FormRow {
  id: string;
  name: string;
  origin: OnboardingFormOrigin;
  is_default: boolean;
  public_id: string;
  definition_json: OnboardingFormDefinition;
  destination_email: string | null;
  updated_at: string;
}

function newPublicId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  return (g.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/-/g, '').slice(0, 16);
}

function toRecord(row: FormRow): OnboardingFormRecord {
  const definition = normalizeOnboardingDefinition(row.definition_json);
  const summary = summarizeOnboardingForm(definition);
  return {
    id: String(row.id),
    name: row.name,
    origin: row.origin,
    is_default: row.is_default,
    public_id: row.public_id,
    definition,
    destination_email: row.destination_email ?? null,
    step_count: summary.step_count,
    question_count: summary.question_count,
    updated_at: row.updated_at,
  };
}

function assertDestinationEmail(raw: string | null | undefined): string | null {
  const issues = validateDestinationEmail(raw);
  if (issues.length > 0) {
    throw new OnboardingFormError('validation_error', issues[0]?.message ?? 'Ese correo no vale.', 422);
  }
  return normalizeDestinationEmail(raw);
}

function assertDefinition(def: OnboardingFormDefinition): OnboardingFormDefinition {
  const definition = normalizeOnboardingDefinition(def);
  if (!definitionIsValid(definition)) {
    throw new OnboardingFormError('validation_error', 'El cuestionario no está bien montado.', 422);
  }
  return definition;
}

async function loadLive(
  coachId: bigint | number,
  client: AnySql,
): Promise<FormRow[]> {
  try {
    return await client<FormRow[]>`
      select
        id::text as id,
        name,
        origin,
        is_default,
        public_id,
        definition_json,
        destination_email,
        updated_at::text as updated_at
      from coach_onboarding_forms
      where coach_id = ${coachId}
        and archived_at is null
      order by is_default desc, created_at asc, id asc
    `;
  } catch (err) {
    if (isPgMissingRelation(err, 'coach_onboarding_forms')) return [];
    throw err;
  }
}

export async function listOnboardingForms(
  coachId: bigint | number,
  client: AnySql = defaultSql,
): Promise<OnboardingFormRecord[]> {
  const rows = await ensureTypicalOnboarding(coachId, client);
  return rows.map(toRecord);
}

export async function getOnboardingForm(
  coachId: bigint | number,
  id: string,
  client: AnySql = defaultSql,
): Promise<OnboardingFormRecord | null> {
  const rows = await loadLive(coachId, client);
  const row = rows.find((r) => String(r.id) === String(id));
  return row ? toRecord(row) : null;
}

async function insertForm(
  coachId: bigint | number,
  input: {
    name: string;
    origin: OnboardingFormOrigin;
    is_default: boolean;
    definition: OnboardingFormDefinition;
    destination_email?: string | null;
  },
  client: AnySql,
): Promise<FormRow> {
  const definition = assertDefinition(input.definition);
  const destinationEmail = assertDestinationEmail(input.destination_email);
  if (input.is_default) {
    await client`
      update coach_onboarding_forms
      set is_default = false, updated_at = now()
      where coach_id = ${coachId}
        and archived_at is null
        and is_default
    `;
  }
  const rows = await client<FormRow[]>`
    insert into coach_onboarding_forms (
      coach_id, name, origin, is_default, public_id, definition_json, destination_email
    ) values (
      ${coachId},
      ${input.name.trim()},
      ${input.origin},
      ${input.is_default},
      ${newPublicId()},
      ${client.json(definition as never)},
      ${destinationEmail}
    )
    returning
      id::text as id,
      name,
      origin,
      is_default,
      public_id,
      definition_json,
      destination_email,
      updated_at::text as updated_at
  `;
  const row = rows[0];
  if (!row) throw new OnboardingFormError('write_failed', 'No se pudo guardar el cuestionario.', 500);
  return row;
}

export async function ensureTypicalOnboarding(
  coachId: bigint | number,
  client: AnySql = defaultSql,
): Promise<FormRow[]> {
  const existing = await loadLive(coachId, client);
  if (existing.length > 0) return existing;
  try {
    await insertForm(
      coachId,
      {
        name: TYPICAL_ONBOARDING_NAME,
        origin: 'preset',
        is_default: true,
        definition: typicalOnboardingPreset(),
      },
      client,
    );
  } catch (err) {
    if (isPgMissingRelation(err, 'coach_onboarding_forms')) return [];
    throw err;
  }
  return loadLive(coachId, client);
}

export async function createOnboardingForm(
  coachId: bigint | number,
  input: {
    name: string;
    definition: OnboardingFormDefinition;
    is_default?: boolean;
    destination_email?: string | null;
  },
  client: AnySql = defaultSql,
): Promise<OnboardingFormRecord> {
  const live = await loadLive(coachId, client);
  const row = await insertForm(
    coachId,
    {
      name: input.name,
      origin: 'custom',
      is_default: input.is_default === true || live.length === 0,
      definition: input.definition,
      destination_email: input.destination_email,
    },
    client,
  );
  return toRecord(row);
}

export async function plantTypicalOnboarding(
  coachId: bigint | number,
  client: AnySql = defaultSql,
): Promise<OnboardingFormRecord> {
  const live = await loadLive(coachId, client);
  const row = await insertForm(
    coachId,
    {
      name: TYPICAL_ONBOARDING_NAME,
      origin: 'preset',
      is_default: live.length === 0,
      definition: typicalOnboardingPreset(),
    },
    client,
  );
  return toRecord(row);
}

export async function updateOnboardingForm(
  coachId: bigint | number,
  id: string,
  input: {
    name?: string;
    definition?: OnboardingFormDefinition;
    is_default?: boolean;
    destination_email?: string | null;
  },
  client: AnySql = defaultSql,
): Promise<OnboardingFormRecord> {
  const current = await getOnboardingForm(coachId, id, client);
  if (!current) throw new OnboardingFormError('not_found', 'Ese cuestionario no existe.', 404);

  const name = input.name?.trim() ?? current.name;
  const definition = input.definition ? assertDefinition(input.definition) : current.definition;
  const destinationEmail =
    input.destination_email !== undefined
      ? assertDestinationEmail(input.destination_email)
      : current.destination_email;
  const makeDefault = input.is_default === true;

  if (makeDefault) {
    await client`
      update coach_onboarding_forms
      set is_default = false, updated_at = now()
      where coach_id = ${coachId}
        and archived_at is null
        and is_default
        and id <> ${id}
    `;
  }

  const rows = await client<FormRow[]>`
    update coach_onboarding_forms
    set
      name = ${name},
      definition_json = ${client.json(definition as never)},
      destination_email = ${destinationEmail},
      is_default = ${makeDefault ? true : current.is_default},
      updated_at = now()
    where coach_id = ${coachId}
      and id = ${id}
      and archived_at is null
    returning
      id::text as id,
      name,
      origin,
      is_default,
      public_id,
      definition_json,
      destination_email,
      updated_at::text as updated_at
  `;
  const row = rows[0];
  if (!row) throw new OnboardingFormError('not_found', 'Ese cuestionario no existe.', 404);
  return toRecord(row);
}

export async function deleteOnboardingForm(
  coachId: bigint | number,
  id: string,
  client: AnySql = defaultSql,
): Promise<void> {
  const current = await getOnboardingForm(coachId, id, client);
  if (!current) throw new OnboardingFormError('not_found', 'Ese cuestionario no existe.', 404);

  await client`
    update coach_onboarding_forms
    set archived_at = now(), is_default = false, updated_at = now()
    where coach_id = ${coachId}
      and id = ${id}
      and archived_at is null
  `;

  if (current.is_default) {
    await client`
      update coach_onboarding_forms
      set is_default = true, updated_at = now()
      where id = (
        select id from coach_onboarding_forms
        where coach_id = ${coachId}
          and archived_at is null
        order by created_at asc, id asc
        limit 1
      )
    `;
  }
}

export async function duplicateOnboardingForm(
  coachId: bigint | number,
  id: string,
  client: AnySql = defaultSql,
): Promise<OnboardingFormRecord> {
  const current = await getOnboardingForm(coachId, id, client);
  if (!current) throw new OnboardingFormError('not_found', 'Ese cuestionario no existe.', 404);
  const copyName = `${current.name} (copia)`.slice(0, 80);
  const row = await insertForm(
    coachId,
    {
      name: copyName,
      origin: 'custom',
      is_default: false,
      definition: duplicateOnboardingDefinition(current.definition),
      destination_email: current.destination_email,
    },
    client,
  );
  return toRecord(row);
}
