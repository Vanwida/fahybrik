'use client';

import { useId } from 'react';
import type { SegmentParams } from '@/lib/templates/schema';
import type { BuilderSegment, ExerciseCategoryToken } from './template-types';
import { VideoUrlField } from '@/components/media/VideoUrlField';
import { cn } from '@/lib/utils';

interface Props {
  segment: BuilderSegment;
  onChange: (next: BuilderSegment) => void;
  onDelete: () => void;
}

export function SegmentEditor({ segment, onChange, onDelete }: Props) {
  const setParams = (patch: Partial<SegmentParams>) =>
    onChange({ ...segment, params_json: { ...segment.params_json, ...patch } });

  const setNotes = (notes: string) => onChange({ ...segment, notes: notes || null });

  return (
    <div className="px-4 pt-3 pb-4 bg-[var(--surface-elevated)] border-t border-[var(--hairline)] animate-in fade-in-0 slide-in-from-top-1 duration-200">
      <CategoryFields category={segment.exercise_category} segment={segment} setParams={setParams} />

      <AdvancedFeatures segment={segment} onChange={onChange} />

      <div className="mt-4">
        <VideoUrlField
          label="Video técnica (YouTube)"
          hint="Opcional. Se reproduce dentro de la app del atleta."
          compact
          value={segment.params_json.video_url ?? null}
          onChange={(url) =>
            setParams({ video_url: url ?? undefined })
          }
        />
      </div>

      <div className="mt-4">
        <Label>Notas Pablo</Label>
        <textarea
          value={segment.notes ?? ''}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="mt-1 w-full text-sm bg-[var(--surface)] border border-[var(--outline)] rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent resize-y"
          placeholder="Cues técnicos, microbreaks, control de pace..."
        />
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onDelete}
          className="text-xs uppercase tracking-[0.16em] text-[var(--muted)] hover:text-[var(--danger)] transition-colors"
        >
          Eliminar segmento
        </button>
      </div>
    </div>
  );
}

function CategoryFields({
  category,
  segment,
  setParams,
}: {
  category: ExerciseCategoryToken;
  segment: BuilderSegment;
  setParams: (p: Partial<SegmentParams>) => void;
}) {
  const p = segment.params_json;

  if (category === 'cardio') {
    return (
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Modo</Label>
          <Toggle
            value={p.cardio_mode ?? 'distance'}
            options={[
              { v: 'distance', l: 'Distancia' },
              { v: 'time', l: 'Tiempo' },
            ]}
            onChange={(v) => setParams({ cardio_mode: v as 'distance' | 'time' })}
          />
        </div>
        <div>
          <Label>{p.cardio_mode === 'time' ? 'Tiempo (s)' : 'Distancia (m)'}</Label>
          {p.cardio_mode === 'time' ? (
            <NumberInput value={p.time_seconds} onChange={(v) => setParams({ time_seconds: v })} />
          ) : (
            <NumberInput
              value={p.distance_meters}
              onChange={(v) => setParams({ distance_meters: v })}
            />
          )}
        </div>
        <div>
          <Label>Pace target</Label>
          <TextInput
            value={p.pace_target ?? ''}
            placeholder="3:50-4:00/km"
            onChange={(v) => setParams({ pace_target: v || undefined })}
          />
        </div>
        <div>
          <Label>HR zone</Label>
          <ZoneSelect value={p.hr_zone} onChange={(v) => setParams({ hr_zone: v })} />
        </div>
        <div>
          <Label>Power (W)</Label>
          <NumberInput
            value={p.power_watts}
            onChange={(v) => setParams({ power_watts: v })}
            placeholder="PM5 only"
          />
        </div>
        <div>
          <Label>Cadencia</Label>
          <TextInput
            value={p.cadence_target ?? ''}
            placeholder="178-184 spm"
            onChange={(v) => setParams({ cadence_target: v || undefined })}
          />
        </div>
        <div>
          <Label>Repeticiones (rounds)</Label>
          <NumberInput value={p.rounds} onChange={(v) => setParams({ rounds: v })} />
        </div>
        <div>
          <Label>Descanso (s)</Label>
          <NumberInput value={p.rest_seconds} onChange={(v) => setParams({ rest_seconds: v })} />
        </div>
      </div>
    );
  }

  if (category === 'strength') {
    return (
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Series</Label>
          <NumberInput value={p.sets} onChange={(v) => setParams({ sets: v })} />
        </div>
        <div>
          <Label>Reps</Label>
          <NumberInput value={p.reps} onChange={(v) => setParams({ reps: v })} />
        </div>
        <div>
          <Label>Carga (kg)</Label>
          <NumberInput value={p.weight_kg} onChange={(v) => setParams({ weight_kg: v })} />
        </div>
        <div>
          <Label>%1RM</Label>
          <NumberInput
            value={p.weight_pct_1rm}
            onChange={(v) => setParams({ weight_pct_1rm: v })}
          />
        </div>
        <div>
          <Label>RPE objetivo</Label>
          <NumberInput value={p.rpe} onChange={(v) => setParams({ rpe: v })} />
        </div>
        <div>
          <Label>Tempo</Label>
          <TextInput
            value={p.tempo ?? ''}
            placeholder="3-1-1-0"
            onChange={(v) => setParams({ tempo: v || undefined })}
          />
        </div>
        <div className="col-span-2">
          <Label>Descanso (s)</Label>
          <NumberInput value={p.rest_seconds} onChange={(v) => setParams({ rest_seconds: v })} />
        </div>
      </div>
    );
  }

  if (category === 'skill') {
    return (
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Reps</Label>
          <NumberInput value={p.reps} onChange={(v) => setParams({ reps: v })} />
        </div>
        <div>
          <Label>Tiempo (s)</Label>
          <NumberInput value={p.time_seconds} onChange={(v) => setParams({ time_seconds: v })} />
        </div>
        <div>
          <Label>Series</Label>
          <NumberInput value={p.sets} onChange={(v) => setParams({ sets: v })} />
        </div>
        <div>
          <Label>RPE</Label>
          <NumberInput value={p.rpe} onChange={(v) => setParams({ rpe: v })} />
        </div>
        <div className="col-span-2">
          <Label>Criterio de calidad</Label>
          <TextInput
            value={p.quality_threshold ?? ''}
            placeholder="3 reps unbroken sin perder forma"
            onChange={(v) => setParams({ quality_threshold: v || undefined })}
          />
        </div>
        <div className="col-span-2">
          <Label>Descanso (s)</Label>
          <NumberInput value={p.rest_seconds} onChange={(v) => setParams({ rest_seconds: v })} />
        </div>
      </div>
    );
  }

  if (category === 'hyrox_station') {
    return (
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Distancia (m)</Label>
          <NumberInput
            value={p.distance_meters}
            onChange={(v) => setParams({ distance_meters: v })}
          />
        </div>
        <div>
          <Label>Reps</Label>
          <NumberInput value={p.reps} onChange={(v) => setParams({ reps: v })} />
        </div>
        <div>
          <Label>Carga (kg)</Label>
          <NumberInput value={p.weight_kg} onChange={(v) => setParams({ weight_kg: v })} />
        </div>
        <div>
          <Label>HR zone</Label>
          <ZoneSelect value={p.hr_zone} onChange={(v) => setParams({ hr_zone: v })} />
        </div>
        <div>
          <Label>RPE</Label>
          <NumberInput value={p.rpe} onChange={(v) => setParams({ rpe: v })} />
        </div>
        <div>
          <Label>Pace target</Label>
          <TextInput
            value={p.pace_target ?? ''}
            placeholder="0:55 / 100m"
            onChange={(v) => setParams({ pace_target: v || undefined })}
          />
        </div>
        <div className="col-span-2">
          <Label>Cadencia</Label>
          <TextInput
            value={p.cadence_target ?? ''}
            placeholder="32-36 reps/min"
            onChange={(v) => setParams({ cadence_target: v || undefined })}
          />
        </div>
        <div className="col-span-2">
          <Label>Clases alternativas</Label>
          <ChipsInput
            values={p.station_alt_classes ?? []}
            onChange={(arr) => setParams({ station_alt_classes: arr })}
            placeholder="Añadir variante (Enter)"
          />
        </div>
      </div>
    );
  }

  // mobility, plyometric, core, default
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <Label>Tiempo (s)</Label>
        <NumberInput value={p.time_seconds} onChange={(v) => setParams({ time_seconds: v })} />
      </div>
      <div>
        <Label>Reps</Label>
        <NumberInput value={p.reps} onChange={(v) => setParams({ reps: v })} />
      </div>
      <div>
        <Label>Series</Label>
        <NumberInput value={p.sets} onChange={(v) => setParams({ sets: v })} />
      </div>
      <div>
        <Label>Intensidad</Label>
        <select
          value={p.intensity ?? ''}
          onChange={(e) =>
            setParams({
              intensity: (e.target.value || undefined) as SegmentParams['intensity'],
            })
          }
          className="mt-1 w-full h-8 px-2 text-sm bg-[var(--surface)] border border-[var(--outline)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
        >
          <option value="">—</option>
          <option value="light">Suave</option>
          <option value="medium">Media</option>
          <option value="hard">Dura</option>
        </select>
      </div>
      <div className="col-span-2">
        <Label>Descanso (s)</Label>
        <NumberInput value={p.rest_seconds} onChange={(v) => setParams({ rest_seconds: v })} />
      </div>
    </div>
  );
}

function AdvancedFeatures({
  segment,
  onChange,
}: {
  segment: BuilderSegment;
  onChange: (next: BuilderSegment) => void;
}) {
  const p = segment.params_json;

  const setParams = (patch: Partial<SegmentParams>) =>
    onChange({ ...segment, params_json: { ...p, ...patch } });

  const variants = p.week_variants ?? [];
  const alts = p.alternatives ?? [];
  const cond = p.conditional;
  const lvl = p.level_notes ?? {};

  return (
    <details className="mt-4 border-t border-[var(--hairline)] pt-3">
      <summary className="cursor-pointer text-xs uppercase tracking-[0.16em] text-[var(--muted)] hover:text-foreground select-none">
        Avanzado · progresión, condicionales, alternativas, notas por nivel
      </summary>

      <div className="mt-3 space-y-4">
        {/* Week variants */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
            <Label>Progresión semanal</Label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  setParams({
                    week_variants: [
                      ...variants,
                      { week: variants.length + 1 },
                    ],
                  })
                }
                className="text-[10px] uppercase tracking-[0.16em] text-[var(--accent)] hover:text-[var(--accent-press)]"
              >
                + semana
              </button>
              {variants.length > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      const last = variants[variants.length - 1]!;
                      setParams({
                        week_variants: [
                          ...variants,
                          { ...last, week: variants.length + 1 },
                        ],
                      });
                    }}
                    className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)] hover:text-[var(--fg)]"
                  >
                    Duplicar semana
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setParams({
                        week_variants: variants.map((v) => ({
                          ...v,
                          rpe: v.rpe != null ? Math.min(10, v.rpe + 0.5) : 7,
                        })),
                      })
                    }
                    className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)] hover:text-[var(--fg)]"
                  >
                    +0.5 RPE todas
                  </button>
                </>
              ) : null}
            </div>
          </div>
          {variants.length === 0 && (
            <p className="text-[11px] text-[var(--muted)]">
              Sin progresión. Añade semanas para que el motor escoja por microciclo.
            </p>
          )}
          {variants.length > 0 && (
            <div className="space-y-1.5">
              {variants.map((v, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-12 gap-1.5 text-xs items-center"
                >
                  <div className="col-span-1 text-center font-mono text-[var(--muted)]">
                    w{v.week}
                  </div>
                  <NumberInput
                    className="col-span-2"
                    placeholder="series"
                    value={v.sets}
                    onChange={(n) =>
                      setParams({
                        week_variants: variants.map((x, i) =>
                          i === idx ? { ...x, sets: n } : x,
                        ),
                      })
                    }
                  />
                  <NumberInput
                    className="col-span-2"
                    placeholder="reps"
                    value={v.reps}
                    onChange={(n) =>
                      setParams({
                        week_variants: variants.map((x, i) =>
                          i === idx ? { ...x, reps: n } : x,
                        ),
                      })
                    }
                  />
                  <NumberInput
                    className="col-span-2"
                    placeholder="%1RM"
                    value={v.weight_pct_1rm}
                    onChange={(n) =>
                      setParams({
                        week_variants: variants.map((x, i) =>
                          i === idx ? { ...x, weight_pct_1rm: n } : x,
                        ),
                      })
                    }
                  />
                  <NumberInput
                    className="col-span-2"
                    placeholder="RPE"
                    value={v.rpe}
                    onChange={(n) =>
                      setParams({
                        week_variants: variants.map((x, i) =>
                          i === idx ? { ...x, rpe: n } : x,
                        ),
                      })
                    }
                  />
                  <TextInput
                    className="col-span-2"
                    placeholder="nota"
                    value={v.note ?? ''}
                    onChange={(s) =>
                      setParams({
                        week_variants: variants.map((x, i) =>
                          i === idx ? { ...x, note: s || undefined } : x,
                        ),
                      })
                    }
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setParams({
                        week_variants: variants.filter((_, i) => i !== idx),
                      })
                    }
                    aria-label="Eliminar semana"
                    className="col-span-1 h-7 w-7 ml-auto grid place-items-center text-[var(--muted)] hover:text-[var(--danger)]"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Conditional */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <Label>Condicional</Label>
            {cond ? (
              <button
                type="button"
                onClick={() => setParams({ conditional: undefined })}
                className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)] hover:text-[var(--danger)]"
              >
                Quitar
              </button>
            ) : (
              <button
                type="button"
                onClick={() =>
                  setParams({
                    conditional: { metric: 'hrv', op: 'lt', baseline_offset: -10, then: 'substitute' },
                  })
                }
                className="text-[10px] uppercase tracking-[0.16em] text-[var(--accent)] hover:text-[var(--accent-press)]"
              >
                + condicional
              </button>
            )}
          </div>
          {cond && (
            <div className="grid grid-cols-12 gap-1.5 text-xs items-center">
              <span className="col-span-1 text-[var(--muted)] uppercase text-[10px]">si</span>
              <select
                className="col-span-2 h-7 px-2 bg-[var(--surface)] border border-[var(--outline)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                value={cond.metric}
                onChange={(e) =>
                  setParams({
                    conditional: { ...cond, metric: e.target.value as typeof cond.metric },
                  })
                }
              >
                <option value="hrv">HRV</option>
                <option value="sleep_score">Sueño</option>
                <option value="recovery">Recovery</option>
                <option value="rpe_yesterday">RPE ayer</option>
                <option value="soreness">Dolor muscular</option>
              </select>
              <select
                className="col-span-1 h-7 px-2 bg-[var(--surface)] border border-[var(--outline)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                value={cond.op}
                onChange={(e) =>
                  setParams({
                    conditional: { ...cond, op: e.target.value as typeof cond.op },
                  })
                }
              >
                <option value="lt">&lt;</option>
                <option value="lte">≤</option>
                <option value="gt">&gt;</option>
                <option value="gte">≥</option>
              </select>
              <NumberInput
                className="col-span-2"
                placeholder="offset"
                value={cond.baseline_offset}
                onChange={(n) => setParams({ conditional: { ...cond, baseline_offset: n } })}
              />
              <span className="col-span-1 text-[var(--muted)] uppercase text-[10px]">→</span>
              <select
                className="col-span-2 h-7 px-2 bg-[var(--surface)] border border-[var(--outline)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                value={cond.then}
                onChange={(e) =>
                  setParams({
                    conditional: { ...cond, then: e.target.value as typeof cond.then },
                  })
                }
              >
                <option value="substitute">Sustituir</option>
                <option value="skip">Saltar</option>
                <option value="reduce_volume">Reducir volumen</option>
                <option value="reduce_intensity">Reducir intensidad</option>
              </select>
              <TextInput
                className="col-span-3"
                placeholder="slug alternativo"
                value={cond.substitute_exercise_slug ?? ''}
                onChange={(s) =>
                  setParams({
                    conditional: {
                      ...cond,
                      substitute_exercise_slug: s || undefined,
                    },
                  })
                }
              />
            </div>
          )}
        </div>

        {/* Alternatives */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <Label>Alternativas (equipamiento)</Label>
            <button
              type="button"
              onClick={() =>
                setParams({
                  alternatives: [...alts, { exercise_slug: '' }],
                })
              }
              className="text-[10px] uppercase tracking-[0.16em] text-[var(--accent)] hover:text-[var(--accent-press)]"
            >
              + alternativa
            </button>
          </div>
          {alts.map((a, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-1.5 text-xs items-center mb-1">
              <TextInput
                className="col-span-4"
                placeholder="slug"
                value={a.exercise_slug}
                onChange={(s) =>
                  setParams({
                    alternatives: alts.map((x, i) =>
                      i === idx ? { ...x, exercise_slug: s } : x,
                    ),
                  })
                }
              />
              <NumberInput
                className="col-span-2"
                placeholder="distancia (m)"
                value={a.distance_meters}
                onChange={(n) =>
                  setParams({
                    alternatives: alts.map((x, i) =>
                      i === idx ? { ...x, distance_meters: n } : x,
                    ),
                  })
                }
              />
              <NumberInput
                className="col-span-2"
                placeholder="reps"
                value={a.reps}
                onChange={(n) =>
                  setParams({
                    alternatives: alts.map((x, i) =>
                      i === idx ? { ...x, reps: n } : x,
                    ),
                  })
                }
              />
              <NumberInput
                className="col-span-2"
                placeholder="kg"
                value={a.weight_kg}
                onChange={(n) =>
                  setParams({
                    alternatives: alts.map((x, i) =>
                      i === idx ? { ...x, weight_kg: n } : x,
                    ),
                  })
                }
              />
              <button
                type="button"
                onClick={() =>
                  setParams({ alternatives: alts.filter((_, i) => i !== idx) })
                }
                className="col-span-1 h-7 w-7 ml-auto grid place-items-center text-[var(--muted)] hover:text-[var(--danger)]"
                aria-label="Eliminar alternativa"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {/* Notes by level */}
        <div>
          <Label>Notas por nivel</Label>
          <div className="grid grid-cols-1 gap-1.5 mt-1">
            {(['level_1', 'level_2', 'level_3'] as const).map((k) => (
              <div key={k} className="flex items-start gap-2">
                <span className="w-12 mt-2 text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
                  Niv {k.slice(-1)}
                </span>
                <textarea
                  rows={1}
                  value={lvl[k] ?? ''}
                  onChange={(e) =>
                    setParams({
                      level_notes: { ...lvl, [k]: e.target.value || undefined },
                    })
                  }
                  placeholder="cue específico"
                  className="flex-1 text-sm bg-[var(--surface)] border border-[var(--outline)] rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent resize-y"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </details>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="block text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
      {children}
    </span>
  );
}

function NumberInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value?: number;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      type="number"
      value={value ?? ''}
      onChange={(e) => {
        const v = e.target.value;
        if (v === '') onChange(undefined);
        else onChange(Number(v));
      }}
      placeholder={placeholder}
      className={cn(
        'mt-1 w-full h-8 px-2 text-sm font-mono bg-[var(--surface)] border border-[var(--outline)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent',
        className,
      )}
    />
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        'mt-1 w-full h-8 px-2 text-sm bg-[var(--surface)] border border-[var(--outline)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent',
        className,
      )}
    />
  );
}

function Toggle({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { v: string; l: string }[];
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <div role="radiogroup" aria-labelledby={id} className="mt-1 flex gap-1">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={o.v === value}
          onClick={() => onChange(o.v)}
          className={cn(
            'h-8 px-3 text-xs rounded-md border transition-colors',
            o.v === value
              ? 'bg-[var(--surface-elevated)] border-[var(--accent)] text-foreground'
              : 'bg-[var(--surface)] border-[var(--outline)] text-[var(--muted)] hover:text-foreground',
          )}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

function ZoneSelect({
  value,
  onChange,
}: {
  value?: number;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
      className="mt-1 w-full h-8 px-2 text-sm bg-[var(--surface)] border border-[var(--outline)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
    >
      <option value="">—</option>
      <option value="1">Z1 · recovery</option>
      <option value="2">Z2 · aerobic base</option>
      <option value="3">Z3 · tempo</option>
      <option value="4">Z4 · threshold</option>
      <option value="5">Z5 · VO2/red line</option>
    </select>
  );
}

function ChipsInput({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5 p-1.5 bg-[var(--surface)] border border-[var(--outline)] rounded-md min-h-8">
      {values.map((v, i) => (
        <span
          key={`${v}-${i}`}
          className="inline-flex items-center gap-1 h-6 px-2 text-xs rounded-sm bg-[var(--surface-elevated)] text-foreground"
        >
          {v}
          <button
            type="button"
            onClick={() => onChange(values.filter((_, idx) => idx !== i))}
            className="text-[var(--muted)] hover:text-[var(--danger)]"
            aria-label="Quitar"
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const target = e.currentTarget;
            const v = target.value.trim();
            if (v) {
              onChange([...values, v]);
              target.value = '';
            }
          }
        }}
        className="flex-1 min-w-[120px] h-6 bg-transparent text-xs focus:outline-none placeholder:text-[var(--muted)]"
      />
    </div>
  );
}
