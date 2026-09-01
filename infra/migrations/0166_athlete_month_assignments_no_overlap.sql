-- 0166: UN ATLETA NO PUEDE TENER DOS MICROCICLOS ASIGNADOS QUE SE SOLAPEN.
--
-- EL INCIDENTE QUE LO MOTIVA
-- --------------------------
-- Atleta 64 pulsó «Personalizar plan» dos veces (08:56:45 y 09:00:40 UTC, 10-ago-
-- 2026). `personalizePlanForAthlete` (web/lib/dashboard/coach/personalize-plan.ts)
-- lee su guardia («¿el plan actual ya es personal?») ANTES de abrir transacción, y
-- escribe en DOS transacciones separadas (fork del mes+semanas, luego —aparte—
-- `instantiateMonthFromTemplate`). Nada serializaba las dos llamadas: ambas leyeron
-- el mismo estado de partida (el microciclo de biblioteca 76, sin forkear
-- todavía) antes de que ninguna hubiera escrito nada — un TOCTOU clásico, no un
-- doble-clic milisegundo a milisegundo (Neon/Vercel añaden latencia variable que
-- ensancha la ventana a varios minutos sin cambiar la causa). Resultado en
-- producción: `athlete_month_assignments` 44 (mes 77) y 45 (mes 78), MISMO rango
-- de fechas exacto [2026-08-10, 2026-09-06], ambos forks de `personalized_from_id`
-- = 76. `resolveOrCreateMicrocycle` reutiliza microciclos por (athlete_id, solape
-- de fechas) sin mirar de qué asignación viene la llamada, así que los DOS
-- recibos acabaron compartiendo los MISMOS `microcycles` {77,78,79,80} — las
-- `workout_assignments` (24, todas `scheduled`, cero ejecutadas) nunca se
-- duplicaron gracias al dedup existente por (atleta, fecha, slot) en
-- `insertSlotAssignment`; lo que se duplicó fue el RECIBO y la PLANTILLA. La
-- última en escribir (78/45) es la que quedó viva de verdad —
-- `microcycles.source_week_template_id` apunta a sus semanas (194-197), no a las
-- de 77 (190-193) — así que 77/44 es el huérfano.
--
-- La guardia de aplicación se arregla de raíz en el mismo lote (advisory lock +
-- re-lectura dentro de la transacción, ver personalize-plan.ts). Pero el mismo
-- fallo de forma —crear un `athlete_month_assignments` solapado— es alcanzable
-- desde CUALQUIER camino que materialice un mes (assign-month, assign-sequence
-- inicial/avance/loop/level-up), no solo desde personalizar. Por eso el invariante
-- va en la BASE DE DATOS, no solo en el código: la única capa que ve TODOS los
-- caminos a la vez.
--
-- EL INVARIANTE
-- -------------
-- `exclude using gist`: para el mismo `athlete_id`, dos filas no pueden tener
-- `daterange(start_date, end_date, '[]')` solapados. `date` es un tipo discreto,
-- así que un rango `'[]'` (ambos extremos incluidos) se normaliza a medio-abierto
-- internamente — un plan que ACABA el 9-ago y otro que EMPIEZA el 10-ago NO se
-- consideran solapados (justo el patrón que ya usa `personalizePlanForAthlete` al
-- recortar el recibo viejo: `end_date` = el día antes del inicio del fork). El
-- invariante permite planes consecutivos sin hueco; solo prohíbe que dos ventanas
-- compartan un día.
--
-- LIMPIEZA ANTES DE LA RESTRICCIÓN
-- ---------------------------------
-- La restricción falla al crearse si ya hay filas que se solapan — así que este
-- archivo limpia PRIMERO, de forma genérica (no hardcodeada al atleta 64) y seguro
-- por diseño:
--   1. Para cada solape, se queda la fila de id MÁS ALTO (la última en escribir —
--      verificado contra el caso real: es la que las microcycles ya referencian).
--   2. De la fila perdedora, solo se tocan los `microcycles` EXCLUSIVOS suyos (no
--      compartidos con ninguna otra `athlete_month_assignments` del mismo atleta)
--      — en el caso real, CERO: las 4 semanas de 44 son las mismas 4 que 45, así
--      que la limpieza para hoy se reduce a borrar el recibo 44 + su plantilla
--      personal (mes 77, cascada a sus semanas propias 190-193); nada de lo que el
--      atleta ve hoy (microciclos 77-80, sus 24 workout_assignments) se toca.
--   3. Salvaguarda dura: si algún microciclo exclusivo del perdedor tiene una
--      `workout_assignments` COMPLETADA (o con `workout_executions` asociada), la
--      migración entera ABORTA con un error explícito — no se borra nada, no hay
--      "borrado parcial silencioso". Verificado antes de escribir esto: cero
--      sesiones completadas en todo el par real, así que esta rama no debería
--      dispararse — es la red de seguridad, no el camino esperado.
--   4. Una plantilla de biblioteca (athlete_id null) NUNCA se borra por esta vía,
--      aunque fuera la perdedora de un solape — solo se borra el RECIBO; podría
--      estar asignada a otros atletas.
--
-- Idempotente: si no hay solapes (el caso normal en cualquier corrida futura), el
-- bloque no hace nada y solo queda crear la extensión + la restricción (ambas con
-- guardas `if not exists`).

begin;

-- btree_gist: para poder comparar `athlete_id` con `=` DENTRO del mismo índice
-- GiST que compara `daterange(...)` con `&&` (la sintaxis `exclude using gist`
-- de más abajo necesita operator classes gist para AMBOS términos).
create extension if not exists btree_gist;

do $$
declare
  loser_id                bigint;
  loser_athlete_id        bigint;
  loser_microcycle_ids    bigint[];
  loser_month_template_id bigint;
  exclusive_ids           bigint[];
  loser_week_ids          bigint[];
  unsafe_n                int;
  cleaned_n                int := 0;
begin
  loop
    -- Un "perdedor": una fila que se solapa con OTRA fila de id más alto del
    -- MISMO atleta. Si ninguna queda, el loop termina — determinista y siempre
    -- converge (cada vuelta borra una fila).
    select a1.id, a1.athlete_id, a1.microcycle_ids, a1.month_template_id
      into loser_id, loser_athlete_id, loser_microcycle_ids, loser_month_template_id
    from athlete_month_assignments a1
    where exists (
      select 1 from athlete_month_assignments a2
      where a2.athlete_id = a1.athlete_id
        and a2.id > a1.id
        and daterange(a2.start_date, a2.end_date, '[]')
            && daterange(a1.start_date, a1.end_date, '[]')
    )
    order by a1.id
    limit 1;

    exit when loser_id is null;

    -- Microciclos EXCLUSIVOS del perdedor: los que ninguna OTRA fila de
    -- athlete_month_assignments del mismo atleta también referencia.
    select coalesce(array_agg(mc), '{}')
      into exclusive_ids
    from unnest(coalesce(loser_microcycle_ids, '{}')) as mc
    where not exists (
      select 1 from athlete_month_assignments other
      where other.athlete_id = loser_athlete_id
        and other.id <> loser_id
        and mc = any(other.microcycle_ids)
    );

    -- Salvaguarda: nunca borrar trabajo ya ejecutado. Si algo exclusivo del
    -- perdedor tiene una sesión completada (o con ejecución real asociada),
    -- se aborta TODA la migración — nada se ha borrado todavía en este punto.
    select count(*)
      into unsafe_n
    from workout_assignments wa
    where wa.microcycle_id = any(exclusive_ids)
      and (
        wa.status = 'completed'
        or exists (select 1 from workout_executions we where we.assignment_id = wa.id)
      );
    if unsafe_n > 0 then
      raise exception
        'athlete_month_assignments % (atleta %) tiene % sesion(es) EJECUTADAS en microciclos exclusivos suyos — limpieza automática abortada, revisar a mano antes de reintentar la migración',
        loser_id, loser_athlete_id, unsafe_n;
    end if;

    -- Perdedor limpio de ejecutar: borra lo exclusivo (pendiente) y el recibo.
    delete from workout_assignments where microcycle_id = any(exclusive_ids);
    delete from microcycles where id = any(exclusive_ids);
    delete from athlete_month_assignments where id = loser_id;

    -- Su plantilla PERSONAL (nunca una de biblioteca — esa puede servir a otros
    -- atletas) también se retira: cascada a program_month_weeks, luego limpia
    -- las program_week_templates propias que quedan huérfanas.
    if loser_month_template_id is not null and exists (
      select 1 from program_month_templates
      where id = loser_month_template_id and athlete_id is not null
    ) then
      select coalesce(array_agg(week_template_id), '{}')
        into loser_week_ids
      from program_month_weeks
      where month_template_id = loser_month_template_id;

      delete from program_month_templates where id = loser_month_template_id;

      delete from program_week_templates pwt
      where pwt.id = any(loser_week_ids)
        and not exists (
          select 1 from program_month_weeks mw where mw.week_template_id = pwt.id
        );
    end if;

    cleaned_n := cleaned_n + 1;
    raise notice 'athlete_month_assignments %: solape limpiado (atleta %, % microciclo(s) exclusivo(s) retirado(s))',
      loser_id, loser_athlete_id, coalesce(array_length(exclusive_ids, 1), 0);
  end loop;

  raise notice '0166: % solape(s) de athlete_month_assignments limpiado(s) antes de crear la restricción', cleaned_n;
end $$;

-- Verificación dura antes del ALTER: si por lo que sea sigue habiendo solapes
-- (no debería, el loop de arriba converge), fallar con un mensaje legible en vez
-- de dejar que el error crudo de postgres al crear la restricción lo explique.
do $$
declare
  remaining int;
begin
  select count(*) into remaining
  from athlete_month_assignments a1
  where exists (
    select 1 from athlete_month_assignments a2
    where a2.athlete_id = a1.athlete_id
      and a2.id > a1.id
      and daterange(a2.start_date, a2.end_date, '[]')
          && daterange(a1.start_date, a1.end_date, '[]')
  );
  if remaining > 0 then
    raise exception '0166: quedan % fila(s) de athlete_month_assignments solapadas tras la limpieza — abortando antes de crear la restricción', remaining;
  end if;
end $$;

alter table athlete_month_assignments
  add constraint athlete_month_assignments_no_overlap
  exclude using gist (
    athlete_id with =,
    daterange(start_date, end_date, '[]') with &&
  );

comment on constraint athlete_month_assignments_no_overlap on athlete_month_assignments is
  '0166: un atleta no puede tener dos microciclos asignados con fechas solapadas — el invariante que ningún camino de aplicación (personalizar, asignar mes, asignar/avanzar secuencia) puede saltarse. Planes consecutivos sin hueco SÍ están permitidos (date es discreto: [.., 9-ago] y [10-ago, ..] no se solapan).';

commit;
