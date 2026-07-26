-- 0137: baja programada — el atleta se da de baja y sigue entrenando hasta el
-- último día que tiene pagado.
--
-- Hasta ahora la baja solo la daba el coach y era INMEDIATA: `bajaAthlete` ponía
-- lifecycle_status='baja' en el acto y dejaba `cancel_at_period_end` en Stripe. Eso
-- está bien cuando la decisión es del coach, pero no cuando la toma el atleta desde
-- la app: entre el clic y el final del periodo puede haber tres semanas YA PAGADAS, y
-- apagarle el plan ese día es cobrarle por nada.
--
-- Así que la baja del atleta se PROGRAMA. Se queda `activo` (con plan, chat y
-- entrenador) hasta `baja_scheduled_for`, que es el fin del periodo facturado. Ese día
-- el cron de ciclo de vida llama a `bajaAthlete` y la baja se aplica de verdad. Hasta
-- entonces puede echarse atrás con un botón.
--
-- Consecuencia sobre las columnas que ya existían (0104 + 0118): baja_reason y
-- baja_by_* pasan a sellarse en el momento de PEDIRLA, no al aplicarla, porque el
-- correo al coach y su bandeja necesitan el motivo y el autor desde el minuto uno.
-- baja_at sigue marcando cuándo se aplicó, y sigue siendo null mientras no se aplique.
--
-- Aditiva e idempotente. El runner envuelve el fichero en una transacción.

begin;

alter table athletes
  add column if not exists baja_scheduled_for date;

comment on column athletes.baja_scheduled_for is
  'Día en que la baja pedida por el atleta se aplica sola (#13), normalmente el fin del periodo pagado. Mientras llega, el atleta sigue lifecycle_status=activo y entrena con normalidad. null = no hay baja programada. Se limpia al cancelarla y al aplicarla.';

-- Los dos comentarios que dejan de ser ciertos con la baja programada.
comment on column athletes.baja_reason is
  'Motivo de la baja (#13), código estable de PAUSE_REASONS (lesion|vacaciones|paron|otro). Se sella al PEDIR la baja — o sea que puede estar relleno con lifecycle_status=activo si hay una baja programada. Se limpia en la re-alta y al cancelar la baja programada.';

comment on column athletes.baja_by_kind is
  'Quién dio la baja (#43): coach cuando la da él desde el dashboard, athlete cuando el atleta la pide desde la app. Se sella al pedirla, igual que baja_reason.';

-- El cron de ciclo de vida barre por esta columna cada día. Parcial: la inmensa
-- mayoría de las filas la tienen a null.
create index if not exists athletes_baja_scheduled_idx
  on athletes (baja_scheduled_for)
  where baja_scheduled_for is not null;

commit;
