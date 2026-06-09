'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Block } from '@fahybrid/shared/schema/blocks';
import type { MethodologyGroup } from '@fahybrid/shared/schema/methodology-groups';
import type { BlockUseModifiers } from '@fahybrid/shared/schema/program-templates';
import { templateFormatForBlock } from '@/lib/dashboard/programming/block-to-part';
import { formatLabel } from '@/lib/dashboard/constants/week-day-part-presets';
import { atrPhaseLabel } from '@/lib/dashboard/constants/atr-phases';
import { SearchInput } from '@/components/dashboard/ui/SearchInput';
import { cn } from '@/lib/utils';

interface BlockLibraryPickerProps {
  open: boolean;
  /** Bloques ya cargados por el studio (biblioteca completa de Pablo). */
  blocks: Block[];
  groups: MethodologyGroup[];
  loading: boolean;
  /** Fase ATR del microciclo/día — resalta los bloques con ese atr_block_hint. */
  phaseHint: string | null;
  onClose: () => void;
  onAdd: (block: Block, modifiers: BlockUseModifiers) => void;
}

// Selector de bloques de la Biblioteca de Bloques (0037). El coach navega los
// ~97 bloques de Pablo agrupados por los 10 methodology_groups, filtra por
// grupo, ve título + prescripción verbatim + chips, ajusta modificadores de uso
// (intensidad / nivel / duración / rondas) y lo añade al día. No muta la
// biblioteca: los modificadores viajan con el uso.

const ALL_GROUPS = 'all';

export function BlockLibraryPicker({
  open,
  blocks,
  groups,
  loading,
  phaseHint,
  onClose,
  onAdd,
}: BlockLibraryPickerProps) {
  const [groupFilter, setGroupFilter] = useState<string>(ALL_GROUPS);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Block | null>(null);
  const [mods, setMods] = useState<BlockUseModifiers>({});
  const dialogRef = useRef<HTMLDivElement>(null);

  // Reset al abrir (transición closed→open) con el patrón de "ajustar estado en
  // render": comparamos el `open` previo en state y reseteamos síncronamente
  // durante el render. Evita el setState-en-effect (cascada de renders).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setGroupFilter(ALL_GROUPS);
      setSearch('');
      setSelected(null);
      setMods({});
    }
  }

  // Cerrar con Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const groupName = useMemo(() => {
    const map = new Map<number, string>();
    for (const g of groups) map.set(g.id, g.name_es);
    return map;
  }, [groups]);

  const phaseUpper = phaseHint ? phaseHint.toUpperCase() : null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const groupId = groupFilter === ALL_GROUPS ? null : Number(groupFilter);
    const rows = blocks.filter((b) => {
      if (groupId != null && b.methodology_group_id !== groupId) return false;
      if (!q) return true;
      return (
        b.title.toLowerCase().includes(q) ||
        b.description.toLowerCase().includes(q)
      );
    });
    // Prioriza visualmente los bloques que casan con la fase ATR del microciclo.
    if (!phaseUpper) return rows;
    return [...rows].sort((a, b) => {
      const am = a.atr_block_hint === phaseUpper ? 0 : 1;
      const bm = b.atr_block_hint === phaseUpper ? 0 : 1;
      return am - bm;
    });
  }, [blocks, groupFilter, search, phaseUpper]);

  if (!open) return null;

  const setMod = (patch: Partial<BlockUseModifiers>) =>
    setMods((prev) => {
      const next = { ...prev, ...patch };
      // limpia claves vacías para no persistir 0/'' como modificador.
      (Object.keys(next) as (keyof BlockUseModifiers)[]).forEach((k) => {
        const v = next[k];
        if (v == null || v === '' || (typeof v === 'number' && Number.isNaN(v))) delete next[k];
      });
      return next;
    });

  const handleConfirm = () => {
    if (!selected) return;
    onAdd(selected, mods);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Insertar bloque de la biblioteca"
        className="flex h-[80vh] w-full max-w-4xl flex-col overflow-hidden rounded-[var(--r-l)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] shadow-2xl"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[color:var(--border-subtle)] px-5 py-3">
          <div className="min-w-0">
            <h2 className="font-display text-base font-bold text-[color:var(--fg)]">
              Biblioteca de bloques
            </h2>
            <p className="text-[11px] text-[color:var(--text-muted)]">
              Prescripciones de Pablo · ajusta los modificadores antes de añadir
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="focus-ring shrink-0 rounded-[var(--r-sm)] p-1.5 text-[color:var(--text-muted)] hover:bg-[color:var(--surface-elevated)] hover:text-[color:var(--fg)]"
          >
            ✕
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Lista de bloques */}
          <div className="flex min-w-0 flex-1 flex-col border-r border-[color:var(--border-subtle)]">
            <div className="shrink-0 space-y-2 border-b border-[color:var(--border-subtle)] p-3">
              <SearchInput value={search} onChange={setSearch} placeholder="Buscar bloque…" />
              <div className="flex flex-wrap gap-1">
                <GroupChip
                  label="Todos"
                  active={groupFilter === ALL_GROUPS}
                  onClick={() => setGroupFilter(ALL_GROUPS)}
                />
                {groups.map((g) => (
                  <GroupChip
                    key={g.id}
                    label={g.name_es}
                    active={groupFilter === String(g.id)}
                    onClick={() => setGroupFilter(String(g.id))}
                  />
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
              {loading ? (
                <p className="text-sm text-[color:var(--text-muted)]">Cargando bloques…</p>
              ) : filtered.length === 0 ? (
                <p className="text-sm text-[color:var(--text-muted)]">Sin bloques.</p>
              ) : (
                filtered.map((block) => (
                  <BlockRow
                    key={block.id}
                    block={block}
                    groupLabel={groupName.get(block.methodology_group_id) ?? `Grupo ${block.methodology_group_id}`}
                    matchesPhase={phaseUpper != null && block.atr_block_hint === phaseUpper}
                    selected={selected?.id === block.id}
                    onSelect={() => {
                      setSelected(block);
                      setMods({});
                    }}
                  />
                ))
              )}
            </div>
          </div>

          {/* Panel de modificadores / detalle */}
          <div className="flex w-80 shrink-0 flex-col bg-[color:var(--surface-container-lowest)]">
            {selected ? (
              <>
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)]">
                    {groupName.get(selected.methodology_group_id) ?? `Grupo ${selected.methodology_group_id}`}
                  </p>
                  <h3 className="mt-1 font-heading text-[color:var(--fg)]">{selected.title}</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[color:var(--text-muted)]">
                    {selected.description}
                  </p>

                  <div className="mt-5 space-y-4">
                    <FieldLabel>Modificadores (por uso)</FieldLabel>

                    <ModField label="Intensidad (%)">
                      <NumberInput
                        value={mods.intensity_pct ?? null}
                        onChange={(v) => setMod({ intensity_pct: v ?? undefined })}
                        min={0}
                        max={200}
                        suffix="%"
                        placeholder="—"
                      />
                    </ModField>

                    <ModField label="Nivel">
                      <input
                        type="text"
                        value={mods.level ?? ''}
                        onChange={(e) => setMod({ level: e.target.value || undefined })}
                        maxLength={40}
                        placeholder="p.ej. RX / escalado"
                        className="focus-ring w-full rounded-[var(--r-sm)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-lowest)] px-3 py-2 text-sm text-[color:var(--fg)] outline-none placeholder:text-[color:var(--text-muted)] focus:border-[color:var(--accent)]"
                      />
                    </ModField>

                    <div className="grid grid-cols-2 gap-3">
                      <ModField label="Duración (min)">
                        <NumberInput
                          value={mods.duration_min ?? null}
                          onChange={(v) => setMod({ duration_min: v ?? undefined })}
                          min={1}
                          max={600}
                          placeholder="—"
                        />
                      </ModField>
                      <ModField label="Rondas">
                        <NumberInput
                          value={mods.rounds ?? null}
                          onChange={(v) => setMod({ rounds: v ?? undefined })}
                          min={1}
                          max={60}
                          placeholder="—"
                        />
                      </ModField>
                    </div>
                  </div>
                </div>

                <div className="shrink-0 border-t border-[color:var(--border-subtle)] p-4">
                  <button
                    type="button"
                    onClick={handleConfirm}
                    className="focus-ring w-full rounded-[var(--r-sm)] bg-[color:var(--accent)] px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-[color:var(--accent-on)] hover:brightness-110"
                  >
                    Añadir al día
                  </button>
                </div>
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
                <span
                  aria-hidden
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--border-subtle)] text-lg text-[color:var(--text-muted)]"
                >
                  ◯
                </span>
                <p className="font-display text-sm font-bold text-[color:var(--fg)]">
                  Selecciona un bloque
                </p>
                <p className="text-xs text-[color:var(--text-muted)]">
                  Elige una prescripción de la lista para revisarla y ajustarla.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function GroupChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'focus-ring rounded-[var(--r-pill)] border px-2.5 py-1 text-[11px] font-semibold transition-colors',
        active
          ? 'border-[color:var(--accent)] bg-[color:var(--accent)] text-[color:var(--accent-on)]'
          : 'border-[color:var(--border-subtle)] bg-transparent text-[color:var(--text-muted)] hover:border-[color:var(--accent)]/60 hover:text-[color:var(--fg)]',
      )}
    >
      {label}
    </button>
  );
}

function BlockRow({
  block,
  groupLabel,
  matchesPhase,
  selected,
  onSelect,
}: {
  block: Block;
  groupLabel: string;
  matchesPhase: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const fmt = templateFormatForBlock(block);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'focus-ring flex w-full flex-col gap-1.5 rounded-[var(--r-l)] border p-3 text-left transition-colors',
        selected
          ? 'border-[color:var(--accent)] bg-[color:var(--surface-container-low)]'
          : 'border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] hover:border-[color:var(--accent)]/60',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 font-display text-sm font-bold text-[color:var(--fg)]">
          {block.title}
        </span>
        {matchesPhase && block.atr_block_hint ? (
          <span className="shrink-0 rounded-[var(--r-pill)] border border-[color:var(--accent)]/40 bg-[color:var(--accent)]/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[color:var(--accent)]">
            {atrPhaseLabel(block.atr_block_hint)}
          </span>
        ) : null}
      </div>
      <p className="line-clamp-2 text-[12px] leading-snug text-[color:var(--text-muted)]">
        {block.description}
      </p>
      <div className="flex flex-wrap items-center gap-1">
        <Chip>{groupLabel}</Chip>
        <Chip muted>{formatLabel(fmt)}</Chip>
        {!matchesPhase && block.atr_block_hint ? (
          <Chip muted>{atrPhaseLabel(block.atr_block_hint)}</Chip>
        ) : null}
      </div>
    </button>
  );
}

function Chip({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span
      className={cn(
        'rounded bg-[color:var(--surface-container-high)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        muted ? 'text-[color:var(--text-muted)]' : 'text-[color:var(--fg)]',
      )}
    >
      {children}
    </span>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)]">
      {children}
    </span>
  );
}

function ModField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)]">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  suffix,
  placeholder,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  suffix?: string;
  placeholder?: string;
}) {
  return (
    <div className="flex items-center overflow-hidden rounded-[var(--r-sm)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-lowest)] focus-within:border-[color:var(--accent)]">
      <input
        type="number"
        inputMode="numeric"
        value={value ?? ''}
        min={min}
        max={max}
        placeholder={placeholder}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') return onChange(null);
          const n = Number(raw);
          if (!Number.isFinite(n)) return;
          onChange(n);
        }}
        className="w-full bg-transparent px-3 py-2 text-sm tabular-nums text-[color:var(--fg)] outline-none placeholder:text-[color:var(--text-muted)]"
      />
      {suffix ? (
        <span className="pr-3 text-xs text-[color:var(--text-muted)]">{suffix}</span>
      ) : null}
    </div>
  );
}
