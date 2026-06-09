// Thin re-export shim. Single source of truth lives in
// `@fahybrid/shared/schema/templates`. Names with the `Schema` suffix are
// aliased here for parity with the legacy local naming convention used
// throughout the templates UI; canonical names drop the suffix.

export {
  templateFormat as templateFormatSchema,
  targetBlock as targetBlockSchema,
  exerciseCategory as exerciseCategorySchema,
  type TemplateFormat,
  type TargetBlock,
  type ExerciseCategory,
} from '@fahybrid/shared/schema/_primitives';

export {
  segmentWeekVariantSchema,
  segmentConditionalSchema,
  segmentAlternativeSchema,
  segmentLevelNotesSchema,
  segmentParamsSchema,
  templateSegmentInputSchema,
  templateUpsertSchema,
  type SegmentParams,
  type SegmentWeekVariant,
  type SegmentConditional,
  type SegmentAlternative,
  type SegmentLevelNotes,
  type TemplateSegmentInput,
  type TemplateUpsert,
} from '@fahybrid/shared/schema/templates';
