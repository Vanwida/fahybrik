import { z } from 'zod';
import {
  EMBEDDING_DIM,
  embeddingSchema,
  idSchema,
  isoDateTime,
  methodologySourceType,
} from './_primitives';

export const methodologyDocumentSchema = z.object({
  id: idSchema,
  coach_id: idSchema,
  source_type: methodologySourceType,
  title: z.string().min(1).max(400),
  raw_content: z.string().min(1),
  ingested_at: isoDateTime,
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type MethodologyDocument = z.infer<typeof methodologyDocumentSchema>;

export const methodologyChunkSchema = z.object({
  id: idSchema,
  document_id: idSchema,
  chunk_index: z.number().int().nonnegative(),
  content: z.string().min(1),
  embedding: embeddingSchema.nullable(),
  created_at: isoDateTime,
});
export type MethodologyChunk = z.infer<typeof methodologyChunkSchema>;

export { EMBEDDING_DIM };
