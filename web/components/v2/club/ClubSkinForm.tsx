'use client';

// Ficha del club: nombre, logo y acento. Vacío = marca de este binario.
// El logo se guarda al elegirlo (igual que la foto de perfil). Nombre y color
// van juntos en PATCH /api/coach/club.

import { useId, useRef, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import {
  BRAND_ACCENT_HEX,
  BRAND_WORDMARK,
  CLUB_SKIN_NAME_MAX,
  clubAccentCssVars,
  parseAccentHex,
  resolveClubBrand,
  type ClubSkin,
} from '@fahybrid/shared/domain/coach/club-skin';
import { MIcon } from '@/components/ui/MIcon';
import { Card } from '@/components/ui/card';
import {
  ajustesButtonGhost as BTN_GHOST,
  ajustesButtonPrimary as BTN_PRIMARY,
  ajustesButtonSecondary as BTN_SECONDARY,
  ajustesField as FIELD,
} from '@/components/v2/ajustes/controls';
import { ClubMark } from '@/components/v2/club/ClubBrand';
import {
  CLUB_LOGO_ACCEPT_ATTR,
  CLUB_LOGO_ACCEPTED_LABEL,
  CLUB_LOGO_MAX_LABEL,
  ClubLogoUploadError,
  deleteClubLogo,
  uploadClubLogo,
} from '@/lib/coach/club-logo-client';
import { PROFILE_PHOTO_VARIANTS, profilePhotoUrl } from '@/lib/profile/photo-source';

type FormState = {
  name: string;
  accent_hex: string;
};

function toForm(s: ClubSkin): FormState {
  return {
    name: s.name ?? '',
    accent_hex: s.accent_hex ?? '',
  };
}

export function ClubSkinForm({ initial }: { initial: ClubSkin }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const nameId = useId();
  const colorId = useId();
  const hexId = useId();

  const [saved, setSaved] = useState<FormState>(() => toForm(initial));
  const [form, setForm] = useState<FormState>(() => toForm(initial));
  const [logo, setLogo] = useState<string | null>(initial.logo_url);
  const [saving, setSaving] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const hexParsed = parseAccentHex(form.accent_hex);
  const hexInvalid = !hexParsed.ok;

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setOk(false);
  }

  const onPickLogo = async (file: File) => {
    setError(null);
    setOk(false);
    setLogoBusy(true);
    try {
      setLogo(await uploadClubLogo(file));
      router.refresh();
    } catch (err) {
      setError(err instanceof ClubLogoUploadError ? err.message : 'No se pudo subir el logo. Reintenta.');
    } finally {
      setLogoBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const onRemoveLogo = async () => {
    setError(null);
    setOk(false);
    setLogoBusy(true);
    try {
      await deleteClubLogo();
      setLogo(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof ClubLogoUploadError ? err.message : 'No se pudo quitar el logo. Reintenta.');
    } finally {
      setLogoBusy(false);
    }
  };

  const save = async () => {
    if (hexInvalid) {
      setError('El color tiene que ser #RRGGBB.');
      return;
    }
    setSaving(true);
    setError(null);
    setOk(false);
    try {
      const res = await fetch('/api/coach/club', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          accent_hex: form.accent_hex,
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { club?: ClubSkin; error?: { message?: string } }
        | null;
      if (!res.ok) {
        setError(data?.error?.message ?? 'No se pudieron guardar los cambios.');
        return;
      }
      if (!data?.club) {
        setError('No se pudieron guardar los cambios.');
        return;
      }
      const next = toForm(data.club);
      setSaved(next);
      setForm(next);
      setLogo(data.club.logo_url);
      setOk(true);
      router.refresh();
    } catch {
      setError('No se pudieron guardar los cambios · Reintenta.');
    } finally {
      setSaving(false);
    }
  };

  const previewHex = hexParsed.ok ? hexParsed.hex : saved.accent_hex;
  const previewVars = clubAccentCssVars(previewHex) as CSSProperties;
  const brand = resolveClubBrand({ name: form.name || null, logo_url: logo });
  const pickerValue = (previewHex ?? BRAND_ACCENT_HEX).toLowerCase();
  const logoSrc = profilePhotoUrl(logo, PROFILE_PHOTO_VARIANTS.ficha) ?? brand.logo_src;

  return (
    <Card className="flex flex-col gap-5 p-4 sm:p-5">
      <div className="flex items-center gap-4">
        <ClubMark src={logoSrc} alt={brand.wordmark} className="h-16 w-16 shrink-0 bg-[color:var(--v2-surface-2)]" />
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={logoBusy}
              className={BTN_SECONDARY}
            >
              {logoBusy ? (
                <>
                  <MIcon name="progress_activity" size={16} className="animate-spin" />
                  Subiendo…
                </>
              ) : (
                <>
                  <MIcon name="add_photo_alternate" size={16} />
                  {logo ? 'Cambiar logo' : 'Subir logo'}
                </>
              )}
            </button>
            {logo ? (
              <button type="button" onClick={() => void onRemoveLogo()} disabled={logoBusy} className={BTN_GHOST}>
                Quitar
              </button>
            ) : null}
          </div>
          <p className="text-xs text-[color:var(--v2-muted)]">
            Marca cuadrada, {CLUB_LOGO_ACCEPTED_LABEL}. Tope {CLUB_LOGO_MAX_LABEL}. Vacío = icono de{' '}
            {BRAND_WORDMARK}.
          </p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept={CLUB_LOGO_ACCEPT_ATTR}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onPickLogo(file);
          }}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={nameId} className="text-xs font-semibold text-[color:var(--v2-muted)]">
          Nombre del club
        </label>
        <input
          id={nameId}
          value={form.name}
          maxLength={CLUB_SKIN_NAME_MAX}
          placeholder={BRAND_WORDMARK}
          onChange={(e) => set('name', e.target.value)}
          className={FIELD}
        />
        <p className="text-xs text-[color:var(--v2-muted)]">
          Vacío = se pinta {BRAND_WORDMARK}. No es tu nombre de persona (eso sigue en Ajustes).
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-[color:var(--v2-muted)]">Color de acento</span>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={colorId} className="sr-only">
            Elegir color
          </label>
          <input
            id={colorId}
            type="color"
            value={pickerValue}
            onChange={(e) => set('accent_hex', e.target.value)}
            className="h-10 w-12 cursor-pointer rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-1"
          />
          <label htmlFor={hexId} className="sr-only">
            Color en hexadecimal
          </label>
          <input
            id={hexId}
            value={form.accent_hex}
            placeholder={BRAND_ACCENT_HEX}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            onChange={(e) => set('accent_hex', e.target.value)}
            className={`${FIELD} max-w-[10rem] font-mono uppercase`}
          />
          {form.accent_hex !== '' ? (
            <button type="button" onClick={() => set('accent_hex', '')} className={BTN_GHOST}>
              Usar marca
            </button>
          ) : null}
        </div>
        {hexInvalid ? (
          <p className="text-xs text-[color:var(--v2-danger)]">El color tiene que ser #RRGGBB.</p>
        ) : (
          <p className="text-xs text-[color:var(--v2-muted)]">
            Vacío = naranja de marca. Se aplica a botones, foco y el rail activo del dashboard.
          </p>
        )}
      </div>

      <div
        style={previewVars}
        className="flex items-center justify-between gap-3 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 py-3"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="h-8 w-8 shrink-0 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)]" aria-hidden />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[color:var(--v2-fg)]">{brand.wordmark}</p>
            <p className="text-xs text-[color:var(--v2-muted)]">Así se lee el acento</p>
          </div>
        </div>
        <span className="inline-flex h-9 shrink-0 items-center rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-3 text-sm font-semibold text-[color:var(--v2-accent-fg)]">
          Acción
        </span>
      </div>

      {error ? <p className="text-sm text-[color:var(--v2-danger)]">{error}</p> : null}
      {ok && !dirty ? <p className="text-sm font-medium text-[color:var(--v2-ok)]">Guardado</p> : null}

      <div className="flex justify-end">
        <button type="button" onClick={() => void save()} disabled={!dirty || saving || hexInvalid} className={BTN_PRIMARY}>
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </Card>
  );
}
