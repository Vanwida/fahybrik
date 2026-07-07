-- 0092_leads.sql
--
-- Leads captured by the public web onboarding funnel (fahybrid.com/empieza).
-- A lead is a prospective athlete who filled the onboarding form (partially or
-- fully) BEFORE becoming an athlete. Pablo works these leads: prep the call,
-- build the program, convert. The nurturing flow (#10) chases abandoned ones.
--
-- Design decisions:
--   * ONE explicit column per answer (no free-text blob) so Pablo can filter and
--     the funnel metrics (#20) can aggregate. Repo rule: jsonb only for ML/embedding
--     vectors, raw provider payloads, audit diffs — a lead's answers are structured.
--   * Single-select answers store a STABLE snake_case CODE (text), not the Spanish
--     label. Copy can change without breaking queries. The closed set for each is
--     enforced server-side by the Zod schema (shared/schema/leads.ts), mirroring the
--     repo's "DB set ↔ Zod enum" convention. Codes ↔ labels: shared/domain/leads/questions.ts.
--   * Multi-select answers store text[] of codes.
--   * pg enums are reserved for the OPERATIONAL fields that drive dashboard/nurturing
--     state machines (status, source) — those are stable and worth the type.
--   * Two-phase capture: the row is created with status='parcial' when the visitor
--     enters their email (end of bloque A); it's completed (status='nuevo',
--     submitted_at set) when they finish the form. Upsert key = email.
--   * RGPD: consent boolean + timestamp + IP + user-agent kept for audit (health data).
--   * Additive + idempotent: guarded enum creation + create table if not exists, so
--     re-running is safe and it cannot touch any existing table (demo included).
--
-- Runner wraps the whole file in one transaction; no begin/commit here.

-- Enums (operational state only) -------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'lead_status') then
    create type lead_status as enum (
      'parcial',      -- email captured, form not finished (abandoned mid-way)
      'nuevo',        -- form completed, awaiting coach action
      'contactado',   -- coach reached out
      'agendado',     -- call booked (funnel task #2)
      'convertido',   -- became an athlete
      'descartado'    -- not a fit / declined
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'lead_source') then
    create type lead_source as enum ('onboarding_web');
  end if;
end $$;

-- Table --------------------------------------------------------------------------
create table if not exists leads (
  id                     bigint generated always as identity primary key,

  -- contacto / identidad
  email                  text not null,                       -- stored lowercased; upsert key
  nombre                 text,                                -- first name
  telefono               text,
  edad                   int,
  sexo                   text,                                -- hombre | mujer | prefiero_no_decir
  ubicacion              text,                                -- barcelona | resto_espana | fuera_espana

  -- ciclo de vida del lead
  status                 lead_status not null default 'parcial',
  source                 lead_source not null default 'onboarding_web',

  -- bloque A · objetivo
  objetivo               text,                                -- primer_hyrox | mejorar_marca | podio | hibrido_general | otro
  carrera_mente          text,                                -- si_se_cual | si_no_se_cual | todavia_no
  carrera_cual           text,                                -- hyrox_barcelona | hyrox_madrid | hyrox_valencia | deka | otra_fuera
  carrera_cuando         text,                                -- menos_3m | 3_6m | mas_6m
  plazo                  text,                                -- menos_3m | 3_6m | 6_12m | largo_plazo
  motivo                 text,                                -- no_progreso | preparar_carrera | recomendado | visto_resultados | salto_nivel
  inicio                 text,                                -- ya_mismo | este_mes | mas_adelante

  -- bloque B · historial
  competido              text,                                -- nunca | una_vez | dos_tres | mas_tres
  categorias_competido   text[],                              -- individual_open | individual_pro | dobles_open | dobles_pro | mixto | deka
  marca_hyrox            text,                                -- best HYROX/DEKA time, free (h:mm / mm:ss)
  dificultad             text,                                -- running | estaciones_fuerza | ergometros | gestion_esfuerzo
  categoria_objetivo     text,                                -- individual_open | individual_pro | dobles_open | dobles_pro | mixto | no_lo_se
  dobles_pareja          text,                                -- si_plan_compartido | si_planes_separados | sin_pareja

  -- bloque C · entrenamiento hoy
  anos_entrenando        text,                                -- menos_1 | 1_3 | 3_5 | mas_5
  deportes_origen        text[],                              -- equipo | running | gym | crossfit | natacion | ciclismo | artes_marciales | otro
  nivel                  text,                                -- principiante | intermedio | avanzado | competidor
  punto_fuerte           text,                                -- running | fuerza | ergometros | resistencia | no_lo_se
  punto_debil            text,                                -- running | fuerza | ergometros | resistencia | no_lo_se
  material               text,                                -- box_completo | gimnasio | basico_casa | solo_running
  dias_semana            text,                                -- d2_3 | d3_4 | d4_5 | d6_mas
  duracion_sesion        text,                                -- min_30_45 | min_45_60 | min_60_90 | min_mas_90
  flexibilidad_horaria   text,                                -- cualquier_hora | mananas | tardes_noches | fines_semana | muy_limitada

  -- bloque D · salud y recuperación
  lesion_actual          text,                                -- ninguna | leve | limita | recuperandose
  lesion_zonas           text[],                              -- rodilla | cadera | lumbar | hombro | tobillo_pie | otra
  lesiones_pasadas       text[],                              -- ninguna | musculares | articulares | espalda | otra
  sueno                  text,                                -- bien_7_9 | suficiente | menos_6 | problemas
  estres                 text,                                -- bajo | moderado | alto | muy_alto
  alimentacion           text,                                -- cuido_mucho | intento | irregular | no_atencion
  recuperacion           text,                                -- bien | fatiga_acumulada | cuesta | siempre_fatigado

  -- bloque E · tus números
  wearable               text,                                -- garmin | coros | polar | whoop | apple_watch | otro | no_uso
  marca_5k               text,                                -- mm:ss (free)
  marca_10k              text,                                -- mm:ss (free)
  marca_hyrox_deka       text,                                -- h:mm (free)
  fc_maxima              int,                                 -- ppm
  estaciones_debiles     text[],                              -- ski | sled_push | sled_pull | burpee | row | farmers | lunges | wall_balls | running | no_lo_se

  -- bloque F · para la llamada
  planes_previos         text,                                -- nunca | internet_apps | coach | pt_gimnasio
  planes_fallo           text[],                              -- generico | sin_seguimiento | no_adaptado | rigido
  espera_coaching        text,                                -- feedback_semanal | disponibilidad | ajustes | plan_medida
  conocido               text,                                -- instagram | recomendacion | evento_hyrox | fabrik | otro (marketing attribution)
  nota_libre             text,                                -- free text for Pablo

  -- consentimiento RGPD (auditoría — incluye datos de salud)
  consent_rgpd           boolean not null default false,
  consent_at             timestamptz,
  consent_ip             text,
  consent_user_agent     text,

  -- auditoría de captura
  submitted_at           timestamptz,                         -- when the full form was completed
  submit_ip              text,
  submit_user_agent      text,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint leads_email_unique unique (email),
  constraint leads_edad_chk check (edad is null or (edad between 12 and 100)),
  constraint leads_fc_maxima_chk check (fc_maxima is null or (fc_maxima between 90 and 240))
);

create index if not exists leads_status_idx     on leads (status);
create index if not exists leads_created_at_idx  on leads (created_at desc);
create index if not exists leads_conocido_idx    on leads (conocido);

comment on table leads is
  'Prospective athletes captured by the public web onboarding (fahybrid.com/empieza). One column per answer (stable snake_case codes; closed sets enforced by shared/schema/leads.ts). Two-phase: status=parcial on email capture, nuevo on full submit. Upsert key = email.';
comment on column leads.status is
  'Lead lifecycle: parcial (abandoned mid-form) → nuevo (completed) → contactado → agendado → convertido | descartado.';
comment on column leads.consent_rgpd is
  'RGPD consent to process personal + health data to prepare the plan. consent_at/ip/user_agent kept for audit.';
