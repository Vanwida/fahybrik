'use client';

// Zonas de FC del coach: dónde corta cada banda (en % de la FC de umbral del
// atleta) y el reparto fácil / medio / duro que persigue (`coach_hr_method`).
// Se guarda el conjunto al salir de un campo, solo si es coherente (sin solapes,
// un reparto que suma 100); si no, la sección dice qué corregir y no guarda.

import { useId, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import type { CoachHrMethod } from '@fahybrid/shared/domain/coach/hr-method';
import { hrMethodProblem } from '@fahybrid/shared/domain/methodology/method-editors';
import { Button, Input, Select, useToast } from '@/components/v2/ui';
import { SettingRow, SettingsSection } from './SettingsKit';
import { SaveStatus, sendJson, useSaveState } from './autosave';

type Setting = { method: CoachHrMethod; is_custom: boolean; defaults: CoachHrMethod };
type FracKey = Extract<keyof CoachHrMethod, `z${number}_${'lo' | 'hi'}_frac`>;
type PctKey = 'polarization_low_pct' | 'polarization_mid_pct' | 'polarization_high_pct';

const ZONES: Array<{ zone: number; lo: FracKey | null; hi: FracKey }> = [
  { zone: 1, lo: null, hi: 'z1_hi_frac' },
  { zone: 2, lo: 'z2_lo_frac', hi: 'z2_hi_frac' },
  { zone: 3, lo: 'z3_lo_frac', hi: 'z3_hi_frac' },
  { zone: 4, lo: 'z4_lo_frac', hi: 'z4_hi_frac' },
  { zone: 5, lo: 'z5_lo_frac', hi: 'z5_hi_frac' },
];

const toPct = (f: number) => String(Math.round(f * 1000) / 10).replace('.', ',');

function draftOf(m: CoachHrMethod): Record<string, string> {
  const out: Record<string, string> = {};
  for (const z of ZONES) {
    if (z.lo) out[z.lo] = toPct(m[z.lo]);
    out[z.hi] = toPct(m[z.hi]);
  }
  out.polarization_low_pct = String(m.polarization_low_pct);
  out.polarization_mid_pct = String(m.polarization_mid_pct);
  out.polarization_high_pct = String(m.polarization_high_pct);
  return out;
}

export function HrMethodSettings({ initial }: { initial: Setting }) {
  const id = useId();
  const toast = useToast();
  const [setting, setSetting] = useState(initial);
  const [draft, setDraft] = useState(() => draftOf(initial.method));
  const [problem, setProblem] = useState<string | null>(null);
  const { state, error, run } = useSaveState();
  const m = setting.method;
  const d = setting.defaults;

  const put = (method: CoachHrMethod | null) =>
    run(async () => {
      const res = await sendJson<Setting>('/api/coach/hr-method', 'PUT', { method });
      if (!res.ok) return res;
      setSetting(res.data);
      setDraft(draftOf(res.data.method));
      return { ok: true };
    });

  /** Lee el borrador; si algo no es número o el conjunto no cuadra, lo dice y no guarda. */
  const commit = (next: CoachHrMethod | null = null) => {
    const candidate: CoachHrMethod = next ?? { ...m };
    if (!next) {
      for (const z of ZONES) {
        for (const k of [z.lo, z.hi]) {
          if (!k) continue;
          const n = Number(draft[k]!.replace(',', '.'));
          if (!Number.isFinite(n) || n <= 0) return setProblem(`Z${z.zone}: escribe un porcentaje.`);
          candidate[k] = Math.round(n * 10) / 1000;
        }
      }
      for (const k of ['polarization_low_pct', 'polarization_mid_pct', 'polarization_high_pct'] as PctKey[]) {
        const n = Number(draft[k]);
        if (!Number.isInteger(n) || n < 0 || n > 100) return setProblem('El reparto va en porcentajes enteros.');
        candidate[k] = n;
      }
    }
    const p = hrMethodProblem(candidate);
    setProblem(p);
    if (p) return;
    if (JSON.stringify(candidate) === JSON.stringify(m)) return;
    void put(candidate);
  };

  const field = (k: string, label: string, width = 'w-16') => (
    <Input
      aria-label={label}
      inputMode="decimal"
      value={draft[k] ?? ''}
      invalid={problem != null}
      onChange={(e) => setDraft((prev) => ({ ...prev, [k]: e.target.value }))}
      onBlur={() => commit()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
      }}
      className={`${width} text-right t-tnum`}
    />
  );

  const restore = async () => {
    const previous = m;
    const ok = await put(null);
    if (ok) {
      setProblem(null);
      toast.toast({ title: 'Zonas de FC por defecto', tone: 'ok', undo: async () => void (await put(previous)) });
    }
  };

  const zoneOptions = (min: number, max: number) =>
    Array.from({ length: max - min + 1 }, (_, i) => ({ value: String(min + i), label: `Hasta Z${min + i}` }));

  return (
    <SettingsSection
      title="Zonas de frecuencia cardiaca"
      action={
        <span className="flex items-center gap-2">
          <SaveStatus state={problem ? 'error' : state} error={problem ?? error} />
          {setting.is_custom ? (
            <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => void restore()}>
              Restaurar
            </Button>
          ) : null}
        </span>
      }
    >
      <div className="flex flex-col gap-1 px-4 pt-3.5 pb-1">
        <span className="t-body font-medium text-v2-fg">Dónde corta cada zona</span>
        <p className="t-body-sm text-v2-muted">En % de la FC de umbral de cada atleta.</p>
      </div>
      {ZONES.map((z) => {
        const def =
          z.lo == null ? `hasta ${toPct(d[z.hi])}` : `${toPct(d[z.lo])}–${toPct(d[z.hi])}`;
        return (
          <SettingRow
            key={z.zone}
            layout="inline"
            label={`Z${z.zone}`}
            hint={<span className="t-tnum text-v2-faint">Por defecto: {def} %.</span>}
          >
            {z.lo ? (
              <>
                {field(z.lo, `Z${z.zone} desde (%)`)}
                <span className="t-body-sm text-v2-muted">a</span>
              </>
            ) : (
              <span className="w-[5.25rem] text-right t-body-sm text-v2-muted">hasta</span>
            )}
            {field(z.hi, `Z${z.zone} hasta (%)`)}
            <span className="w-4 t-body-sm text-v2-muted">%</span>
          </SettingRow>
        );
      })}
      <SettingRow
        layout="inline"
        label="Qué cuenta como fácil y como medio"
        htmlFor={`${id}-low`}
        hint={
          <span className="text-v2-faint">
            Por defecto: fácil hasta Z{d.polarization_low_max_zone}, medio hasta Z{d.polarization_mid_max_zone}; lo de encima, duro.
          </span>
        }
      >
        <Select
          id={`${id}-low`}
          aria-label="Fácil"
          value={String(m.polarization_low_max_zone)}
          onValueChange={(v) => commit({ ...m, polarization_low_max_zone: Number(v) })}
          options={zoneOptions(1, 3)}
          className="w-32"
        />
        <Select
          aria-label="Medio"
          value={String(m.polarization_mid_max_zone)}
          onValueChange={(v) => commit({ ...m, polarization_mid_max_zone: Number(v) })}
          options={zoneOptions(2, 4)}
          className="w-32"
        />
      </SettingRow>
      <SettingRow
        layout="inline"
        label="Reparto que buscas"
        hint={
          <span className="t-tnum text-v2-faint">
            Fácil / medio / duro, suma 100. Por defecto: {d.polarization_low_pct} / {d.polarization_mid_pct} /{' '}
            {d.polarization_high_pct}.
          </span>
        }
      >
        {field('polarization_low_pct', 'Fácil (%)', 'w-14')}
        <span className="t-body-sm text-v2-muted">/</span>
        {field('polarization_mid_pct', 'Medio (%)', 'w-14')}
        <span className="t-body-sm text-v2-muted">/</span>
        {field('polarization_high_pct', 'Duro (%)', 'w-14')}
        <span className="w-4 t-body-sm text-v2-muted">%</span>
      </SettingRow>
    </SettingsSection>
  );
}
