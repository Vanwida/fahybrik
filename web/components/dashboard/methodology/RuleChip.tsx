'use client';

import { MIcon } from '@/components/dashboard/MIcon';
import { cn } from '@/lib/utils';
import {
  OPERATOR_LABELS,
  PRIORITY_LABELS,
  findMetric,
  findVerb,
  type RuleVM,
  type RulePriority,
} from '@/lib/dashboard/coach/methodology/rule-vm';

// The signature element: a rule rendered as a Concept2-PM5-style readout —
// CUANDO [métrica][op][valor] ENTONCES [verbo][params] · prioridad — with
// editable token "chips". Reads like a hardware monitor, never a generic form.

const PRIORITY_COLOR: Record<RulePriority, string> = {
  critical: 'var(--danger)',
  high: 'var(--accent)',
  medium: 'var(--warning)',
  low: 'var(--text-muted)',
};

function formatValue(value: number | [number, number] | string): string {
  if (Array.isArray(value)) return `${value[0]}–${value[1]}`;
  return String(value);
}

function Token({
  kind,
  children,
  onClick,
}: {
  kind: 'metric' | 'op' | 'value' | 'verb' | 'params';
  children: React.ReactNode;
  onClick?: () => void;
}) {
  const base =
    'inline-flex items-center gap-1 rounded-[var(--r-sm)] border px-2 py-0.5 text-[12px] font-semibold transition-colors';
  const styles: Record<string, string> = {
    metric:
      'border-[color:var(--border-subtle)] bg-[color:var(--surface-elevated)] text-[color:var(--fg)]',
    op: 'metric-num border-transparent bg-transparent px-1 text-[color:var(--text-muted)]',
    value:
      'metric-num border-[color:color-mix(in_srgb,var(--accent)_35%,var(--border-subtle))] bg-[color:color-mix(in_srgb,var(--accent)_8%,var(--surface-card))] text-[color:var(--accent)]',
    verb: 'border-[color:var(--border-subtle)] bg-[color:var(--surface-elevated)] text-[color:var(--fg)]',
    params: 'border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] text-[color:var(--text-muted)]',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(base, styles[kind], onClick && 'focus-ring hover:border-[color:var(--accent)]')}
    >
      {children}
      {onClick ? <MIcon name="edit" size={11} className="opacity-50" /> : null}
    </button>
  );
}

export function RuleChip({
  rule,
  onToggle,
  onEdit,
}: {
  rule: RuleVM;
  onToggle: () => void;
  onEdit?: () => void;
}) {
  const disabled = !rule.enabled;

  return (
    <div
      className={cn(
        'card-surface relative space-y-3 p-4 transition-opacity',
        disabled && 'opacity-50',
      )}
      style={{
        borderLeft: `3px solid ${disabled ? 'var(--border-subtle)' : PRIORITY_COLOR[rule.priority]}`,
      }}
    >
      {/* Top row: authored source + priority + toggle */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {rule.authored === 'pablo' ? (
            <span className="inline-flex items-center gap-1 rounded-[var(--r-pill)] border border-[color:color-mix(in_srgb,var(--ok)_40%,var(--border-subtle))] bg-[color:color-mix(in_srgb,var(--ok)_8%,transparent)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-[color:var(--ok)]">
              <MIcon name="verified" size={12} />
              tuya
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-[var(--r-pill)] border border-[color:var(--border-subtle)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-[color:var(--text-muted)]">
              {rule.authored === 'ai_suggested' ? 'sugerida' : 'default'}
            </span>
          )}
          <span
            className="text-[11px] font-bold uppercase tracking-[0.06em]"
            style={{ color: PRIORITY_COLOR[rule.priority] }}
          >
            {PRIORITY_LABELS[rule.priority]}
          </span>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={rule.enabled}
          aria-label={rule.enabled ? 'Desactivar regla' : 'Activar regla'}
          onClick={onToggle}
          className={cn(
            'focus-ring relative h-5 w-9 shrink-0 rounded-[var(--r-pill)] transition-colors',
            rule.enabled ? 'bg-[color:var(--accent)]' : 'bg-[color:var(--surface-elevated)]',
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform',
              rule.enabled ? 'translate-x-4' : 'translate-x-0.5',
            )}
          />
        </button>
      </div>

      {/* The readout */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-display text-[12px] font-black italic uppercase tracking-wide text-[color:var(--text-muted)]">
          Cuando
        </span>
        {rule.conditions.map((c, i) => {
          const metric = findMetric(c.metric);
          return (
            <span key={i} className="flex flex-wrap items-center gap-1.5">
              {i > 0 ? (
                <span className="text-[10px] font-bold uppercase text-[color:var(--text-muted)]">
                  y
                </span>
              ) : null}
              <Token kind="metric" onClick={onEdit}>
                {metric?.label ?? c.metric}
              </Token>
              <Token kind="op">{OPERATOR_LABELS[c.operator]}</Token>
              <Token kind="value" onClick={onEdit}>
                {formatValue(c.value)}
                <span className="text-[10px] opacity-70"> {c.unit}</span>
              </Token>
              {c.window ? (
                <span className="metric-num text-[10px] text-[color:var(--text-muted)]">
                  ({c.window})
                </span>
              ) : null}
            </span>
          );
        })}

        <span className="font-display text-[12px] font-black italic uppercase tracking-wide text-[color:var(--accent)]">
          Entonces
        </span>
        {rule.actions.map((a, i) => {
          const verb = findVerb(a.verb);
          return (
            <span key={i} className="flex flex-wrap items-center gap-1.5">
              <Token kind="verb" onClick={onEdit}>
                {verb?.label ?? a.verb}
              </Token>
              <Token kind="params" onClick={onEdit}>
                {a.paramsLabel}
              </Token>
            </span>
          );
        })}
      </div>

      {/* Source excerpt — trust signal */}
      {rule.sourceExcerpt ? (
        <p className="flex items-start gap-1.5 border-t border-[color:var(--hairline)] pt-2 text-[11px] italic text-[color:var(--text-muted)]">
          <MIcon name="format_quote" size={13} className="mt-px shrink-0" />
          {rule.sourceExcerpt}
        </p>
      ) : null}
    </div>
  );
}
