-- 0019: Migra slots_json de program_week_templates al modelo `sessions[]`.
--
-- Antes: { days: [{ day_of_week, am: {kind, template_id}, pm: {kind, template_id},
--                   parts?, pm_parts?, blocks?, pm_blocks?, focus?, coach_note? }] }
-- Ahora: { days: [{ day_of_week, sessions: [{ kind, template_id?, blocks? }],
--                   focus?, notes? }] }
--
-- Mapeo:
--   - am.kind='workout'  → sessions[0] = { kind: 'workout', template_id: am.template_id,
--                                          blocks: day.parts }
--   - pm.kind='workout'  → sessions[N] = { kind: 'workout', template_id: pm.template_id,
--                                          blocks: day.pm_parts }
--   - Ambos rest         → sessions: []
--   - day.coach_note     → day.notes
--   - day.blocks/pm_blocks (legacy deprecated dentro del modelo viejo) se descartan;
--     los datos ricos vivían en parts/pm_parts.
--
-- Idempotente: guard `NOT (slots_json->'days'->0 ? 'sessions')` para no re-correr.

begin;

UPDATE program_week_templates
SET slots_json = jsonb_build_object('days', (
  SELECT COALESCE(jsonb_agg(
    CASE
      WHEN day ? 'sessions' THEN day
      ELSE jsonb_strip_nulls(jsonb_build_object(
        'day_of_week', day->'day_of_week',
        'focus',       day->'focus',
        'notes',       COALESCE(day->'notes', day->'coach_note'),
        'sessions',    COALESCE((
          SELECT jsonb_agg(s) FROM (
            SELECT jsonb_strip_nulls(jsonb_build_object(
              'kind',        'workout',
              'template_id', day->'am'->'template_id',
              'blocks',      day->'parts'
            )) AS s
            WHERE day->'am'->>'kind' = 'workout'
            UNION ALL
            SELECT jsonb_strip_nulls(jsonb_build_object(
              'kind',        'workout',
              'template_id', day->'pm'->'template_id',
              'blocks',      day->'pm_parts'
            )) AS s
            WHERE day->'pm'->>'kind' = 'workout'
          ) sess
        ), '[]'::jsonb)
      ))
    END
  ), '[]'::jsonb)
  FROM jsonb_array_elements(slots_json->'days') AS day
)),
updated_at = now()
WHERE slots_json ? 'days'
  AND jsonb_array_length(slots_json->'days') > 0
  AND NOT (slots_json->'days'->0 ? 'sessions');

commit;
