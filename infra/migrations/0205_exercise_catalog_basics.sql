-- 0205 — LOS BÁSICOS QUE FALTABAN EN EL CATÁLOGO (card 128)
--
-- POR QUÉ
-- El catálogo global tenía 119 ejercicios activos y no tenía ni un curl de
-- bíceps, ni un encogimiento de hombros, ni un remo invertido, ni un mountain
-- climber, ni un buenos días. No es que faltaran «variantes raras»: faltaban
-- básicos de gimnasio que cualquier entrenador escribe sin pensar. Salió al
-- cruzar el catálogo contra un macrociclo real de 12 semanas (209 movimientos
-- distintos, 51 líneas sin resolver).
--
-- LA REGLA QUE DECIDE QUÉ ENTRA (Alex, 21-ago-2026)
-- Una fila del catálogo es un MOVIMIENTO, no una manera de hacerlo.
--   · «Curl de bíceps» es UNA fila. Alterno, martillo, con barra, sentado: eso
--     lo dice el entrenador en su prescripción, no lo dice el catálogo.
--   · El test: ¿el atleta tiene que aprender algo distinto? → ejercicio
--     distinto. ¿Es el mismo gesto con otro implemento, agarre, tempo o lado?
--     → el mismo, con calificador.
--   · Y lo que ya es eje del sistema (lado, carga, tempo, descanso) NO se
--     resuelve creando filas: se tipa en la prescripción.
-- Por eso las 51 líneas sin resolver del macrociclo se consolidan en 29 filas y
-- no en 51: las cuatro redacciones de «zancada explosiva / pliométrica
-- horizontal / con salto en el sitio» son UNA zancada con salto, y el salto al
-- cajón aterrizando a una pierna NO entra (el salto al cajón ya existe; cómo se
-- aterriza lo describe el entrenador).
--
-- Todas nacen globales (coach_id null), como el resto del catálogo base: son
-- vocabulario, no metodología. Ningún entrenador queda obligado a usarlas.
--
-- Idempotente: `on conflict (slug) do nothing` en los ejercicios y
-- `on conflict (exercise_id, term_normalized) do nothing` en los alias.

insert into exercises
  (slug, name, name_en, name_es, category, modality, movement_pattern,
   is_unilateral, equipment, primary_muscle_groups, source)
values
  -- ── Fuerza: los básicos ausentes ──────────────────────────────────────────
  ('bicep-curl','Bicep Curl','Bicep Curl','Curl de bíceps',
   'strength','strength','other', false,
   '{dumbbell,barbell,cable}','{biceps,forearms}','catalog_basics'),
  ('shrug','Shrug','Shrug','Encogimiento de hombros',
   'strength','strength','other', false,
   '{dumbbell,kettlebell,barbell}','{traps,upper_back}','catalog_basics'),
  ('inverted-row','Inverted Row','Inverted Row','Remo invertido',
   'strength','strength','horizontal_pull', false,
   '{barbell,rack,rope}','{upper_back,lats,biceps}','catalog_basics'),
  ('renegade-row','Renegade Row','Renegade Row','Remo renegado',
   'strength','strength','horizontal_pull', true,
   '{dumbbell,kettlebell}','{upper_back,core,lats}','catalog_basics'),
  ('band-row','Band Row','Band Row','Remo con banda',
   'strength','strength','horizontal_pull', false,
   '{band,resistance_band}','{upper_back,biceps}','catalog_basics'),
  ('good-morning','Good Morning','Good Morning','Buenos días',
   'strength','strength','hinge', false,
   '{barbell,band_or_pvc_pipe}','{hamstrings,glutes,erectors}','catalog_basics'),
  ('gorilla-row','Gorilla Row','Gorilla Row','Remo gorila',
   'strength','strength','horizontal_pull', true,
   '{kettlebell,dumbbell}','{upper_back,lats}','catalog_basics'),
  ('skater-squat','Skater Squat','Skater Squat','Sentadilla skater',
   'strength','strength','squat', true,
   '{plate,dumbbell}','{quads,glutes}','catalog_basics'),
  ('lateral-lunge','Lateral Lunge','Lateral Lunge','Zancada lateral',
   'strength','strength','lunge', true,
   '{bodyweight,dumbbell,kettlebell}','{quads,glutes,adductors}','catalog_basics'),
  ('dead-hang','Dead Hang','Dead Hang','Suspensión en barra',
   'strength','strength','hold', false,
   '{pull_up_bar}','{forearms,lats,shoulders}','catalog_basics'),

  -- ── Habilidad gimnástica ──────────────────────────────────────────────────
  ('l-sit','L-sit','L-sit','L-sit',
   'skill','functional','hold', false,
   '{parallel_bars,rope}','{core,hip_flexors,triceps}','catalog_basics'),
  ('wall-climb','Wall Climb','Wall Climb','Wall climb',
   'skill','functional','vertical_push', false,
   '{bodyweight}','{shoulders,core,triceps}','catalog_basics'),

  -- ── Core ──────────────────────────────────────────────────────────────────
  ('mountain-climber','Mountain Climber','Mountain Climber','Mountain climbers',
   'core','core','anti_extension', false,
   '{bodyweight}','{core,hip_flexors,shoulders}','catalog_basics'),
  ('plank-shoulder-tap','Plank Shoulder Tap','Plank Shoulder Tap','Toques de hombro en plancha',
   'core','core','anti_rotation', true,
   '{bodyweight}','{core,shoulders}','catalog_basics'),
  ('body-saw','Body Saw','Body Saw','Body saw',
   'core','core','anti_extension', false,
   '{bodyweight}','{core,abdominals}','catalog_basics'),
  ('plank-up-down','Plank Up-Down','Plank Up-Down','Plancha de codos a manos',
   'core','core','anti_extension', true,
   '{bodyweight}','{core,triceps,shoulders}','catalog_basics'),
  ('stability-ball-pike','Stability Ball Pike','Stability Ball Pike','Pike en fitball',
   'core','core','flexion', false,
   '{bodyweight}','{core,abdominals,shoulders}','catalog_basics'),
  ('landmine-twist','Landmine Twist','Landmine Twist','Giro con landmine',
   'core','core','rotation', true,
   '{barbell}','{obliques,core}','catalog_basics'),
  ('cable-woodchop','Cable Woodchop','Cable Woodchop','Leñador en polea',
   'core','core','rotation', true,
   '{cable,cable_or_band}','{obliques,core}','catalog_basics'),

  -- ── Movilidad y preparación de agarre ─────────────────────────────────────
  ('foam-roll','Foam Roll','Foam Roll','Foam roller',
   'mobility','mobility','other', false,
   '{foam_roller}','{full_body}','catalog_basics'),
  ('banded-hip-flexion','Banded Hip Flexion','Banded Hip Flexion','Flexión de cadera con banda',
   'mobility','mobility','other', true,
   '{band,resistance_band}','{hip_flexors}','catalog_basics'),
  ('banded-wrist-flexion','Banded Wrist Flexion','Banded Wrist Flexion','Flexión de muñeca con banda',
   'mobility','mobility','other', true,
   '{band,resistance_band}','{forearms}','catalog_basics'),
  ('hand-open-close','Hand Open and Close','Hand Open and Close','Apertura y cierre de mano',
   'mobility','mobility','other', false,
   '{bodyweight}','{forearms}','catalog_basics'),

  -- ── Pliometría (el hueco más grande del macrociclo) ───────────────────────
  ('jump-lunge','Jump Lunge','Jump Lunge','Zancada con salto',
   'plyometric','functional','jump', true,
   '{bodyweight}','{quads,glutes,calves}','catalog_basics'),
  ('medicine-ball-throw','Medicine Ball Throw','Medicine Ball Throw','Lanzamiento de balón medicinal',
   'plyometric','functional','other', false,
   '{wall_ball}','{core,shoulders,full_body}','catalog_basics'),
  ('lateral-bound','Lateral Bound','Lateral Bound','Salto lateral',
   'plyometric','functional','jump', true,
   '{bodyweight}','{glutes,quads,adductors}','catalog_basics'),
  ('zig-zag-hop','Zig-Zag Hop','Zig-Zag Hop','Saltos en zigzag',
   'plyometric','functional','jump', false,
   '{bodyweight}','{calves,quads,ankles}','catalog_basics'),
  ('lunge-to-high-knee','Lunge to High Knee','Lunge to High Knee','Zancada a rodilla alta',
   'plyometric','functional','jump', true,
   '{bodyweight}','{quads,glutes,hip_flexors}','catalog_basics'),
  ('pogo-jump','Pogo Jump','Pogo Jump','Pogo jumps',
   'plyometric','functional','jump', false,
   '{bodyweight}','{calves,ankles}','catalog_basics')
on conflict (slug) do nothing;

-- ── ALIAS ────────────────────────────────────────────────────────────────────
-- Cómo escribe la gente cada uno de estos movimientos. Dos usos: la búsqueda de
-- la biblioteca del entrenador, y (en cuanto se conecte esta tabla al
-- importador) resolver el nombre libre de un plan importado.
--
-- Aquí van TAMBIÉN las redacciones que el catálogo consolida a propósito
-- («zancadas explosivas» → zancada con salto): es justo lo que permite meter una
-- fila y no cuatro.
insert into exercise_aliases (exercise_id, term, term_normalized, lang, source)
select e.id, a.term, lower(unaccent(a.term)), a.lang, 'catalog_basics'
from (values
  -- fuerza
  ('bicep-curl','curl de biceps','es'),('bicep-curl','curl','es'),
  ('bicep-curl','curl alterno','es'),('bicep-curl','curl martillo','es'),
  ('bicep-curl','bicep curl','en'),('bicep-curl','hammer curl','en'),
  ('shrug','encogimiento de hombros','es'),('shrug','encogimientos','es'),
  ('shrug','encogimientos con kb','es'),('shrug','encogimientos con db','es'),
  ('shrug','shrug','en'),('shrug','shrugs','en'),
  ('inverted-row','remo invertido','es'),('inverted-row','remo australiano','es'),
  ('inverted-row','inverted row','en'),
  ('renegade-row','remo renegado','es'),('renegade-row','remo unilateral en plancha','es'),
  ('renegade-row','remo en plancha alterno','es'),('renegade-row','renegade row','en'),
  ('band-row','remo con goma','es'),('band-row','remo con banda','es'),('band-row','band row','en'),
  ('good-morning','buenos dias','es'),('good-morning','buenos dias con pica','es'),
  ('good-morning','good morning','en'),
  ('gorilla-row','remo gorila','es'),('gorilla-row','gorilla row','en'),
  ('skater-squat','sentadilla skater','es'),('skater-squat','sentadilla skater con disco','es'),
  ('skater-squat','skater squat','en'),
  ('lateral-lunge','zancada lateral','es'),('lateral-lunge','lunge lateral','es'),
  ('lateral-lunge','lateral lunge','en'),
  ('dead-hang','suspension en barra','es'),('dead-hang','colgado en barra','es'),
  ('dead-hang','dead hang','en'),
  -- habilidad
  ('l-sit','l-sit','en'),('l-sit','l sit','en'),
  ('wall-climb','wall climb','en'),('wall-climb','subida a la pared','es'),
  -- core
  ('mountain-climber','mountain climbers','en'),('mountain-climber','escaladores','es'),
  ('plank-shoulder-tap','toques de hombro','es'),('plank-shoulder-tap','shoulder taps','en'),
  ('plank-shoulder-tap','shoulder tap','en'),
  ('body-saw','body saw','en'),
  ('plank-up-down','plancha de codos a manos','es'),
  ('plank-up-down','climb plank elbow to hand','en'),('plank-up-down','plank up down','en'),
  ('stability-ball-pike','pike en fitball','es'),('stability-ball-pike','stability ball pike','en'),
  ('landmine-twist','giro con landmine','es'),('landmine-twist','landmine twist','en'),
  ('cable-woodchop','lenador en polea','es'),('cable-woodchop','cable cross woodchop','en'),
  ('cable-woodchop','woodchop','en'),
  -- movilidad
  ('foam-roll','foam roller','es'),('foam-roll','rodillo','es'),('foam-roll','foam roll','en'),
  ('banded-hip-flexion','flexion de cadera resistida con goma','es'),
  ('banded-hip-flexion','flexion de cadera con banda','es'),
  ('banded-hip-flexion','banded hip flexion','en'),
  ('banded-wrist-flexion','flexion de muneca con banda','es'),
  ('banded-wrist-flexion','banded wrist flexion','en'),
  ('hand-open-close','aperturas y cierres de mano','es'),
  ('hand-open-close','apertura y cierre de mano','es'),
  -- pliometría
  ('jump-lunge','zancada con salto','es'),('jump-lunge','zancadas explosivas','es'),
  ('jump-lunge','zancadas pliometricas horizontales','es'),
  ('jump-lunge','zancadas con salto en el sitio','es'),('jump-lunge','jump lunge','en'),
  ('medicine-ball-throw','lanzamiento de balon medicinal','es'),
  ('medicine-ball-throw','lanzamientos dinamicos','es'),
  ('medicine-ball-throw','medicine ball rainbow slam','en'),
  ('medicine-ball-throw','medicine ball throw','en'),
  ('lateral-bound','salto lateral','es'),('lateral-bound','skaters','en'),
  ('lateral-bound','skaters explosivos laterales','es'),('lateral-bound','lateral bound','en'),
  ('zig-zag-hop','saltos en zigzag','es'),('zig-zag-hop','zig zag hops','en'),
  ('lunge-to-high-knee','zancada a rodilla alta','es'),
  ('lunge-to-high-knee','lunge to explosive high knee','en'),
  ('pogo-jump','pogo jumps','en'),('pogo-jump','bilateral pogo jumps','en')
) as a(slug, term, lang)
join exercises e on e.slug = a.slug
on conflict (exercise_id, term_normalized) do nothing;

-- ── EL FALSO POSITIVO DEL PUENTE DE GLÚTEO ──────────────────────────────────
-- «Puente de glúteo unilateral» resolvía CON CONFIANZA al puente bilateral,
-- existiendo el unilateral, porque el alias genérico «puente de gluteo» gana por
-- subcadena y nadie miraba el calificador. Un ejercicio equivocado dado por
-- bueno es peor que no encontrarlo. Los alias explícitos lo anclan.
insert into exercise_aliases (exercise_id, term, term_normalized, lang, source)
select e.id, a.term, lower(unaccent(a.term)), 'es', 'catalog_basics'
from (values
  ('single-leg-glute-bridge','puente de gluteo unilateral'),
  ('single-leg-glute-bridge','puente de gluteo a una pierna'),
  ('single-leg-rdl','peso muerto unilateral'),
  ('single-leg-rdl','peso muerto unilateral con db'),
  ('single-leg-rdl','peso muerto unilateral con kb')
) as a(slug, term)
join exercises e on e.slug = a.slug
on conflict (exercise_id, term_normalized) do nothing;
