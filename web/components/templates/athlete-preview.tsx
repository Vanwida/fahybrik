'use client';

import type { BuilderSegment } from './template-types';
import { summarize } from './segment-row';
import { YouTubeEmbed } from '@/components/media/YouTubeEmbed';
import { cn } from '@/lib/utils';

const ZONE_TINT_VAR: Record<number, string> = {
  1: 'var(--z1-tint)',
  2: 'var(--z2-tint)',
  3: 'var(--z3-tint)',
  4: 'var(--z4-tint)',
  5: 'var(--z5-tint)',
};

const ZONE_VAR: Record<number, string> = {
  1: 'var(--z1)',
  2: 'var(--z2)',
  3: 'var(--z3)',
  4: 'var(--z4)',
  5: 'var(--z5)',
};

interface Props {
  open: boolean;
  onClose: () => void;
  name: string;
  format: string;
  warmup: string | null;
  cooldown: string | null;
  demoVideoUrl: string | null;
  segments: BuilderSegment[];
  level: 1 | 2 | 3;
  onLevelChange: (lvl: 1 | 2 | 3) => void;
}

export function AthletePreview({
  open,
  onClose,
  name,
  format,
  warmup,
  cooldown,
  demoVideoUrl,
  segments,
  level,
  onLevelChange,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-stretch"
      style={{ backgroundColor: 'var(--scrim)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Vista atleta"
    >
      <div
        className="ml-auto h-full w-full sm:w-[min(100%,440px)] md:w-[38%] lg:w-[30%] min-w-0 bg-[var(--bg)] border-l border-[var(--hairline)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-12 px-4 flex items-center justify-between border-b border-[var(--hairline)]">
          <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
            Vista atleta · niv
          </span>
          <div className="flex gap-1">
            {([1, 2, 3] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => onLevelChange(l)}
                className={cn(
                  'h-7 w-7 text-xs font-mono rounded-md',
                  l === level
                    ? 'bg-[var(--surface-elevated)] text-foreground border border-[var(--accent)]'
                    : 'text-[var(--muted)] hover:text-foreground',
                )}
              >
                {l}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="h-7 w-7 grid place-items-center text-[var(--muted)] hover:text-foreground"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <h2 className="font-display italic font-black text-2xl tracking-tight leading-tight">
            {name || 'Sin título'}
          </h2>
          <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)] mt-1">
            {format}
          </div>

          {demoVideoUrl ? (
            <Card title="Video demo">
              <YouTubeEmbed url={demoVideoUrl} title={name} />
            </Card>
          ) : null}

          {warmup && (
            <Card title="Calentamiento">
              <p className="text-sm whitespace-pre-line">{warmup}</p>
            </Card>
          )}

          <Card title="Segmentos">
            <ol className="space-y-3">
              {segments.length === 0 && (
                <li className="text-sm text-[var(--muted)]">Sin segmentos.</li>
              )}
              {segments.map((s, i) => (
                <li
                  key={s.uid}
                  className="border-l-2 pl-3"
                  style={{
                    borderColor: s.params_json.hr_zone
                      ? ZONE_VAR[s.params_json.hr_zone]
                      : 'var(--hairline)',
                  }}
                >
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-xs text-[var(--muted)] tabular-nums">
                      {i + 1}
                    </span>
                    <span className="font-medium">{s.exercise_name}</span>
                    {s.params_json.hr_zone && (
                      <span
                        className="text-[10px] uppercase tracking-[0.16em] px-1.5 py-0.5 rounded-sm font-mono"
                        style={{
                          backgroundColor: ZONE_TINT_VAR[s.params_json.hr_zone],
                          color: ZONE_VAR[s.params_json.hr_zone],
                        }}
                      >
                        Z{s.params_json.hr_zone}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--muted)] font-mono mt-0.5">
                    {summarize(s)}
                  </div>
                  {(() => {
                    const key = `level_${level}` as const;
                    const note = s.params_json.level_notes?.[key];
                    return note ? (
                      <p className="text-xs text-foreground/80 mt-1 italic">{note}</p>
                    ) : null;
                  })()}
                  {s.notes && (
                    <p className="text-xs text-[var(--muted)] mt-1 whitespace-pre-line">
                      {s.notes}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </Card>

          {cooldown && (
            <Card title="Vuelta a la calma">
              <p className="text-sm whitespace-pre-line">{cooldown}</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 bg-[var(--surface)] rounded-[var(--r-l)] p-4">
      <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)] mb-2">
        {title}
      </div>
      {children}
    </div>
  );
}
