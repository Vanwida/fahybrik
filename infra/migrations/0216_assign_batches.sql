-- 0216: ASIGNAR A VARIOS — un lote por envío, y lo necesario para deshacerlo EXACTO.
--
-- POR QUÉ (auditoría D-programar: ~500 clics para dar un programa a 20 atletas)
-- ---------------------------------------------------------------------------
-- El panel solo sabía asignar un programa a UN atleta y dejarlo en borrador.
-- `POST /api/coach/assign` lo da a muchos de una vez (atletas sueltos y grupos),
-- con vista previa de conflictos y un «Deshacer». Unirse a un grupo usa el mismo
-- motor (kind 'group_join'): también es «darle a un atleta un programa con fecha».
--
-- UN LOTE = UNA FILA en `coach_assign_batches`; cada atleta del lote = una fila
-- en `coach_assign_batch_items`, aplicada en SU propia transacción.
--
-- DESHACER TIENE QUE DEVOLVER LO QUE HABÍA, no solo quitar lo nuevo. Con
-- «Sustituir» el lote corta el plan que el atleta ya tenía; si deshacer solo
-- borrara lo nuevo, el atleta se quedaría con un hueco donde estaba su plan. Por
-- eso cada ítem apunta lo que tocó, fila a fila, en cuatro tablas de cambios:
--   · sesiones (`workout_assignments`): creadas / quitadas (copia de la fila) /
--     modificadas (copia de antes). Nunca se quita una sesión hecha: solo
--     'scheduled', sin ejecución, sin vivo de dobles y sin confirmación de reloj.
--   · recibos (`athlete_month_assignments`): creado / recortado / borrado.
--   · semanas (`weekly_plans`): cómo estaba la visibilidad antes.
--   · microciclos: creados / re-enlazados (linaje `source_week_template_id`).
--   · cursor de grupo (`athlete_sequence_progress`): creado / cambiado de estado.
-- Columnas explícitas (CLAUDE.md). `station_assignment` es jsonb porque ESPEJA la
-- columna jsonb de la fila original — una copia fiel, no un blob nuevo.
--
-- IDEMPOTENCIA frente al doble envío: `request_hash` (hash canónico de la
-- petición resuelta) + ventana corta, serializado por coach con un advisory lock.

begin;

create table if not exists coach_assign_batches (
  id                 bigint generated always as identity primary key,
  coach_id           bigint   not null references coaches(id) on delete cascade,
  -- 'assign' = un programa a varios · 'group_join' = entrar en un grupo alineado.
  kind               text     not null,
  month_template_id  bigint   references program_month_templates(id) on delete set null,
  sequence_id        bigint   references program_sequences(id) on delete set null,
  start_date         date     not null,
  start_week         smallint,
  start_position     smallint,
  delivery           text     not null,
  on_conflict        text     not null,
  request_hash       text     not null,
  created_by_user_id bigint   references users(id) on delete set null,
  created_at         timestamptz not null default now(),
  undone_at          timestamptz,
  undone_by_user_id  bigint   references users(id) on delete set null,

  constraint coach_assign_batches_kind_chk check (kind in ('assign', 'group_join')),
  constraint coach_assign_batches_delivery_chk check (delivery in ('auto', 'visible', 'draft')),
  constraint coach_assign_batches_conflict_chk check (on_conflict in ('chain', 'replace', 'skip')),
  constraint coach_assign_batches_start_week_chk check (start_week is null or start_week >= 1),
  constraint coach_assign_batches_start_position_chk check (start_position is null or start_position >= 1)
);

create index if not exists coach_assign_batches_request_idx
  on coach_assign_batches (coach_id, request_hash, created_at desc);

create table if not exists coach_assign_batch_items (
  id                  bigint generated always as identity primary key,
  batch_id            bigint   not null references coach_assign_batches(id) on delete cascade,
  athlete_id          bigint   not null references athletes(id) on delete cascade,
  -- applied | skipped | failed | undone
  status              text     not null,
  -- assign | chain | replace | skip | blocked | adopt — lo que el plan decidió para él.
  -- adopt = al entrar en un grupo ya estaba haciendo un programa de su cadena:
  -- se queda con él (cursor en esa posición) y no se materializa nada.
  action              text     not null,
  month_template_id   bigint   references program_month_templates(id) on delete set null,
  start_date          date,
  end_date            date,
  start_week          smallint,
  position            smallint,
  month_assignment_id bigint   references athlete_month_assignments(id) on delete set null,
  sessions_created    integer  not null default 0,
  reason_code         text,
  reason              text,
  prior_plan_mode     text,
  undone_at           timestamptz,
  created_at          timestamptz not null default now(),

  constraint coach_assign_batch_items_status_chk
    check (status in ('applied', 'skipped', 'failed', 'undone')),
  constraint coach_assign_batch_items_action_chk
    check (action in ('assign', 'chain', 'replace', 'skip', 'blocked', 'adopt')),
  constraint coach_assign_batch_items_uq unique (batch_id, athlete_id)
);

create index if not exists coach_assign_batch_items_athlete_idx
  on coach_assign_batch_items (athlete_id);

create table if not exists coach_assign_batch_session_changes (
  id                     bigint generated always as identity primary key,
  batch_item_id          bigint   not null references coach_assign_batch_items(id) on delete cascade,
  change                 text     not null,
  -- id ORIGINAL de la fila: una quitada ya no existe, así que no es FK. Deshacer
  -- la reinserta con el mismo id (overriding system value).
  assignment_id          bigint   not null,
  -- Copia de la fila ANTES del cambio (removed/modified); NULL en 'created'.
  athlete_id             bigint,
  microcycle_id          bigint   references microcycles(id) on delete set null,
  scheduled_for          date,
  -- FK sin acción: mientras haya copia, la plantilla instanciada no se puede borrar
  -- sola (deshacer la necesita); en cascada desde el atleta cae con la copia.
  template_id            bigint   references templates(id),
  template_version       integer,
  status                 text,
  notes                  text,
  origin                 text,
  planned_sequence       smallint,
  partner_visibility     text,
  station_assignment     jsonb,
  injury_id              bigint,
  injury_adaptation      text,
  calibration_test_id    bigint,
  created_by_user_id     bigint,
  created_by_kind        text,
  last_edited_by_user_id bigint,
  last_edited_by_kind    text,
  created_at             timestamptz,

  constraint coach_assign_batch_session_changes_change_chk
    check (change in ('created', 'removed', 'modified'))
);

create index if not exists coach_assign_batch_session_changes_item_idx
  on coach_assign_batch_session_changes (batch_item_id);

create table if not exists coach_assign_batch_receipt_changes (
  id                  bigint generated always as identity primary key,
  batch_item_id       bigint   not null references coach_assign_batch_items(id) on delete cascade,
  change              text     not null,
  month_assignment_id bigint   not null,
  -- Copia ANTES del cambio (trimmed/deleted); en 'created' solo el id.
  athlete_id          bigint,
  month_template_id   bigint   references program_month_templates(id),
  start_date          date,
  end_date            date,
  microcycle_ids      bigint[],
  assignment_count    integer,
  created_by_coach_id bigint,
  created_at          timestamptz,

  constraint coach_assign_batch_receipt_changes_change_chk
    check (change in ('created', 'trimmed', 'deleted'))
);

create index if not exists coach_assign_batch_receipt_changes_item_idx
  on coach_assign_batch_receipt_changes (batch_item_id);

create table if not exists coach_assign_batch_week_changes (
  id                  bigint generated always as identity primary key,
  batch_item_id       bigint   not null references coach_assign_batch_items(id) on delete cascade,
  week_start          date     not null,
  -- NULL = no había fila (y sin fila la semana SE VE, 2026-08-10).
  prior_status        text,
  prior_delivery_mode text
);

create index if not exists coach_assign_batch_week_changes_item_idx
  on coach_assign_batch_week_changes (batch_item_id);

create table if not exists coach_assign_batch_microcycle_changes (
  id                            bigint generated always as identity primary key,
  batch_item_id                 bigint   not null references coach_assign_batch_items(id) on delete cascade,
  change                        text     not null,
  microcycle_id                 bigint   not null,
  prior_source_week_template_id bigint,

  constraint coach_assign_batch_microcycle_changes_change_chk
    check (change in ('created', 'relinked'))
);

create index if not exists coach_assign_batch_microcycle_changes_item_idx
  on coach_assign_batch_microcycle_changes (batch_item_id);

create table if not exists coach_assign_batch_cursor_changes (
  id            bigint generated always as identity primary key,
  batch_item_id bigint   not null references coach_assign_batch_items(id) on delete cascade,
  change        text     not null,
  progress_id   bigint   not null,
  prior_status  text,

  constraint coach_assign_batch_cursor_changes_change_chk
    check (change in ('created', 'status_changed'))
);

create index if not exists coach_assign_batch_cursor_changes_item_idx
  on coach_assign_batch_cursor_changes (batch_item_id);

comment on table coach_assign_batches is
  '0216: un envío de «Asignar a varios» o de «Añadir al grupo». Deshacer = undone_at.';
comment on table coach_assign_batch_items is
  '0216: un atleta dentro de un lote — lo que el plan decidió (action) y lo que pasó (status).';
comment on table coach_assign_batch_session_changes is
  '0216: qué sesiones creó, quitó o modificó el ítem, con la fila de antes, para que deshacer sea exacto.';

commit;
