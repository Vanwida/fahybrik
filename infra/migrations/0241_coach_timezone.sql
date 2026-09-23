-- 0241 — El huso horario del coach (su estudio) pasa a ser DATO.
--
-- La agenda (huecos de cita, días bloqueados, «llamadas hoy») razonaba siempre en
-- 'Europe/Madrid' cableado: un coach en otro huso ofrecía horas que no eran las
-- suyas. `coaches.timezone` (IANA, p. ej. 'America/Mexico_City'); NULL = el defecto
-- del producto (`BOX_TIMEZONE` en shared/domain/dates.ts, hoy 'Europe/Madrid'),
-- así que un coach que no toca nada se comporta igual que antes. Ver DECISIONS
-- 2026-09-23 «El huso del coach es dato».
--
-- Sin `default` de columna (el defecto es del dominio, DECISIONS 2026-08-09). La
-- validez IANA la comprueba el dominio al escribir; aquí solo una forma sensata.
-- Idempotente.

alter table coaches add column if not exists timezone text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'coaches_timezone_chk') then
    alter table coaches
      add constraint coaches_timezone_chk
      check (timezone is null or (length(timezone) between 3 and 64 and timezone ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+)*$'));
  end if;
end $$;
