-- 0271 — El cuestionario de entrada acepta lo que la app pregunta.
--
-- El hueco (auditoría de la app del atleta, F-01): dos respuestas que la app
-- ofrece no cabían en la base, y la base tumbaba el cuestionario ENTERO:
--   · «¿Cuánto depende de ti?» va de 0 («Nada») a 10 en la app; la columna solo
--     admitía 1–10. 0 es una respuesta, no un error.
--   · «Triatlón» es una de las disciplinas que la app ofrece y no existía en el
--     enum `discipline`: el `::discipline` del alta daba 500 y la app reintentaba
--     hasta que el envío caducaba.
-- El resto de respuestas imposibles ya no tumban el alta (se leen una a una en
-- `web/lib/athlete/onboarding-snapshot.ts`); estas dos eran VÁLIDAS.
--
-- `ADD VALUE` dentro de la transacción del migrador: permitido desde Postgres 12
-- mientras el valor nuevo no se use en la misma transacción (no se usa).

alter table athletes drop constraint if exists athletes_pct_depends_chk;
alter table athletes
  add constraint athletes_pct_depends_chk
  check (pct_depends_on_me is null or (pct_depends_on_me >= 0 and pct_depends_on_me <= 10));

alter type discipline add value if not exists 'triathlon';
