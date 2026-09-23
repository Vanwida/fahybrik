'use client';

// Tu club — el ÚNICO sitio para lo del club: nombre, logo, color, nombre del
// box, dirección y el correo que recibe los avisos. Cada campo se guarda al
// salir (nombre, color y correo por PATCH /api/coach/club; box y dirección por
// PATCH /api/coach/profile, que son sus columnas). El logo se guarda al elegirlo.
// La vista previa doble se repinta mientras se escribe el color.

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ImagePlus } from 'lucide-react';
import {
  CLUB_SKIN_NAME_MAX,
  parseAccentHex,
  resolveClubBrand,
} from '@fahybrid/shared/domain/coach/club-skin';
import type { ClubFicha } from '@fahybrid/shared/schema/coach-club-skin';
import { Button, Input } from '@/components/v2/ui';
import { ClubMark } from '@/components/v2/club/ClubBrand';
import { ClubSkinPreview } from '@/components/v2/club/ClubSkinPreview';
import { SettingRow, SettingsSection, TextSetting } from '@/components/v2/ajustes/SettingsKit';
import { sendJson, useSaveState, type SaveResult } from '@/components/v2/ajustes/autosave';
import { COACH_PROFILE_LIMITS } from '@/lib/coach/profile-schema';
import {
  CLUB_LOGO_ACCEPT_ATTR,
  CLUB_LOGO_ACCEPTED_LABEL,
  CLUB_LOGO_MAX_LABEL,
  ClubLogoUploadError,
  deleteClubLogo,
  uploadClubLogo,
} from '@/lib/coach/club-logo-client';
import { PROFILE_PHOTO_VARIANTS, profilePhotoUrl } from '@/lib/profile/photo-source';

/** Sin color elegido, la muestra es gris: el panel usa su neutro, no un color inventado. */
const NO_ACCENT_SWATCH = '#8c8c8c';

export interface ClubFormInitial {
  club: ClubFicha;
  studio_name: string | null;
  location: string | null;
}

export function ClubForm({ initial }: { initial: ClubFormInitial }) {
  const router = useRouter();
  const [name, setName] = useState(initial.club.name ?? '');
  const [logo, setLogo] = useState<string | null>(initial.club.logo_url);
  const [accent, setAccent] = useState<string | null>(initial.club.accent_hex);

  const patchClub = (key: 'name' | 'notify_email') => async (value: string): Promise<SaveResult> => {
    const res = await sendJson<{ club: ClubFicha }>('/api/coach/club', 'PATCH', { [key]: value });
    if (!res.ok) return res;
    if (key === 'name') {
      setName(res.data.club.name ?? '');
      router.refresh();
    }
    return { ok: true };
  };
  const patchProfile = (key: 'studio_name' | 'location') => async (value: string): Promise<SaveResult> => {
    const res = await sendJson('/api/coach/profile', 'PATCH', { [key]: value });
    return res.ok ? { ok: true } : res;
  };

  const brand = resolveClubBrand({ name: name || null, logo_url: logo });
  const logoSrc = profilePhotoUrl(logo, PROFILE_PHOTO_VARIANTS.ficha) ?? brand.logo_src;

  return (
    <div className="flex flex-col gap-6">
      <SettingsSection title="Marca">
        <LogoRow logo={logo} logoSrc={logoSrc} wordmark={brand.wordmark} onChange={setLogo} />
        <TextSetting
          label="Nombre del club"
          hint="Es la marca que ven tus atletas en la app. Si lo dejas vacío, se usa la de la app."
          value={initial.club.name ?? ''}
          save={async (v) => {
            const r = await patchClub('name')(v);
            return r;
          }}
          maxLength={CLUB_SKIN_NAME_MAX}
        />
        <AccentRow initialHex={initial.club.accent_hex} onPreview={setAccent} />
        <div className="px-4 pt-1 pb-4">
          <ClubSkinPreview accentHex={accent} wordmark={brand.wordmark} logoSrc={logoSrc} />
        </div>
      </SettingsSection>

      <SettingsSection title="Dónde entrenáis">
        <TextSetting
          label="Nombre del box o estudio"
          hint="Sale en el correo y en el calendario de quien reserva una sesión presencial."
          value={initial.studio_name ?? ''}
          save={patchProfile('studio_name')}
          maxLength={COACH_PROFILE_LIMITS.studio}
        />
        <TextSetting
          label="Dirección"
          hint="Calle y número. Opcional si con el nombre del box basta."
          value={initial.location ?? ''}
          save={patchProfile('location')}
          maxLength={COACH_PROFILE_LIMITS.location}
          autoComplete="street-address"
        />
      </SettingsSection>

      <SettingsSection title="Avisos">
        <TextSetting
          label="Correo que recibe los avisos"
          hint="Leads nuevos, citas y bajas. Si lo dejas vacío, no se manda nada."
          value={initial.club.notify_email ?? ''}
          save={patchClub('notify_email')}
          type="email"
          autoComplete="email"
          placeholder="avisos@tuclub.com"
        />
      </SettingsSection>
    </div>
  );
}

function LogoRow({
  logo,
  logoSrc,
  wordmark,
  onChange,
}: {
  logo: string | null;
  logoSrc: string;
  wordmark: string;
  onChange: (url: string | null) => void;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'subir' | 'quitar' | null>(null);
  const { state, error, run } = useSaveState();

  const act = async (kind: 'subir' | 'quitar', file?: File) => {
    setBusy(kind);
    await run(async () => {
      try {
        onChange(kind === 'subir' && file ? await uploadClubLogo(file) : (await deleteClubLogo(), null));
        router.refresh();
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          message:
            err instanceof ClubLogoUploadError
              ? err.message
              : kind === 'subir'
                ? 'No se ha podido subir el logo.'
                : 'No se ha podido quitar el logo.',
        };
      }
    });
    setBusy(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <SettingRow
      label="Logo"
      status={state}
      error={error}
      hint={`Cuadrado, ${CLUB_LOGO_ACCEPTED_LABEL}, hasta ${CLUB_LOGO_MAX_LABEL}. Sin logo se usa el icono de la app.`}
    >
      <div className="flex items-center gap-4">
        <ClubMark src={logoSrc} alt={wordmark} className="size-16 shrink-0 border border-v2-border bg-v2-surface-2" />
        <div className="flex flex-wrap items-center gap-2">
          <Button icon={ImagePlus} loading={busy === 'subir'} disabled={busy !== null} onClick={() => fileRef.current?.click()}>
            {logo ? 'Cambiar logo' : 'Subir logo'}
          </Button>
          {logo ? (
            <Button variant="ghost" loading={busy === 'quitar'} disabled={busy !== null} onClick={() => void act('quitar')}>
              Quitar
            </Button>
          ) : null}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept={CLUB_LOGO_ACCEPT_ATTR}
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void act('subir', f);
          }}
        />
      </div>
    </SettingRow>
  );
}

/**
 * El color: selector del sistema + hexadecimal. La vista previa sigue a lo que
 * se escribe; se guarda al salir del campo (o medio segundo después de dejar
 * de mover el selector). «Sin color» vuelve al neutro del panel.
 */
function AccentRow({ initialHex, onPreview }: { initialHex: string | null; onPreview: (hex: string | null) => void }) {
  const id = useId();
  const [draft, setDraft] = useState(initialHex ?? '');
  const [saved, setSaved] = useState(initialHex ?? '');
  const { state, error, run } = useSaveState();
  const pickerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const parsed = parseAccentHex(draft);

  useEffect(() => () => {
    if (pickerTimer.current) clearTimeout(pickerTimer.current);
  }, []);

  const commit = async (value: string) => {
    const p = parseAccentHex(value);
    if (!p.ok) return;
    const normalized = p.hex ?? '';
    if (normalized === saved) return;
    const ok = await run(async () => {
      const res = await sendJson<{ club: ClubFicha }>('/api/coach/club', 'PATCH', { accent_hex: normalized });
      return res.ok ? { ok: true } : res;
    });
    if (ok) {
      setSaved(normalized);
      setDraft(normalized);
    }
  };

  const change = (value: string, fromPicker = false) => {
    setDraft(value);
    const p = parseAccentHex(value);
    if (p.ok) onPreview(p.hex);
    if (fromPicker) {
      if (pickerTimer.current) clearTimeout(pickerTimer.current);
      pickerTimer.current = setTimeout(() => void commit(value), 500);
    }
  };

  return (
    <SettingRow
      label="Color"
      htmlFor={id}
      hintId={`${id}-hint`}
      status={parsed.ok ? state : 'error'}
      error={parsed.ok ? error : 'Escribe el color como #RRGGBB.'}
      hint="Va en el botón principal, el anillo de foco y la app de tus atletas. Sin color, el panel usa su neutro."
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="relative size-10 shrink-0 overflow-hidden rounded-ctl border border-v2-border-strong [&>input]:absolute [&>input]:-inset-2 [&>input]:size-14 [&>input]:cursor-pointer">
          <input
            type="color"
            aria-label="Elegir color"
            value={(parsed.ok && parsed.hex) || NO_ACCENT_SWATCH}
            onChange={(e) => change(e.target.value, true)}
          />
        </span>
        <Input
          id={id}
          size="lg"
          value={draft}
          placeholder="Sin color"
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          invalid={!parsed.ok}
          aria-describedby={`${id}-hint`}
          onChange={(e) => change(e.target.value)}
          onBlur={() => void commit(draft)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
          }}
          className="w-36 font-mono uppercase placeholder:normal-case placeholder:font-sans"
        />
        {saved !== '' ? (
          <Button
            variant="ghost"
            onClick={() => {
              change('');
              void commit('');
            }}
          >
            Sin color
          </Button>
        ) : null}
      </div>
    </SettingRow>
  );
}
