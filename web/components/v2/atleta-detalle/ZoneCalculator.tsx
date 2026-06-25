'use client';

// ZoneCalculator — the SALIDA of the Test feature: a faithful, dark-v2 replica of
// the "Calculadora de Zonas" Pablo approved (UX pase 2026-06-25 §3). It READS the
// athlete's stored zone profile(s) (athlete_zone_profiles snapshot) and renders
// the 6 zones per modality — it NEVER recomputes (one source of truth).
//
//   · ergo profiles (row/ski, per_500m) → side-by-side columns.
//   · run profile (per_km)              → a single column.
// Each zone card = color dot + "Zona N · label" + the absolute pace RANGE, with
// the ≤30s badge literal on Z6 (Pablo's image). A result bar at the bottom carries
// the athlete · date · the test result(s). Colors are the v2 zone tokens
// (--v2-z1..--v2-z6), the AA-adapted family of the original; the stored band
// `color` remains the coach's data of record (rendered model-agnostic via tokens).

import { AthleteAvatar } from '@/components/v2/AthleteAvatar';
import type { AthleteZoneProfile } from '@fahybrid/shared/schema/methodology-system';
import {
  MODALITY_LABEL,
  formatProfileDate,
  formatThreshold,
  formatZoneRange,
  groupProfilesForCalculator,
  paceUnitLabel,
  zoneVar,
  type ProfileModality,
} from '@/lib/dashboard/v2/zone-view';
import { TEST_TARGET_RPE } from '@fahybrid/shared/domain/methodology';

// ── One zone card (a row in a column) ────────────────────────────────────────
function ZoneCard({
  zone,
  unit,
}: {
  zone: AthleteZoneProfile['zones_json'][number];
  unit: 'per_500m' | 'per_km';
}) {
  const isZ6 = zone.sort_order >= 6;
  const dotVar = zoneVar(zone.sort_order);
  return (
    <div
      className="flex items-center gap-3 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-3 py-2.5"
      style={{ borderLeft: `3px solid var(${dotVar})` }}
    >
      <span
        aria-hidden
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{
          background: `var(${dotVar})`,
          ...(isZ6 ? { boxShadow: '0 0 0 1px var(--v2-border-strong)' } : null),
        }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[12.5px] font-bold leading-tight text-[color:var(--v2-fg)]">
            Zona {zone.sort_order}
          </span>
          {isZ6 ? (
            <span className="rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-z6-soft)] px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-[color:var(--v2-muted)]">
              ≤30 s
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 truncate text-[11px] leading-snug text-[color:var(--v2-muted)]">
          {zone.label}
        </div>
      </div>
      <div className="v2-num shrink-0 whitespace-nowrap text-[13px] font-bold text-[color:var(--v2-fg)]">
        {formatZoneRange(zone)}
        <span className="ml-0.5 text-[10px] font-semibold text-[color:var(--v2-faint)]">
          {paceUnitLabel(unit)}
        </span>
      </div>
    </div>
  );
}

// ── One modality column (header + the 6 cards) ───────────────────────────────
function ZoneColumn({ profile }: { profile: AthleteZoneProfile }) {
  const unit = profile.pace_unit;
  const zones = [...profile.zones_json].sort((a, b) => a.sort_order - b.sort_order);
  return (
    <div className="min-w-0">
      <div className="mb-2.5 flex items-center gap-2 border-b border-[color:var(--v2-border)] pb-2">
        <span
          aria-hidden
          className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
          style={{ background: `var(--v2-mod-${profile.modality === 'run' ? 'carrera' : 'ergo'})` }}
        />
        <span className="text-[12.5px] font-bold text-[color:var(--v2-fg)]">
          {MODALITY_LABEL[profile.modality]}
        </span>
        <span className="v2-num ml-auto text-[11px] text-[color:var(--v2-muted)]">
          test{' '}
          <b className="text-[color:var(--v2-fg)]">{formatThreshold(profile.threshold_s)}</b>{' '}
          {paceUnitLabel(unit)}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {zones.map((z) => (
          <ZoneCard key={z.code} zone={z} unit={unit} />
        ))}
      </div>
    </div>
  );
}

// ── The result bar (athlete · date · the test result(s)) ─────────────────────
function ResultBar({
  athleteName,
  profiles,
}: {
  athleteName: string;
  profiles: AthleteZoneProfile[];
}) {
  // The bar shows the most recent recorded_at across the displayed profiles.
  const latestIso = profiles
    .map((p) => p.recorded_at)
    .sort()
    .at(-1);
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-4 py-3">
      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[color:var(--v2-accent)]">
        Resultado del test
      </span>
      <span aria-hidden className="h-4 w-px self-stretch bg-[color:var(--v2-border)]" />
      {profiles.map((p) => (
        <div key={`${p.modality}-${p.id}`} className="flex items-baseline gap-1.5">
          <span className="text-[10.5px] font-semibold uppercase tracking-wide text-[color:var(--v2-faint)]">
            {MODALITY_LABEL[p.modality]}
          </span>
          <span className="v2-num text-[16px] font-bold text-[color:var(--v2-fg)]">
            {formatThreshold(p.threshold_s)}
          </span>
          <span className="text-[11px] font-semibold text-[color:var(--v2-muted)]">
            {paceUnitLabel(p.pace_unit)}
          </span>
        </div>
      ))}
      {latestIso ? (
        <span className="v2-num ml-auto text-[11px] text-[color:var(--v2-faint)]">
          {athleteName} · {formatProfileDate(latestIso)}
        </span>
      ) : null}
    </div>
  );
}

/** The branded title family: "Remo & Ski-Erg", "Carrera · zonas", etc. */
function titleFamily(profiles: AthleteZoneProfile[]): string {
  const mods = profiles.map((p) => p.modality);
  if (mods.length === 0) return '';
  if (mods.every((m) => m === 'run')) return 'Carrera';
  const names = profiles.map((p) => MODALITY_LABEL[p.modality as ProfileModality]);
  return names.join(' & ');
}

export function ZoneCalculator({
  athleteName,
  profiles,
}: {
  athleteName: string;
  profiles: AthleteZoneProfile[];
}) {
  if (profiles.length === 0) return null;

  const { ergo, run } = groupProfilesForCalculator(profiles);
  const latestIso = profiles
    .map((p) => p.recorded_at)
    .sort()
    .at(-1);

  return (
    <div className="rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-4 shadow-[var(--v2-shadow-card)] sm:p-5">
      {/* Header — athlete + date + branded title */}
      <div className="flex items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <AthleteAvatar name={athleteName} size="lg" />
          <div>
            <div className="text-[15px] font-extrabold text-[color:var(--v2-fg)]">
              {athleteName}
            </div>
            <div className="text-[11px] text-[color:var(--v2-muted)]">
              {latestIso ? `Test · ${formatProfileDate(latestIso)}` : 'Test'} · RPE{' '}
              {TEST_TARGET_RPE}
            </div>
          </div>
        </div>
        <div className="text-right text-[10.5px] font-bold uppercase leading-tight tracking-[0.12em] text-[color:var(--v2-faint)]">
          Calculadora de zonas
          <b className="block text-[13px] tracking-[0.04em] text-[color:var(--v2-accent)]">
            {titleFamily(profiles)}
          </b>
        </div>
      </div>

      {/* Columns — ergo side-by-side (per_500m), run single (per_km) */}
      {ergo.length > 0 ? (
        <div
          className="mt-4 grid gap-4"
          style={{ gridTemplateColumns: `repeat(${Math.min(ergo.length, 2)}, minmax(0, 1fr))` }}
        >
          {ergo.map((p) => (
            <ZoneColumn key={`${p.modality}-${p.id}`} profile={p} />
          ))}
        </div>
      ) : null}

      {run.length > 0 ? (
        <div className="mx-auto mt-4 max-w-[520px]">
          {run.map((p) => (
            <ZoneColumn key={`${p.modality}-${p.id}`} profile={p} />
          ))}
        </div>
      ) : null}

      <ResultBar athleteName={athleteName} profiles={profiles} />

      {/* Feeds-the-plan callout — the chain that makes the test the resolver */}
      <div
        className="mt-4 flex items-center gap-3 rounded-[var(--v2-r-s)] border border-[color:var(--v2-accent-soft)] px-4 py-3"
        style={{
          borderLeft: '3px solid var(--v2-accent)',
          background: 'linear-gradient(90deg, var(--v2-accent-soft), transparent)',
        }}
      >
        <span aria-hidden className="text-[color:var(--v2-accent)]">
          ⤓
        </span>
        <p className="text-[12px] leading-snug text-[color:var(--v2-muted)]">
          Estas zonas <b className="text-[color:var(--v2-fg)]">alimentan el plan</b>: cada bloque
          escrito en relativo (<span className="v2-num text-[color:var(--v2-accent)]">Z2</span> /{' '}
          <span className="v2-num text-[color:var(--v2-accent)]">Z4</span> / “ritmo umbral”) se
          resuelve al rango concreto de {athleteName.split(' ')[0]}.
        </p>
      </div>
    </div>
  );
}
