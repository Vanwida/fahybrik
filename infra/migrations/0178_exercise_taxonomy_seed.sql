-- 0178_exercise_taxonomy_seed.sql
--
-- EL CATÁLOGO, TRADUCIDO Y CLASIFICADO — y la basura fuera.
-- (Cimiento en 0172; ver docs/DECISIONS.md 2026-08-11 «La biblioteca de ejercicios».)
--
-- QUÉ TRAE
-- --------
--  1. Dos valores más de patrón: `anti_extension` y `flexion`. El core son 20 de los
--     126 ejercicios y su eje útil NO es empujar/tirar: es anti-extensión (plancha,
--     rueda, hollow), anti-rotación (pallof, bird dog) y flexión (abdominal). Sin
--     esos dos, una sexta parte del catálogo caía a `other` y el eje dejaba de
--     navegar justo donde más filas hay.
--  2. `name_es` para los 126 y `name_en` para los cinco que solo estaban en
--     castellano. Castellano de box, no de diccionario: «Peso muerto rumano», no
--     «Levantamiento rumano»; y lo que en un box se dice en inglés se queda en
--     inglés en las dos columnas («thruster», «burpee», «wall balls», «hollow»)
--     porque traducirlo sería inventar una palabra que nadie usa.
--  3. `movement_pattern`, `is_unilateral` e `implement_count` de cada uno.
--  4. Alias base en los dos idiomas para los movimientos que un coach escribe de
--     verdad. Sale del mapa cableado en TS (101 entradas, solo inglés, solo para el
--     importador) más el castellano que faltaba, y ahora lo leen los dos.
--
-- LOS ERRORES DE DATO QUE ARREGLA, todos verificados en producción
-- ---------------------------------------------------------------
--  · `bici-libre` tenía `modality = 'run'`. Una bici con modalidad de correr rompe
--    el reparto por modalidad, la zona y la duración estimada. → `bike`.
--  · `w23-kb-overhead-walking-lunge` estaba en `category = 'hyrox_station'` SIN
--    posición de estación. No es una estación de HYROX: es una zancada con
--    kettlebell sobre la cabeza. → `strength`. (Las 8 posiciones reales están
--    completas: 1 ski, 2 empuje, 3 arrastre, 4 burpee, 5 remo, 6 farmers,
--    7 sandbag, 8 wall balls; ski y remo viven en `cardio` con su posición puesta,
--    que es correcto: son ergómetros.)
--  · Siete filas que NO son movimientos se archivan (`archived_at`), no se borran:
--    «FUERZA PARTE ALTA» y «OPCIONAL» son rótulos de bloque; «Incremental
--    ergómetros» y «Prehab / Preventatives» son formatos; y los tres `*-15min`
--    («Foam roll lower body», «Hip mobility flow», «Banded shoulder prehab») son
--    bloques con la duración metida en el slug. Entraron por el importador del plan
--    viejo. Archivar y no borrar porque puede haber histórico colgando de ellas, y
--    `segment_executions` es ON DELETE SET NULL: un borrado le quitaría el ejercicio
--    a trabajo que un atleta ya hizo, sin avisar.
--
-- LO QUE NO HACE
-- --------------
-- No inventa ejercicios nuevos: esto ordena y traduce lo que hay. Ampliar el
-- catálogo (126 → ~500) es contenido y va aparte, con el cimiento ya puesto.
-- Tampoco toca `name`: sigue siendo el de siempre y el último recurso del resolutor.

-- ── 1. el core también tiene ejes ───────────────────────────────────────────
alter table exercises
  drop constraint if exists exercises_movement_pattern_chk,
  add constraint exercises_movement_pattern_chk
    check (movement_pattern is null or movement_pattern = any (array[
      'squat', 'hinge',
      'horizontal_push', 'vertical_push',
      'horizontal_pull', 'vertical_pull',
      'lunge', 'carry',
      'rotation', 'anti_rotation', 'anti_extension', 'flexion',
      'locomotion', 'jump', 'olympic',
      'hold', 'other'
    ]));

-- ── 2. nombres, patrón, unilateral e implementos ────────────────────────────
update exercises e set
  name_es         = v.name_es,
  name_en         = v.name_en,
  movement_pattern = v.pattern,
  is_unilateral   = v.unilateral,
  implement_count = v.implements,
  updated_at      = now()
from (values
  -- slug, name_es, name_en, patrón, unilateral, implementos
  ('run',                        'Correr',                                    'Run',                          'locomotion',      false, null::int),
  ('walk',                       'Caminar',                                   'Walk',                         'locomotion',      false, null),
  ('row',                        'Remo',                                      'Rowing',                       'locomotion',      false, null),
  ('ski-erg',                    'SkiErg',                                    'SkiErg',                       'locomotion',      false, null),
  ('bike-erg',                   'BikeErg',                                   'BikeErg',                      'locomotion',      false, null),
  ('assault-bike',               'Assault bike',                              'Assault Bike',                 'locomotion',      false, null),
  ('bici-libre',                 'Bici libre',                                'Free Bike',                    'locomotion',      false, null),
  ('incremental-ergometros',     'Incremental ergómetros',                    'Ergometer Ramp',               'locomotion',      false, null),
  ('run-technique-drills',       'Técnica de carrera',                        'Run Technique Drills',         'locomotion',      false, null),

  ('back-squat',                 'Sentadilla trasera',                        'Back Squat',                   'squat',           false, null),
  ('front-squat',                'Sentadilla frontal',                        'Front Squat',                  'squat',           false, null),
  ('goblet-squat',               'Sentadilla goblet',                         'Goblet Squat',                 'squat',           false, 1),
  ('air-squat',                  'Sentadilla sin peso',                       'Air Squat',                    'squat',           false, null),
  ('jump-squat',                 'Sentadilla con salto',                      'Jump Squat',                   'jump',            false, null),
  ('zercher-squat-jump',         'Salto de sentadilla zercher',               'Zercher Squat Jump',           'jump',            false, null),
  ('thruster',                   'Thruster',                                  'Thruster',                     'squat',           false, null),
  ('pistol-squat',               'Sentadilla a una pierna',                   'Pistol Squat',                 'squat',           true,  null),
  ('side-step-squat-band',       'Paso lateral en sentadilla con banda',      'Side Step Squat With Band',    'squat',           false, null),
  ('cossack-squat',              'Sentadilla cosaco',                         'Cossack Squat',                'lunge',           true,  null),
  ('hyrox-wall-balls',           'Wall balls',                                'Wall Balls',                   'squat',           false, 1),

  ('deadlift',                   'Peso muerto',                               'Deadlift',                     'hinge',           false, null),
  ('romanian-deadlift',          'Peso muerto rumano',                        'Romanian Deadlift',            'hinge',           false, null),
  ('single-leg-rdl',             'Peso muerto rumano a una pierna',           'Single-leg Romanian Deadlift', 'hinge',           true,  null),
  ('kb-swing',                   'Swing con kettlebell',                      'KB Swing',                     'hinge',           false, 1),
  ('hip-thrust',                 'Empuje de cadera',                          'Hip Thrust',                   'hinge',           false, null),
  ('atlas-stone-shoulder',       'Atlas stone al hombro',                     'Atlas Stone to Shoulder',      'hinge',           false, 1),
  ('w23-nordic-curl',            'Curl nórdico',                              'Nordic Curl',                  'hinge',           false, null),

  ('clean-and-jerk',             'Cargada y envión',                          'Clean & Jerk',                 'olympic',         false, null),
  ('power-clean',                'Cargada de potencia',                       'Power Clean',                  'olympic',         false, null),
  ('hang-power-clean',           'Cargada de potencia desde suspensión',      'Hang Power Clean',             'olympic',         false, null),
  ('snatch',                     'Arrancada',                                 'Snatch',                       'olympic',         false, null),
  ('dumbbell-snatch',            'Arrancada con mancuerna',                   'Dumbbell Snatch',              'olympic',         true,  1),
  ('kb-clean',                   'Cargada con kettlebell',                    'KB Clean',                     'olympic',         false, 1),
  ('sandbag-clean',              'Cargada de sandbag',                        'Sandbag Clean',                'olympic',         false, 1),
  ('turkish-get-up',             'Levantada turca',                           'Turkish Get-up',               'other',           true,  1),
  ('devil-press',                'Devil press',                               'Devil Press',                  'other',           false, 2),

  ('bench-press',                'Press banca',                               'Bench Press',                  'horizontal_push', false, null),
  ('push-up',                    'Flexión',                                   'Push-up',                      'horizontal_push', false, null),
  ('cable-fly',                  'Aperturas en polea',                        'Cable Fly',                    'horizontal_push', false, null),
  ('scapular-push-up',           'Flexión escapular',                         'Scapular Push-up',             'horizontal_push', false, null),
  ('overhead-press',             'Press militar',                             'Overhead Press',               'vertical_push',   false, null),
  ('push-press',                 'Push press',                                'Push Press',                   'vertical_push',   false, null),
  ('push-jerk',                  'Push jerk',                                 'Push Jerk',                    'vertical_push',   false, null),
  ('dip',                        'Fondo en paralelas',                        'Dip',                          'vertical_push',   false, null),
  ('weighted-dip',               'Fondo lastrado',                            'Weighted Dip',                 'vertical_push',   false, null),
  ('lateral-raise',              'Elevación lateral',                         'Lateral Raise',                'vertical_push',   false, 2),
  ('banded-front-raise',         'Elevación frontal con banda',               'Banded Front Raise',           'vertical_push',   false, null),
  ('serratus-wall-slide',        'Deslizamiento en pared para serrato',       'Serratus Wall Slide',          'vertical_push',   false, null),

  ('pull-up',                    'Dominada',                                  'Pull-up',                      'vertical_pull',   false, null),
  ('weighted-pullup',            'Dominada lastrada',                         'Weighted Pull-up',             'vertical_pull',   false, null),
  ('barbell-row',                'Remo con barra',                            'Barbell Row',                  'horizontal_pull', false, null),
  ('pendlay-row',                'Remo Pendlay',                              'Pendlay Row',                  'horizontal_pull', false, null),
  ('face-pull',                  'Face pull',                                 'Face Pull',                    'horizontal_pull', false, null),
  ('band-pull-apart',            'Apertura con banda',                        'Band Pull Apart',              'horizontal_pull', false, null),
  ('diagonal-band-pull-apart',   'Apertura diagonal con banda',               'Diagonal Band Pull Apart',     'horizontal_pull', false, null),
  ('band-scapular-retraction',   'Retracción escapular con banda',            'Band Scapular Retraction',     'horizontal_pull', false, null),
  ('prone-t-raise',              'Elevación en T tumbado',                    'Prone T Raise',                'horizontal_pull', false, 2),
  ('prone-y-raise',              'Elevación en Y tumbado',                    'Prone Y Raise',                'horizontal_pull', false, 2),
  ('cable-external-rotation',    'Rotación externa en polea',                 'Cable External Rotation',      'rotation',        true,  null),
  ('hyrox-sled-pull',            'Arrastre de trineo',                        'Sled Pull',                    'horizontal_pull', false, null),

  ('reverse-lunge',              'Zancada hacia atrás',                       'Reverse Lunge',                'lunge',           true,  null),
  ('walking-lunge',              'Zancada caminando',                         'Walking Lunge',                'lunge',           true,  null),
  ('box-step-up',                'Subida al cajón',                           'Box Step-up',                  'lunge',           true,  null),
  ('bulgarian-split-squat',      'Sentadilla búlgara',                        'Bulgarian Split Squat',        'lunge',           true,  null),
  ('hyrox-sandbag-lunges',       'Zancadas con sandbag',                      'Sandbag Lunges',               'lunge',           true,  1),
  ('w23-kb-overhead-walking-lunge', 'Zancada con kettlebell sobre la cabeza', 'KB Overhead Walking Lunge',    'lunge',           true,  1),

  ('hyrox-farmer-carry',         'Transporte de pesas',                       'Farmers Carry',                'carry',           false, 2),
  ('hyrox-sled-push',            'Empuje de trineo',                          'Sled Push',                    'carry',           false, null),
  ('sled-drag-backwards',        'Arrastre de trineo hacia atrás',            'Sled Drag (backwards)',        'carry',           false, null),
  ('monster-walk',               'Paso de monstruo con banda',                'Monster Walk',                 'carry',           false, null),

  ('box-jump',                   'Salto al cajón',                            'Box Jump',                     'jump',            false, null),
  ('w6-high-box-jump',           'Salto al cajón alto',                       'High Box Jump',                'jump',            false, null),
  ('broad-jump',                 'Salto de longitud',                         'Broad Jump',                   'jump',            false, null),
  ('depth-jump',                 'Salto en profundidad',                      'Depth Jump',                   'jump',            false, null),
  ('double-under',               'Doble salto de comba',                      'Double Under',                 'jump',            false, null),
  ('burpee',                     'Burpee',                                    'Burpee',                       'jump',            false, null),
  ('hyrox-burpee-broad-jump',    'Burpee con salto de longitud',              'Burpee Broad Jump',            'jump',            false, null),
  ('w9-burpee-to-plate',         'Burpee al disco',                           'Burpee to Plate',              'jump',            false, null),

  ('plank',                      'Plancha',                                   'Plank',                        'anti_extension',  false, null),
  ('side-plank',                 'Plancha lateral',                           'Side Plank',                   'anti_rotation',   true,  null),
  ('hollow-hold',                'Hollow',                                    'Hollow Hold',                  'anti_extension',  false, null),
  ('ab-wheel',                   'Rueda abdominal',                           'Ab Wheel',                     'anti_extension',  false, null),
  ('pallof-press',               'Press Pallof',                              'Pallof Press',                 'anti_rotation',   true,  null),
  ('bird-dog',                   'Bird dog',                                  'Bird Dog',                     'anti_rotation',   true,  null),
  ('w23-dead-bug',               'Dead bug',                                  'Dead Bug',                     'anti_extension',  false, null),
  ('russian-twist',              'Giro ruso',                                 'Russian Twist',                'rotation',        false, null),
  ('sit-up',                     'Abdominal completo',                        'Sit-up',                       'flexion',         false, null),
  ('w6-sit-up-shoot',            'Abdominal con impulso',                     'Sit-up Shoot',                 'flexion',         false, null),
  ('toes-to-bar',                'Puntas a la barra',                         'Toes-to-bar',                  'flexion',         false, null),
  ('hanging-knee-raise',         'Elevación de rodillas colgado',             'Hanging Knee Raise',           'flexion',         false, null),
  ('glute-bridge',               'Puente de glúteo',                          'Glute Bridge',                 'hinge',           false, null),
  ('single-leg-glute-bridge',    'Puente de glúteo a una pierna',             'Single-leg Glute Bridge',      'hinge',           true,  null),
  ('glute-bridge-march',         'Marcha desde puente de glúteo',             'Glute Bridge March',           'anti_extension',  true,  null),
  ('glute-bridge-isometric-hold','Isometría en puente de glúteo',             'Glute Bridge Isometric Hold',  'hold',            false, null),
  ('quadruped-hip-extension',    'Extensión de cadera en cuadrupedia',        'Quadruped Hip Extension',      'hinge',           true,  null),
  ('clamshell',                  'Concha',                                    'Clamshell',                    'rotation',        true,  null),
  ('fire-hydrant',               'Boca de riego',                             'Fire Hydrant',                 'rotation',        true,  null),

  ('ankle-dorsiflexion-mobilization', 'Movilización de tobillo',              'Ankle Dorsiflexion Mobilization','other',         true,  null),
  ('calf-stretch',               'Estiramiento de gemelo',                    'Calf Stretch',                 'other',           true,  null),
  ('cat-cow',                    'Gato-camello',                              'Cat Cow',                      'other',           false, null),
  ('cobra-pose',                 'Postura de la cobra',                       'Cobra Pose',                   'other',           false, null),
  ('couch-stretch',              'Estiramiento de sofá',                      'Couch Stretch',                'other',           true,  null),
  ('frog-stretch',               'Estiramiento de rana',                      'Frog Stretch',                 'other',           false, null),
  ('hip-90-90-stretch',          'Estiramiento de cadera 90/90',              '90/90 Hip Stretch',            'other',           true,  null),
  ('hip-cars',                   'CARs de cadera',                            'Hip CARs',                     'rotation',        true,  null),
  ('hip-flexor-stretch',         'Estiramiento de flexor de cadera',          'Hip Flexor Stretch',           'other',           true,  null),
  ('inchworm',                   'Oruga',                                     'Inchworm',                     'locomotion',      false, null),
  ('leg-cradle',                 'Cuna de pierna',                            'Leg Cradle',                   'other',           true,  null),
  ('leg-swings',                 'Balanceos de pierna',                       'Leg Swings',                   'other',           true,  null),
  ('open-book-stretch',          'Libro abierto',                             'Open Book Stretch',            'rotation',        true,  null),
  ('pigeon-pose',                'Postura de la paloma',                      'Pigeon Pose',                  'other',           true,  null),
  ('scorpion-stretch',           'Escorpión',                                 'Scorpion Stretch',             'rotation',        true,  null),
  ('shoulder-dislocates',        'Dislocaciones de hombro',                   'Shoulder Dislocates',          'other',           false, null),
  ('standing-quad-stretch',      'Estiramiento de cuádriceps de pie',         'Standing Quad Stretch',        'other',           true,  null),
  ('thoracic-rotation',          'Rotación torácica',                         'Thoracic Rotation',            'rotation',        true,  null),
  ('thread-the-needle',          'Enhebrar la aguja',                         'Thread the Needle',            'rotation',        true,  null),
  ('walking-knee-hug',           'Rodilla al pecho caminando',                'Walking Knee Hug',             'locomotion',      true,  null),
  ('windmill-stretch',           'Molino',                                    'Windmill Stretch',             'rotation',        true,  null),
  ('worlds-greatest-stretch',    'El mejor estiramiento del mundo',           'World''s Greatest Stretch',    'other',           true,  null),
  ('w6-breathing-work',          'Trabajo de respiración',                    'Breathing Work',               'other',           false, null),

  -- rótulos y bloques que entraron como ejercicios: se traducen igual porque
  -- siguen existiendo en el histórico, pero abajo se archivan.
  ('fuerza-parte-alta',          'Fuerza parte alta',                         'Upper Body Strength',          null,              false, null),
  ('opcional',                   'Opcional',                                  'Optional',                     null,              false, null),
  ('w7-prehab-preventatives',    'Prehabilitación y preventivos',             'Prehab / Preventatives',       null,              false, null),
  ('foam-roll-lower-15min',      'Foam roller de tren inferior',              'Foam Roll Lower Body',         null,              false, null),
  ('mobility-hip-flow-15min',    'Flujo de movilidad de cadera',              'Hip Mobility Flow',            null,              false, null),
  ('prehab-shoulder-banded-15min','Prehabilitación de hombro con banda',      'Banded Shoulder Prehab',       null,              false, null)
) as v(slug, name_es, name_en, pattern, unilateral, implements)
where e.slug = v.slug;

-- ── 3. los errores de dato ──────────────────────────────────────────────────
update exercises set modality = 'bike', updated_at = now()
  where slug = 'bici-libre' and modality <> 'bike';

update exercises set category = 'strength', updated_at = now()
  where slug = 'w23-kb-overhead-walking-lunge' and category = 'hyrox_station';

update exercises set archived_at = now(), updated_at = now()
  where archived_at is null and slug in (
    'fuerza-parte-alta', 'opcional', 'w7-prehab-preventatives',
    'foam-roll-lower-15min', 'mobility-hip-flow-15min', 'prehab-shoulder-banded-15min',
    'incremental-ergometros'
  );

-- ── 4. el vocabulario base, en los dos idiomas ──────────────────────────────
-- Un término por fila. Lo que un coach escribe de verdad: el nombre corto, el
-- coloquial, la sigla y la falta de tilde. El normalizado lo calcula la misma
-- función que indexa, así que buscador e importador no pueden divergir.
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
