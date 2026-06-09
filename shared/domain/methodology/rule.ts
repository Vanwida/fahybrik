// Methodology RULE model (spec §2) — the reusable "WHEN [condition] THEN
// [action]" unit that captures HOW a coach decides, across all 14 areas.
//
// WHY THIS EXISTS
// ---------------
// Per-exercise dosage is already structured (domain/prescription). What was NOT
// captured anywhere is the DECISION layer: how the coach selects, sequences,
// progresses and adapts. This file is the single typed shape for one such rule.
// It is persisted in `methodology_rules` (migration 0048): the typed scalar axes
// (area, trigger_phase, scope, priority, authored, enabled…) are columns; the
// VARIABLE-ARITY parts (conditions[], actions[]) are validated JSONB —
// same precedent as `prescription_json` (0043), which is why JSONB is justified
// here and nowhere else in the methodology schema.

import { z } from 'zod';
import {
  actionVerb,
  conditionGroupOp,
  conditionMetric,
  conditionSource,
  conditionUnit,
  ruleAuthored,
  rulePriority,
  ruleScope,
  ruleOperator,
  ruleTriggerPhase,
} from './vocabulary';

const AREA_MIN = 1; // 14 methodology areas (spec §4)
const AREA_MAX = 14;

// ── RuleCondition (spec §2) ─────────────────────────────────────────────────
// One observation. `value` is a number for scalar comparisons, a [min,max] tuple
// for `between`, or a string/string[] for `in`/enum comparisons. `unit` and
// `source` make the value self-describing so the evaluator never guesses scale.
export const ruleConditionSchema = z
  .object({
    metric: conditionMetric,
    operator: ruleOperator,
    value: z.union([
      z.number(),
      z.tuple([z.number(), z.number()]),
      z.string(),
      z.array(z.string()).min(1),
      z.boolean(),
    ]),
    unit: conditionUnit,
    source: conditionSource,
    window: z.string().min(1).max(40).optional(),
    // Optional argument for metrics that take a parameter, e.g.
    // injury_active(area), missing_equipment(item), modality_score(modality).
    arg: z.string().min(1).max(60).optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    // operator/value coherence — caught at write time, not at eval time.
    if (c.operator === 'between' && !(Array.isArray(c.value) && c.value.length === 2)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'between requires value [min,max]' });
    }
    if (c.operator === 'in' && !Array.isArray(c.value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'in requires value string[]' });
    }
    if (
      (c.operator === '<' ||
        c.operator === '<=' ||
        c.operator === '>' ||
        c.operator === '>=') &&
      typeof c.value !== 'number'
    ) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${c.operator} requires a numeric value` });
    }
    if (c.operator === 'is_true' && typeof c.value !== 'boolean') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'is_true requires a boolean value' });
    }
  });
export type RuleCondition = z.infer<typeof ruleConditionSchema>;

// A group of conditions combined by AND (default) or OR (alternatives, spec §2).
// A rule's `conditions` is an array of groups; groups are AND-ed with each other,
// conditions WITHIN a group use the group's `op`. A bare list of conditions is
// represented as a single AND group.
export const conditionGroupSchema = z
  .object({
    op: conditionGroupOp.default('AND'),
    conditions: z.array(ruleConditionSchema).min(1).max(10),
  })
  .strict();
export type ConditionGroup = z.infer<typeof conditionGroupSchema>;

// ── RuleAction (spec §2) ────────────────────────────────────────────────────
// One adjustment. `params` is a bounded bag of numbers/strings (verb-specific —
// e.g. scale_load{pct:-10,scope:'exercise'}; swap_modality{exercise,to_modality}).
// `requires_coach_approval` decides whether applying the action writes a pending
// week_adjustment_proposal (spec §2.7).
export const ruleActionSchema = z
  .object({
    verb: actionVerb,
    params: z.record(z.union([z.number(), z.string(), z.boolean()])).default({}),
    requires_coach_approval: z.boolean(),
  })
  .strict();
export type RuleAction = z.infer<typeof ruleActionSchema>;

// ── Rule source provenance (spec §2) ────────────────────────────────────────
export const ruleSourceSchema = z
  .object({
    template_id: z.union([z.string(), z.number()]).optional(),
    coach_note_excerpt: z.string().max(2000).optional(),
    authored: ruleAuthored,
  })
  .strict();
export type RuleSource = z.infer<typeof ruleSourceSchema>;

// ── Rule (spec §2) ──────────────────────────────────────────────────────────
// Full rule. `id`/`coach_id` are present on persisted rules but optional on a
// draft being authored in the builder (DB assigns id; coach_id from session).
export const ruleSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    coach_id: z.union([z.string(), z.number()]).optional(),
    area: z.number().int().min(AREA_MIN).max(AREA_MAX),
    trigger_phase: ruleTriggerPhase,
    scope: ruleScope,
    conditions: z.array(conditionGroupSchema).min(1).max(8),
    actions: z.array(ruleActionSchema).min(1).max(8),
    priority: rulePriority,
    source: ruleSourceSchema,
    enabled: z.boolean().default(true),
  })
  .strict();
export type Rule = z.infer<typeof ruleSchema>;

// Input (pre-default) shape, for composing into request bodies via .extend.
export type RuleInput = z.input<typeof ruleSchema>;

// Parse-or-throw + safe variants (server-side validation on every mutation —
// project rule). Use safeParse on request paths.
export function parseRule(value: unknown): Rule {
  return ruleSchema.parse(value);
}
export function safeParseRule(value: unknown) {
  return ruleSchema.safeParse(value);
}

// Convenience: flatten all conditions of a rule (ignoring group structure) — used
// by the conflict evaluator's metric-overlap heuristic.
export function allConditions(rule: Rule): RuleCondition[] {
  return rule.conditions.flatMap((g) => g.conditions);
}
