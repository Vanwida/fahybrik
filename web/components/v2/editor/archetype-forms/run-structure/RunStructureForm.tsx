'use client';

// RunStructureForm — the STRUCTURED running-workout builder (#61), redesigned
// (editor-bloques mockup): the coach writes ONE LINE the way it's written in the
// gym ("6x1000 @4:30 r2'") and the importer grammar turns it into typed segments;
// the block's intensity profile renders as bars; each element reads as a sentence
// and only the tapped one opens. Editing writes both the rich `structure` and the
// legacy flatten (via prescriptionFromStructure) so the installed iOS app keeps
// decoding.

import { useState } from 'react';
import type { Phase, PhaseRole, Prescription, RunStructure } from '@fahybrid/shared/domain/prescription';
import { legacyToStructure, prescriptionFromStructure } from '@fahybrid/shared/domain/prescription';
import { parseNotationCell } from '@fahybrid/shared/domain/import/notation';
import { cn } from '@/lib/utils';
import { MIcon } from '@/components/ui/MIcon';
import {
  structureBars,
  structureTotals,
  totalsSentence,
  type IntensityBar,
} from '@/lib/dashboard/v2/run-structure-view';
import { PhaseEditor } from './PhaseEditor';
import {
  defaultCooldownElements,
  defaultWarmupElements,
  prefillElements,
  RUN_ARCHETYPES,
  type RunArchetypeId,
} from './archetype-prefills';
import { defaultWorkSegment } from './tree-ops';

// A never-empty starting structure: a single Principal work bout (the coach then
// picks an archetype, types the quick line, or builds the sequence by hand).
function seedStructure(): RunStructure {
  return [{ role: 'main', elements: [defaultWorkSegment()] }];
}

const PHASE_TABS: { role: PhaseRole; label: string; optional: boolean }[] = [
  { role: 'warmup', label: 'Calentamiento', optional: true },
  { role: 'main', label: 'Principal', optional: false },
  { role: 'cooldown', label: 'Vuelta a la calma', optional: true },
];

const PHASE_RANK: Record<PhaseRole, number> = { warmup: 0, main: 1, cooldown: 2 };

function sortPhases(phases: Phase[]): Phase[] {
  return [...phases].sort((a, b) => PHASE_RANK[a.role] - PHASE_RANK[b.role]);
}

/** El cuerpo que sembramos nosotros al abrir una fase. Si sigue igual, no hay
 *  trabajo del coach dentro: es el hueco por rellenar. */
function defaultElementsFor(role: PhaseRole): Phase['elements'] {
  if (role === 'warmup') return defaultWarmupElements();
  if (role === 'cooldown') return defaultCooldownElements();
  return seedStructure()[0]!.elements;
}

function isUntouched(role: PhaseRole, elements: Phase['elements']): boolean {
  return JSON.stringify(elements) === JSON.stringify(defaultElementsFor(role));
}

/** Las dos acciones de un toque que BORRAN lo ya escrito. Se confirman; el resto
 *  del editor no pregunta nada, porque nada más destruye. */
type PendingAction =
  | { kind: 'archetype'; id: RunArchetypeId; label: string }
  | { kind: 'removePhase'; role: PhaseRole; label: string };

export function RunStructureForm({
  value,
  onChange,
}: {
  value: Prescription;
  onChange: (next: Prescription) => void;
}) {
  // Derive the working structure WITHOUT mutating on open: existing structure →
  // legacy seed → a fresh single-bout. The first real edit persists it.
  const structure: RunStructure = value.structure ?? legacyToStructure(value) ?? seedStructure();
  const [activeRole, setActiveRole] = useState<PhaseRole>('main');
  const [pending, setPending] = useState<PendingAction | null>(null);

  const commit = (nextStructure: RunStructure) => {
    onChange(prescriptionFromStructure(nextStructure, value.note ? { note: value.note } : undefined));
    setPending(null);
  };

  const phaseFor = (role: PhaseRole): Phase | undefined => structure.find((p) => p.role === role);

  const setPhaseElements = (role: PhaseRole, elements: Phase['elements']) => {
    commit(sortPhases(structure.map((p) => (p.role === role ? { ...p, elements } : p))));
  };

  const addPhase = (role: PhaseRole) => {
    const elements = role === 'warmup' ? defaultWarmupElements() : defaultCooldownElements();
    commit(sortPhases([...structure, { role, elements }]));
    setActiveRole(role);
  };

  const removePhase = (role: PhaseRole) => {
    commit(structure.filter((p) => p.role !== role));
    setActiveRole('main');
  };

  const applyArchetype = (id: RunArchetypeId) => {
    // Prefills fill the PRINCIPAL phase; warmup/cooldown are preserved.
    commit(sortPhases(structure.map((p) => (p.role === 'main' ? { ...p, elements: prefillElements(id) } : p))));
    setActiveRole('main');
  };

  // Una plantilla NO se suma: sustituye. Con el principal todavía en blanco eso
  // no cuesta nada, así que va directa; si el coach ya ha escrito ahí, primero
  // se pregunta. Un toque nunca puede borrarle un entreno escrito —
  // exactamente lo que le pasó a una sesión real de correr (11-ago).
  const requestArchetype = (id: RunArchetypeId, label: string) => {
    const main = phaseFor('main');
    if (!main || isUntouched('main', main.elements)) return applyArchetype(id);
    setPending({ kind: 'archetype', id, label });
  };

  // Misma regla para la × de una fase: si dentro hay algo escrito, se pregunta.
  const requestRemovePhase = (role: PhaseRole, label: string) => {
    const phase = phaseFor(role);
    if (!phase || isUntouched(role, phase.elements)) return removePhase(role);
    setPending({ kind: 'removePhase', role, label });
  };

  /**
   * The quick line: "6x1000 @4:30 r2'" → typed segments via the SAME grammar the
   * Excel importer uses, then legacyToStructure lifts the parsed prescription into
   * structure elements. They land in the PRINCIPAL: replacing it when it is still
   * the untouched seed, appending otherwise. Returns false when nothing parses —
   * the input shows the hint and keeps the text for correction.
   */
  const applyQuickLine = (text: string): boolean => {
    const lines = parseNotationCell(text);
    const typed = lines.find((l) => l.confidence === 'detected');
    if (!typed) return false;
    const parsed = legacyToStructure(typed.prescription);
    const elements = parsed?.find((p) => p.role === 'main')?.elements ?? parsed?.[0]?.elements;
    if (!elements || elements.length === 0) return false;

    const main = phaseFor('main');
    const seed = seedStructure()[0]!.elements;
    const mainIsUntouchedSeed =
      !!main && JSON.stringify(main.elements) === JSON.stringify(seed);
    const nextElements = mainIsUntouchedSeed || !main ? elements : [...main.elements, ...elements];
    commit(sortPhases(structure.map((p) => (p.role === 'main' ? { ...p, elements: nextElements } : p))));
    setActiveRole('main');
    return true;
  };

  const active = phaseFor(activeRole) ?? phaseFor('main')!;
  const totals = structureTotals(structure);

  return (
    <div className="space-y-3">
      {/* The quick line — write it the way it's written in the gym */}
      <QuickLine onSubmit={applyQuickLine} />

      {/* The block's intensity profile — the two-second sanity check */}
      <IntensityStrip bars={structureBars(structure)} />

      {/* Archetype prefills — one tap fills the Principal */}
      <div className="space-y-1.5">
        <span className="v2-micro">Plantilla del principal</span>
        <div className="flex flex-wrap gap-1.5">
          {RUN_ARCHETYPES.map((a) => (
            <button
              key={a.id}
              type="button"
              title={a.hint}
              onClick={() => requestArchetype(a.id, a.name)}
              className="v2-focus inline-flex items-center gap-1.5 rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-2.5 py-1 text-label font-bold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-accent)] hover:text-[color:var(--v2-accent)]"
            >
              <MIcon name={a.icon} size={14} />
              {a.name}
            </button>
          ))}
        </div>
      </div>

      {/* Lo que se va a perder, dicho antes de perderlo. Se pinta entre los dos
          disparadores (los chips arriba, la × de la fase abajo). */}
      {pending ? (
        <ConfirmBar
          message={
            pending.kind === 'archetype'
              ? `«${pending.label}» sustituye lo que ya has escrito en el principal.`
              : `Se borra el ${pending.label.toLowerCase()} que has escrito.`
          }
          confirmLabel={pending.kind === 'archetype' ? 'Sustituir' : 'Borrar'}
          onConfirm={() =>
            pending.kind === 'archetype'
              ? applyArchetype(pending.id)
              : removePhase(pending.role)
          }
          onCancel={() => setPending(null)}
        />
      ) : null}

      {/* Phase tabs */}
      <div className="flex items-center gap-1 border-b border-[color:var(--v2-border)]">
        {PHASE_TABS.map((tab) => {
          const present = !!phaseFor(tab.role);
          if (!present && tab.optional) {
            return (
              <button
                key={tab.role}
                type="button"
                onClick={() => addPhase(tab.role)}
                className="v2-focus inline-flex items-center gap-1 px-2.5 py-2 text-label font-semibold text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-accent)]"
              >
                <MIcon name="add" size={13} />
                {tab.label}
              </button>
            );
          }
          const isActive = tab.role === activeRole;
          return (
            <button
              key={tab.role}
              type="button"
              onClick={() => setActiveRole(tab.role)}
              className={cn(
                'v2-focus -mb-px inline-flex items-center gap-1.5 border-b-2 px-2.5 py-2 text-xs font-bold transition-colors',
                isActive
                  ? 'border-[color:var(--v2-accent)] text-[color:var(--v2-fg)]'
                  : 'border-transparent text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]',
              )}
            >
              {tab.label}
              {tab.optional ? (
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`Quitar ${tab.label}`}
                  title={`Quitar ${tab.label}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    requestRemovePhase(tab.role, tab.label);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      requestRemovePhase(tab.role, tab.label);
                    }
                  }}
                  className="inline-flex text-[color:var(--v2-faint)] hover:text-[color:var(--v2-danger)]"
                >
                  <MIcon name="close" size={13} />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Active phase editor */}
      <PhaseEditor elements={active.elements} onChange={(elements) => setPhaseElements(active.role, elements)} />

      {/* La sesión suma — the coach's mental math, done for him */}
      <p className="pt-1 text-label font-semibold text-[color:var(--v2-faint)]">
        {totalsSentence(totals)}
      </p>
    </div>
  );
}

// ── Confirmar antes de destruir ───────────────────────────────────────────────

function ConfirmBar({
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="alertdialog"
      aria-label={message}
      className="flex flex-wrap items-center gap-2 rounded-[var(--v2-r-m)] border border-[color:var(--v2-warn)] bg-[color:var(--v2-warn-soft)] px-3 py-2"
    >
      <MIcon name="warning" size={15} className="shrink-0 text-[color:var(--v2-warn)]" />
      <span className="min-w-0 flex-1 text-xs text-[color:var(--v2-fg)]">{message}</span>
      <button
        type="button"
        autoFocus
        onClick={onConfirm}
        className="v2-focus inline-flex h-7 items-center rounded-[var(--v2-r-s)] bg-[color:var(--v2-warn)] px-2.5 text-label font-bold text-[color:var(--v2-bg)]"
      >
        {confirmLabel}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="v2-focus inline-flex h-7 items-center rounded-[var(--v2-r-s)] border border-[color:var(--v2-border-strong)] px-2.5 text-label font-bold text-[color:var(--v2-fg)]"
      >
        Cancelar
      </button>
    </div>
  );
}

// ── The quick line ────────────────────────────────────────────────────────────

function QuickLine({ onSubmit }: { onSubmit: (text: string) => boolean }) {
  const [text, setText] = useState('');
  const [failed, setFailed] = useState(false);

  const go = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const ok = onSubmit(trimmed);
    setFailed(!ok);
    if (ok) setText('');
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface-2)] py-1 pl-3 pr-1">
        <MIcon name="bolt" size={15} className="shrink-0 text-[color:var(--v2-accent)]" />
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (failed) setFailed(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              go();
            }
          }}
          placeholder="Escríbelo como siempre: 6x1000 @4:30 r2'"
          aria-label="Añadir tramos escribiendo la serie"
          className="v2-focus w-full bg-transparent py-1.5 font-mono text-body text-[color:var(--v2-fg)] placeholder:text-[color:var(--v2-faint)] focus:outline-none"
        />
        <button
          type="button"
          onClick={go}
          disabled={!text.trim()}
          className="v2-focus shrink-0 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-3 py-1.5 text-xs font-bold text-[color:var(--v2-accent-fg)] transition-opacity disabled:opacity-30"
        >
          Añadir
        </button>
      </div>
      {failed ? (
        <p role="alert" className="pl-1 text-label text-[color:var(--v2-warn)]">
          No lo he entendido: prueba como <span className="font-mono">6x1000 @4:30 r2&apos;</span>{' '}
          o <span className="font-mono">20&apos; Z2</span>. También puedes montarlo abajo.
        </p>
      ) : null}
    </div>
  );
}

// ── The intensity strip ───────────────────────────────────────────────────────

function IntensityStrip({ bars }: { bars: IntensityBar[] }) {
  if (bars.length < 2) return null; // a single bout has no profile worth drawing
  const totalS = bars.reduce((acc, b) => acc + Math.max(1, b.seconds), 0);
  return (
    <div
      aria-hidden
      className="flex h-14 items-end gap-px overflow-hidden rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-2 pt-2"
    >
      {bars.map((b, i) => (
        <div
          key={i}
          className={cn('rounded-t-[2px]', b.kind === 'recovery' ? 'bg-[color:var(--v2-info)]/25' : 'bg-[color:var(--v2-accent)]')}
          style={{
            width: `${Math.max(1.2, (Math.max(1, b.seconds) / totalS) * 100)}%`,
            height: `${Math.round(b.intensity * 100)}%`,
          }}
        />
      ))}
    </div>
  );
}
