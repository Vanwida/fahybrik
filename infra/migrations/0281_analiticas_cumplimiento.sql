-- 0281 — El cumplimiento de las analíticas rehechas (docs/analiticas/modelo.md A7/A8,
-- §3 fila 3 y §5): el método del coach para juzgar cada sesión frente a su plan y
-- cada tramo frente a su banda.
--
-- (Numeración: 0278 a 0280 ya están en main — limpieza de datos, intensidad y
-- progreso — y también añaden columnas a `coach_analytics_method`. Todas son
-- `add column if not exists` y el migrador registra por nombre de fichero.)
--
-- HARD RULE Nº0. Lo que un entrenador competente pondría distinto nace como dato:
--   · contra qué se compara una sesión hecha con su plan, y en qué orden
--     (carga › duración › distancia, la escalera de TrainingPeaks),
--   · dónde cortan el verde, el ámbar y el rojo de una sesión (defecto de
--     mercado: verde 80-120 %, ámbar 50-79 % o 121-150 %, rojo fuera o no hecha),
--   · cuánto puede salirse un tramo de su banda sin dejar de estar dentro (la
--     holgura del vivo: ritmo, split, vatios, pulso, ±1 de RPE y de RIR, la
--     carga dentro de su rango, un 10 % de dosis),
--   · qué cambio de un porcentaje de cumplimiento entre periodos es cambio.
--
-- Mismo patrón que 0277: columnas nullable sin `default`, NULL = el defecto del
-- producto (shared/domain/analytics/metodo.ts). Un coach que no toca nada se
-- comporta igual que el defecto. Los CHECK repiten ANALYTICS_METHOD_BOUNDS. La
-- coherencia entre columnas (las bandas en orden, las bases sin repetir) la
-- comprueba el PUT (`validarMetodoAnalitico`) sobre los valores efectivos.
--
-- Aditiva. Idempotente. El runner envuelve el fichero en UNA transacción (sin
-- begin/commit aquí) y corta por punto y coma, así que ningún comentario lleva uno.

alter table coach_analytics_method
  add column if not exists cumplimiento_sesion_bases    text[],
  add column if not exists cumplimiento_verde_min_pct   smallint,
  add column if not exists cumplimiento_verde_max_pct   smallint,
  add column if not exists cumplimiento_ambar_min_pct   smallint,
  add column if not exists cumplimiento_ambar_max_pct   smallint,
  add column if not exists holgura_ritmo_s_km           numeric(4,1),
  add column if not exists holgura_split_s_500m         numeric(4,1),
  add column if not exists holgura_vatios_w             smallint,
  add column if not exists holgura_pulso_ppm            smallint,
  add column if not exists holgura_rpe                  numeric(3,1),
  add column if not exists holgura_rir                  numeric(3,1),
  add column if not exists holgura_carga_pct            numeric(4,1),
  add column if not exists holgura_dosis_pct            numeric(4,1),
  add column if not exists cambio_cumplimiento_pts      smallint;

do $$
declare
  c record;
begin
  for c in
    select * from (values
      ('cumplimiento_verde_min_pct',  50, 100),
      ('cumplimiento_verde_max_pct',  100, 200),
      ('cumplimiento_ambar_min_pct',  0, 99),
      ('cumplimiento_ambar_max_pct',  101, 300),
      ('holgura_ritmo_s_km',          0, 30),
      ('holgura_split_s_500m',        0, 15),
      ('holgura_vatios_w',            0, 100),
      ('holgura_pulso_ppm',           0, 15),
      ('holgura_rpe',                 0, 3),
      ('holgura_rir',                 0, 3),
      ('holgura_carga_pct',           0, 20),
      ('holgura_dosis_pct',           0, 50),
      ('cambio_cumplimiento_pts',     1, 50)
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

  begin
    alter table coach_analytics_method
      add constraint coach_analytics_method_cumplimiento_sesion_bases_chk
      check (
        cumplimiento_sesion_bases is null
        or (
          cardinality(cumplimiento_sesion_bases) between 1 and 3
          and cumplimiento_sesion_bases <@ array['carga', 'duracion', 'distancia']::text[]
        )
      );
  exception when duplicate_object then null;
  end;
end $$;

comment on column coach_analytics_method.cumplimiento_sesion_bases is
  'Orden de bases para comparar una sesión hecha con su plan (carga|duracion|distancia). Manda la primera que saben las dos partes. NULL = carga, duración, distancia.';
comment on column coach_analytics_method.cumplimiento_verde_min_pct is
  'Cortes del cumplimiento de una sesión, en % de su plan: verde entre verde_min y verde_max, ámbar entre ambar_min y ambar_max fuera de la verde, rojo fuera o no hecha. NULL = 80/120 y 50/150.';
comment on column coach_analytics_method.holgura_ritmo_s_km is
  'Holgura de un tramo frente a su banda (la del vivo): ritmo s/km, split s/500 m, vatios, pulso ppm, RPE, RIR, carga % y dosis %. NULL = 3 / 2 / 10 / 2 / 1 / 1 / 0 / 10.';
comment on column coach_analytics_method.cambio_cumplimiento_pts is
  'Cambio de un porcentaje de cumplimiento o adherencia entre periodos que cuenta como cambio, en puntos. NULL = 10.';
