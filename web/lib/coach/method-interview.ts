import 'server-only';

// Persistencia de «Cómo entrenas». Una fila por coach. Vacío = no imita.
// El párrafo lo genera el dominio. Aquí solo se guarda y se lee.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { isPgMissingRelation } from '@/lib/dashboard/db/pg-errors';
import {
  INTERVIEW_QUESTION_COUNT,
  applyInterviewUpdate,
  answeredQuestionCount,
  emptyInterview,
  generateMirror,
  normalizeAnswers,
  normalizeMirrorText,
  type CoachMethodAnswers,
  type CoachMethodInterview,
} from '@fahybrid/shared/domain/coach/method-interview';
import type { CoachMethodInterviewResponse } from '@fahybrid/shared/schema/coach-method-interview';

const TABLE = 'coach_method_interview';

type InterviewRow = CoachMethodAnswers & {
  generated_mirror: string | null;
  mirror_text: string | null;
  updated_at: string;
};

function toInterview(row: InterviewRow): CoachMethodInterview {
  const answers = normalizeAnswers(row);
  const generated = generateMirror(answers);
  const storedMirror = normalizeMirrorText(row.mirror_text) ?? '';
  const storedGenerated = normalizeMirrorText(row.generated_mirror) ?? '';
  const wasEdited = storedMirror.length > 0 && storedMirror !== storedGenerated;
  const mirror_text = wasEdited ? storedMirror : generated;
  return {
    answers,
    generated_mirror: generated,
    mirror_text,
    mirror_is_edited: wasEdited && storedMirror !== generated,
  };
}

function toResponse(
  interview: CoachMethodInterview,
  updated_at: string | null,
): CoachMethodInterviewResponse {
  return {
    answers: interview.answers,
    generated_mirror: interview.generated_mirror,
    mirror_text: interview.mirror_text,
    mirror_is_edited: interview.mirror_is_edited,
    answered_count: answeredQuestionCount(interview.answers),
    question_count: INTERVIEW_QUESTION_COUNT,
    updated_at,
  };
}

async function loadRow(
  coach_id: bigint | number,
  client: Sql,
): Promise<InterviewRow | null> {
  try {
    const rows = await client<InterviewRow[]>`
      select
        majority_work, typical_day, typical_athlete, venue,
        start_from, block_length, within_block, if_date_crowded, easy_week,
        training_days, save_three, hard_day_place, two_hard, same_day_two,
        things_per_day, session_menu, must_write, prescribe_hard, race_like_when,
        never_programs, strength_role, easy_role, number_source, tests_used,
        no_recent_number, measure_for_measure, if_going_well, raise_variable,
        if_flat, bad_sleep_hard, skipped_day, published_voice, is_this_ok,
        box_stops, typical_day_other, save_three_other, never_programs_named,
        box_stops_phrase, generated_mirror, mirror_text,
        updated_at::text as updated_at
      from coach_method_interview
      where coach_id = ${coach_id}
      limit 1
    `;
    return rows[0] ?? null;
  } catch (err) {
    if (isPgMissingRelation(err, TABLE)) return null;
    throw err;
  }
}

export async function getCoachMethodInterview(
  coach_id: bigint | number,
  client: Sql = defaultSql,
): Promise<CoachMethodInterviewResponse> {
  const row = await loadRow(coach_id, client);
  if (!row) return toResponse(emptyInterview(), null);
  return toResponse(toInterview(row), row.updated_at);
}

/** El texto que leen plan / chat / MCP. Cadena vacía = no hay sistema. */
export async function loadCoachMethodMirror(
  coach_id: bigint | number,
  client: Sql = defaultSql,
): Promise<string> {
  const row = await getCoachMethodInterview(coach_id, client);
  return row.mirror_text || row.generated_mirror;
}

export async function upsertCoachMethodInterview(
  coach_id: bigint | number,
  patch: {
    answers: CoachMethodAnswers;
    mirror_text?: string | null;
  },
  client: Sql = defaultSql,
): Promise<CoachMethodInterviewResponse> {
  const prevRow = await loadRow(coach_id, client);
  const prev = prevRow ? toInterview(prevRow) : emptyInterview();
  const next = applyInterviewUpdate(prev, {
    answers: patch.answers,
    ...(patch.mirror_text !== undefined ? { mirror_text: patch.mirror_text } : {}),
  });

  const a = next.answers;
  const generated = next.generated_mirror || null;
  const mirror = next.mirror_text || null;
  const tests = a.tests_used ? [...a.tests_used] : null;

  const rows = await client<Array<{ updated_at: string }>>`
    insert into coach_method_interview (
      coach_id,
      majority_work, typical_day, typical_athlete, venue,
      start_from, block_length, within_block, if_date_crowded, easy_week,
      training_days, save_three, hard_day_place, two_hard, same_day_two,
      things_per_day, session_menu, must_write, prescribe_hard, race_like_when,
      never_programs, strength_role, easy_role, number_source, tests_used,
      no_recent_number, measure_for_measure, if_going_well, raise_variable,
      if_flat, bad_sleep_hard, skipped_day, published_voice, is_this_ok,
      box_stops, typical_day_other, save_three_other, never_programs_named,
      box_stops_phrase, generated_mirror, mirror_text, updated_at
    ) values (
      ${coach_id},
      ${a.majority_work}, ${a.typical_day}, ${a.typical_athlete}, ${a.venue},
      ${a.start_from}, ${a.block_length}, ${a.within_block}, ${a.if_date_crowded},
      ${a.easy_week}, ${a.training_days}, ${a.save_three}, ${a.hard_day_place},
      ${a.two_hard}, ${a.same_day_two}, ${a.things_per_day}, ${a.session_menu},
      ${a.must_write}, ${a.prescribe_hard}, ${a.race_like_when}, ${a.never_programs},
      ${a.strength_role}, ${a.easy_role}, ${a.number_source}, ${tests},
      ${a.no_recent_number}, ${a.measure_for_measure}, ${a.if_going_well},
      ${a.raise_variable}, ${a.if_flat}, ${a.bad_sleep_hard}, ${a.skipped_day},
      ${a.published_voice}, ${a.is_this_ok}, ${a.box_stops},
      ${a.typical_day_other}, ${a.save_three_other}, ${a.never_programs_named},
      ${a.box_stops_phrase}, ${generated}, ${mirror}, now()
    )
    on conflict (coach_id) do update set
      majority_work = excluded.majority_work,
      typical_day = excluded.typical_day,
      typical_athlete = excluded.typical_athlete,
      venue = excluded.venue,
      start_from = excluded.start_from,
      block_length = excluded.block_length,
      within_block = excluded.within_block,
      if_date_crowded = excluded.if_date_crowded,
      easy_week = excluded.easy_week,
      training_days = excluded.training_days,
      save_three = excluded.save_three,
      hard_day_place = excluded.hard_day_place,
      two_hard = excluded.two_hard,
      same_day_two = excluded.same_day_two,
      things_per_day = excluded.things_per_day,
      session_menu = excluded.session_menu,
      must_write = excluded.must_write,
      prescribe_hard = excluded.prescribe_hard,
      race_like_when = excluded.race_like_when,
      never_programs = excluded.never_programs,
      strength_role = excluded.strength_role,
      easy_role = excluded.easy_role,
      number_source = excluded.number_source,
      tests_used = excluded.tests_used,
      no_recent_number = excluded.no_recent_number,
      measure_for_measure = excluded.measure_for_measure,
      if_going_well = excluded.if_going_well,
      raise_variable = excluded.raise_variable,
      if_flat = excluded.if_flat,
      bad_sleep_hard = excluded.bad_sleep_hard,
      skipped_day = excluded.skipped_day,
      published_voice = excluded.published_voice,
      is_this_ok = excluded.is_this_ok,
      box_stops = excluded.box_stops,
      typical_day_other = excluded.typical_day_other,
      save_three_other = excluded.save_three_other,
      never_programs_named = excluded.never_programs_named,
      box_stops_phrase = excluded.box_stops_phrase,
      generated_mirror = excluded.generated_mirror,
      mirror_text = excluded.mirror_text,
      updated_at = now()
    returning updated_at::text as updated_at
  `;

  return toResponse(next, rows[0]?.updated_at ?? new Date().toISOString());
}

export function methodMirrorPromptBlock(mirror: string): string | null {
  const text = mirror.trim();
  if (text.length === 0) return null;
  return [
    'CÓMO ENTRENA ESTE COACH (su sistema, en su voz. No lo contradigas. Si está vacío no imites a nadie):',
    text,
  ].join('\n');
}
