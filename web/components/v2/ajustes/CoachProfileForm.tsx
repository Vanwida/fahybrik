'use client';

// CoachProfileForm — the editable coach profile. One "Guardar cambios" persists
// every field (name, bio, photo, specialties, certifications, studio, location)
// via PATCH /api/coach/profile. The photo uploads to Vercel Blob first (POST
// /api/coach/profile/avatar) and its URL is saved with the rest, so a single
// save is atomic. Email is read-only (Clerk-owned). After a save we router
// .refresh() so the server shell (header name + avatar) reflects the change.

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { AthleteAvatar } from '@/components/v2/AthleteAvatar';
import { Card } from '@/components/ui/card';
import { TagInput } from './TagInput';
import { COACH_PROFILE_LIMITS } from '@/lib/coach/profile-schema';
import type { CoachProfile } from '@/lib/coach/profile';
import { cn } from '@/lib/utils';

const FIELD = cn(
  'v2-focus w-full rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)]',
  'bg-[color:var(--v2-surface-2)] px-3 py-2 text-sm text-[color:var(--v2-fg)]',
  'outline-none placeholder:text-[color:var(--v2-faint)] focus:border-[color:var(--v2-border-strong)]',
);

const BTN_PRIMARY = cn(
  'v2-focus inline-flex items-center justify-center gap-1.5 rounded-[var(--v2-r-m)]',
  'bg-[color:var(--v2-accent)] px-4 py-2 text-sm font-semibold text-[color:var(--v2-accent-fg)]',
  'disabled:cursor-not-allowed disabled:opacity-50',
);
const BTN_SECONDARY = cn(
  'v2-focus inline-flex items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)]',
  'bg-[color:var(--v2-surface)] px-3 py-1.5 text-sm font-semibold text-[color:var(--v2-fg)]',
  'hover:border-[color:var(--v2-border-strong)] disabled:cursor-not-allowed disabled:opacity-50',
);
const BTN_GHOST = cn(
  'v2-focus inline-flex items-center gap-1 rounded-[var(--v2-r-s)] px-2 py-1.5',
  'text-sm font-medium text-[color:var(--v2-muted)] hover:text-[color:var(--v2-danger)]',
);

// One-tap suggestions only — the coach can type anything; these never constrain
// what's stored (no enum), they just speed up the common picks.
const SPECIALTY_SUGGESTIONS = ['HYROX', 'Híbrido', 'Running', 'Fuerza', 'CrossFit', 'Resistencia', 'Trail'];
const CERT_SUGGESTIONS = ['HYROX Trainer', 'CrossFit L1', 'CrossFit L2', 'NSCA-CSCS'];

type FormState = {
  full_name: string;
  bio: string;
  avatar_url: string | null;
  specialties: string[];
  certifications: string[];
  studio_name: string;
  location: string;
};

function toForm(p: CoachProfile): FormState {
  return {
    full_name: p.full_name,
    bio: p.bio ?? '',
    avatar_url: p.avatar_url,
    specialties: p.specialties,
    certifications: p.certifications,
    studio_name: p.studio_name ?? '',
    location: p.location ?? '',
  };
}

export function CoachProfileForm({ initial }: { initial: CoachProfile }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const nameId = useId();
  const studioId = useId();
  const locationId = useId();
  const bioId = useId();

  const [saved, setSaved] = useState<FormState>(() => toForm(initial));
  const [form, setForm] = useState<FormState>(() => toForm(initial));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const nameInvalid = form.full_name.trim() === '';

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setOk(false);
  }

  const onPickPhoto = async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/coach/profile/avatar', { method: 'POST', body: fd });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error?.message ?? 'No se pudo subir la imagen.');
        return;
      }
      set('avatar_url', data.url as string);
    } catch {
      setError('No se pudo subir la imagen · Reintenta.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const save = async () => {
    if (nameInvalid) {
      setError('El nombre es obligatorio.');
      return;
    }
    setSaving(true);
    setError(null);
    setOk(false);
    try {
      const res = await fetch('/api/coach/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          full_name: form.full_name,
          bio: form.bio,
          avatar_url: form.avatar_url,
          specialties: form.specialties,
          certifications: form.certifications,
          studio_name: form.studio_name,
          location: form.location,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error?.message ?? 'No se pudieron guardar los cambios.');
        return;
      }
      const next = toForm(data.profile as CoachProfile);
      setSaved(next);
      setForm(next);
      setOk(true);
      router.refresh();
    } catch {
      setError('No se pudieron guardar los cambios · Reintenta.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="flex flex-col gap-5 p-4 sm:p-5">
      {/* Photo */}
      <div className="flex items-center gap-4">
        <AthleteAvatar name={form.full_name || initial.full_name} imageUrl={form.avatar_url} size="xl" />
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className={BTN_SECONDARY}
            >
              {uploading ? (
                <>
                  <MIcon name="progress_activity" size={16} className="animate-spin" />
                  Subiendo…
                </>
              ) : (
                <>
                  <MIcon name="photo_camera" size={16} />
                  {form.avatar_url ? 'Cambiar foto' : 'Subir foto'}
                </>
              )}
            </button>
            {form.avatar_url ? (
              <button type="button" onClick={() => set('avatar_url', null)} className={BTN_GHOST}>
                Quitar
              </button>
            ) : null}
          </div>
          <p className="text-label text-[color:var(--v2-muted)]">JPG, PNG o WEBP · máx. 4 MB</p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onPickPhoto(f);
          }}
        />
      </div>

      {/* Nombre */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={nameId} className="v2-micro">
          Nombre
        </label>
        <input
          id={nameId}
          type="text"
          value={form.full_name}
          maxLength={COACH_PROFILE_LIMITS.name}
          placeholder="Tu nombre completo"
          onChange={(e) => set('full_name', e.target.value)}
          className={cn(FIELD, nameInvalid && 'border-[color:var(--v2-danger)]')}
        />
        <p className="text-label text-[color:var(--v2-muted)]">
          Lo que ven tus atletas como su entrenador.
        </p>
      </div>

      {/* Email (read-only) */}
      <div className="flex flex-col gap-1.5">
        <span className="v2-micro">Email</span>
        <div className="flex items-center gap-2 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 py-2">
          <MIcon name="lock" size={15} className="text-[color:var(--v2-faint)]" aria-hidden />
          <span className="truncate text-sm text-[color:var(--v2-muted)]">{initial.email}</span>
        </div>
      </div>

      {/* Box / estudio + Ubicación */}
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={studioId} className="v2-micro">
            Box / estudio
          </label>
          <input
            id={studioId}
            type="text"
            value={form.studio_name}
            maxLength={COACH_PROFILE_LIMITS.studio}
            placeholder="Ej: nombre de tu club o estudio"
            onChange={(e) => set('studio_name', e.target.value)}
            className={FIELD}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={locationId} className="v2-micro">
            Ubicación
          </label>
          <input
            id={locationId}
            type="text"
            value={form.location}
            maxLength={COACH_PROFILE_LIMITS.location}
            placeholder="Barcelona, España"
            onChange={(e) => set('location', e.target.value)}
            className={FIELD}
          />
        </div>
      </div>

      {/* Bio */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={bioId} className="v2-micro">
          Bio
        </label>
        <textarea
          id={bioId}
          value={form.bio}
          maxLength={COACH_PROFILE_LIMITS.bio}
          rows={4}
          placeholder="Cuéntales quién eres, tu enfoque y tu experiencia."
          onChange={(e) => set('bio', e.target.value)}
          className={cn(FIELD, 'resize-y leading-relaxed')}
        />
        <p className="self-end text-label tabular-nums text-[color:var(--v2-faint)]">
          {form.bio.length}/{COACH_PROFILE_LIMITS.bio}
        </p>
      </div>

      {/* Especialidades */}
      <TagInput
        label="Especialidades"
        hint="Disciplinas en las que entrenas. Pulsa Enter para añadir."
        values={form.specialties}
        placeholder="HYROX, running, fuerza…"
        maxTags={COACH_PROFILE_LIMITS.tags}
        maxTagLength={COACH_PROFILE_LIMITS.tag}
        suggestions={SPECIALTY_SUGGESTIONS}
        onChange={(next) => set('specialties', next)}
      />

      {/* Certificaciones */}
      <TagInput
        label="Certificaciones"
        hint="Tus titulaciones y acreditaciones."
        values={form.certifications}
        placeholder="HYROX Trainer, CrossFit L2…"
        maxTags={COACH_PROFILE_LIMITS.tags}
        maxTagLength={COACH_PROFILE_LIMITS.tag}
        suggestions={CERT_SUGGESTIONS}
        onChange={(next) => set('certifications', next)}
      />

      {/* Actions */}
      <div className="flex items-center justify-between gap-3 border-t border-[color:var(--v2-border)] pt-4">
        <div className="min-h-[1.25rem] text-xs" aria-live="polite">
          {error ? (
            <span className="text-[color:var(--v2-danger)]">{error}</span>
          ) : ok ? (
            <span className="inline-flex items-center gap-1 text-[color:var(--v2-ok)]">
              <MIcon name="check_circle" size={14} />
              Guardado
            </span>
          ) : dirty ? (
            <span className="text-[color:var(--v2-muted)]">Cambios sin guardar</span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving || nameInvalid}
          className={BTN_PRIMARY}
        >
          {saving ? (
            <>
              <MIcon name="progress_activity" size={16} className="animate-spin" />
              Guardando…
            </>
          ) : (
            'Guardar cambios'
          )}
        </button>
      </div>
    </Card>
  );
}
