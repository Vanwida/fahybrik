-- FAHYBRIK migration 0009: methodology document storage + soft delete.
--
-- Additive only. methodology_documents and methodology_chunks (with HNSW
-- pgvector index) ya existen desde 0001_init.sql. Aquí añadimos los campos
-- que la pipeline RAG necesita en producción:
--
--   * archived_at  → soft delete (DELETE en API marca archived_at en vez
--                     de borrar; conservamos la base de embeddings histórica
--                     y permitimos rollback). El retrieval ignora archived.
--   * file_url     → URL al blob original (R2/S3 en prod, local fs en dev).
--                     Null cuando la fuente es texto pegado o transcripción.
--   * mime_type    → MIME del archivo subido (`application/pdf`,
--                     `application/vnd.openxmlformats-...wordprocessingml...`,
--                     `text/plain`, `text/markdown`, `audio/*`).
--   * byte_size    → tamaño original en bytes (para UI listado).
--   * chunk_count  → contador denormalizado para listar sin N+1; lo mantiene
--                     la pipeline de ingesta.
--
-- No tocamos columnas existentes; no migramos datos. Migración idempotente.

begin;

alter table methodology_documents
  add column if not exists archived_at timestamptz,
  add column if not exists file_url    text,
  add column if not exists mime_type   text,
  add column if not exists byte_size   bigint,
  add column if not exists chunk_count int not null default 0;

-- Filtrar archivados rápido: parcial sobre el listado por coach.
create index if not exists methodology_documents_active_idx
  on methodology_documents (coach_id, ingested_at desc)
  where archived_at is null;

commit;
