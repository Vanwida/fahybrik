-- 0201 — El alta del atleta es dato del coach.
--
-- Un club nuevo no toca codigo: nace con un cuestionario tipico (dato),
-- lo puede editar entero, borrarlo, crear mas y duplicar. Las preguntas y
-- los pasos viven en definition_json. El mecanismo (tipos, validar, copiar)
-- esta en shared/domain/coach/onboarding-form.ts.
--
-- No es el embudo publico /empieza ni la cola /altas. No es la piel del club.
-- Aditivo e idempotente. El runner envuelve el fichero en transaccion.

create table if not exists coach_onboarding_forms (
  id              bigint      generated always as identity primary key,
  coach_id        bigint      not null references coaches(id) on delete cascade,
  name            text        not null,
  origin          text        not null default 'custom',
  is_default      boolean     not null default false,
  public_id          text        not null,
  definition_json    jsonb       not null,
  destination_email  text,
  archived_at        timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint coach_onboarding_forms_name_chk
    check (char_length(btrim(name)) between 1 and 80),
  constraint coach_onboarding_forms_origin_chk
    check (origin in ('preset', 'custom')),
  constraint coach_onboarding_forms_public_id_chk
    check (char_length(public_id) between 8 and 32),
  constraint coach_onboarding_forms_definition_obj_chk
    check (jsonb_typeof(definition_json) = 'object'),
  constraint coach_onboarding_forms_destination_email_chk
    check (
      destination_email is null
      or char_length(btrim(destination_email)) between 3 and 254
    )
);

create unique index if not exists coach_onboarding_forms_public_id_uq
  on coach_onboarding_forms (public_id);

create unique index if not exists coach_onboarding_forms_default_uq
  on coach_onboarding_forms (coach_id)
  where archived_at is null and is_default;

create index if not exists coach_onboarding_forms_coach_idx
  on coach_onboarding_forms (coach_id)
  where archived_at is null;

comment on table coach_onboarding_forms is
  '0201: cuestionarios de alta del coach. Preset tipico editable y borable. El coach crea los suyos.';
