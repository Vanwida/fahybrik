'use client';

import { useState } from 'react';
import { MIcon } from '@/components/dashboard/MIcon';
import { cn } from '@/lib/utils';
import { SectionHeader } from './SectionHeader';
import { RuleChip } from './RuleChip';
import { useRuleParse } from '@/lib/dashboard/coach/methodology/use-rule-parse';
import { INTRA_SESSION_RULES_DEFAULT } from '@/lib/dashboard/coach/methodology/defaults';
import { PRIORITY_ORDER, type RuleVM } from '@/lib/dashboard/coach/methodology/rule-vm';

// Área 7 — Autorregulación intra-sesión. Hosts the rule-builder (make-or-break):
// NL textarea + [✦] → parsed chip preview → add to the list. Pablo's real rules
// come pre-loaded as editable/toggleable chips. Parse is a stub (use-rule-parse)
// ready to wire to the AI endpoint; chips + toggling are fully functional.

const PLACEHOLDER =
  'si la HRV cae más de 15% cambio el run de la tarde por remo Z2 de 30 min';

function sortRules(rules: RuleVM[]): RuleVM[] {
  return [...rules].sort(
    (a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority),
  );
}

export function AutoregulationSection() {
  const [rules, setRules] = useState<RuleVM[]>(() => sortRules(INTRA_SESSION_RULES_DEFAULT));
  const [draft, setDraft] = useState('');
  const { status, parsed, parse, reset } = useRuleParse();

  const toggle = (id: string) =>
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));

  const addParsed = () => {
    if (!parsed) return;
    setRules((prev) => sortRules([{ ...parsed }, ...prev]));
    setDraft('');
    reset();
  };

  const activeCount = rules.filter((r) => r.enabled).length;

  return (
    <div className="space-y-8">
      <SectionHeader
        areaId={7}
        phase="intra_session"
        title="Autorregulación intra-sesión"
        subtitle="Señales en vivo (FC, ritmo, RPE por serie) → micro-ajustes inmediatos. Los ajustes intra son auto-aplicables; los que tocan el plan futuro se difieren a una sola propuesta al cierre."
      />

      {/* Rule builder */}
      <div className="card-elevated space-y-4 p-5">
        <div className="flex items-center gap-2">
          <MIcon name="add_circle" size={18} className="text-[color:var(--accent)]" />
          <h2 className="font-heading text-[color:var(--fg)]">Nueva regla</h2>
        </div>
        <p className="text-[13px] text-[color:var(--text-muted)]">
          Dílo como se lo dirías a un atleta. La IA lo convierte en chips editables.
        </p>

        <div className="relative">
          <textarea
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (status !== 'idle') reset();
            }}
            placeholder={PLACEHOLDER}
            rows={2}
            className={cn(
              'focus-ring w-full resize-none rounded-[var(--r-m)] border border-[color:var(--border-subtle)]',
              'bg-[color:var(--surface-card)] py-3 pl-3.5 pr-14 text-sm text-[color:var(--fg)]',
              'placeholder:text-[color:var(--text-muted)] focus:border-[color:var(--accent)] focus:outline-none',
            )}
          />
          <button
            type="button"
            aria-label="Interpretar con IA"
            disabled={!draft.trim() || status === 'parsing'}
            onClick={() => parse(draft)}
            className={cn(
              'focus-ring absolute right-2.5 top-2.5 grid h-9 w-9 place-items-center rounded-[var(--r-m)]',
              'bg-[color:var(--accent)] text-[color:var(--accent-on)] transition',
              'hover:bg-[color:var(--accent-press)] disabled:opacity-40',
            )}
          >
            {status === 'parsing' ? (
              <MIcon name="progress_activity" size={18} className="animate-spin" />
            ) : (
              // Six-pointed asterisk glyph — deliberately NOT the Sparkles cliché.
              <span className="text-[18px] leading-none font-bold">✦</span>
            )}
          </button>
        </div>

        {/* Parse preview */}
        {status === 'parsing' ? (
          <p className="flex items-center gap-2 text-[13px] text-[color:var(--text-muted)]">
            <MIcon name="progress_activity" size={16} className="animate-spin" />
            La IA está interpretando tu regla…
          </p>
        ) : null}

        {status === 'done' && parsed ? (
          <div className="space-y-3">
            <p className="flex items-center gap-1.5 text-[12px] font-semibold text-[color:var(--text-muted)]">
              <MIcon name="visibility" size={14} />
              La IA lo entiende así — revisa los chips y guarda:
            </p>
            <RuleChip rule={parsed} onToggle={() => undefined} />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={reset}
                className="focus-ring rounded-[var(--r-sm)] px-3 py-2 text-sm font-semibold text-[color:var(--text-muted)] hover:text-[color:var(--fg)]"
              >
                Descartar
              </button>
              <button
                type="button"
                onClick={addParsed}
                className="focus-ring inline-flex items-center gap-2 rounded-[var(--r-m)] bg-[color:var(--accent)] px-4 py-2 text-sm font-bold text-[color:var(--accent-on)] transition hover:bg-[color:var(--accent-press)]"
              >
                <MIcon name="check" size={18} />
                Guardar regla
              </button>
            </div>
          </div>
        ) : null}

        <p className="flex items-center gap-1.5 text-[11px] italic text-[color:var(--text-muted)]">
          <MIcon name="info" size={13} />
          La interpretación NL→estructura es un stub local por ahora; los chips y su edición son
          reales.
        </p>
      </div>

      {/* Pre-loaded Pablo rules */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-[color:var(--fg)]">Tus reglas</h2>
          <span className="metric-num text-[12px] text-[color:var(--text-muted)]">
            {activeCount} activas · {rules.length} en total
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {rules.map((rule, i) => (
            <div key={rule.id} className="stagger-in" style={{ ['--stagger-i' as string]: i }}>
              <RuleChip rule={rule} onToggle={() => toggle(rule.id)} onEdit={() => undefined} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
