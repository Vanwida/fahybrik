-- 0135: Suunto y Amazfit como orígenes de dato válidos (+ el hueco de device_type).
--
-- (Numeración: 0134 es la más alta de esta rama → esta es la 0135. El runner
-- journaliza por nombre de fichero, así que una colisión de prefijo con otra rama
-- en vuelo es inocua.)
--
-- POR QUÉ
-- -------
-- `biometric_source` es la lista CERRADA de "de dónde viene este dato", y es cerrada
-- a propósito: impide que se cuele un origen inventado. Se creó en la 0001 y NUNCA
-- se ha ampliado.
--
-- El problema es que el código ya va por delante. `WearableProvider`
-- (web/lib/wearables/token-store.ts) declara 'suunto' y 'amazfit', y hay rutas OAuth
-- vivas para Amazfit. Eso hoy FUNCIONA a medias porque `wearable_connections.provider`
-- es `text` libre: se puede guardar la conexión del atleta. Pero en cuanto llegue una
-- actividad de verdad, escribir su `source` en `workout_executions` o en
-- `biometric_streams` REVIENTA — el enum no conoce esos valores.
--
-- O sea: hoy se puede conectar un Suunto y mañana su primera actividad se pierde.
-- Con la solicitud de partner de Suunto ya enviada (25-jul, responden en dos
-- semanas), esto deja de ser hipotético.
--
-- `device_type` arrastra el mismo hueco y va en la misma migración porque es el
-- mismo problema: le faltan suunto y amazfit, y además polar y coros, que SÍ están
-- en `biometric_source` desde la 0001. Un dispositivo Polar registrado hoy tendría
-- que declararse 'other'.
--
-- QUÉ
-- ---
-- Añadir valores a un enum de Postgres. NO reescribe filas, NO toca columnas, NO
-- invalida índices: solo amplía lo aceptado. `if not exists` lo hace idempotente,
-- así que re-aplicarlo es inocuo.
--
-- Nota de compatibilidad: `add value` no puede ir dentro de una transacción en
-- Postgres < 12. Neon corre 15+, donde sí se permite, y el runner aplica cada
-- fichero en su propia transacción — de ahí que no haga falta trocearlo.

alter type biometric_source add value if not exists 'suunto';
alter type biometric_source add value if not exists 'amazfit';

alter type device_type add value if not exists 'suunto';
alter type device_type add value if not exists 'amazfit';
alter type device_type add value if not exists 'polar';
alter type device_type add value if not exists 'coros';
