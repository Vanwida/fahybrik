-- 0142: una carrera inventada deja de parecer una carrera real.
--
-- Los seeds de demo escriben en `races` con el `source` COPIADO del fixture
-- ('hyresult_import'), y uno de ellos (seed_demo_athlete_races con
-- DEMO_RACES_SCALE) multiplica todos los splits por un factor para darle a la
-- pareja de demo un historial parecido pero no idéntico. Resultado: filas
-- fabricadas indistinguibles de una importación real de hyresult.com.
--
-- Eso no es cosmético. El presupuesto por tramo del gap se calcula con un
-- COHORTE que lee `races` a través de TODOS los atletas (goal-gap singles y
-- dobles), así que los tiempos inventados de la demo entran en el cálculo de un
-- atleta de pago. En producción hoy el cohorte de dobles ya los cuenta.
--
-- `source` NO sirve para marcarlo: es la procedencia del canal de importación, y
-- cambiarlo dejaría a los propios atletas de demo sin sus lecturas (marcas,
-- estación a estación, transferencia, su propio dobles), que sí deben seguir
-- funcionando — son la demo. La propiedad que falta es otra y es ortogonal: si
-- el dato es FABRICADO. Por eso una columna propia.
--
--   is_synthetic = true  → fila escrita por un seed / cuenta de demo. Vale para
--                          pintar esa cuenta, JAMÁS como evidencia de población
--                          (cohorte, calibración predicho-vs-real, estadística).
--   is_synthetic = false → carrera real de un atleta real (por defecto).
--
-- Backfill: toda carrera de una cuenta de demo (email marcador @demo.fahybrid.local
-- — el mismo que usan los seeds para resolver su objetivo) queda marcada. Son las
-- 10 filas que hoy contaminan main. Aditiva + idempotente.

begin;

alter table races
  add column if not exists is_synthetic boolean not null default false;

comment on column races.is_synthetic is
  'La fila la fabricó un seed / pertenece a una cuenta de demo. Se pinta en su cuenta, pero NUNCA cuenta como evidencia de población: fuera del cohorte y de la calibración. Ortogonal a `source`, que es el canal de importación.';

-- Las carreras de las cuentas de demo son inventadas por definición: el seed las
-- copia de un fixture y, para la pareja, escala los splits.
update races r
set is_synthetic = true
where not r.is_synthetic
  and exists (
    select 1
    from athletes a
    join users u on u.id = a.user_id
    where a.id = r.athlete_id
      and lower(u.email) like '%@demo.fahybrid.local'
  );

commit;
