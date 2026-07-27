-- 0141 — la propiedad de un template es coach O atleta, nunca ninguno de los dos.
--
-- El entreno libre persiste como template-INSTANCIA (instance_athlete_id, 0083)
-- + asignación self-origin. Un atleta FREE (athletes.coach_id null, nullable
-- desde 0001) guarda ese mismo libre y NO tiene coach: su instancia no tiene
-- dueño coach, y el NOT NULL de templates.coach_id (0001) revienta el insert.
--
-- La raíz, no el parche: el dueño de un template es (coach_id) — biblioteca y
-- contenido del coach — O (instance_athlete_id) — la instancia de un atleta.
-- El check de abajo exige al menos uno, así que la BIBLIOTECA sigue exigiendo
-- coach exactamente igual (una fila de biblioteca es instance_athlete_id null,
-- y con instancia null el check obliga coach_id). Las lecturas de biblioteca ya
-- filtran `instance_athlete_id is null` (0083) y no cambian.
--
-- Alternativa DESCARTADA: colgar los templates free de un coach real. Contamina
-- la propiedad (el coach vería atribuido contenido que no es suyo), acopla el
-- tier free a una cuenta concreta (marca en código) y rompe la agnosticidad.
--
-- Verificado en PROD antes de redactar (27-jul, Neon HTTP read-only):
-- 116 templates, 28 instancias, 0 filas violarían el check (hoy todas llevan
-- coach_id por el propio NOT NULL que se relaja aquí).

alter table templates
  alter column coach_id drop not null;

alter table templates
  add constraint templates_owner_chk
    check (coach_id is not null or instance_athlete_id is not null);
