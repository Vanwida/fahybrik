// Zod schemas for the public lead funnel (web onboarding).
//
// Enums are DERIVED from the canonical codes in shared/domain/leads/questions.ts
// (single source of truth) — so the DB column comments, the UI options and this
// validation can never drift. Two request shapes:
//   • leadDraftInput  — POST /api/leads          (partial, on email capture)
//   • leadSubmitInput — POST /api/leads/complete (full, on finish; consent required)
//
// Server-side validation runs on both endpoints (CLAUDE.md: validate every mutation).

import { z } from 'zod';
import { type LeadColumn, leadCodes } from '../domain/leads/questions';

const single = (c: LeadColumn) => z.enum(leadCodes(c));
const multi = (c: LeadColumn) => z.array(z.enum(leadCodes(c))).max(20);

/** Best-mark / time fields are free text (e.g. "1:12", "21:30"), kept short. */
const markField = z.string().trim().max(20).optional();

/** Empty strings from optional inputs collapse to undefined so we store NULL. */
const optionalInt = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.coerce.number().int().min(min).max(max).optional(),
  );

/** Operational lifecycle enum — mirrors the pg `lead_status` type (migration 0092). */
export const leadStatus = z.enum([
  'parcial',
  'nuevo',
  'contactado',
  'agendado',
  'convertido',
  'descartado',
]);
export type LeadStatus = z.infer<typeof leadStatus>;

export const leadSource = z.enum(['onboarding_web']);
export type LeadSource = z.infer<typeof leadSource>;

const email = z.string().trim().email().toLowerCase().max(200);

/**
 * Honeypot: a field no human sees or fills. Any non-empty value ⇒ bot. Kept in the
 * schema (optional) so the route can detect and silently drop without erroring.
 */
const honeypot = z.string().max(0).optional().or(z.string().optional());

/** Every answer field, all optional — reused by both request shapes. */
const answersShape = {
  nombre: z.string().trim().min(1).max(80).optional(),

  // bloque A
  objetivo: single('objetivo').optional(),
  carrera_mente: single('carrera_mente').optional(),
  carrera_cual: single('carrera_cual').optional(),
  carrera_cuando: single('carrera_cuando').optional(),
  plazo: single('plazo').optional(),
  motivo: single('motivo').optional(),
  inicio: single('inicio').optional(),

  // bloque B
  competido: single('competido').optional(),
  categorias_competido: multi('categorias_competido').optional(),
  marca_hyrox: markField,
  dificultad: single('dificultad').optional(),
  categoria_objetivo: single('categoria_objetivo').optional(),
  dobles_pareja: single('dobles_pareja').optional(),

  // bloque C
  anos_entrenando: single('anos_entrenando').optional(),
  deportes_origen: multi('deportes_origen').optional(),
  nivel: single('nivel').optional(),
  punto_fuerte: single('punto_fuerte').optional(),
  punto_debil: single('punto_debil').optional(),
  material: single('material').optional(),
  dias_semana: single('dias_semana').optional(),
  duracion_sesion: single('duracion_sesion').optional(),
  flexibilidad_horaria: single('flexibilidad_horaria').optional(),

  // bloque D
  lesion_actual: single('lesion_actual').optional(),
  lesion_zonas: multi('lesion_zonas').optional(),
  lesiones_pasadas: multi('lesiones_pasadas').optional(),
  sueno: single('sueno').optional(),
  estres: single('estres').optional(),
  alimentacion: single('alimentacion').optional(),
  recuperacion: single('recuperacion').optional(),

  // bloque E
  wearable: single('wearable').optional(),
  marca_5k: markField,
  marca_10k: markField,
  marca_hyrox_deka: markField,
  fc_maxima: optionalInt(90, 240),
  estaciones_debiles: multi('estaciones_debiles').optional(),

  // bloque F
  planes_previos: single('planes_previos').optional(),
  planes_fallo: multi('planes_fallo').optional(),
  espera_coaching: single('espera_coaching').optional(),
  conocido: single('conocido').optional(),
  nota_libre: z.string().trim().max(2000).optional(),

  // cierre · datos
  edad: optionalInt(12, 100),
  sexo: single('sexo').optional(),
  ubicacion: single('ubicacion').optional(),
} as const;

/** Partial capture — created when the visitor enters their email (end of bloque A). */
export const leadDraftInput = z
  .object({
    email,
    website: honeypot,
    ...answersShape,
  })
  .strict();
export type LeadDraftInput = z.infer<typeof leadDraftInput>;

/** Full submit — telefono + RGPD consent required; everything else optional. */
export const leadSubmitInput = z
  .object({
    email,
    website: honeypot,
    telefono: z.string().trim().min(6).max(30),
    consent_rgpd: z.literal(true),
    ...answersShape,
  })
  .strict();
export type LeadSubmitInput = z.infer<typeof leadSubmitInput>;
