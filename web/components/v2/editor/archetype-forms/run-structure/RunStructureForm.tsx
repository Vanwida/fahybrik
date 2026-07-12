'use client';

// RunStructureForm — the STRUCTURED running-workout builder (#61). Evolves the old
// IntervalsForm from "N × X @ ritmo + descanso" into a full sequence: phases
// (Calentamiento · Principal · Vuelta), an ordered work/recovery sequence with
// nested "Repetir ×N", explicit pace zones / pace bands / RPE bands / cadence /
// incline, and one-tap archetype prefills (Progresivo · Fartlek · Cuestas ·
// Pirámide). Editing writes both the rich `structure` and the legacy flatten (via
// prescriptionFromStructure) so the installed iOS app keeps decoding.

import { useState } from 'react';
import type { Phase, PhaseRole, Prescription, RunStructure } from '@fahybrid/shared/domain/prescription';
import { legacyToStructure, prescriptionFromStructure } from '@fahybrid/shared/domain/prescription';
import { cn } from '@/lib/utils';
import { MIcon } from '@/components/ui/MIcon';
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
// picks an archetype or builds the sequence by hand).
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

  const commit = (nextStructure: RunStructure) => {
    onChange(prescriptionFromStructure(nextStructure, value.note ? { note: value.note } : undefined));
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

  const active = phaseFor(activeRole) ?? phaseFor('main')!;

  return (
    <div className="space-y-3">
      {/* Archetype prefills — one tap fills the Principal */}
      <div className="space-y-1.5">
        <span className="v2-micro">Plantilla del principal</span>
        <div className="flex flex-wrap gap-1.5">
          {RUN_ARCHETYPES.map((a) => (
            <button
              key={a.id}
              type="button"
              title={a.hint}
              onClick={() => applyArchetype(a.id)}
              className="v2-focus inline-flex items-center gap-1.5 rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-2.5 py-1 text-[11.5px] font-bold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-accent)] hover:text-[color:var(--v2-accent)]"
            >
              <MIcon name={a.icon} size={14} />
              {a.name}
            </button>
          ))}
        </div>
      </div>

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
                className="v2-focus inline-flex items-center gap-1 px-2.5 py-2 text-[11.5px] font-semibold text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-accent)]"
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
                    removePhase(tab.role);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      removePhase(tab.role);
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
    </div>
  );
}
