-- 0277 — El motor de las analíticas rehechas (docs/analiticas/modelo.md, 29-09-2026):
-- el método del coach que faltaba, y dónde declarar un umbral de un toque.
--
-- ── 1. `coach_analytics_method` gana el método de la carga única ──────────────
--
-- HARD RULE Nº0. Lo que un entrenador competente pondría distinto nace como dato:
--   · qué peldaño de la escalera de carga se mira primero en cada modalidad
--     (potencia, ritmo, pulso, esfuerzo);
--   · cuánto vale una hora de fuerza a esfuerzo X frente a una de cardio;
--   · cuánta cobertura exige la frescura para decir su palabra;
--   · dónde cortan las cinco bandas de frescura;
--   · sobre qué se mide el cumplimiento y con qué cortes;
--   · qué cambio entre periodos cuenta como cambio, métrica a métrica;
--   · la ventana basal de la recuperación.
--
-- Mismo patrón que 0190 y 0256: columnas nullable sin `default`, NULL = el
-- defecto del producto (shared/domain/analytics/metodo.ts). Un coach que no toca
-- nada se comporta exactamente igual que hoy. Los CHECK repiten los límites de
-- ANALYTICS_METHOD_BOUNDS; la coherencia entre columnas (bandas en orden, cortes
-- de cumplimiento, peldaños admisibles) la comprueba el PUT
-- (`validarMetodoAnalitico`) sobre los valores efectivos.
--
-- Las escaleras van como text[] (como `coaches.test_retest_weeks`): una lista
-- ORDENADA y corta de un vocabulario cerrado, no un JSON.
--
-- ── 2. `athlete_declared_thresholds` — el umbral que se DECLARA ─────────────
--
-- Hoy un umbral solo entra por un test o por el alta. La escalera de evidencia
-- (medida > declarada > estimada > poblacional) tiene un peldaño «declarada» y
-- ninguna pantalla lo escribe después del alta: la carga se quedaba en el 8 %
-- del tiempo cuando el 47 % de las sesiones tenía pulso suficiente, porque casi
-- nadie tiene un test y a nadie se le podía preguntar «¿cuál es tu umbral?».
--
-- NO va a `athlete_benchmarks`: una declaración no es una marca (no es un
-- rendimiento, no hay PR, no recalibra un test) y allí saldría en el historial
-- de marcas. Es una fila por (atleta, clave) que se reemplaza al volver a
-- declarar (la más reciente manda; se guarda el historial para auditar). Un test
-- la supera siempre, por orden de evidencia, no por fecha.
--
-- Aditiva. Idempotente. El runner envuelve el fichero en UNA transacción (sin
-- begin/commit aquí) y corta por punto y coma, así que ningún comentario lleva uno.

alter table coach_analytics_method
  add column if not exists fuentes_run                  text[],
  add column if not exists fuentes_row                  text[],
  add column if not exists fuentes_ski                  text[],
  add column if not exists fuentes_bike                 text[],
  add column if not exists fuentes_strength             text[],
  add column if not exists fuentes_other                text[],
  add column if not exists fuerza_coeficiente           numeric(3,2),
  add column if not exists cobertura_veredicto_min_pct  smallint,
  add column if not exists frescura_sobrecarga_hasta    smallint,
  add column if not exists frescura_optimo_hasta        smallint,
  add column if not exists frescura_mantener_hasta      smallint,
  add column if not exists frescura_fresco_hasta        smallint,
  add column if not exists cumplimiento_base            text,
  add column if not exists cumplimiento_bien_pct        smallint,
  add column if not exists cumplimiento_regular_pct     smallint,
  add column if not exists cambio_carga_pct             smallint,
  add column if not exists cambio_horas_pct             smallint,
  add column if not exists cambio_forma_tss             smallint,
  add column if not exists cambio_frescura_tss          smallint,
  add column if not exists cambio_variabilidad_pct      smallint,
  add column if not exists cambio_pulso_reposo_bpm      smallint,
  add column if not exists cambio_sueno_horas           numeric(3,1),
  add column if not exists basal_dias                   smallint,
  add column if not exists basal_excluir_dias           smallint;

do $$
declare
  c record;
begin
  for c in
    select * from (values
      ('fuerza_coeficiente',          0.25, 2),
      ('cobertura_veredicto_min_pct', 50, 100),
      ('frescura_sobrecarga_hasta',   -80, 0),
      ('frescura_optimo_hasta',       -60, 20),
      ('frescura_mantener_hasta',     -40, 40),
      ('frescura_fresco_hasta',       -20, 80),
      ('cumplimiento_bien_pct',       50, 100),
      ('cumplimiento_regular_pct',    0, 99),
      ('cambio_carga_pct',            1, 100),
      ('cambio_horas_pct',            1, 100),
      ('cambio_forma_tss',            1, 50),
      ('cambio_frescura_tss',         1, 50),
      ('cambio_variabilidad_pct',     1, 50),
      ('cambio_pulso_reposo_bpm',     1, 20),
      ('cambio_sueno_horas',          0.1, 5),
      ('basal_dias',                  14, 180),
      ('basal_excluir_dias',          0, 60)
    ) as t(col, lo, hi)
  loop
    begin
      execute format(
        'alter table coach_analytics_method add constraint %I check (%I is null or %I between %s and %s)',
        'coach_analytics_method_' || c.col || '_chk', c.col, c.col, c.lo, c.hi
      );
    exception when duplicate_object then null;
    end;
  end loop;

  for c in
    select * from (values
      ('fuentes_run'), ('fuentes_row'), ('fuentes_ski'), ('fuentes_bike'), ('fuentes_strength'), ('fuentes_other')
    ) as t(col)
  loop
    begin
      execute format(
        'alter table coach_analytics_method add constraint %I check (%I is null or (cardinality(%I) between 1 and 4 and %I <@ array[''potencia'',''ritmo'',''pulso'',''esfuerzo'']::text[]))',
        'coach_analytics_method_' || c.col || '_chk', c.col, c.col, c.col
      );
    exception when duplicate_object then null;
    end;
  end loop;

  begin
    alter table coach_analytics_method
      add constraint coach_analytics_method_cumplimiento_base_chk
      check (cumplimiento_base is null or cumplimiento_base in ('sesiones', 'tramos', 'carga'));
  exception when duplicate_object then null;
  end;
end $$;

comment on column coach_analytics_method.fuentes_run is
  'Orden de peldaños de la escalera de carga al correr (potencia|ritmo|pulso|esfuerzo). NULL = defecto de metodo.ts (ritmo, pulso, esfuerzo). Gana el primero con dato y ancla.';
comment on column coach_analytics_method.fuerza_coeficiente is
  'Cuánto vale una hora de fuerza a esfuerzo X frente a una de cardio al mismo esfuerzo. NULL = 1,0 (la misma unidad para todo).';
comment on column coach_analytics_method.cobertura_veredicto_min_pct is
  'Porcentaje mínimo del tiempo entrenado con carga preciada para que la frescura diga su palabra. NULL = 90 (LOAD_COVERAGE_MIN).';
comment on column coach_analytics_method.frescura_sobrecarga_hasta is
  'Cuatro cortes de las cinco bandas de frescura (TSB): ≤sobrecarga | óptimo | mantener | fresco | >fresco = recargando. NULL = −30/−11/4/29.';
comment on column coach_analytics_method.cumplimiento_base is
  'Sobre qué se mide el cumplimiento: sesiones hechas | tramos dentro de banda | carga hecha frente a planificada. NULL = sesiones.';
comment on column coach_analytics_method.basal_dias is
  'Ventana basal de la recuperación: se promedia desde basal_dias atrás hasta basal_excluir_dias atrás. NULL = 60 → 14.';

-- ── 2 · Umbrales declarados de un toque ────────────────────────────────────────

create table if not exists athlete_declared_thresholds (
  id            bigint      generated always as identity primary key,
  athlete_id    bigint      not null references athletes(id) on delete cascade,
  -- Qué umbral, en su unidad natural: lthr_bpm (ppm), run_s_per_km, row/ski/bike_s_per_500m, bike_watts.
  kind          text        not null,
  value         numeric(7,2) not null,
  -- Quién lo escribió. El coach lo hace desde la ficha; el atleta desde su perfil.
  declared_by   text        not null,
  -- El coach que lo escribió, cuando fue el coach (auditoría; el ámbito de club se
  -- comprueba en la ruta antes de escribir).
  declared_by_coach_id bigint references coaches(id) on delete set null,
  note          text,
  declared_at   timestamptz not null default now(),

  constraint athlete_declared_thresholds_kind_chk check (
    kind in ('lthr_bpm', 'run_s_per_km', 'row_s_per_500m', 'ski_s_per_500m', 'bike_s_per_500m', 'bike_watts')
  ),
  constraint athlete_declared_thresholds_by_chk check (declared_by in ('athlete', 'coach')),
  constraint athlete_declared_thresholds_value_chk check (value > 0),
  constraint athlete_declared_thresholds_note_chk check (note is null or length(btrim(note)) between 1 and 200)
);

-- «El umbral declarado vigente de este atleta para esta clave»: la fila más reciente.
create index if not exists athlete_declared_thresholds_current_idx
  on athlete_declared_thresholds (athlete_id, kind, declared_at desc);

comment on table athlete_declared_thresholds is
  'Umbrales que el atleta o su coach DECLARAN de un toque (peldaño «declarada» de la escalera de evidencia: medida > declarada > estimada > poblacional). Una fila por declaración; la más reciente por (atleta, clave) manda. No es una marca: no sale en el historial de marcas ni recalibra un test. Un test la supera siempre.';
