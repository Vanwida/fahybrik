-- Availability is catalog data, never a prescribed quantity or coach methodology.
-- Match the audited public taxonomy on fresh installs as well as production.
-- 0247 reconstructed old tags for these rows; it must not route drills to GPS.
update exercises e set category = v.category::exercise_category, modality = v.modality
from (values
  ('walk','cardio','other'), ('run-technique-drills','skill','functional'),
  ('air-squat','skill','functional'), ('thruster','strength','strength'),
  ('pistol-squat','skill','functional'), ('kb-swing','strength','strength'),
  ('atlas-stone-shoulder','strength','strength'), ('sandbag-clean','strength','strength'),
  ('devil-press','strength','strength'), ('push-up','skill','functional'),
  ('dip','strength','strength'), ('pull-up','strength','strength'),
  ('w23-kb-overhead-walking-lunge','strength','functional'),
  ('sled-drag-backwards','strength','strength'), ('double-under','plyometric','functional'),
  ('burpee','skill','functional'), ('toes-to-bar','skill','functional')
) v(slug,category,modality)
where e.slug = v.slug and e.coach_id is null and e.archived_at is null;

update exercises set default_metrics_json = default_metrics_json
  || '{"reps":true,"time":true,"rpe":true}'::jsonb
where coach_id is null and archived_at is null and slug in (
  'w6-sit-up-shoot','hand-open-close','body-saw','banded-hip-flexion','banded-wrist-flexion',
  'landmine-twist','cable-woodchop','mountain-climber','stability-ball-pike',
  'plank-up-down','plank-shoulder-tap'
) and not (coalesce((default_metrics_json->>'reps')::boolean, false)
  or coalesce((default_metrics_json->>'time')::boolean, false)
  or coalesce((default_metrics_json->>'duration_seconds')::boolean, false));

update exercises set default_metrics_json = default_metrics_json || '{"time":true,"reps":false}'::jsonb
where coach_id is null and archived_at is null and slug in ('foam-roll','w6-breathing-work');

-- Add canonical metric keys without discarding historical keys/values.
update exercises e
set default_metrics_json = e.default_metrics_json || jsonb_build_object(
  'time', coalesce((e.default_metrics_json->>'time')::boolean, false)
    or coalesce((e.default_metrics_json->>'duration_seconds')::boolean, false),
  'distance', coalesce((e.default_metrics_json->>'distance')::boolean, false)
    or coalesce((e.default_metrics_json->>'distance_meters')::boolean, false)
    or coalesce((e.default_metrics_json->>'distance_km')::boolean, false),
  'weight', coalesce((e.default_metrics_json->>'weight')::boolean, false)
    or coalesce((e.default_metrics_json->>'load_kg')::boolean, false),
  'hr', coalesce((e.default_metrics_json->>'hr')::boolean, false)
    or coalesce((e.default_metrics_json->>'hr_zone')::boolean, false)
), updated_at = now()
where e.coach_id is null and e.archived_at is null;

-- Carry/push/pull are measured by distance or time, not by repetition count.
update exercises set default_metrics_json = default_metrics_json
  || '{"distance":true,"time":true,"weight":true,"reps":false}'::jsonb
where coach_id is null and archived_at is null
  and slug in ('hyrox-farmer-carry','hyrox-sled-push','hyrox-sled-pull','sled-drag-backwards');

-- Static holds are timed work; the catalog must not suggest counting repetitions.
update exercises set default_metrics_json = default_metrics_json
  || '{"time":true,"reps":false}'::jsonb
where coach_id is null and archived_at is null and slug in (
  'hip-90-90-stretch','standing-quad-stretch','hip-flexor-stretch','calf-stretch',
  'frog-stretch','couch-stretch','pigeon-pose','hamstring-stretch',
  'doorway-chest-stretch','kneeling-lat-stretch','plank','side-plank',
  'hollow-hold','glute-bridge-isometric-hold','l-sit','dead-hang'
);

-- Private rows already occupy two canonical slugs in production. Publish OUR
-- generic vocabulary under an available slug; keep the private identity/content.
-- Fresh databases already have the global rows from 0247, so do not duplicate them.
with v(slug, name_es, name_en, category, modality, equipment, muscles, metrics, pattern, description, cues) as (values
  ('catalog-push-jerk', 'Push jerk', 'Push Jerk', 'strength', 'strength',
   array['barbell'], array['quads','glutes','shoulders','triceps','core'],
   '{"reps":true,"weight":true,"rpe":true}', 'vertical_push',
   'Desde la barra apoyada delante de los hombros, flexiona ligeramente las piernas e impúlsate. Recibe la barra con los brazos extendidos y las rodillas flexionadas; después ponte de pie.',
   'Mantén el tronco vertical al impulsarte. Recibe la carga estable sobre el centro del pie. Termina extendiendo caderas y rodillas antes de bajar la barra.'),
  ('outdoor-bike', 'Bici libre', 'Outdoor Cycling', 'cardio', 'bike',
   array['bicycle'], array['quads','glutes','hamstrings','calves'],
   '{"time":true,"distance":true,"hr":true,"rpe":true}', 'locomotion',
   'Pedalea en bicicleta por un recorrido adecuado al objetivo indicado por el coach. La distancia, duración e intensidad se eligen en la prescripción.',
   'Ajusta el sillín y comprueba los frenos. Pedalea de forma continua con hombros relajados. Respeta las condiciones del recorrido y las normas de circulación.')
), completed as (
  update exercises e set equipment = v.equipment, primary_muscle_groups = v.muscles,
    description = v.description, cues = v.cues,
    default_metrics_json = e.default_metrics_json || v.metrics::jsonb, updated_at = now()
  from v where e.coach_id is null and e.archived_at is null
    and e.slug = case v.slug when 'catalog-push-jerk' then 'push-jerk' else 'bici-libre' end
  returning e.id
)
insert into exercises (slug, name, name_es, name_en, category, modality,
  equipment, primary_muscle_groups, default_metrics_json, movement_pattern,
  is_unilateral, implement_count, description, cues, source)
select v.slug, v.name_en, v.name_es, v.name_en, v.category::exercise_category, v.modality,
  v.equipment, v.muscles, v.metrics::jsonb, v.pattern, false, null, v.description, v.cues,
  'catalog_launch_2026_10'
from v
where not exists (
  select 1 from exercises e where e.coach_id is null
    and e.slug in (v.slug, case v.slug when 'catalog-push-jerk' then 'push-jerk' else 'bici-libre' end)
)
on conflict (slug) do nothing;

-- Every public identity is searchable through each of its full names.
insert into exercise_aliases (exercise_id, term, term_normalized, lang, source)
select e.id, n.term, fahybrid_normalize_term(n.term), n.lang, 'system'
from exercises e
cross join lateral (values (e.name_es, 'es'), (e.name_en, 'en'), (e.name, 'en')) n(term,lang)
where e.coach_id is null and e.archived_at is null and nullif(btrim(n.term),'') is not null
on conflict (exercise_id, term_normalized) do nothing;

-- Common words and equipment variants of existing movements, not new rows.
update exercises set equipment = array['cable','resistance_band'],
  name = 'Shoulder External Rotation', name_es = 'Rotación externa de hombro', name_en = 'Shoulder External Rotation',
  description = 'Con el codo flexionado y cerca del cuerpo, rota el brazo hacia fuera contra la resistencia de una polea o una banda.',
  cues = 'Mantén el codo cerca del costado y el hombro estable. Mueve el antebrazo sin girar el tronco. Elige material y recorrido según la variante indicada por el coach.'
where slug = 'cable-external-rotation' and coach_id is null and archived_at is null;

insert into exercise_aliases (exercise_id, term, term_normalized, lang, source)
select e.id, v.term, fahybrid_normalize_term(v.term), 'es', 'system'
from (values
  ('single-leg-rdl','peso muerto unilateral'),
  ('ankle-dorsiflexion-mobilization','rodilla a la pared'),
  ('leg-swings','balanceos frontales de pierna'), ('leg-swings','balanceos laterales de pierna'),
  ('cable-external-rotation','rotación externa con banda'),
  ('cable-external-rotation','rotación externa de hombro'),
  ('cable-external-rotation','Shoulder External Rotation'),
  ('standing-calf-raise','elevación de talones'),
  ('standing-calf-raise','gemelos'),
  ('standing-calf-raise','gemelos con rodilla flexionada'),
  ('single-under','comba'), ('single-under','salto de cuerda simple'),
  ('doorway-chest-stretch','estiramiento de pecho'),
  ('hamstring-stretch','estiramiento de isquios')
) v(slug,term)
join exercises e on e.slug = v.slug and e.coach_id is null and e.archived_at is null
on conflict (exercise_id, term_normalized) do nothing;
