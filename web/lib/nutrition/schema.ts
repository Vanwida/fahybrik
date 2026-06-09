// Server-side validation for the nutrition log (Zod). Trust nothing from the
// client: macros must be finite numbers >= 0, name 1..200 chars, source within
// the enum, logged_for a strict YYYY-MM-DD calendar date.

import { z } from 'zod';
import { NUTRITION_SOURCES } from './entries';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Accepts only a real calendar date in YYYY-MM-DD (rejects 2026-13-40 etc.).
export const isoDate = z
  .string()
  .regex(ISO_DATE, 'Expected YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'Not a valid calendar date');

const macro = z.number().finite().min(0);

export const createNutritionSchema = z.object({
  logged_for: isoDate,
  name: z.string().trim().min(1).max(200),
  kcal: macro,
  protein_g: macro,
  carbs_g: macro,
  fat_g: macro,
  quantity: z.number().finite().min(0).nullish(),
  unit: z.string().trim().min(1).max(40).nullish(),
  source: z.enum(NUTRITION_SOURCES).optional(),
  barcode: z
    .string()
    .trim()
    .regex(/^\d{6,14}$/, 'barcode must be 6-14 digits')
    .nullish(),
  // Free-form audit payload (OFF product / AI estimation). Kept as-is.
  raw: z.unknown().optional(),
});

export type CreateNutritionBody = z.infer<typeof createNutritionSchema>;

// ?code= for the barcode proxy: EAN/UPC are 6-14 digits.
export const barcodeQuerySchema = z.object({
  code: z.string().regex(/^\d{6,14}$/, 'code must be 6-14 digits'),
});

// ?q= for the food-search proxy: 2..100 chars after trim.
export const searchQuerySchema = z.object({
  q: z.string().trim().min(2, 'q must be at least 2 chars').max(100),
});
