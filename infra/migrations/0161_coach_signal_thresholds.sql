-- 0161_coach_signal_thresholds.sql
--
-- LOS UMBRALES DE SEÑAL SON METODO, NO MECANISMO (CLAUDE.md, HARD RULE Nº0).
--
-- Que exista una senal «pregunta sin responder» lo decide el modelo del
-- comunicado: una pregunta se cierra respondiendo, y mientras no se responda
-- reclama. Eso es MECANISMO y vive en codigo. Cuantos dias de silencio hacen
-- falta antes de molestar al coach con ella es METODO: con veinte atletas lo
-- quieres al dia siguiente y con cien no quieres ruido hasta la semana. La
-- pregunta que decide («otro entrenador competente lo haria distinto?») da que
-- si, asi que estos numeros nacen como DATO editable.
--
-- Esta tabla es el SITIO de los umbrales de senal editables. Hoy entra con los
-- tres del comunicado (docs/DECISIONS.md, 2026-08-09). Los demas umbrales del
-- motor siguen siendo defectos del sistema en web/lib/coach/signal-config.ts y
-- se moveran aqui, columna a columna, cuando dejen de ser aceptables como
-- constantes. El resolutor (web/lib/coach/signal-thresholds.ts) mezcla esta fila
-- sobre los defectos y entrega el `EffectiveThresholds` que reciben los
-- evaluadores, que es justo para lo que ese tipo se llama «effective».
--
-- Los defectos NO viven aqui como `default` de columna: viven en
-- shared/domain/coach/signal-thresholds.ts. Misma forma y mismo razonamiento
-- que `coach_import_defaults` (0149) y `coach_guidance` (0123). NO copiar
-- `coach_methodology` (0048): aquella horneo sus defectos en el DDL, no llego a
-- tener ni escritor ni UI, y esta muerta.
--
-- Una fila por coach. Guardar reemplaza el conjunto entero: no hay parche por
-- campo, asi el editor y el motor no pueden discrepar sobre cuales son «los del
-- coach». Columnas explicitas, sin JSONB (convencion del repo).
--
-- Aditivo. No toca ninguna tabla existente. Idempotente (create table if not
-- exists). El runner envuelve el fichero en UNA transaccion (sin begin/commit
-- aqui) y corta por punto y coma, asi que ningun comentario lleva uno.

create table if not exists coach_signal_thresholds (
  id                                        bigint      generated always as identity primary key,
  coach_id                                  bigint      not null references coaches(id) on delete cascade,
  -- Dias que una pregunta publicada aguanta sin respuesta antes de subir a /hoy.
  -- Cuenta desde que se publico, no desde que la vio: el atleta que abre y no
  -- contesta es exactamente el caso que hay que ver.
  communication_question_unanswered_days    smallint    not null,
  -- Dias de retraso a partir de los cuales una tarea vencida pasa de vigilar a
  -- critica. Vencer ya dispara la senal (eso es el modelo) — lo que el coach
  -- decide es cuando el retraso deja de ser un despiste.
  communication_task_overdue_critical_days  smallint    not null,
  -- Dias de antelacion con los que un protocolo sin abrir empieza a reclamar,
  -- medidos hasta la fecha del evento al que cuelga (carrera o test).
  communication_protocol_unopened_days      smallint    not null,
  updated_at                                timestamptz not null default now(),
  constraint coach_signal_thresholds_coach_uq unique (coach_id),
  -- Por debajo de un dia no hay espera (la senal saltaria al publicar) y por
  -- encima de un mes ya no es un umbral, es no querer la senal: para eso esta
  -- silenciarla en su tarjeta (coach_alert_overrides).
  constraint coach_signal_thresholds_question_chk
    check (communication_question_unanswered_days between 1 and 30),
  constraint coach_signal_thresholds_task_chk
    check (communication_task_overdue_critical_days between 1 and 30),
  constraint coach_signal_thresholds_protocol_chk
    check (communication_protocol_unopened_days between 1 and 30)
);

comment on table coach_signal_thresholds is
  'Umbrales de senal editables por el coach (HARD RULE Nº0: el umbral es metodo, no mecanismo). Una fila por coach, el conjunto entero se reemplaza al guardar. Los defectos viven en shared/domain/coach/signal-thresholds.ts, NUNCA como default de columna: un coach que no toca nada se comporta igual que hoy.';
