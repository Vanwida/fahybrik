import { z } from 'zod';
import { idSchema, isoDate } from './_primitives';

// Intake commit payload — Pablo's signed-off decisions for a new athlete.
//
// The flow is described in /docs/ux/11-coach-athlete-intake.md. The five steps
// produce one transaction: macrocycle persist + level assignment + tests
// scheduled + welcome message dispatched. Skipping the welcome message is
// allowed; skipping macrocycle/level/tests is not (they are required for the
// athlete to be active in the cohort).

export const intakeBlockSpecSchema = z.object({
  // Microciclo NAME (coach data / agnostic) — e.g. "Microciclo 1". Not an ATR phase.
  type: z.string().min(1).max(60),
  weeks: z.number().int().min(1).max(20),
});
export type IntakeBlockSpec = z.infer<typeof intakeBlockSpecSchema>;

export const ATHLETE_LEVELS = [1, 2, 3, 4] as const;
export const athleteLevelSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);
export type AthleteLevel = z.infer<typeof athleteLevelSchema>;

export const intakeBaselineTestSchema = z.object({
  // Test slug — keys into a coach-defined catalog (HRV baseline, sleep tracking,
  // HYROX simulation half, 1RM update, …). Free-form so we can extend without
  // schema churn.
  slug: z.string().min(1).max(120),
  label: z.string().min(1).max(200),
  scheduled_for: isoDate.nullable(),
  // `auto` tests are passive (HRV / sleep tracked from device); `programmed`
  // tests are workouts Pablo schedules.
  kind: z.enum(['auto', 'programmed']),
});
export type IntakeBaselineTest = z.infer<typeof intakeBaselineTestSchema>;

export const intakeWelcomeSchema = z.object({
  send: z.boolean(),
  body: z.string().max(2000).nullable(),
});
export type IntakeWelcome = z.infer<typeof intakeWelcomeSchema>;

export const intakeCommitSchema = z.object({
  target_event_id: idSchema,
  block_specs: z.array(intakeBlockSpecSchema).min(1).max(8),
  level: athleteLevelSchema,
  baseline_tests: z.array(intakeBaselineTestSchema).max(20),
  welcome: intakeWelcomeSchema,
  acknowledged_warnings: z.array(z.string().max(120)).default([]),
  notes: z.string().max(2000).nullable().default(null),
  month_template_id: idSchema.optional(),
  month_start_date: isoDate.optional(),
});
export type IntakeCommit = z.infer<typeof intakeCommitSchema>;

// What we surface in `intake_notes_json` after commit. Snapshot of decisions
// so a future audit can see what Pablo signed off without re-querying.
export const intakeNotesSnapshotSchema = z.object({
  level: athleteLevelSchema,
  block_specs: z.array(intakeBlockSpecSchema),
  baseline_tests: z.array(intakeBaselineTestSchema),
  acknowledged_warnings: z.array(z.string()),
  welcome_sent: z.boolean(),
  notes: z.string().nullable(),
  committed_at: z.string(),
});
export type IntakeNotesSnapshot = z.infer<typeof intakeNotesSnapshotSchema>;
