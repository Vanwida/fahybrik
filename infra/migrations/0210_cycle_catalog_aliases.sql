-- 0210 — LOS 35 QUE YA EXISTÍAN, Y EL HOLLOW ROCKS QUE FALTABA (card 128 · hueco 4)
--
-- POR QUÉ
-- El ciclo real de 12 semanas pide 209 movimientos. 112 ya estaban. 35 existen
-- con otro nombre y solo les falta el alias («Air bike» es Assault Bike,
-- «Dominada neutra» es Pull-up, «Peso muerto unilateral con DB» es el RDL a
-- una pierna). Las 34 altas de movimiento se consolidaron en 29 filas en la
-- 0205 (una fila es un MOVIMIENTO, no una manera de hacerlo). Quedaba un
-- hueco: hollow rocks no es el hollow hold (uno se mueve, el otro se queda).
--
-- El importador ya lee `exercise_aliases` (peldaño 1b, card 129). Esta
-- migración no inventa otro almacén: mete los nombres LITERALES del ciclo
-- en esa tabla. Sin vídeo. Sin salto al cajón a una pierna como fila nueva
-- (el box jump ya existe; cómo se aterriza lo describe el entrenador; aquí
-- entra como alias).
--
-- Idempotente: `on conflict (slug) do nothing` y
-- `on conflict (exercise_id, term_normalized) do nothing`. Índices que
-- ya existen. Cero ON CONFLICT nuevo.

insert into exercises
  (slug, name, name_en, name_es, category, modality, movement_pattern,
   is_unilateral, equipment, primary_muscle_groups, source)
values
  ('hollow-rocks','Hollow Rocks','Hollow Rocks','Hollow rocks',
   'core','core','anti_extension', false,
   '{bodyweight}','{core,abdominals}','cycle_catalog')
on conflict (slug) do nothing;

insert into exercise_aliases (exercise_id, term, term_normalized, lang, source)
select e.id, a.term, fahybrid_normalize_term(a.term), a.lang, 'cycle_catalog'
from (values
  -- 1. Air bike = Assault Bike (si no, la ventana «bike» lo manda al BikeErg)
  ('assault-bike','air bike','en'),
  ('assault-bike','airbike','en'),
  ('assault-bike','air bike en zona 2','en'),
  ('assault-bike','air bike en zona 3','en'),
  ('assault-bike','descanso activo en air bike','es'),

  -- 2. Dominada neutra / estricta = Pull-up (el agarre no es otro movimiento)
  ('pull-up','dominada neutra','es'),
  ('pull-up','dominadas neutras','es'),
  ('pull-up','dominadas estrictas','es'),
  ('pull-up','dominadas estrictas (lastradas si se puede)','es'),
  ('pull-up','dominadas supinas','es'),
  ('weighted-pullup','dominadas neutras lastradas','es'),
  ('weighted-pullup','dominadas supinas lastradas si se puede','es'),

  -- 3. Peso muerto unilateral (redacciones del ciclo; la 0205 ya ancló las cortas)
  ('single-leg-rdl','peso muerto unilateral con db, un pie adelantado','es'),
  ('single-leg-rdl','peso muerto unilateral con 2kb','es'),
  ('single-leg-rdl','peso muerto unilateral con db','es'),

  -- 4. Sandbag walking lunge = Sandbag Lunges (si no, «walking lunge» se lo come)
  ('hyrox-sandbag-lunges','sandbag walking lunge','en'),
  ('hyrox-sandbag-lunges','sandbag walking lunge a peso de competicion','en'),
  ('hyrox-sandbag-lunges','sandbag walking lunge sobrecargado','en'),
  ('hyrox-sandbag-lunges','sandbag lunge por encima del peso de competicion','en'),

  -- 5. Band face pull = Face Pull
  ('face-pull','band face pull','en'),

  -- 6. Paloff = Pallof (así lo escribió el coach)
  ('pallof-press','paloff press','es'),
  ('pallof-press','paloff','es'),

  -- 7. Hand release / pliométricos = Push-up (manera de hacerlo)
  ('push-up','hand release push up','en'),
  ('push-up','hands release push up','en'),
  ('push-up','hands release push ups','en'),
  ('push-up','push up pliometricos hand release','es'),
  ('push-up','push ups sobre db','en'),
  ('push-up','push ups sobre DB','en'),

  -- 8. Side bridge = plancha lateral
  ('side-plank','side bridge','en'),

  -- 9. Rodillas al pecho colgado = hanging knee raise
  ('hanging-knee-raise','rodillas al pecho estrictas colgado','es'),
  ('hanging-knee-raise','rodillas al pecho colgado','es'),

  -- 10. Press militar arrodillado = overhead press (la rodilla no es otro gesto)
  ('overhead-press','press militar arrodillado con mancuernas','es'),
  ('overhead-press','press militar arrodillado','es'),
  ('overhead-press','press arrodillado unilateral 1db','es'),
  ('overhead-press','press arrodillado unilateral','es'),
  ('overhead-press','press militar estricto con barra','es'),
  ('overhead-press','strict shoulder press con barra','en'),

  -- 11. Farmer: marcha, hold, unilateral = farmers carry (el lado es prescripción)
  ('hyrox-farmer-carry','kb marching farmer''s walk','en'),
  ('hyrox-farmer-carry','marching farmer''s walk','en'),
  ('hyrox-farmer-carry','marching farmers walk','en'),
  ('hyrox-farmer-carry','ktb farmer hold','en'),
  ('hyrox-farmer-carry','farmer hold','en'),
  ('hyrox-farmer-carry','farmer carry unilateral','en'),
  ('hyrox-farmer-carry','farmer carry a peso de competicion','en'),
  ('hyrox-farmer-carry','farmer carry por encima del peso de competicion','en'),
  ('hyrox-farmer-carry','farmer carry con carga reducida','en'),

  -- 12. Bodyweight walking lunge = walking lunge
  ('walking-lunge','bodyweight walking lunge','en'),

  -- 13. Hip thrust bodyweight / unilateral = hip thrust (unilateral = laterality)
  ('hip-thrust','hip thrust bodyweight','en'),
  ('hip-thrust','hip thrust unilateral','en'),

  -- 14. KB goblet squat = goblet squat
  ('goblet-squat','kb goblet squat','en'),
  ('goblet-squat','goblet squat con carga ligera','es'),

  -- 15. Subida a cajón (sin «al») / step up al cajón
  ('box-step-up','subida a cajon','es'),
  ('box-step-up','subida a cajon con 2kb','es'),
  ('box-step-up','step up al cajon','es'),
  ('box-step-up','10+10 step up al cajon','es'),

  -- 16. Ab wheel de rodillas = ab wheel
  ('ab-wheel','ab wheel de rodillas','en'),
  ('ab-wheel','rueda abdominal de rodillas','es'),

  -- 17. Remo invertido con calificador = remo invertido
  ('inverted-row','remo invertido con barra','es'),
  ('inverted-row','remo invertido con pies elevados','es'),
  ('inverted-row','remo invertido en anillas explosivo','es'),
  ('inverted-row','remo invertido en anillas','es'),

  -- 18. Remo bajo con barra = remo con barra
  ('barbell-row','remo bajo con barra','es'),
  ('barbell-row','remo bajo con barra, sin tocar el suelo entre reps','es'),

  -- 19. Drop jump = depth jump
  ('depth-jump','drop jump','en'),
  ('depth-jump','drop jump bajo desde banco','en'),

  -- 20. Salto horizontal / broad jump a dos piernas = broad jump
  ('broad-jump','salto horizontal','es'),
  ('broad-jump','salto horizontal a dos piernas','es'),
  ('broad-jump','broad jump a dos piernas','en'),

  -- 21. Hang DB snatch = dumbbell snatch (el hang no es otro movimiento)
  ('dumbbell-snatch','alternate hang db snatch','en'),
  ('dumbbell-snatch','hang db snatch','en'),
  ('dumbbell-snatch','alternate hang snatch','en'),
  ('dumbbell-snatch','hang snatch','en'),

  -- 22. Sit up wall ball shoot = sit-up shoot
  ('w6-sit-up-shoot','sit up wall ball shoot','en'),
  ('w6-sit-up-shoot','sit-up wall ball shoot','en'),

  -- 23. Drills de carrera: caben en el cajón genérico que ya existe
  ('run-technique-drills','wall acceleration','en'),
  ('run-technique-drills','wall acceleration - load','en'),
  ('run-technique-drills','wall acceleration - triple','en'),
  ('run-technique-drills','wall acceleration con 1 cambio','en'),
  ('run-technique-drills','skip','en'),
  ('run-technique-drills','skip uni','en'),
  ('run-technique-drills','skip estabilizando','es'),

  -- 24. Andando = walk
  ('walk','andando','es'),
  ('walk','andando rapido','es'),
  ('walk','andando a 3,5 km/h','es'),

  -- 25. Trote / easy run = run
  ('run','trote','es'),
  ('run','easy run','en'),
  ('run','cool down easy run','en'),

  -- 26. Concept 2 con espacio (0178 tiene «concept2» pegado)
  ('row','concept 2','en'),

  -- 27. Lanzamiento overhead = medicine ball throw
  ('medicine-ball-throw','lanzamiento de balon medicinal overhead','es'),
  ('medicine-ball-throw','lanzamientos dinamicos (rusos)','es'),

  -- 28. Plancha en fitball = plank
  ('plank','plancha con manos en fitball','es'),

  -- 29. Box jump: bajada o aterrizaje a una pierna NO es otra fila
  ('box-jump','box jump con bajada step down','en'),
  ('box-jump','box jump unilateral aterrizando a una pierna','en'),
  ('box-jump','salto a cajon aterrizando a una pierna','es'),
  ('box-jump','salto a cajon bajo aterrizando a una pierna','es'),
  ('box-jump','salto a cajon aterrizando y estabilizando a una pierna','es'),

  -- 30. 90-90 to lunge = 90/90
  ('hip-90-90-stretch','movilidad cadera 90-90 to lunge','es'),
  ('hip-90-90-stretch','90-90 to lunge','en'),

  -- 31. Press banca agarre cerrado = bench press
  ('bench-press','press banca agarre cerrado','es'),
  ('bench-press','press banca agarre cerrado al 75%','es'),

  -- 32. Devil press unilateral = devil press
  ('devil-press','devil press unilateral','en'),

  -- 33. Burpees con salto = burpee broad jump (así lo escribe este ciclo)
  ('hyrox-burpee-broad-jump','burpees con salto','es'),

  -- 34. Combos que ya son un movimiento del catálogo
  ('renegade-row','kb push up to renegade row','en'),
  ('renegade-row','push up to renegade row','en'),
  ('bird-dog','bird dog push up','en'),

  -- 35. Stability ball pike with knee tuck = pike en fitball
  ('stability-ball-pike','stability ball pike with knee tuck','en'),

  -- Hollow rocks (alta de esta migración)
  ('hollow-rocks','hollow rocks','en'),
  ('hollow-rocks','hollow rock','en'),

  -- Redacciones literales de la 0205 que el ciclo escribe más largas
  ('jump-lunge','zancadas explosivas (saltando hacia adelante)','es'),
  ('lateral-bound','skaters, saltos explosivos reactivos laterales','es'),
  ('lateral-bound','skaters explosivos laterales','es'),
  ('lateral-bound','skaters por lado','es'),
  ('shrug','encogimientos con db con parada','es'),
  ('shrug','encogimientos con kb, parada de 3" cerca de las orejas','es'),
  ('bicep-curl','curl alterno con db de pie','es'),
  ('hip-flexor-stretch','hip flexor stretch dinamico','en'),
  ('lateral-lunge','lateral lunge alterno','es')
) as a(slug, term, lang)
join exercises e on e.slug = a.slug
on conflict (exercise_id, term_normalized) do nothing;
