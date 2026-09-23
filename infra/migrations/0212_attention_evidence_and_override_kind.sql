-- 0212_attention_evidence_and_override_kind.sql
--
-- La senal dice CUANDO y SOBRE QUE VENTANA, y el «hecho» del coach se distingue
-- del «posponer».
--
-- 1. coach_attention_items gana `observed_at` y `window_label`. El contrato del
--    panel (docs/auditoria-panel-coach/PLAN-CONSTRUCCION.md §4.1) exige que cada
--    senal diga valor, base, ventana y fecha: «Readiness 31 · −24 vs su base ·
--    3 dias seguidos · 22 sept». La fecha de la lectura no es `computed_at` (esa
--    es cuando corrio el barrido) y la ventana («7 d», «28 d») la decide el
--    evaluador. Sin columna, cada superficie la reinventaria.
--
-- 2. coach_alert_overrides gana tres cosas que la resurreccion necesitaba y no
--    tenia:
--    - `override_kind` ('snooze' | 'done'): posponer y marcar hecho suprimen igual
--      pero se cuentan distinto (Hoy dice «resueltos hoy» y «pospuestos»).
--    - `severity_at_override`: «vuelve si se agrava» comparaba contra nada — un
--      critico descartado reaparecia al instante porque el codigo no sabia que ya
--      era critico cuando el coach lo descarto.
--    - `dedupe_key`: el sufijo del dedupe (id de la propuesta, del comunicado, del
--      episodio de readiness) identifica una instancia NUEVA de la misma senal.
--      Estaba prometido en shared/domain/coach/signals.ts y en DECISIONS
--      2026-08-09 («uno nuevo tras silenciar el anterior no queda tapado») pero la
--      fila del override no lo guardaba, asi que un comunicado nuevo SI quedaba
--      tapado por el silencio del anterior.
--
-- Todo nullable: las filas viejas se leen como antes. Aditivo e idempotente.

alter table coach_attention_items
  add column if not exists observed_at  timestamptz,
  add column if not exists window_label text;

alter table coach_alert_overrides
  add column if not exists override_kind        text,
  add column if not exists severity_at_override text,
  add column if not exists dedupe_key           text;

do $$
begin
  alter table coach_alert_overrides add constraint coach_alert_overrides_kind_chk
    check (override_kind is null or override_kind in ('snooze', 'done'));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table coach_alert_overrides add constraint coach_alert_overrides_severity_chk
    check (severity_at_override is null or severity_at_override in ('critical', 'warning', 'info'));
exception when duplicate_object then null;
end $$;

comment on column coach_alert_overrides.override_kind is
  'snooze = el coach pospuso (1 d, 3 d o hasta nueva senal) · done = lo marco hecho. Suprimen igual, se cuentan distinto en Hoy. NULL = fila anterior a 0212.';
comment on column coach_alert_overrides.dedupe_key is
  'dedupe_key de la senal cuando el coach la silencio: una instancia con otro dedupe_key (propuesta, comunicado o episodio nuevo) vuelve a salir.';
