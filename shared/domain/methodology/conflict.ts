// Methodology CONFLICT EVALUATOR (spec §2 "Resolución de conflictos", rules 1-8).
//
// WHY THIS EXISTS
// ---------------
// At any decision point (pre-session gate, intra-session signal, nightly batch,
// selection) MULTIPLE rules can fire at once — e.g. "HRV<-15% → skip PM" and
// "ACC week++ → +3% load". The system must deterministically pick which
// action(s) actually apply. This module implements the spec's 8-step resolution
// so the web dashboard (conflict hints), the plan adapter (what to apply), and
// tests all agree on ONE answer.
//
// It is PURE: rules in → a resolution out. No I/O. The caller is responsible for
// having already filtered to the rules whose conditions actually MATCHED the
// current athlete/session context (matching needs runtime data this module does
// not have). This module decides PRECEDENCE among matched rules.

import {
  ACTION_SEVERITY_ORDER,
  AUTHORED_RANK,
  LOWERING_VERBS,
  PRIORITY_RANK,
  RAISING_VERBS,
  SCOPE_SPECIFICITY,
  type ActionVerb,
} from './vocabulary';
import type { Rule, RuleAction } from './rule';

// A matched rule paired with the single action under consideration. A rule can
// carry several actions; precedence is computed per (rule, action) pair so a
// rule's safety action and its progression action are weighed independently.
export interface MatchedAction {
  rule: Rule;
  action: RuleAction;
}

export interface ResolutionResult {
  // The winning action(s) to apply. Usually one per scope; intra-session may
  // apply several non-conflicting micro-adjusts.
  winners: MatchedAction[];
  // Actions suppressed by a higher-precedence one, with the reason (for the UI's
  // "these rules overlap — priority decides" hint and for audit).
  suppressed: Array<{ loser: MatchedAction; beatenBy: MatchedAction; reason: ConflictReason }>;
  // True if any winning action rewrites the assigned plan → caller consolidates
  // into ONE week_adjustment_proposal (spec §2.6).
  requiresCoachApproval: boolean;
}

export type ConflictReason =
  | 'priority' // §2.1
  | 'severity' // §2.2
  | 'direction' // §2.3
  | 'scope' // §2.4
  | 'authored'; // §2.8

const severityIndex = (verb: ActionVerb): number => {
  const i = ACTION_SEVERITY_ORDER.indexOf(verb);
  return i === -1 ? ACTION_SEVERITY_ORDER.length : i; // unknown = least severe
};

// Pairwise precedence: does `a` beat `b`? Returns the winner + reason, or null on
// a true tie (both kept). Implements §2.1→§2.8 in priority order.
function compare(a: MatchedAction, b: MatchedAction): { winner: MatchedAction; reason: ConflictReason } | null {
  // §2.1 priority
  const pa = PRIORITY_RANK[a.rule.priority];
  const pb = PRIORITY_RANK[b.rule.priority];
  if (pa !== pb) return { winner: pa > pb ? a : b, reason: 'priority' };

  // §2.2 severity (more conservative wins within equal priority)
  const sa = severityIndex(a.action.verb);
  const sb = severityIndex(b.action.verb);
  if (sa !== sb) return { winner: sa < sb ? a : b, reason: 'severity' };

  // §2.3 direction coherence: opposing pushes → the one that LOWERS wins.
  // Exception (taper/REAL with days_to_race) is handled by priority: taper rules
  // are authored `critical`, so they never reach this branch.
  const aLowers = LOWERING_VERBS.has(a.action.verb);
  const bLowers = LOWERING_VERBS.has(b.action.verb);
  const aRaises = RAISING_VERBS.has(a.action.verb);
  const bRaises = RAISING_VERBS.has(b.action.verb);
  if (aLowers && bRaises) return { winner: a, reason: 'direction' };
  if (bLowers && aRaises) return { winner: b, reason: 'direction' };

  // §2.4 scope specificity (more specific wins at equal priority)
  const ca = SCOPE_SPECIFICITY[a.rule.scope];
  const cb = SCOPE_SPECIFICITY[b.rule.scope];
  if (ca !== cb) return { winner: ca > cb ? a : b, reason: 'scope' };

  // §2.8 coach > IA at equal priority/scope
  const aa = AUTHORED_RANK[a.rule.source.authored];
  const ab = AUTHORED_RANK[b.rule.source.authored];
  if (aa !== ab) return { winner: aa > ab ? a : b, reason: 'authored' };

  return null; // genuine tie — both apply
}

// Two actions CONFLICT (one must suppress the other) when they contend over the
// same target. Heuristic per spec: same scope, OR one is a session-killer
// (skip/reschedule/swap_session) that voids everything in that session/day, OR
// they push opposite directions on the same dimension. Non-conflicting actions
// (e.g. notify_athlete + cut_reps) BOTH apply.
const SESSION_KILLERS: ReadonlySet<ActionVerb> = new Set<ActionVerb>([
  'skip',
  'reschedule',
  'swap_session',
  'remove_session',
]);

function conflicts(a: MatchedAction, b: MatchedAction): boolean {
  // A session-killer voids any other action on the same or narrower temporal scope.
  if (SESSION_KILLERS.has(a.action.verb) || SESSION_KILLERS.has(b.action.verb)) {
    return SCOPE_SPECIFICITY[a.rule.scope] <= SCOPE_SPECIFICITY[b.rule.scope] + 3 ||
      SCOPE_SPECIFICITY[b.rule.scope] <= SCOPE_SPECIFICITY[a.rule.scope] + 3;
  }
  // Opposite direction on intensity/volume → conflict.
  const aDir = LOWERING_VERBS.has(a.action.verb) ? -1 : RAISING_VERBS.has(a.action.verb) ? 1 : 0;
  const bDir = LOWERING_VERBS.has(b.action.verb) ? -1 : RAISING_VERBS.has(b.action.verb) ? 1 : 0;
  if (aDir !== 0 && bDir !== 0 && aDir !== bDir) return true;
  // Same exact verb on same scope → redundant/conflicting (keep the precedent one).
  if (a.action.verb === b.action.verb && a.rule.scope === b.rule.scope) return true;
  return false;
}

/**
 * Resolve a set of MATCHED (already condition-satisfied) actions into the ones to
 * apply, per spec §2.1-§2.8. Pure & deterministic.
 *
 * Algorithm: greedily build the winner set. For each candidate, if it conflicts
 * with an existing winner, run pairwise `compare`; the loser is suppressed. This
 * yields a stable, transitive result because the comparison is a total preorder.
 */
export function resolveConflicts(matched: MatchedAction[]): ResolutionResult {
  // Only enabled rules participate.
  const candidates = matched.filter((m) => m.rule.enabled);
  const winners: MatchedAction[] = [];
  const suppressed: ResolutionResult['suppressed'] = [];

  for (const cand of candidates) {
    let dropped = false;
    for (let i = winners.length - 1; i >= 0; i--) {
      const w = winners[i]!;
      if (!conflicts(cand, w)) continue;
      const verdict = compare(cand, w);
      if (verdict === null) continue; // tie → both stay
      if (verdict.winner === cand) {
        // candidate beats this winner → remove the winner
        winners.splice(i, 1);
        suppressed.push({ loser: w, beatenBy: cand, reason: verdict.reason });
      } else {
        // existing winner beats candidate → candidate is suppressed
        suppressed.push({ loser: cand, beatenBy: w, reason: verdict.reason });
        dropped = true;
        break;
      }
    }
    if (!dropped) winners.push(cand);
  }

  const requiresCoachApproval = winners.some((w) => w.action.requires_coach_approval);
  return { winners, suppressed, requiresCoachApproval };
}

/**
 * Static (authoring-time) overlap hint for the rule builder (spec §6 "Aviso de
 * conflicto"). Two rules MAY overlap when they share a trigger_phase and at
 * least one condition metric — the priority/severity then decides at runtime.
 * This does NOT need runtime data; it powers the "these 2 rules can overlap" UI.
 */
export function rulesMayOverlap(a: Rule, b: Rule): boolean {
  if (a.trigger_phase !== b.trigger_phase) return false;
  if (a.area !== b.area) {
    // cross-area overlap only matters when scopes intersect temporally
    if (SCOPE_SPECIFICITY[a.scope] !== SCOPE_SPECIFICITY[b.scope]) return false;
  }
  const metricsA = new Set(a.conditions.flatMap((g) => g.conditions.map((c) => c.metric)));
  for (const g of b.conditions) {
    for (const c of g.conditions) {
      if (metricsA.has(c.metric)) return true;
    }
  }
  return false;
}
