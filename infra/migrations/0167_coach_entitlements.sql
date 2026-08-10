-- 0167_coach_entitlements.sql
--
-- QUÉ TIENE CONTRATADO UN CLUB. El sitio donde vive el «sí» de un add-on.
--
-- El conector MCP del coach (docs/DECISIONS.md, 2026-08-10) se vende como add-on
-- por coach, no viene con la cuenta. Hasta hoy cualquier coach con una membresía
-- válida podía conectar su asistente: la autorización contestaba «¿es de un club?»
-- y nadie preguntaba «¿ese club lo ha contratado?». Esta tabla es esa segunda
-- pregunta.
--
-- GENÉRICA A PROPÓSITO, y no una columna `mcp_connector boolean` en `coaches`. Van
-- a venir más add-ons, y cada uno como columna nueva significa una migración por
-- add-on, una tabla `coaches` que crece por motivos comerciales, y ningún sitio
-- donde conste DE DÓNDE salió el permiso. Una fila por (club, capacidad) contesta
-- las cuatro cosas que se le van a preguntar: qué club, qué capacidad, en qué
-- estado y por qué vía entró.
--
-- SIN CHECK EN `feature`, `status` NI `source` — mismo criterio que
-- `audit_log.channel` (0165): el portón es el tipo TS. Los tres viven en
-- `web/lib/coach/entitlements.ts` (`EntitlementFeature`, `EntitlementStatus`,
-- `EntitlementSource`), que es por donde pasa toda lectura y pasará toda escritura.
-- Un add-on nuevo no debe costar una migración, y menos convertir su estreno en un
-- error en runtime.
--
-- FAIL-CLOSED, y en dos sitios. (1) La AUSENCIA de fila es «no»: un club sin fila
-- no tiene el add-on, así que estrenar el portón no puede abrirle la puerta a
-- nadie por olvido. (2) El resolutor filtra por LISTA BLANCA (`status = 'active'`),
-- nunca por `status <> 'inactive'`: cuando Stripe traiga sus estados
-- (`past_due`, `canceled`, y un `trialing` que sí debería dar acceso), el portón
-- cierra por defecto y abrirlo exige tocar el resolutor a mano. Al revés, un
-- estado nuevo concedería acceso en silencio.
--
-- `on delete cascade`: un entitlement sin su club no nombra nada. Mismo criterio
-- que `coach_signal_thresholds` (0161).
--
-- SIN ÍNDICE EXTRA: el `unique (coach_id, feature)` ES el índice de la única
-- consulta que existe («¿tiene este club esta capacidad activa?»). Un índice más
-- sería peso muerto.
--
-- NO SIEMBRA NINGUNA FILA. El alta de un club real es DATO, no esquema, y depende
-- del entorno: hornear aquí un `coach_id` concreto metería el club de pruebas en
-- cualquier base que corra el runner (CLAUDE.md: cero datos falsos en cuentas
-- reales). Las altas se hacen contra su base, y el día que haya cobro las escribe
-- el webhook de Stripe con `source = 'stripe'`.
--
-- Aditiva. No toca ninguna tabla existente. Idempotente (`create table if not
-- exists`). El runner envuelve el fichero en UNA transacción, así que aquí no van
-- ni begin ni commit.

create table if not exists coach_entitlements (
  id         bigint      generated always as identity primary key,
  coach_id   bigint      not null references coaches(id) on delete cascade,
  -- La capacidad contratada. Hoy solo 'mcp_connector'. El valor lo fija
  -- EntitlementFeature en web/lib/coach/entitlements.ts.
  feature    text        not null,
  -- 'active' | 'inactive' hoy. Solo 'active' concede: ver la nota de lista blanca
  -- de la cabecera antes de añadir un estado nuevo.
  status     text        not null default 'active',
  -- POR QUÉ tiene esto el club: 'founder' (alta manual nuestra), y 'stripe'
  -- cuando el cobro exista. Sin esta columna, dentro de un año nadie sabe si una
  -- fila la puso una suscripción viva o un favor de hace meses.
  source     text        not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_entitlements_coach_feature_uq unique (coach_id, feature)
);

comment on table coach_entitlements is
  '0167: qué add-ons tiene contratado cada club. Una fila por (coach_id, feature). Fail-closed: sin fila no hay add-on, y solo status=''active'' concede (lista blanca en web/lib/coach/entitlements.ts, que es también el portón de los valores de feature/status/source — sin CHECK, mismo criterio que audit_log.channel en 0165).';
