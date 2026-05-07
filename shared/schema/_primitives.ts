import { z } from 'zod';

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

export const targetPriority = z.enum(['A', 'B', 'C']);
export type TargetPriority = z.infer<typeof targetPriority>;

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

export const templateFormat = z.enum([
  'amrap',
  'for_time',
  'emom',
  'intervals',
  'strength_block',
  'hyrox_sim',
  'tempo',
  'circuit',
]);
export type TemplateFormat = z.infer<typeof templateFormat>;

export const atrBlockType = z.enum(['ACC', 'TRANS', 'REAL']);
export type AtrBlockType = z.infer<typeof atrBlockType>;

export const targetBlock = z.enum(['ACC', 'TRANS', 'REAL', 'any']);
export type TargetBlock = z.infer<typeof targetBlock>;

export const macrocycleStatus = z.enum(['planned', 'active', 'completed', 'cancelled']);
export type MacrocycleStatus = z.infer<typeof macrocycleStatus>;

export const blockStatus = z.enum(['planned', 'active', 'completed', 'skipped']);
export type BlockStatus = z.infer<typeof blockStatus>;

export const assignmentStatus = z.enum(['scheduled', 'completed', 'missed', 'skipped']);
export type AssignmentStatus = z.infer<typeof assignmentStatus>;

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
]);
export type BiometricSource = z.infer<typeof biometricSource>;

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
]);
export type NotificationType = z.infer<typeof notificationType>;

export const auditAction = z.enum(['create', 'update', 'delete', 'restore']);
export type AuditAction = z.infer<typeof auditAction>;

// Embedding dimension matches DB methodology_chunks.embedding vector(1536).
// Migration path documented in 0001_init.sql.
export const EMBEDDING_DIM = 1536;
export const embeddingSchema = z.array(z.number()).length(EMBEDDING_DIM);
