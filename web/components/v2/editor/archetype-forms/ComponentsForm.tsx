'use client';

// ComponentsForm — the COMPONENTS base pattern (WOD/Metcon · Circuito/Core ·
// Fuerza-potencia/EMOM routed here; Simulación HYROX has its own dedicated
// form). A conditioning block is NOT one nested prescription: per the domain
// model a "compromised" block is MULTIPLE block items, each its OWN exercise +
// dosis (measure ± target) sharing one block. So this form edits the
// EditorBlock's ITEM LIST, branching on whether the block IS Circuito
// (`format === 'circuit'`, docs/DECISIONS.md 2026-08-07):
//   - Circuito (`isCircuit`) — CircuitConfigFields (component-stations.tsx)
//     edits `EditorBlock.circuit` DIRECTLY: rondas + pacing (por_tarea sin
//     reloj | por_reloj con work_seconds) + los dos descansos, a nivel de
//     BLOQUE. Stations carry ONLY their own exercise + measure/target — no
//     Formato picker, nothing copied onto items.
//   - Every other format (WOD/EMOM/Tabata/…) — Formato — the block-level
//     scheme drawn from the shared metcon catalog (For Time | AMRAP | EMOM |
//     Tabata | Death By | Series | Chipper | Escalera | Rondas), applied to
//     every component via `applyHead`: Rondas (Stepper) / Time cap / Ventana /
//     Descanso (chips con el «—» honesto) stored on EVERY item's prescription
//     so the persisted shape stays coherent. UNCHANGED — this convention is
//     only wrong for the multi-station Circuito case that `circuit` replaces.
//   - Estaciones — filas limpias en orden (component-stations): asa, movimiento,
//     medida en mono y objetivo. Shared by both branches.
// Edits the same EditorItem[] (+ `circuit` for Circuito) the serializer
// persists; zero free text.

import type {
  FormatParam,
  Prescription,
  PrescriptionScheme,
} from '@fahybrid/shared/domain/prescription';
import { formatMeta, formatsByFamily } from '@fahybrid/shared/domain/prescription';
import type { CircuitConfig } from '@fahybrid/shared/schema/program-templates';
import type { EditorBlock, EditorItem } from '@/lib/dashboard/v2/editor-types';
import { MIcon } from '@/components/ui/MIcon';
import { CircuitConfigFields } from './circuit-config-fields';
import { ComponentStationRow, FormatParamField } from './component-stations';
import { Field, InlineToggle } from './form-controls';

// The conditioning formats this WOD/components form offers: the full metcon
// family (minus the dedicated HYROX-sim template, which has its own archetype +
// ordered seed) plus the endurance interval format. The SET is DERIVED from the
// shared catalog (formatsByFamily) so a metcon format added there surfaces here
// automatically — there is no parallel list of format values.
type Format = Extract<
  PrescriptionScheme,
  | 'for_time'
  | 'amrap'
  | 'emom'
  | 'tabata'
  | 'death_by'
  | 'intervals'
  | 'chipper'
  | 'ladder'
  | 'rounds'
>;

const OFFERED_FORMATS: Format[] = [
  ...formatsByFamily('metcon').filter((f) => f !== 'hyrox_sim'),
  'intervals',
] as Format[];

// Spanish picker labels. The catalog `label` is canonical/English; every surface
// localizes its own copy. Keyed by the offered formats only.
const FORMAT_LABEL_ES: Record<Format, string> = {
  for_time: 'For Time',
  amrap: 'AMRAP',
  emom: 'EMOM',
  tabata: 'Tabata',
  death_by: 'Death By',
  intervals: 'Series',
  chipper: 'Chipper',
  ladder: 'Escalera',
  rounds: 'Rondas',
};

const FORMAT_OPTIONS: { value: Format; label: string }[] = OFFERED_FORMATS.map((f) => ({
  value: f,
  label: FORMAT_LABEL_ES[f],
}));

// Per-format structural defaults. The existing four (for_time/amrap/emom/rounds)
// keep their exact prior values; the rest seed the catalog's new formats.
const DEFAULT_CAP_S = 1080; // 18' — For Time / Chipper / Escalera time cap
const DEFAULT_AMRAP_S = 720; // 12' — AMRAP total duration
const DEFAULT_WORK_S = 60; // EMOM minute window
const DEFAULT_TABATA_WORK_S = 20; // classic Tabata work
const DEFAULT_TABATA_REST_S = 10; // classic Tabata rest
const DEFAULT_TABATA_ROUNDS = 8; // classic Tabata rounds
const DEFAULT_DEATH_BY_WORK_S = 60; // Death By minute window
const DEFAULT_DEATH_BY_START = 1; // Death By round-1 reps
const DEFAULT_DEATH_BY_INCREMENT = 1; // Death By reps added per round
const DEFAULT_INTERVAL_ROUNDS = 4;
const DEFAULT_INTERVAL_WORK_S = 60;
const DEFAULT_INTERVAL_REST_S = 60;

// Every structural scalar a format may carry — the universe cleanScheme strips
// from, keeping only the format's catalog params.
const STRUCTURAL_PARAMS: readonly FormatParam[] = [
  'rounds',
  'work_s',
  'rest_s',
  'total_s',
  'start',
  'increment',
];

function blockFormat(block: EditorBlock): Format {
  const s = block.items[0]?.prescription.scheme;
  if (s && (OFFERED_FORMATS as string[]).includes(s)) return s as Format;
  return 'for_time';
}

// The block-level structural fields (rounds / cap / work window) read off the
// first item (every item carries the same — kept coherent by `applyHead`).
function blockHead(block: EditorBlock): Prescription | undefined {
  return block.items[0]?.prescription;
}

export function ComponentsForm({
  block,
  onChange,
}: {
  block: EditorBlock;
  onChange: (next: EditorBlock) => void;
}) {
  const format = blockFormat(block);
  const head = blockHead(block);
  // Circuito (docs/DECISIONS.md, 2026-08-07) is a type of its own: no Formato
  // picker, no applyHead — its structural fields live in `block.circuit`,
  // edited directly by CircuitConfigFields below. `format` is the STORED,
  // authoritative classifier (set once at archetype creation and never
  // touched by the inner Formato toggle, which only exists for the other
  // branch), so it survives reload the same way `archetypeForFormat` does.
  const isCircuit = block.format === 'circuit';

  const setCircuit = (next: CircuitConfig) => onChange({ ...block, circuit: next });

  // Apply a block-level field (scheme / rounds / total_s / work_s / rest_s) to
  // EVERY item's prescription so the persisted shape stays coherent across the
  // block (all components share the format + cap). Only the non-Circuito
  // branch calls this — Circuito's structural fields never touch item
  // prescriptions (that duplication was the real bug this form replaces).
  const applyHead = (p: Partial<Prescription>) => {
    onChange({
      ...block,
      items: block.items.map((it) => ({
        ...it,
        prescription: cleanScheme({ ...it.prescription, ...p }),
      })),
    });
  };

  const setFormat = (next: Format) => {
    if (next === format) return;
    // Reset EVERY structural field, then seed the new format's natural defaults.
    const base: Partial<Prescription> = {
      scheme: next,
      rounds: undefined,
      total_s: undefined,
      work_s: undefined,
      rest_s: undefined,
      start: undefined,
      increment: undefined,
    };
    switch (next) {
      case 'for_time':
        base.rounds = head?.rounds ?? 3;
        base.total_s = head?.total_s ?? DEFAULT_CAP_S;
        break;
      case 'amrap':
        base.total_s = head?.total_s ?? DEFAULT_AMRAP_S;
        break;
      case 'emom':
        base.rounds = head?.rounds ?? 10;
        base.work_s = head?.work_s ?? DEFAULT_WORK_S;
        break;
      case 'rounds':
        base.rounds = head?.rounds ?? 3;
        base.rest_s = head?.rest_s ?? 60;
        break;
      case 'tabata':
        base.work_s = head?.work_s ?? DEFAULT_TABATA_WORK_S;
        base.rest_s = head?.rest_s ?? DEFAULT_TABATA_REST_S;
        base.rounds = head?.rounds ?? DEFAULT_TABATA_ROUNDS;
        break;
      case 'death_by':
        base.work_s = head?.work_s ?? DEFAULT_DEATH_BY_WORK_S;
        base.start = head?.start ?? DEFAULT_DEATH_BY_START;
        base.increment = head?.increment ?? DEFAULT_DEATH_BY_INCREMENT;
        break;
      case 'intervals':
        base.rounds = head?.rounds ?? DEFAULT_INTERVAL_ROUNDS;
        base.work_s = head?.work_s ?? DEFAULT_INTERVAL_WORK_S;
        base.rest_s = head?.rest_s ?? DEFAULT_INTERVAL_REST_S;
        break;
      case 'chipper':
      case 'ladder':
        base.total_s = head?.total_s ?? DEFAULT_CAP_S;
        break;
    }
    applyHead(base);
  };

  const updateItem = (uid: string, patch: Partial<EditorItem>) =>
    onChange({
      ...block,
      items: block.items.map((it) => (it.uid === uid ? { ...it, ...patch } : it)),
    });

  const addComponent = () => {
    // Circuito: a new station carries ONLY its scheme + modality — never the
    // head's rounds/work_s/rest_s/total_s. Spreading `head` here (like the
    // non-Circuito branch does) is exactly how the old `applyHead` convention
    // re-leaked block-level fields onto stations one at a time; the block's
    // rounds/pacing/descansos live solely in `block.circuit` now.
    const seed = isCircuit
      ? { scheme: head?.scheme ?? ('rounds' as const), modality: head?.modality ?? 'functional' }
      : { ...(head ?? { scheme: format }), modality: head?.modality ?? 'functional' };
    const next: EditorItem = {
      uid: `comp-${Date.now()}`,
      exercise_id: null,
      exercise_name: '',
      prescription: cleanScheme({
        ...seed,
        sets: [{ measure: { kind: 'reps', value: 10 } }],
      }),
    };
    onChange({ ...block, items: [...block.items, next] });
  };

  const removeComponent = (uid: string) =>
    onChange({ ...block, items: block.items.filter((it) => it.uid !== uid) });

  const moveComponent = (uid: string, dir: -1 | 1) => {
    const idx = block.items.findIndex((it) => it.uid === uid);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= block.items.length) return;
    const items = block.items.slice();
    [items[idx], items[swap]] = [items[swap]!, items[idx]!];
    onChange({ ...block, items });
  };

  return (
    <div className="space-y-4">
      {isCircuit ? (
        // Circuito: rounds/pacing/descansos a nivel de bloque — sin Formato
        // picker (Circuito no es una de las 9 variantes del catálogo metcon).
        <CircuitConfigFields config={block.circuit} onChange={setCircuit} />
      ) : (
        /* Formato + per-format structural fields (driven by the catalog params) */
        <div className="space-y-3">
          <Field label="Formato">
            <InlineToggle
              ariaLabel="Formato del bloque"
              value={format}
              options={FORMAT_OPTIONS}
              onChange={setFormat}
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(formatMeta(format)?.params ?? []).map((param) => (
              <FormatParamField
                key={param}
                param={param}
                format={format}
                head={head}
                onPatch={applyHead}
              />
            ))}
          </div>
        </div>
      )}

      {/* Estaciones, en el orden en que se hacen */}
      <div className="space-y-1.5">
        <span className="v2-micro">
          Estaciones · en orden{' '}
          {isCircuit || format === 'amrap' || format === 'rounds' ? '(cada ronda)' : ''}
        </span>
        <div className="space-y-2">
          {block.items.map((it, i) => (
            <ComponentStationRow
              key={it.uid}
              index={i}
              item={it}
              count={block.items.length}
              onChange={(patch) => updateItem(it.uid, patch)}
              onRemove={() => removeComponent(it.uid)}
              onMove={(dir) => moveComponent(it.uid, dir)}
            />
          ))}
          {block.items.length === 0 ? (
            <p className="px-1 py-2 text-xs text-[color:var(--v2-muted)]">
              Sin estaciones: añade el primer movimiento.
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={addComponent}
          className="v2-focus inline-flex items-center gap-1 rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-2.5 py-1 text-xs font-semibold text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-border-strong)]"
        >
          <MIcon name="add" size={13} />
          Añadir estación
        </button>
      </div>
    </div>
  );
}

// Strip the structural fields a scheme doesn't use, so the persisted prescription
// stays clean (an AMRAP carries total_s, not rounds; EMOM carries work_s, etc.).
// The keep-set is the format's catalog `params`; everything else (including Death
// By's start/increment when not death_by) is dropped — one rule, every format.
function cleanScheme(p: Prescription): Prescription {
  const keep = new Set<FormatParam>(formatMeta(p.scheme)?.params ?? []);
  const out: Prescription = { ...p };
  for (const param of STRUCTURAL_PARAMS) {
    if (!keep.has(param)) delete out[param];
  }
  // `rounds_max` (fase 2, ago-2026) es un companion de `rounds` — no es un
  // FormatParam propio del catálogo, así que no lo cubre el bucle de arriba.
  // Sin este borrado, cambiar de un formato con rango activo a uno sin
  // `rounds` (p.ej. rounds→amrap) dejaba un `rounds_max` huérfano sin su
  // `rounds` — hallazgo del agente de fase 2 stream A, no reproducible antes
  // porque no existía UI para escribir `rounds_max`.
  if (out.rounds === undefined) delete out.rounds_max;
  return out;
}
