-- 0272 — Las notas del alta vuelven a ser un objeto.
--
-- El hueco: POST /api/onboarding/submit escribía
--   intake_notes_json = intake_notes_json || ${JSON.stringify({...})}::jsonb
-- Con el cast, postgres.js tipa el parámetro como jsonb y vuelve a serializar la
-- cadena: llegaba un jsonb STRING, y `objeto || string` convierte la columna en un
-- ARRAY ([{…}, "{\"onboarding\":…}"]). Ningún lector (el nivel del cuestionario,
-- las horas por semana, la foto del alta que lee la IA, «respuestas fuera de
-- rango») encuentra nada dentro de un array. La ruta ya escribe con `tx.json`
-- (el mismo aviso que `web/lib/notifications/dispatch.ts`); esto repara las filas
-- que se escribieron mal.
--
-- Cómo: para cada fila cuyo valor es un array, se funden sus elementos EN ORDEN
-- (como hacía `||`: lo de la derecha gana). Un elemento objeto se funde tal cual;
-- un elemento string se lee como JSON y, si es un objeto, se funde; lo demás se
-- ignora. Un string que no es JSON no tumba la migración (se ignora). Idempotente:
-- una segunda pasada no encuentra arrays.

do $$
declare
  r record;
  e record;
  merged jsonb;
  parsed jsonb;
begin
  for r in
    select id, intake_notes_json from athletes where jsonb_typeof(intake_notes_json) = 'array'
  loop
    merged := '{}'::jsonb;
    for e in
      select x.elem
      from jsonb_array_elements(r.intake_notes_json) with ordinality as x(elem, ord)
      order by x.ord
    loop
      if jsonb_typeof(e.elem) = 'object' then
        merged := merged || e.elem;
      elsif jsonb_typeof(e.elem) = 'string' then
        parsed := null;
        begin
          parsed := (e.elem #>> '{}')::jsonb;
        exception when others then
          parsed := null;
        end;
        if parsed is not null and jsonb_typeof(parsed) = 'object' then
          merged := merged || parsed;
        end if;
      end if;
    end loop;
    update athletes set intake_notes_json = merged where id = r.id;
  end loop;
end
$$;
