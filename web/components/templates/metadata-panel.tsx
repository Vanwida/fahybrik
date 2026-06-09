'use client';

import type { TemplateFormat, TargetBlock } from '@/lib/templates/schema';
import { VideoUrlField } from '@/components/media/VideoUrlField';

const FORMAT_OPTIONS: { v: TemplateFormat; l: string }[] = [
  { v: 'strength_block', l: 'Strength block' },
  { v: 'intervals', l: 'Intervals' },
  { v: 'tempo', l: 'Tempo / Continuous' },
  { v: 'hyrox_sim', l: 'HYROX simulation' },
  { v: 'circuit', l: 'Circuit' },
  { v: 'amrap', l: 'AMRAP' },
  { v: 'emom', l: 'EMOM' },
  { v: 'for_time', l: 'For Time' },
];

const BLOCK_OPTIONS: { v: TargetBlock; l: string }[] = [
  { v: 'any', l: 'Cualquiera' },
  { v: 'ACC', l: 'ACC · Acumulación' },
  { v: 'TRANS', l: 'TRANS · Transformación' },
  { v: 'REAL', l: 'REAL · Realización' },
];

export interface MetadataState {
  name: string;
  format: TemplateFormat;
  target_block: TargetBlock;
  target_level: number | null;
  day_position: string | null;
  is_partner_workout: boolean;
  warmup: string | null;
  cooldown: string | null;
  coach_notes: string | null;
  demo_video_url: string | null;
}

interface VersionChainEntry {
  version: number;
  is_draft: boolean;
  archived_at: string | null;
  is_current: boolean;
  assignment_count: number;
}

interface Props {
  meta: MetadataState;
  onChange: (next: MetadataState) => void;
  versionChain: VersionChainEntry[];
}

export function MetadataPanel({ meta, onChange, versionChain }: Props) {
  return (
    <div className="space-y-4">
      <Section title="Identidad">
        <Field label="Nombre">
          <input
            type="text"
            value={meta.name}
            onChange={(e) => onChange({ ...meta, name: e.target.value })}
            placeholder="Sled Push + Wall Ball Circuit"
            className="w-full h-9 px-3 text-sm bg-[var(--surface)] border border-[var(--outline)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Formato">
            <select
              value={meta.format}
              onChange={(e) =>
                onChange({ ...meta, format: e.target.value as TemplateFormat })
              }
              className="w-full h-9 px-2 text-sm bg-[var(--surface)] border border-[var(--outline)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
            >
              {FORMAT_OPTIONS.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Bloque ATR">
            <select
              value={meta.target_block}
              onChange={(e) =>
                onChange({ ...meta, target_block: e.target.value as TargetBlock })
              }
              className="w-full h-9 px-2 text-sm bg-[var(--surface)] border border-[var(--outline)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
            >
              {BLOCK_OPTIONS.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.l}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nivel objetivo">
            <select
              value={meta.target_level ?? ''}
              onChange={(e) =>
                onChange({
                  ...meta,
                  target_level: e.target.value ? Number(e.target.value) : null,
                })
              }
              className="w-full h-9 px-2 text-sm bg-[var(--surface)] border border-[var(--outline)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
            >
              <option value="">Cualquiera</option>
              <option value="1">Niv 1</option>
              <option value="2">Niv 2</option>
              <option value="3">Niv 3</option>
            </select>
          </Field>
          <Field label="Day position">
            <input
              type="text"
              value={meta.day_position ?? ''}
              onChange={(e) =>
                onChange({ ...meta, day_position: e.target.value || null })
              }
              placeholder="ACC w3 d2 AM"
              className="w-full h-9 px-3 text-sm font-mono bg-[var(--surface)] border border-[var(--outline)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
            />
          </Field>
        </div>
        <Field label="">
          <label className="inline-flex items-center gap-2 text-sm text-[var(--muted)] cursor-pointer">
            <input
              type="checkbox"
              checked={meta.is_partner_workout}
              onChange={(e) =>
                onChange({ ...meta, is_partner_workout: e.target.checked })
              }
              className="accent-[var(--accent)]"
            />
            Partner workout
          </label>
        </Field>
      </Section>

      <Section title="Video demo">
        <VideoUrlField
          label="YouTube · sesión completa"
          hint="Pablo graba o enlaza un vídeo del entreno. El atleta lo ve embebido, sin salir de la app."
          value={meta.demo_video_url}
          onChange={(url) => onChange({ ...meta, demo_video_url: url })}
        />
      </Section>

      <Section title="Calentamiento">
        <textarea
          rows={2}
          value={meta.warmup ?? ''}
          onChange={(e) => onChange({ ...meta, warmup: e.target.value || null })}
          placeholder="10 min row Z2 + glute activation + sled walk 30m"
          className="w-full text-sm bg-[var(--surface)] border border-[var(--outline)] rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent resize-y"
        />
      </Section>

      <Section title="Vuelta a la calma">
        <textarea
          rows={2}
          value={meta.cooldown ?? ''}
          onChange={(e) => onChange({ ...meta, cooldown: e.target.value || null })}
          placeholder="10 min Z1 + foam roll"
          className="w-full text-sm bg-[var(--surface)] border border-[var(--outline)] rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent resize-y"
        />
      </Section>

      <Section title="Notas Pablo">
        <textarea
          rows={3}
          value={meta.coach_notes ?? ''}
          onChange={(e) =>
            onChange({ ...meta, coach_notes: e.target.value || null })
          }
          placeholder="Cues globales, pacing, intent del bloque..."
          className="w-full text-sm bg-[var(--surface)] border border-[var(--outline)] rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent resize-y"
        />
      </Section>

      {versionChain.length > 1 && (
        <Section title="Historial de versiones">
          <ol className="space-y-1">
            {versionChain.map((v) => (
              <li
                key={v.version}
                className="flex items-center justify-between text-xs font-mono"
              >
                <span>
                  v{v.version}
                  {v.is_current && <span className="ml-2 text-[var(--accent)]">actual</span>}
                  {v.is_draft && <span className="ml-2 text-[var(--muted)]">borrador</span>}
                  {v.archived_at && <span className="ml-2 text-[var(--muted)]">archivada</span>}
                </span>
                <span className="text-[var(--muted)]">
                  {v.assignment_count} asign.
                </span>
              </li>
            ))}
          </ol>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[11px] uppercase tracking-[0.16em] text-[var(--muted)] mb-2">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      {label && (
        <span className="block text-[10px] uppercase tracking-[0.16em] text-[var(--muted)] mb-1">
          {label}
        </span>
      )}
      {children}
    </label>
  );
}
