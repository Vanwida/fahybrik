'use client';

import { useId, useMemo, useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import type { EventListItem } from '@/lib/coach/events';
import {
  eventRegion,
  eventSeries,
  hyroxDivision,
} from '@fahybrid/shared/schema/events';

// Owner/admin race create + edit form (phase 2c). One form for both: a null
// `race` is a manual create (verified + visible by default), a present `race`
// pre-fills for an edit. Talks to /api/admin/races[/:id]; the parent reloads.

const SERIES_OPTIONS = eventSeries.options;
const REGION_OPTIONS = eventRegion.options;
const DIVISION_OPTIONS = hyroxDivision.options;

const SERIES_LABEL: Record<string, string> = {
  hyrox: 'HYROX',
  deka: 'DEKA',
  athx: 'AthX',
  deadly_dozen: 'Deadly Dozen',
  other: 'Otra',
};

const REGION_LABEL: Record<string, string> = {
  EU: 'Europa',
  NA: 'Norteamérica',
  APAC: 'Asia-Pacífico',
  LATAM: 'Latinoamérica',
  MEA: 'Oriente Medio / África',
};

// Slug that satisfies slugSchema (/^[a-z0-9][a-z0-9_-]*$/): lowercase, accents
// stripped, every other run collapsed to a single '-', trimmed.
function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

interface RaceFormModalProps {
  race: EventListItem | null;
  onClose: () => void;
  onSaved: () => void;
}

export function RaceFormModal({ race, onClose, onSaved }: RaceFormModalProps) {
  const isEdit = race != null;
  const titleId = useId();

  const [series, setSeries] = useState<string>(race?.series ?? 'hyrox');
  const [name, setName] = useState(race?.name ?? '');
  const [slug, setSlug] = useState(race?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(isEdit);
  const [location, setLocation] = useState(race?.location ?? '');
  const [country, setCountry] = useState(race?.country ?? '');
  const [region, setRegion] = useState<string>(race?.region ?? '');
  const [startDate, setStartDate] = useState(race?.start_date ?? '');
  const [endDate, setEndDate] = useState(race?.end_date ?? '');
  const [isTentative, setIsTentative] = useState(race?.is_tentative ?? false);
  const [divisions, setDivisions] = useState<string[]>(
    race?.division_options ?? ['Pro', 'Open', 'Doubles'],
  );
  const [sourceUrl, setSourceUrl] = useState(race?.source_url ?? '');
  const [sourceRef, setSourceRef] = useState(race?.source_ref ?? '');
  const [visible, setVisible] = useState(race?.is_visible_to_athletes ?? true);
  const [verified, setVerified] = useState(race?.is_verified ?? true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-fill slug from name+year until the admin edits it by hand.
  const autoSlug = useMemo(() => {
    const base = slugify(name);
    if (!base) return '';
    const year = startDate.slice(0, 4);
    return /^\d{4}$/.test(year) ? `${base}-${year}` : base;
  }, [name, startDate]);
  const effectiveSlug = slugTouched ? slug : autoSlug;

  function toggleDivision(value: string) {
    setDivisions((prev) =>
      prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    const finalSlug = effectiveSlug.trim();
    if (!trimmedName) {
      setError('La carrera necesita un nombre.');
      return;
    }
    if (!finalSlug) {
      setError('El identificador (slug) no puede estar vacío.');
      return;
    }
    if (!startDate && !isTentative) {
      setError('Indica una fecha, o marca «fecha por confirmar».');
      return;
    }
    const upperCountry = country.trim().toUpperCase();
    if (upperCountry && !/^[A-Z]{2}$/.test(upperCountry)) {
      setError('El país debe ser un código de 2 letras (ISO), p. ej. ES.');
      return;
    }

    // `type` is the broad category; derive it from the series brand, preserving a
    // pre-existing non-HYROX type (e.g. crossfit) when the series doesn't imply one.
    const derivedType: 'hyrox' | 'crossfit' | 'other' =
      series === 'hyrox'
        ? 'hyrox'
        : race?.type && race.type !== 'hyrox'
          ? race.type
          : 'other';

    const payload: Record<string, unknown> = {
      slug: finalSlug,
      name: trimmedName,
      type: derivedType,
      series: series || null,
      location: location.trim() || null,
      country: upperCountry || null,
      region: region || null,
      start_date: startDate || null,
      end_date: endDate || null,
      is_tentative: isTentative,
      // Headline division = first selected (legacy single field).
      division: divisions[0] ?? null,
      division_options: divisions,
      source_url: sourceUrl.trim() || null,
      source_ref: sourceRef.trim() || null,
      // `source` (origin identifier) is auto: the route defaults it to 'manual'
      // on create and leaves it untouched on edit — not a hand-edited field.
    };
    // On create the route defaults source='manual'; on edit, only touch verified
    // when it actually changed so we don't re-stamp verified_at on every save.
    if (!isEdit || verified !== race?.is_verified) {
      payload.verified = verified;
    }

    setSubmitting(true);
    try {
      const res = await fetch(
        isEdit ? `/api/admin/races/${race.event_id}` : '/api/admin/races',
        {
          method: isEdit ? 'PATCH' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(body?.error?.message ?? 'No se pudo guardar la carrera.');
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la carrera.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[color:var(--scrim)] p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-2xl rounded-[var(--r-m)] border border-[color:var(--border-subtle)] bg-[color:var(--surface)] shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-[color:var(--border-subtle)] px-5 py-4">
          <h2 id={titleId} className="font-display-xl text-[color:var(--fg)]">
            {isEdit ? 'Editar carrera' : 'Añadir carrera'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-8 w-8 items-center justify-center rounded-[var(--r-sm)] text-[color:var(--text-muted)] transition-colors hover:bg-[color:var(--surface-elevated)] hover:text-[color:var(--fg)]"
          >
            <MIcon name="close" size={18} />
          </button>
        </header>

        <div className="flex flex-col gap-5 px-5 py-5">
          {/* Serie + nombre */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Serie">
              <select
                value={series}
                onChange={(e) => setSeries(e.target.value)}
                className={selectClass}
              >
                {SERIES_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {SERIES_LABEL[s] ?? s}
                  </option>
                ))}
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Nombre">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="HYROX Barcelona"
                  className={inputClass}
                />
              </Field>
            </div>
          </div>

          {/* Slug */}
          <Field label="Identificador (slug)">
            <input
              value={effectiveSlug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              placeholder="hyrox-barcelona-2026"
              className={`${inputClass} font-mono`}
            />
          </Field>

          {/* Ciudad / país / región */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Ciudad / sede">
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Fira de Barcelona"
                className={inputClass}
              />
            </Field>
            <Field label="País (ISO-2)">
              <input
                value={country}
                onChange={(e) => setCountry(e.target.value.toUpperCase())}
                maxLength={2}
                placeholder="ES"
                className={`${inputClass} uppercase`}
              />
            </Field>
            <Field label="Región">
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className={selectClass}
              >
                <option value="">—</option>
                {REGION_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {REGION_LABEL[r] ?? r}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {/* Fechas */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Fecha inicio">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Fecha fin (opcional)">
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>

          <Checkbox
            checked={isTentative}
            onChange={setIsTentative}
            label="Fecha por confirmar"
            hint="Se mostrará como «por confirmar» hasta que la confirmes."
          />

          {/* Divisiones */}
          <Field label="Divisiones">
            <div className="flex flex-wrap gap-2">
              {DIVISION_OPTIONS.map((d) => {
                const on = divisions.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDivision(d)}
                    aria-pressed={on}
                    className={
                      on
                        ? 'rounded-full bg-[color:var(--accent)] px-3 py-1 text-xs font-bold text-[color:var(--accent-on)]'
                        : 'rounded-full border border-[color:var(--border-subtle)] px-3 py-1 text-xs font-semibold text-[color:var(--text-muted)] transition-colors hover:border-[color:var(--accent)] hover:text-[color:var(--fg)]'
                    }
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </Field>

          {/* Fuente */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="URL fuente (opcional)">
              <input
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://hyrox.com/event/…"
                className={inputClass}
              />
            </Field>
            <Field label="Ref. fuente (opcional)">
              <input
                value={sourceRef}
                onChange={(e) => setSourceRef(e.target.value)}
                placeholder="ID del scraper"
                className={inputClass}
              />
            </Field>
          </div>

          {/* Estado de curación */}
          <div className="flex flex-col gap-3 rounded-[var(--r-sm)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-lowest)] p-4">
            <Checkbox
              checked={visible}
              onChange={setVisible}
              label="Visible para atletas"
              hint="Si no, queda solo en el catálogo interno."
            />
            <Checkbox
              checked={verified}
              onChange={setVerified}
              label="Verificada"
              hint="Verificada por ti — el scraper no la sobrescribirá."
            />
          </div>

          {error ? (
            <p
              role="alert"
              className="text-sm text-[color:var(--danger)]"
            >
              {error}
            </p>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-[color:var(--border-subtle)] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-[var(--r-sm)] border border-[color:var(--border-subtle)] px-4 text-sm font-semibold text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--fg)]"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="h-10 rounded-[var(--r-sm)] bg-[color:var(--accent)] px-5 text-sm font-bold uppercase tracking-wide text-[color:var(--accent-on)] transition-colors hover:bg-[color:var(--accent-press)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear carrera'}
          </button>
        </footer>
      </form>
    </div>
  );
}

const inputClass =
  'h-11 w-full rounded-[var(--r-sm)] border border-[color:var(--border-subtle)] bg-[color:var(--bg)] px-3.5 text-sm text-[color:var(--fg)] outline-none transition-colors placeholder:text-[color:var(--text-muted)] focus:border-[color:var(--accent)]';

const selectClass = `${inputClass} appearance-none`;

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function Checkbox({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-[color:var(--accent)]"
      />
      <span className="flex flex-col">
        <span className="text-sm font-semibold text-[color:var(--fg)]">{label}</span>
        {hint ? (
          <span className="text-xs text-[color:var(--text-muted)]">{hint}</span>
        ) : null}
      </span>
    </label>
  );
}
