import { z } from 'zod';
import {
  TEMPLATE_FORMAT_VALUES,
  type LegacyTemplateFormat,
  type WorkoutFormat,
} from '../domain/prescription/format';

export const idSchema = z.coerce.bigint().or(z.number().int().nonnegative());
export type Id = z.infer<typeof idSchema>;

export const isoDateTime = z.string().datetime({ offset: true });
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

export const slugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9][a-z0-9_-]*$/, 'lowercase letters, digits, _ or -');

export const emailSchema = z.string().email().toLowerCase();

export const userRole = z.enum(['athlete', 'coach', 'admin']);
export type UserRole = z.infer<typeof userRole>;

export const athleteSex = z.enum(['male', 'female', 'other']);
export type AthleteSex = z.infer<typeof athleteSex>;

export const discipline = z.enum(['hyrox', 'crossfit', 'hybrid', 'running', 'strength', 'other']);
export type Discipline = z.infer<typeof discipline>;

export const equipmentAccess = z.enum(['full_gym', 'home_gym', 'minimal', 'travel']);
export type EquipmentAccess = z.infer<typeof equipmentAccess>;

export const eventType = z.enum(['hyrox', 'crossfit', 'other']);
export type EventType = z.infer<typeof eventType>;

export const exerciseCategory = z.enum([
  'cardio',
  'strength',
  'skill',
  'hyrox_station',
  'mobility',
  'plyometric',
  'core',
]);
export type ExerciseCategory = z.infer<typeof exerciseCategory>;

// `template_format` (the block/template format) shares ONE vocabulary with the
// prescription scheme — the canonical catalog in
// `shared/domain/prescription/format.ts`. This zod mirror = every value the DB
// `template_format` enum accepts: the canonical formats PLUS the legacy DB-only
// members (strength_block | tempo | circuit | test) still present in old rows.
// Readers normalize the legacy members to canonical via `normalizeFormat`.
export type TemplateFormat = WorkoutFormat | LegacyTemplateFormat;
export const templateFormat = z.enum(
  TEMPLATE_FORMAT_VALUES as unknown as [TemplateFormat, ...TemplateFormat[]],
);

export const targetBlock = z.enum(['ACC', 'TRANS', 'REAL', 'any']);
export type TargetBlock = z.infer<typeof targetBlock>;

export const macrocycleStatus = z.enum(['planned', 'active', 'completed', 'cancelled']);
export type MacrocycleStatus = z.infer<typeof macrocycleStatus>;

export const blockStatus = z.enum(['planned', 'active', 'completed', 'skipped']);
export type BlockStatus = z.infer<typeof blockStatus>;

// 'partial' = terminated early but honestly logged (mig 0089); the write path
// emits it, so the wire contract must accept it or 'partial' rows fail to parse.
export const assignmentStatus = z.enum(['scheduled', 'completed', 'partial', 'missed', 'skipped']);
export type AssignmentStatus = z.infer<typeof assignmentStatus>;

// Mirrors the `biometric_source` Postgres enum, IN ITS DECLARATION ORDER — the
// order matters because Postgres sorts enum arrays by enum position, so
// `contributing_sources` written here matches one written by SQL (mig 0144).
// 'treadmill' and 'gps' (mig 0143) are not accounts or brands: they are the
// local apparatus the live engine reads (FTMS treadmill, phone GPS), and
// `workout_executions.contributing_sources` has to be able to name them.
//
// 'suunto' and 'amazfit' (mig 0135) sat in the DB for weeks WITHOUT being here,
// so both Zod copies rejected a value Postgres accepts. Nothing broke only
// because no ingestor emits them yet — but their absence also silently shifted
// every later value's position, which is exactly the invariant the first
// paragraph depends on. Verified against production: the enum is these thirteen,
// in this order.
export const biometricSource = z.enum([
  'healthkit',
  'garmin',
  'concept2',
  'manual',
  'whoop',
  'oura',
  'polar',
  'coros',
  'wahoo',
  'suunto',
  'amazfit',
  'treadmill',
  'gps',
]);
export type BiometricSource = z.infer<typeof biometricSource>;

// Mirrors the `execution_recording_method` Postgres enum (mig 0144). HOW the
// record came to exist — a different question from `biometric_source`, which
// says WHICH APPARATUS produced the numbers. A session run in the app with a
// PM5 is recorded_via='live' AND source='concept2'; conflating the two is what
// made four real live sessions read as "a mano".
export const executionRecordingMethod = z.enum(['live', 'manual', 'imported']);
export type ExecutionRecordingMethod = z.infer<typeof executionRecordingMethod>;

export const biometricMetric = z.enum([
  'hr',
  'hr_resting',
  'hrv',
  'sleep_duration',
  'sleep_score',
  'vo2max',
  'recovery',
  'training_load',
  'body_battery',
  'stress',
  'respiration',
  'spo2',
  'steps',
  'calories_active',
  'weight',
  'body_fat',
]);
export type BiometricMetric = z.infer<typeof biometricMetric>;

export const deviceType = z.enum([
  'apple_watch',
  'iphone',
  'garmin',
  'concept2',
  'whoop',
  'oura',
  'other',
]);
export type DeviceType = z.infer<typeof deviceType>;

export const methodologySourceType = z.enum([
  'text',
  'interview_transcript',
  'document_upload',
  'voice_note',
]);
export type MethodologySourceType = z.infer<typeof methodologySourceType>;

export const notificationType = z.enum([
  'workout_assigned',
  'workout_edited',
  'chat_message',
  'event_reminder',
  'recovery_alert',
  'milestone',
  'system',
  // Coach inbox triggers (phase 1c):
  'week_adjustment_pending',
  'monthly_block_pending',
  'intake_pending',
  'atr_transition_suggested',
]);
export type NotificationType = z.infer<typeof notificationType>;

export const auditAction = z.enum(['create', 'update', 'delete', 'restore']);
export type AuditAction = z.infer<typeof auditAction>;

// Languages supported by the user-facing surfaces (iOS + Pablo dashboard).
// Mirrored by users.idioma CHECK constraint (migration 0021).
export const userLanguage = z.enum(['es', 'en']);
export type UserLanguage = z.infer<typeof userLanguage>;

// Dobles HYROX: which partner does this assignment belong to, visibility-wise.
// 'shared' (default) → both partners see it; 'self_only' → only the assigned
// athlete sees it (e.g. solo strength work inside a Dobles plan).
export const partnerVisibility = z.enum(['shared', 'self_only']);
export type PartnerVisibility = z.infer<typeof partnerVisibility>;

// weekly_plans.status — coach planning lifecycle (migration 0021).
export const weeklyPlanStatus = z.enum(['draft', 'published', 'archived']);
export type WeeklyPlanStatus = z.infer<typeof weeklyPlanStatus>;

// subscriptions.plan_type — billing tiers (migration 0021).
export const subscriptionPlanType = z.enum(['individual', 'dobles', 'pro_elite']);
export type SubscriptionPlanType = z.infer<typeof subscriptionPlanType>;

// subscriptions.status — mirrors the subscription_status pg enum.
export const subscriptionStatus = z.enum([
  'active',
  'past_due',
  'canceled',
  'incomplete',
  'trialing',
]);
export type SubscriptionStatus = z.infer<typeof subscriptionStatus>;

// Embedding dimension matches DB methodology_chunks.embedding vector(1536).
// Migration path documented in 0001_init.sql.
export const EMBEDDING_DIM = 1536;
export const embeddingSchema = z.array(z.number()).length(EMBEDDING_DIM);
