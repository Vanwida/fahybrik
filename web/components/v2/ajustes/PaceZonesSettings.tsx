'use client';

// Zonas de ritmo del coach (`methodology_zones`): seis bandas en segundos
// respecto al ritmo umbral que da un test, una tabla para correr (por km) y otra
// para ergómetro (por 500 m). Cada fila enseña cómo queda con un umbral de
// ejemplo, para que el número se entienda sin hacer cuentas. Se guarda la tabla
// entera al salir de un campo, si es coherente.

import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import type { CoachZone, ZonePaceUnit } from '@fahybrid/shared/domain/methodology';
import { paceZonesProblem, type PaceZoneEdit } from '@fahybrid/shared/domain/methodology/method-editors';
import { Button, Input, SegmentedControl, useToast } from '@/components/v2/ui';
import { SettingsSection } from './SettingsKit';
import { SaveStatus, sendJson, useSaveState } from './autosave';

export interface PaceZoneModel {
  pace_unit: ZonePaceUnit;
  zones: CoachZone[];
  is_standard: boolean;
  standard: CoachZone[];
}

const UNIT = {
  per_km: { label: 'Carrera', suffix: '/km', example: 270 },
  per_500m: { label: 'Ergómetro', suffix: '/500 m', example: 105 },
} as const;

function clock(s: number): string {
  const r = Math.round(s);
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`;
}

type Draft = Array<{ label: string; low: string; high: string }>;

const draftOf = (zones: CoachZone[]): Draft =>
  zones.map((z) => ({ label: z.label, low: String(z.low_offset_s), high: z.high_offset_s == null ? '' : String(z.high_offset_s) }));

function parse(draft: Draft): PaceZoneEdit[] | string {
  const out: PaceZoneEdit[] = [];
  for (const [i, z] of draft.entries()) {
    const low = Number(z.low.replace(',', '.'));
    if (!Number.isInteger(low)) return `Z${i + 1}: segundos enteros.`;
    let high: number | null = null;
    if (i > 0) {
      high = Number(z.high.replace(',', '.'));
      if (z.high.trim() === '' || !Number.isInteger(high)) return `Z${i + 1}: segundos enteros.`;
    }
    out.push({ label: z.label, low_offset_s: low, high_offset_s: high });
  }
  return out;
}

export function PaceZonesSettings({ initial }: { initial: Record<ZonePaceUnit, PaceZoneModel> }) {
  const [unit, setUnit] = useState<ZonePaceUnit>('per_km');
  return (
    <SettingsSection
      title="Zonas de ritmo"
      action={
        <SegmentedControl
          size="sm"
          aria-label="Modalidad"
          items={(['per_km', 'per_500m'] as const).map((u) => ({ value: u, label: UNIT[u].label }))}
          value={unit}
          onValueChange={setUnit}
        />
      }
    >
      <UnitTable key={unit} initial={initial[unit]} />
    </SettingsSection>
  );
}

function UnitTable({ initial }: { initial: PaceZoneModel }) {
  const toast = useToast();
  const [model, setModel] = useState(initial);
  const [draft, setDraft] = useState<Draft>(() => draftOf(initial.zones));
  const [problem, setProblem] = useState<string | null>(null);
  const { state, error, run } = useSaveState();
  const u = UNIT[model.pace_unit];

  const put = (zones: PaceZoneEdit[] | null) =>
    run(async () => {
      const res = await sendJson<PaceZoneModel>('/api/coach/pace-zones', 'PUT', { pace_unit: model.pace_unit, zones });
      if (!res.ok) return res;
      setModel(res.data);
      setDraft(draftOf(res.data.zones));
      return { ok: true };
    });

  const commit = () => {
    const parsed = parse(draft);
    if (typeof parsed === 'string') return setProblem(parsed);
    const p = paceZonesProblem(parsed);
    setProblem(p);
    if (p) return;
    const same = parsed.every(
      (z, i) =>
        z.label.trim() === model.zones[i]!.label &&
        z.low_offset_s === model.zones[i]!.low_offset_s &&
        z.high_offset_s === model.zones[i]!.high_offset_s,
    );
    if (!same) void put(parsed);
  };

  const restore = async () => {
    const previous = parse(draftOf(model.zones));
    const ok = await put(null);
    if (ok) {
      setProblem(null);
      toast.toast({
        title: `Zonas de ${u.label.toLowerCase()} estándar`,
        tone: 'ok',
        undo: typeof previous === 'string' ? undefined : async () => void (await put(previous)),
      });
    }
  };

  const set = (i: number, k: 'label' | 'low' | 'high', v: string) =>
    setDraft((d) => d.map((row, j) => (j === i ? { ...row, [k]: v } : row)));

  const keys = {
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') e.currentTarget.blur();
    },
  };

  return (
    <>
      <div className="flex flex-col items-start gap-2 px-4 pt-3.5 pb-1 sm:flex-row sm:justify-between">
        <p className="min-w-0 flex-1 t-body-sm text-v2-muted">
          Segundos respecto al ritmo umbral del test (negativo = más rápido); junto a cada zona, cómo queda con un umbral
          de {clock(u.example)}
          {u.suffix}. Vale para los tests nuevos: las zonas ya calculadas de cada atleta no cambian.
        </p>
        <span className="flex items-center gap-2">
          <SaveStatus state={problem ? 'error' : state} error={problem ?? error} />
          {!model.is_standard ? (
            <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => void restore()}>
              Usar las estándar
            </Button>
          ) : null}
        </span>
      </div>
      <ol aria-label={`Zonas de ${u.label.toLowerCase()}`}>
        {draft.map((row, i) => {
          const std = model.standard[i]!;
          const low = Number(row.low);
          const high = row.high.trim() === '' ? null : Number(row.high);
          const example =
            Number.isFinite(low) && (high == null || Number.isFinite(high))
              ? high == null
                ? `${clock(u.example + low)} o más lento`
                : `${clock(u.example + low)}–${clock(u.example + high)}`
              : '—';
          const isThreshold = std.role === 'threshold';
          return (
            <li key={std.code} className="flex flex-col gap-2 border-t border-v2-border px-4 py-3 first:border-t-0 sm:flex-row sm:items-center sm:gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="w-7 shrink-0 t-body font-semibold text-v2-fg t-tnum">{std.code}</span>
                <Input
                  aria-label={`Nombre de ${std.code}`}
                  value={row.label}
                  maxLength={40}
                  onChange={(e) => set(i, 'label', e.target.value)}
                  {...keys}
                  className="min-w-0 flex-1"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 pl-9 sm:pl-0">
                <Input
                  aria-label={`${std.code}: borde rápido (s)`}
                  inputMode="numeric"
                  value={row.low}
                  disabled={isThreshold}
                  onChange={(e) => set(i, 'low', e.target.value)}
                  {...keys}
                  className="w-16 text-right t-tnum"
                />
                <span className="t-body-sm text-v2-muted">a</span>
                {i === 0 ? (
                  <span className="w-16 t-body-sm text-v2-muted">sin techo</span>
                ) : (
                  <Input
                    aria-label={`${std.code}: borde lento (s)`}
                    inputMode="numeric"
                    value={row.high}
                    onChange={(e) => set(i, 'high', e.target.value)}
                    {...keys}
                    className="w-16 text-right t-tnum"
                  />
                )}
                <span className="w-3 t-body-sm text-v2-muted">{i === 0 ? '' : 's'}</span>
                <span className="w-28 whitespace-nowrap t-meta text-v2-faint t-tnum">{example}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}
