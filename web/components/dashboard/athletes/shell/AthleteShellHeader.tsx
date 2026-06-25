'use client';

// EL HUB de la ficha de atleta. El header responde, EN ORDEN, a las tres
// preguntas del coach: "¿dónde está este atleta?" (bloque ATR + carrera) ·
// "¿cómo está?" (UNA palabra de estado derivada de cumplimiento + readiness, con
// la línea de métricas etiquetada de apoyo) · "¿qué necesita mi decisión?" (las
// CTAs + la cola de decisiones, que vive aparte). Sustituye la "sopa" de números
// flotantes por un read de estado legible de un vistazo. El naranja significa
// SOLO acción primaria / identidad / hoy: el estado usa color SEMÁNTICO. Vocabulario
// del fundador: "bloque"/nombre de fase, NUNCA "microciclo". Cambiar de sección
// NO navega.

import { Link } from '@/i18n/navigation';
import type { AthleteProfileShell } from '@/lib/dashboard/coach/athlete-profile-shell';
import type { AthleteResumen } from '@/lib/dashboard/coach/resumen';
import type { PlanViewMode } from '@/lib/dashboard/coach/athlete-plan';
import { cn } from '@/lib/utils';
import { computeAthleteState } from '@/lib/dashboard/coach/athlete-status';
import { AthleteAvatar } from '@/components/dashboard/atoms/AthleteAvatar';
import { InviteAthleteButton } from '@/components/dashboard/athletes/InviteAthleteButton';
import { MIcon } from '@/components/dashboard/MIcon';

export type AthleteSection = 'calendario' | 'cuerpo' | 'rendimiento';

export const ATHLETE_SECTIONS: ReadonlyArray<{ key: AthleteSection; label: string }> = [
  { key: 'calendario', label: 'Calendario' },
  { key: 'cuerpo', label: 'Cuerpo' },
  { key: 'rendimiento', label: 'Rendimiento' },
];

const ZOOM_OPTIONS: ReadonlyArray<{ key: PlanViewMode; label: string }> = [
  { key: 'week', label: 'Semana' },
  { key: 'month', label: 'Mes' },
  { key: 'macro', label: 'Macro' },
];

const MODALITY_LABELS: Record<string, string> = {
  individual: 'Individual',
  dobles: 'Dobles',
  pro_elite: 'Pro Elite',
};

// ── Read de estado: UNA palabra a partir de cumplimiento (7d) + readiness ────
// La lógica + umbrales viven en lib/dashboard/coach/athlete-status.ts (fuente de
// verdad compartida con el roster /atletas — así el read coincide en ambas).

/** Días enteros (UTC) entre una fecha ISO YYYY-MM-DD y hoy. null si no parsea. */
function daysSinceIso(iso: string, todayIso: string): number | null {
  const a = Date.parse(`${iso}T00:00:00Z`);
  const b = Date.parse(`${todayIso}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

interface AthleteShellHeaderProps {
  profile: AthleteProfileShell;
  resumen: AthleteResumen;
  /** Línea de fase ATR bajo el nombre, p.ej. "Acumulación · Semana 3 de 5". */
  phaseLine: string | null;
  section: AthleteSection;
  onSectionChange: (section: AthleteSection) => void;
  zoom: PlanViewMode;
  onZoomChange: (zoom: PlanViewMode) => void;
  onAssignOpen: () => void;
}

export function AthleteShellHeader({
  profile,
  resumen,
  phaseLine,
  section,
  onSectionChange,
  zoom,
  onZoomChange,
  onAssignOpen,
}: AthleteShellHeaderProps) {
  const todayIso = new Date().toISOString().slice(0, 10);

  const compliance = resumen.compliance_pct_7d;
  const readiness = resumen.readiness_score;
  const stateRead = computeAthleteState(compliance, readiness);

  // Carrera objetivo (la meta a la que apunta el plan) → fallback a a_event.
  const race =
    resumen.target_race != null
      ? { name: resumen.target_race.name, days_until: resumen.target_race.days_until }
      : profile.a_event != null
        ? { name: profile.a_event.name, days_until: profile.a_event.days_until }
        : null;

  // Check-in: recencia en días si hay fecha; "hoy" si es hoy; "—" si no hay.
  const checkinDaysAgo =
    resumen.last_checkin_at != null
      ? resumen.last_checkin_at === todayIso
        ? 0
        : daysSinceIso(resumen.last_checkin_at, todayIso)
      : null;
  const checkinText =
    checkinDaysAgo == null
      ? 'Check-in —'
      : checkinDaysAgo === 0
        ? 'Check-in hoy'
        : `Check-in hace ${checkinDaysAgo}d`;

  // Conteo de la semana (hechas / total) — semana en curso (lun-dom).
  const weekTotal = resumen.week_scheduled > 0 ? resumen.week_scheduled : null;
  const weekDone = resumen.week_completed;

  return (
    <header className="sticky top-14 z-20 -mx-4 -mt-4 border-b border-[color:var(--border-subtle)] bg-[color:color-mix(in_srgb,var(--bg)_92%,transparent)] px-4 pt-3 backdrop-blur-md sm:-mx-6 sm:-mt-6 sm:px-6 sm:pt-4">
      <nav aria-label="Ruta" className="mb-2 flex items-center gap-1.5 text-xs">
        <Link
          href="/atletas"
          className="focus-ring rounded-[var(--r-s)] font-semibold text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--fg)]"
        >
          Atletas
        </Link>
        <MIcon name="chevron_right" size={14} className="text-[color:var(--text-muted)]" aria-hidden />
        <span aria-current="page" className="font-semibold text-[color:var(--fg)]">
          {profile.full_name}
        </span>
      </nav>

      {/* TIER 1 — identidad (avatar + nombre + modalidad) a la izquierda; SOLO el
          par de CTAs a la derecha. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <AthleteAvatar name={profile.full_name} size="md" />

        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-headline-md uppercase leading-none text-[color:var(--fg)]">
              {profile.full_name}
            </h1>
            {profile.modality ? <Chip>{MODALITY_LABELS[profile.modality]}</Chip> : null}
            {profile.modality === 'dobles' && profile.partner ? (
              <Link
                href={`/atletas/${profile.partner.athlete_id}`}
                className="focus-ring inline-flex h-5 items-center gap-1 rounded-[var(--r-pill)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-elevated)] px-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[color:var(--text-muted)] transition-colors hover:border-[color:color-mix(in_srgb,var(--accent)_45%,var(--border-subtle))] hover:text-[color:var(--fg)]"
                aria-label={`Pareja de Dobles: ${profile.partner.full_name} — abrir su ficha`}
              >
                <MIcon name="group" size={12} aria-hidden />
                {profile.partner.full_name}
              </Link>
            ) : null}
          </div>

          {/* DÓNDE ESTÁ — bloque ATR (fase + semana del bloque) · carrera + cuenta
              atrás. Vocabulario del fundador: "bloque"/fase, nunca "microciclo". */}
          {phaseLine || race ? (
            <p className="micro-label flex flex-wrap items-center gap-x-1.5 gap-y-1">
              {phaseLine ? <span>{phaseLine}</span> : null}
              {phaseLine && race ? (
                <span aria-hidden className="text-[color:var(--tertiary)]">
                  ·
                </span>
              ) : null}
              {race ? (
                <span className="inline-flex items-center gap-1">
                  <MIcon name="flag" size={12} aria-hidden />
                  {race.name}
                  <span className="text-[color:var(--tertiary)]">·</span>
                  <span className="metric-num text-[color:var(--text-muted)]">
                    {race.days_until <= 0 ? 0 : race.days_until}
                  </span>
                  {race.days_until === 1 ? 'día' : 'días'}
                </span>
              ) : null}
            </p>
          ) : null}
        </div>

        {/* El par de CTAs: primario naranja + invitación outline. */}
        <div className="ml-auto flex items-center gap-2">
          <InviteAthleteButton athleteId={profile.athlete_id} athleteName={profile.full_name} />
          <button
            type="button"
            onClick={onAssignOpen}
            aria-haspopup="dialog"
            className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-[var(--r-m)] bg-[color:var(--accent)] px-4 text-[13px] font-semibold text-[color:var(--accent-on)] transition-colors hover:bg-[color:var(--accent-press)]"
          >
            <MIcon name="event_repeat" size={17} aria-hidden />
            Programar bloque
          </button>
        </div>
      </div>

      {/* TIER 2 — CÓMO ESTÁ: UNA palabra de estado (punto + palabra, el foco del
          read) + la línea de métricas de apoyo, etiquetada (NO sopa de números).
          El estado se mantiene en móvil; solo la línea de apoyo colapsa bajo md. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="flex items-center gap-2">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: stateRead.tone }}
          />
          <span
            className="font-heading uppercase leading-none"
            style={{ color: stateRead.tone }}
          >
            {stateRead.word}
          </span>
        </span>

        <span aria-hidden className="hidden h-4 w-px self-center bg-[color:var(--border-subtle)] sm:block" />

        {/* Línea de apoyo: cada métrica con su etiqueta en palabras. Colapsa bajo
            sm (el read de estado solo). */}
        <p className="hidden flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-[color:var(--text-muted)] sm:flex">
          <SupportMetric label="Cumplimiento" value={compliance != null ? `${compliance}%` : '—'} />
          <Sep />
          <SupportMetric label="Readiness" value={readiness != null ? String(readiness) : '—'} />
          <Sep />
          <span>{checkinText}</span>
          {weekTotal != null ? (
            <>
              <Sep />
              <span>
                <span className="metric-num text-[color:var(--fg)]">
                  {weekDone}/{weekTotal}
                </span>{' '}
                esta semana
              </span>
            </>
          ) : null}
        </p>
      </div>

      <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
        <nav aria-label="Secciones de la ficha" className="flex">
          {ATHLETE_SECTIONS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => onSectionChange(key)}
              aria-current={section === key ? 'true' : undefined}
              className={cn(
                'focus-ring -mb-px border-b-2 px-4 py-2.5 text-[13px] font-semibold transition-colors',
                section === key
                  ? 'border-[color:var(--accent)] text-[color:var(--fg)]'
                  : 'border-transparent text-[color:var(--text-muted)] hover:text-[color:var(--fg)]',
              )}
            >
              {label}
            </button>
          ))}
        </nav>

        {section === 'calendario' ? (
          <div
            role="group"
            aria-label="Nivel de zoom del calendario"
            className="mb-1.5 inline-flex items-center gap-0.5 rounded-[var(--r-m)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-low)] p-[3px]"
          >
            {ZOOM_OPTIONS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => onZoomChange(key)}
                aria-pressed={zoom === key}
                className={cn(
                  'focus-ring h-[26px] rounded-[var(--r-s)] px-3.5 text-xs font-semibold transition-colors',
                  zoom === key
                    ? 'bg-[color:var(--surface-container-highest)] text-[color:var(--fg)] shadow-[0_1px_0_rgba(255,255,255,0.05)_inset]'
                    : 'text-[color:var(--text-muted)] hover:text-[color:var(--fg)]',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </header>
  );
}

/** Chip de identidad NEUTRO (modalidad): sin naranja (orange discipline). */
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-5 items-center rounded-[var(--r-pill)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-elevated)] px-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[color:var(--text-muted)]">
      {children}
    </span>
  );
}

/** Métrica de apoyo etiquetada en palabras: "Cumplimiento 82%". */
function SupportMetric({ label, value }: { label: string; value: string }) {
  return (
    <span className="whitespace-nowrap">
      {label} <span className="metric-num font-semibold text-[color:var(--fg)]">{value}</span>
    </span>
  );
}

function Sep() {
  return (
    <span aria-hidden className="text-[color:var(--tertiary)]">
      ·
    </span>
  );
}
