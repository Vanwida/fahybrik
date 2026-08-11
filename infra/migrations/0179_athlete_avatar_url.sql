-- 0179_athlete_avatar_url.sql
--
-- EL ATLETA TAMBIÉN TIENE CARA
-- (ver docs/DECISIONS.md 2026-08-11 «La foto de perfil vive en Cloudflare Images».)
--
-- EL HUECO
-- --------
-- `coaches.avatar_url` existía desde el principio, pero `athletes` no tenía NINGUNA
-- columna de foto. Por eso el atleta salía siempre con iniciales: en el listado del
-- entrenador, en la cabecera de su ficha, en el hilo de mensajes y en cada tarjeta
-- de la pantalla de hoy. No era una decisión de diseño, era que el dato no existía.
--
-- Con cien atletas en el roster, las iniciales dejan de ser un detalle: la cara es
-- lo que hace que el entrenador reconozca la fila sin leerla.
--
-- LA DECISIÓN
-- -----------
-- Simétrica a la del entrenador — MISMO nombre de columna, MISMO tipo, MISMA forma
-- guardada — porque es el mismo concepto: la foto de una persona. Una tabla aparte
-- de «fotos» sería un segundo censo que puede contradecir al primero.
--
-- QUÉ SE GUARDA: la BASE de entrega de Cloudflare Images,
-- `https://imagedelivery.net/<cuenta>/<imagen>`, SIN variante. El tamaño lo pide
-- quien pinta (`web/lib/profile/photo-source.ts`), porque la misma foto va en un
-- círculo de 28 px de un listado y en el retrato de una ficha. Guardar el tamaño en
-- la columna obligaría a reescribir la URL en cada vista.
--
-- Nada de columnas para el ancho, el alto o el formato: eso lo resuelve la variante
-- que se pide al entregar, y guardarlo aquí sería un dato que envejece solo.
--
-- QUIÉN LA ESCRIBE: sólo el propio atleta desde su móvil, vía
-- `POST /api/perfil/foto/confirmar` con su bearer. El entrenador NO sube la foto de
-- sus atletas: la foto la elige quien sale en ella.
--
-- SEGURIDAD
-- ---------
-- Columna nueva y anulable: ninguna fila cambia de valor y sin foto se siguen
-- pintando las iniciales, exactamente como hasta hoy.

alter table athletes
  add column if not exists avatar_url text;

comment on column athletes.avatar_url is
  'Foto de perfil: base de entrega de Cloudflare Images (sin variante), o NULL = iniciales. La escribe el propio atleta desde la app.';
