'use client';

import { useState, useCallback } from 'react';
import type { RuleVM } from './rule-vm';

// AI-assist: parse a natural-language rule → structured RuleVM (spec §6, mode a).
//
// STUB for now: returns a deterministic mock so the chips + editing are 100%
// real and demoable without a backend. The hook signature is the final one —
// wiring is a one-line swap to POST /api/coach/methodology/parse-rule (the
// endpoint another agent will add). Until then `parse()` resolves a best-effort
// local guess after a short delay to mimic the round-trip.

export type ParseStatus = 'idle' | 'parsing' | 'done' | 'error';

interface UseRuleParseResult {
  status: ParseStatus;
  parsed: RuleVM | null;
  parse: (text: string) => Promise<void>;
  reset: () => void;
}

// Minimal keyword → structure heuristics, ONLY to make the stub feel alive.
// The real parser is the AI endpoint; do not extend this into a real NLP layer.
function mockParse(text: string): RuleVM {
  const t = text.toLowerCase();
  const id = `draft-${Date.now()}`;

  if (t.includes('hrv') || t.includes('variabilidad')) {
    return {
      id,
      area: 7,
      triggerPhase: 'pre_session',
      scope: 'session',
      conditions: [
        { metric: 'hrv_delta_vs_baseline', operator: '<', value: -15, unit: '%', window: 'today' },
      ],
      actions: [{ verb: 'walk_jog', paramsLabel: 'swap PM run → row Z2 · 30min' }],
      priority: 'high',
      authored: 'ai_suggested',
      enabled: true,
    };
  }
  if (t.includes('ritmo') || t.includes('pace')) {
    return {
      id,
      area: 7,
      triggerPhase: 'intra_session',
      scope: 'set',
      conditions: [
        { metric: 'pace_drift_intra', operator: '>', value: 3, unit: 's/km', window: 'rep1_vs_rep6' },
      ],
      actions: [{ verb: 'cut_reps', paramsLabel: 'cortar a 4' }],
      priority: 'medium',
      authored: 'ai_suggested',
      enabled: true,
    };
  }
  // Generic RPE fallback.
  return {
    id,
    area: 7,
    triggerPhase: 'intra_session',
    scope: 'set',
    conditions: [{ metric: 'rpe_live', operator: '>', value: 8, unit: '0-10', window: 'session' }],
    actions: [{ verb: 'scale_load', paramsLabel: '−5 a −10% carga' }],
    priority: 'high',
    authored: 'ai_suggested',
    enabled: true,
  };
}

const PARSE_DELAY_MS = 650; // mimic AI round-trip

export function useRuleParse(): UseRuleParseResult {
  const [status, setStatus] = useState<ParseStatus>('idle');
  const [parsed, setParsed] = useState<RuleVM | null>(null);

  const parse = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setStatus('parsing');
    setParsed(null);
    // FOLLOW-UP (wiring): replace this block with
    //   const res = await fetch('/api/coach/methodology/parse-rule', { method:'POST', body: JSON.stringify({ text }) });
    //   setParsed(await res.json());
    await new Promise((r) => setTimeout(r, PARSE_DELAY_MS));
    try {
      setParsed(mockParse(text));
      setStatus('done');
    } catch {
      setStatus('error');
    }
  }, []);

  const reset = useCallback(() => {
    setStatus('idle');
    setParsed(null);
  }, []);

  return { status, parsed, parse, reset };
}
