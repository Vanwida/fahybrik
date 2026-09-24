-- 0247 — EL CATÁLOGO BASE NACE DE LAS MIGRACIONES
--
-- POR QUÉ
-- En la línea rápida del editor, «sentadilla», «peso muerto» o «press banca» no
-- encontraban nada en una base recién montada: el catálogo solo tenía los 71
-- ejercicios que crean 0152 y 0205 (movilidad, activación y los básicos que
-- faltaban), y ni un levantamiento principal.
--
-- En producción esos ejercicios SÍ existen: son las ~126 filas que 0178 traduce
-- y clasifica (y cuyos alias ES/EN añade). Pero 0178 es un UPDATE sobre filas
-- que ninguna migración crea — entraron a mano, con scripts de siembra que ya
-- no casan con el esquema (`infra/scripts/seed_exercises.ts` siembra otro
-- catálogo, en inglés y con otros slugs, y no rellena `modality`, que es NOT
-- NULL). Resultado: toda base que no sea la de producción (local, tests, una
-- rama nueva, la región de otro cliente) arranca sin sentadilla. Para vender
-- esto a otros entrenadores el catálogo base tiene que venir con el esquema.
--
-- QUÉ HACE
--   1. Crea las filas base de 0178 que falten, con sus mismos slugs, nombres
--      ES/EN, patrón, lado e implementos (los datos de 0178, no inventados), más
--      la categoría y la modalidad que el esquema exige. Las siete filas que
--      0178 archiva (rótulos y bloques que no son movimientos) NO se crean.
--      Las 8 estaciones de HYROX llevan su posición.
--   2. Vuelve a pasar los alias de 0178 (su bloque 4, idéntico): en una base
--      nueva no se aplicaron porque sus ejercicios no existían.
--
-- En producción no cambia nada: `on conflict … do nothing` en las dos partes.
-- Todas nacen globales (coach_id null): son vocabulario, no metodología.

insert into exercises
  (slug, name, name_en, name_es, category, modality, movement_pattern,
   is_unilateral, implement_count, hyrox_station_position, source)
select v.slug, v.name, v.name_en, v.name_es, v.category::exercise_category, v.modality,
       v.pattern, v.unilateral, v.implements, v.station, 'catalog_base'
from (values
  ('run', 'Run', 'Run', 'Correr', 'cardio', 'run', 'locomotion', false, null, null),
  ('walk', 'Walk', 'Walk', 'Caminar', 'cardio', 'run', 'locomotion', false, null, null),
  ('row', 'Rowing', 'Rowing', 'Remo', 'cardio', 'row', 'locomotion', false, null, 5),
  ('ski-erg', 'SkiErg', 'SkiErg', 'SkiErg', 'cardio', 'ski', 'locomotion', false, null, 1),
  ('bike-erg', 'BikeErg', 'BikeErg', 'BikeErg', 'cardio', 'bike', 'locomotion', false, null, null),
  ('assault-bike', 'Assault Bike', 'Assault Bike', 'Assault bike', 'cardio', 'bike', 'locomotion', false, null, null),
  ('bici-libre', 'Free Bike', 'Free Bike', 'Bici libre', 'cardio', 'bike', 'locomotion', false, null, null),
  ('run-technique-drills', 'Run Technique Drills', 'Run Technique Drills', 'Técnica de carrera', 'cardio', 'run', 'locomotion', false, null, null),
  ('back-squat', 'Back Squat', 'Back Squat', 'Sentadilla trasera', 'strength', 'strength', 'squat', false, null, null),
  ('front-squat', 'Front Squat', 'Front Squat', 'Sentadilla frontal', 'strength', 'strength', 'squat', false, null, null),
  ('goblet-squat', 'Goblet Squat', 'Goblet Squat', 'Sentadilla goblet', 'strength', 'strength', 'squat', false, 1, null),
  ('air-squat', 'Air Squat', 'Air Squat', 'Sentadilla sin peso', 'strength', 'strength', 'squat', false, null, null),
  ('jump-squat', 'Jump Squat', 'Jump Squat', 'Sentadilla con salto', 'plyometric', 'functional', 'jump', false, null, null),
  ('zercher-squat-jump', 'Zercher Squat Jump', 'Zercher Squat Jump', 'Salto de sentadilla zercher', 'plyometric', 'functional', 'jump', false, null, null),
  ('thruster', 'Thruster', 'Thruster', 'Thruster', 'strength', 'functional', 'squat', false, null, null),
  ('pistol-squat', 'Pistol Squat', 'Pistol Squat', 'Sentadilla a una pierna', 'skill', 'strength', 'squat', true, null, null),
  ('hyrox-wall-balls', 'Wall Balls', 'Wall Balls', 'Wall balls', 'hyrox_station', 'functional', 'squat', false, 1, 8),
  ('deadlift', 'Deadlift', 'Deadlift', 'Peso muerto', 'strength', 'strength', 'hinge', false, null, null),
  ('romanian-deadlift', 'Romanian Deadlift', 'Romanian Deadlift', 'Peso muerto rumano', 'strength', 'strength', 'hinge', false, null, null),
  ('single-leg-rdl', 'Single-leg Romanian Deadlift', 'Single-leg Romanian Deadlift', 'Peso muerto rumano a una pierna', 'strength', 'strength', 'hinge', true, null, null),
  ('kb-swing', 'KB Swing', 'KB Swing', 'Swing con kettlebell', 'strength', 'functional', 'hinge', false, 1, null),
  ('hip-thrust', 'Hip Thrust', 'Hip Thrust', 'Empuje de cadera', 'strength', 'strength', 'hinge', false, null, null),
  ('atlas-stone-shoulder', 'Atlas Stone to Shoulder', 'Atlas Stone to Shoulder', 'Atlas stone al hombro', 'strength', 'functional', 'hinge', false, 1, null),
  ('w23-nordic-curl', 'Nordic Curl', 'Nordic Curl', 'Curl nórdico', 'strength', 'strength', 'hinge', false, null, null),
  ('clean-and-jerk', 'Clean & Jerk', 'Clean & Jerk', 'Cargada y envión', 'strength', 'strength', 'olympic', false, null, null),
  ('power-clean', 'Power Clean', 'Power Clean', 'Cargada de potencia', 'strength', 'strength', 'olympic', false, null, null),
  ('hang-power-clean', 'Hang Power Clean', 'Hang Power Clean', 'Cargada de potencia desde suspensión', 'strength', 'strength', 'olympic', false, null, null),
  ('snatch', 'Snatch', 'Snatch', 'Arrancada', 'strength', 'strength', 'olympic', false, null, null),
  ('dumbbell-snatch', 'Dumbbell Snatch', 'Dumbbell Snatch', 'Arrancada con mancuerna', 'strength', 'strength', 'olympic', true, 1, null),
  ('kb-clean', 'KB Clean', 'KB Clean', 'Cargada con kettlebell', 'strength', 'strength', 'olympic', false, 1, null),
  ('sandbag-clean', 'Sandbag Clean', 'Sandbag Clean', 'Cargada de sandbag', 'strength', 'functional', 'olympic', false, 1, null),
  ('turkish-get-up', 'Turkish Get-up', 'Turkish Get-up', 'Levantada turca', 'strength', 'strength', 'other', true, 1, null),
  ('devil-press', 'Devil Press', 'Devil Press', 'Devil press', 'strength', 'functional', 'other', false, 2, null),
  ('bench-press', 'Bench Press', 'Bench Press', 'Press banca', 'strength', 'strength', 'horizontal_push', false, null, null),
  ('push-up', 'Push-up', 'Push-up', 'Flexión', 'skill', 'strength', 'horizontal_push', false, null, null),
  ('cable-fly', 'Cable Fly', 'Cable Fly', 'Aperturas en polea', 'strength', 'strength', 'horizontal_push', false, null, null),
  ('overhead-press', 'Overhead Press', 'Overhead Press', 'Press militar', 'strength', 'strength', 'vertical_push', false, null, null),
  ('push-press', 'Push Press', 'Push Press', 'Push press', 'strength', 'strength', 'vertical_push', false, null, null),
  ('push-jerk', 'Push Jerk', 'Push Jerk', 'Push jerk', 'strength', 'strength', 'vertical_push', false, null, null),
  ('dip', 'Dip', 'Dip', 'Fondo en paralelas', 'skill', 'strength', 'vertical_push', false, null, null),
  ('weighted-dip', 'Weighted Dip', 'Weighted Dip', 'Fondo lastrado', 'strength', 'strength', 'vertical_push', false, null, null),
  ('lateral-raise', 'Lateral Raise', 'Lateral Raise', 'Elevación lateral', 'strength', 'strength', 'vertical_push', false, 2, null),
  ('pull-up', 'Pull-up', 'Pull-up', 'Dominada', 'skill', 'strength', 'vertical_pull', false, null, null),
  ('weighted-pullup', 'Weighted Pull-up', 'Weighted Pull-up', 'Dominada lastrada', 'strength', 'strength', 'vertical_pull', false, null, null),
  ('barbell-row', 'Barbell Row', 'Barbell Row', 'Remo con barra', 'strength', 'strength', 'horizontal_pull', false, null, null),
  ('pendlay-row', 'Pendlay Row', 'Pendlay Row', 'Remo Pendlay', 'strength', 'strength', 'horizontal_pull', false, null, null),
  ('hyrox-sled-pull', 'Sled Pull', 'Sled Pull', 'Arrastre de trineo', 'hyrox_station', 'functional', 'horizontal_pull', false, null, 3),
  ('reverse-lunge', 'Reverse Lunge', 'Reverse Lunge', 'Zancada hacia atrás', 'strength', 'strength', 'lunge', true, null, null),
  ('walking-lunge', 'Walking Lunge', 'Walking Lunge', 'Zancada caminando', 'strength', 'strength', 'lunge', true, null, null),
  ('box-step-up', 'Box Step-up', 'Box Step-up', 'Subida al cajón', 'strength', 'strength', 'lunge', true, null, null),
  ('bulgarian-split-squat', 'Bulgarian Split Squat', 'Bulgarian Split Squat', 'Sentadilla búlgara', 'strength', 'strength', 'lunge', true, null, null),
  ('hyrox-sandbag-lunges', 'Sandbag Lunges', 'Sandbag Lunges', 'Zancadas con sandbag', 'hyrox_station', 'functional', 'lunge', true, 1, 7),
  ('w23-kb-overhead-walking-lunge', 'KB Overhead Walking Lunge', 'KB Overhead Walking Lunge', 'Zancada con kettlebell sobre la cabeza', 'strength', 'strength', 'lunge', true, 1, null),
  ('hyrox-farmer-carry', 'Farmers Carry', 'Farmers Carry', 'Transporte de pesas', 'hyrox_station', 'functional', 'carry', false, 2, 6),
  ('hyrox-sled-push', 'Sled Push', 'Sled Push', 'Empuje de trineo', 'hyrox_station', 'functional', 'carry', false, null, 2),
  ('sled-drag-backwards', 'Sled Drag (backwards)', 'Sled Drag (backwards)', 'Arrastre de trineo hacia atrás', 'strength', 'functional', 'carry', false, null, null),
  ('box-jump', 'Box Jump', 'Box Jump', 'Salto al cajón', 'plyometric', 'functional', 'jump', false, null, null),
  ('w6-high-box-jump', 'High Box Jump', 'High Box Jump', 'Salto al cajón alto', 'plyometric', 'functional', 'jump', false, null, null),
  ('broad-jump', 'Broad Jump', 'Broad Jump', 'Salto de longitud', 'plyometric', 'functional', 'jump', false, null, null),
  ('depth-jump', 'Depth Jump', 'Depth Jump', 'Salto en profundidad', 'plyometric', 'functional', 'jump', false, null, null),
  ('double-under', 'Double Under', 'Double Under', 'Doble salto de comba', 'skill', 'functional', 'jump', false, null, null),
  ('burpee', 'Burpee', 'Burpee', 'Burpee', 'plyometric', 'functional', 'jump', false, null, null),
  ('hyrox-burpee-broad-jump', 'Burpee Broad Jump', 'Burpee Broad Jump', 'Burpee con salto de longitud', 'hyrox_station', 'functional', 'jump', false, null, 4),
  ('w9-burpee-to-plate', 'Burpee to Plate', 'Burpee to Plate', 'Burpee al disco', 'plyometric', 'functional', 'jump', false, null, null),
  ('plank', 'Plank', 'Plank', 'Plancha', 'core', 'core', 'anti_extension', false, null, null),
  ('side-plank', 'Side Plank', 'Side Plank', 'Plancha lateral', 'core', 'core', 'anti_rotation', true, null, null),
  ('hollow-hold', 'Hollow Hold', 'Hollow Hold', 'Hollow', 'core', 'core', 'anti_extension', false, null, null),
  ('ab-wheel', 'Ab Wheel', 'Ab Wheel', 'Rueda abdominal', 'core', 'core', 'anti_extension', false, null, null),
  ('w23-dead-bug', 'Dead Bug', 'Dead Bug', 'Dead bug', 'core', 'core', 'anti_extension', false, null, null),
  ('russian-twist', 'Russian Twist', 'Russian Twist', 'Giro ruso', 'core', 'core', 'rotation', false, null, null),
  ('sit-up', 'Sit-up', 'Sit-up', 'Abdominal completo', 'core', 'core', 'flexion', false, null, null),
  ('w6-sit-up-shoot', 'Sit-up Shoot', 'Sit-up Shoot', 'Abdominal con impulso', 'core', 'core', 'flexion', false, null, null),
  ('toes-to-bar', 'Toes-to-bar', 'Toes-to-bar', 'Puntas a la barra', 'core', 'core', 'flexion', false, null, null),
  ('hanging-knee-raise', 'Hanging Knee Raise', 'Hanging Knee Raise', 'Elevación de rodillas colgado', 'core', 'core', 'flexion', false, null, null),
  ('leg-swings', 'Leg Swings', 'Leg Swings', 'Balanceos de pierna', 'mobility', 'mobility', 'other', true, null, null),
  ('thoracic-rotation', 'Thoracic Rotation', 'Thoracic Rotation', 'Rotación torácica', 'mobility', 'mobility', 'rotation', true, null, null),
  ('w6-breathing-work', 'Breathing Work', 'Breathing Work', 'Trabajo de respiración', 'mobility', 'mobility', 'other', false, null, null)
) as v(slug, name, name_en, name_es, category, modality, pattern, unilateral, implements, station)
on conflict (slug) do nothing;

-- ── Los alias de 0178, otra vez (idempotente) ──────────────────────────────
insert into exercise_aliases (exercise_id, term, term_normalized, lang, source)
select e.id, v.term, fahybrid_normalize_term(v.term), v.lang, 'system'
from (values
  ('back-squat','sentadilla','es'), ('back-squat','sentadilla trasera','es'),
  ('back-squat','sentadilla con barra','es'), ('back-squat','squat','en'),
  ('back-squat','back squat','en'), ('back-squat','sentadilla atras','es'),
  ('front-squat','sentadilla frontal','es'), ('front-squat','front squat','en'),
  ('goblet-squat','sentadilla goblet','es'), ('goblet-squat','goblet','en'),
  ('air-squat','sentadilla libre','es'), ('air-squat','air squat','en'),
  ('air-squat','sentadilla sin peso','es'),
  ('pistol-squat','pistol','en'), ('pistol-squat','sentadilla a una pierna','es'),
  ('cossack-squat','cosaco','es'), ('cossack-squat','cossack','en'),
  ('deadlift','peso muerto','es'), ('deadlift','deadlift','en'), ('deadlift','pm','es'),
  ('romanian-deadlift','peso muerto rumano','es'), ('romanian-deadlift','rdl','en'),
  ('romanian-deadlift','romanian deadlift','en'), ('romanian-deadlift','pmr','es'),
  ('single-leg-rdl','rdl a una pierna','es'), ('single-leg-rdl','single leg rdl','en'),
  ('kb-swing','swing','en'), ('kb-swing','swing con kettlebell','es'),
  ('kb-swing','swing ruso','es'),
  ('hip-thrust','empuje de cadera','es'), ('hip-thrust','hip thrust','en'),
  ('bench-press','press banca','es'), ('bench-press','banca','es'),
  ('bench-press','bench press','en'), ('bench-press','press de banca','es'),
  ('overhead-press','press militar','es'), ('overhead-press','militar','es'),
  ('overhead-press','overhead press','en'), ('overhead-press','ohp','en'),
  ('overhead-press','press hombro','es'),
  ('push-press','push press','en'), ('push-jerk','push jerk','en'),
  ('push-up','flexion','es'), ('push-up','flexiones','es'), ('push-up','push up','en'),
  ('push-up','fondo de pecho','es'),
  ('dip','fondo','es'), ('dip','fondos en paralelas','es'), ('dip','dip','en'),
  ('pull-up','dominada','es'), ('pull-up','dominadas','es'), ('pull-up','pull up','en'),
  ('weighted-pullup','dominada lastrada','es'), ('weighted-pullup','weighted pull up','en'),
  ('barbell-row','remo con barra','es'), ('barbell-row','remo barra','es'),
  ('barbell-row','barbell row','en'),
  ('pendlay-row','remo pendlay','es'), ('pendlay-row','pendlay row','en'),
  ('face-pull','face pull','en'), ('face-pull','tiron a la cara','es'),
  ('band-pull-apart','apertura con banda','es'), ('band-pull-apart','band pull apart','en'),
  ('lateral-raise','elevacion lateral','es'), ('lateral-raise','lateral raise','en'),
  ('clean-and-jerk','cargada y envion','es'), ('clean-and-jerk','clean and jerk','en'),
  ('clean-and-jerk','dos tiempos','es'),
  ('power-clean','cargada','es'), ('power-clean','power clean','en'),
  ('hang-power-clean','cargada desde suspension','es'), ('hang-power-clean','hang power clean','en'),
  ('snatch','arrancada','es'), ('snatch','snatch','en'), ('snatch','un tiempo','es'),
  ('dumbbell-snatch','arrancada con mancuerna','es'), ('dumbbell-snatch','db snatch','en'),
  ('kb-clean','cargada con kettlebell','es'), ('kb-clean','kb clean','en'),
  ('thruster','thruster','en'), ('thruster','thrusters','en'),
  ('turkish-get-up','levantada turca','es'), ('turkish-get-up','turkish get up','en'),
  ('turkish-get-up','tgu','en'),
  ('devil-press','devil press','en'),
  ('bulgarian-split-squat','sentadilla bulgara','es'), ('bulgarian-split-squat','bulgara','es'),
  ('bulgarian-split-squat','bulgarian split squat','en'),
  ('reverse-lunge','zancada atras','es'), ('reverse-lunge','reverse lunge','en'),
  ('reverse-lunge','zancada hacia atras','es'),
  ('walking-lunge','zancada caminando','es'), ('walking-lunge','walking lunge','en'),
  ('walking-lunge','zancadas','es'),
  ('box-step-up','subida al cajon','es'), ('box-step-up','step up','en'),
  ('box-jump','salto al cajon','es'), ('box-jump','box jump','en'), ('box-jump','bj','en'),
  ('broad-jump','salto de longitud','es'), ('broad-jump','broad jump','en'),
  ('double-under','doble salto','es'), ('double-under','double under','en'),
  ('double-under','dobles','es'), ('double-under','comba','es'),
  ('burpee','burpee','en'), ('burpee','burpees','en'),
  ('hyrox-burpee-broad-jump','burpee broad jump','en'), ('hyrox-burpee-broad-jump','burpee con salto','es'),
  ('hyrox-burpee-broad-jump','bbj','en'),
  ('hyrox-wall-balls','wall ball','en'), ('hyrox-wall-balls','wall balls','en'),
  ('hyrox-wall-balls','wb','en'), ('hyrox-wall-balls','balon medicinal a diana','es'),
  ('hyrox-sled-push','empuje de trineo','es'), ('hyrox-sled-push','sled push','en'),
  ('hyrox-sled-push','trineo empuje','es'),
  ('hyrox-sled-pull','arrastre de trineo','es'), ('hyrox-sled-pull','sled pull','en'),
  ('hyrox-sled-pull','trineo arrastre','es'),
  ('hyrox-farmer-carry','farmers','en'), ('hyrox-farmer-carry','farmers carry','en'),
  ('hyrox-farmer-carry','transporte de pesas','es'), ('hyrox-farmer-carry','paseo del granjero','es'),
  ('hyrox-sandbag-lunges','zancadas con sandbag','es'), ('hyrox-sandbag-lunges','sandbag lunges','en'),
  ('hyrox-sandbag-lunges','zancada con saco','es'),
  ('row','remo','es'), ('row','rowing','en'), ('row','remoergometro','es'),
  ('row','remo ergometro','es'), ('row','concept2','en'),
  ('ski-erg','ski','en'), ('ski-erg','skierg','en'), ('ski-erg','esqui','es'),
  ('bike-erg','bikeerg','en'), ('bike-erg','bici','es'), ('bike-erg','bike erg','en'),
  ('assault-bike','assault bike','en'), ('assault-bike','bici de aire','es'),
  ('run','correr','es'), ('run','carrera','es'), ('run','run','en'), ('run','rodaje','es'),
  ('walk','caminar','es'), ('walk','andar','es'), ('walk','walk','en'),
  ('plank','plancha','es'), ('plank','plank','en'), ('plank','plancha frontal','es'),
  ('side-plank','plancha lateral','es'), ('side-plank','side plank','en'),
  ('hollow-hold','hollow','en'), ('hollow-hold','hollow hold','en'),
  ('ab-wheel','rueda abdominal','es'), ('ab-wheel','ab wheel','en'),
  ('pallof-press','press pallof','es'), ('pallof-press','pallof','en'),
  ('bird-dog','bird dog','en'), ('w23-dead-bug','dead bug','en'),
  ('russian-twist','giro ruso','es'), ('russian-twist','russian twist','en'),
  ('sit-up','abdominal','es'), ('sit-up','abdominales','es'), ('sit-up','sit up','en'),
  ('toes-to-bar','puntas a la barra','es'), ('toes-to-bar','toes to bar','en'),
  ('toes-to-bar','t2b','en'),
  ('hanging-knee-raise','elevacion de rodillas','es'), ('hanging-knee-raise','hanging knee raise','en'),
  ('glute-bridge','puente de gluteo','es'), ('glute-bridge','glute bridge','en'),
  ('glute-bridge','puente','es'),
  ('w23-nordic-curl','curl nordico','es'), ('w23-nordic-curl','nordic curl','en'),
  ('hip-flexor-stretch','estiramiento de flexor de cadera','es'), ('hip-flexor-stretch','flexores de cadera','es'),
  ('standing-quad-stretch','estiramiento de cuadriceps','es'), ('standing-quad-stretch','cuadriceps','es'),
  ('calf-stretch','estiramiento de gemelo','es'), ('calf-stretch','gemelos','es'),
  ('worlds-greatest-stretch','el mejor estiramiento del mundo','es'), ('worlds-greatest-stretch','wgs','en'),
  ('cat-cow','gato camello','es'), ('cat-cow','cat cow','en'),
  ('w6-breathing-work','respiracion','es'), ('w6-breathing-work','breathing','en'),
  ('w6-breathing-work','trabajo respiratorio','es'),
  ('sandbag-clean','cargada de sandbag','es'), ('sandbag-clean','sandbag clean','en'),
  ('sandbag-clean','cargada de saco','es'),
  ('sled-drag-backwards','arrastre hacia atras','es'), ('sled-drag-backwards','sled drag','en'),
  ('monster-walk','paso de monstruo','es'), ('monster-walk','monster walk','en'),
  ('run-technique-drills','tecnica de carrera','es'), ('run-technique-drills','drills','en')
) as v(slug, term, lang)
join exercises e on e.slug = v.slug
on conflict (exercise_id, term_normalized) do nothing;
