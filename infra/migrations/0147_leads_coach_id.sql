-- 0147 — un lead tiene DUEÑO, y se graba al captarlo.
--
-- EL PROBLEMA
-- -----------
-- `leads` tiene 67 columnas y ninguna dice de quién es el lead. Hasta hoy eso se
-- resolvía DESPUÉS, mirando quién había en la base: `funnelCoachId()` devuelve el
-- `FUNNEL_COACH_ID` del entorno y, si no está puesto, el `min(coaches.id)`.
--
-- Para una CUENTA (cupo, lista de espera) ese apaño se aguanta: si falla, sale un
-- número equivocado que nadie ve. Para la IDENTIDAD no se aguanta, y esto no es
-- teórico: en producción `min(coaches.id)` es el 4, una fila de desarrollo llamada
-- «alexsole». Firmar con eso significa mandarle a un desconocido un correo que dice
-- «— alexsole» y meterle un `.ics` en el calendario para siempre. Un correo no se
-- retira.
--
-- LA DECISIÓN (Alex, 29-jul-2026)
-- -------------------------------
-- El dueño de un lead es EL COACH, y **la atribución se graba al captar, no se
-- deduce después**. Misma regla que ya rige la procedencia de una marca y el
-- `recorded_via` de una ejecución (0144): quien no lo grabó en su momento, ya no lo
-- sabe.
--
-- El mecanismo: un lead entra por un ENLACE, y ese enlace tiene dueño. El embudo
-- público de hoy es el enlace de un solo club; el día que entre otro coach, el suyo
-- apunta a su panel. Mismo mecanismo, cero casos especiales.
--
-- NULLABLE A PROPÓSITO
-- --------------------
-- `coach_id` NULL significa «sin asignar», y es un estado legítimo y necesario: si
-- un lead llegara sin enlace atribuible (alguien que escribe al correo genérico),
-- NO se adivina — se queda sin dueño y una persona lo asigna a mano. Ese camino
-- existe desde el primer día justamente para que mañana un lead ajeno no acabe en
-- el panel de otro por defecto. Poner un dueño por descarte es el fallo que esta
-- migración viene a cerrar, no una comodidad que valga la pena conservar.
--
-- `on delete set null`: si se borra un coach, sus leads quedan sin asignar (que es
-- la verdad) en vez de arrastrar la fila del lead a la papelera.

begin;

alter table leads
  add column if not exists coach_id bigint references coaches(id) on delete set null;

comment on column leads.coach_id is
  'El coach dueño de este lead, GRABADO EN LA CAPTURA a partir del enlace por el que entró. NULL = sin asignar (no atribuible en su momento) y se asigna a mano; NULL nunca significa "el coach por defecto".';

-- El panel del coach lista sus leads por dueño: sin índice eso es un seq scan por
-- cada carga del embudo.
create index if not exists leads_coach_id_idx on leads (coach_id);

-- ---------------------------------------------------------------------------
-- Relleno hacia atrás — los leads que YA existen.
--
-- Los 8 leads de producción entraron por el único embudo público que ha existido
-- (`source = 'onboarding_web'`), que es el enlace del club con `coaches.id = 60`
-- («Pablo Amigo» / estudio «Fabrik Training»). No es una deducción: es de dónde
-- vinieron, y por eso se puede escribir.
--
-- El `exists` no es decorativo: en una rama de test o en una instalación limpia no
-- hay ningún coach 60, y ahí la respuesta correcta es dejarlos SIN ASIGNAR, no
-- inventarles un dueño. La migración no falla, simplemente no atribuye nada.
--
-- Solo toca filas con `coach_id is null`, así que re-ejecutarla no pisa a nadie.
-- ---------------------------------------------------------------------------
update leads
   set coach_id = 60,
       updated_at = now()
 where coach_id is null
   and source = 'onboarding_web'
   and exists (select 1 from coaches where id = 60);

commit;
