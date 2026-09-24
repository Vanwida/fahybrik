'use client';

// Tu perfil — la PERSONA: nombre, foto, bio, especialidades y titulaciones.
// Lo del club (nombre del club, box, dirección) vive en Tu club: un campo, un
// sitio. Cada campo se guarda al salir de él (PATCH /api/coach/profile con esa
// sola clave). La foto va por su propio camino y se guarda al elegirla (sube
// directa a Cloudflare: no puede esperar a nada).

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera } from 'lucide-react';
import { Avatar, Button } from '@/components/v2/ui';
import { COACH_PROFILE_LIMITS } from '@/lib/coach/profile-schema';
import type { CoachProfile } from '@/lib/coach/profile';
import {
  deleteProfilePhoto,
  PROFILE_PHOTO_ACCEPT_ATTR,
  PROFILE_PHOTO_ACCEPTED_LABEL,
  PROFILE_PHOTO_MAX_LABEL,
  ProfilePhotoUploadError,
  uploadProfilePhoto,
} from '@/lib/profile/photo-upload-client';
import { PROFILE_PHOTO_VARIANTS, profilePhotoUrl } from '@/lib/profile/photo-source';
import { SettingRow, SettingsSection, TextSetting } from './SettingsKit';
import { TagSetting } from './TagSetting';
import { sendJson, useSaveState, type SaveResult } from './autosave';

// Atajos de un toque; nunca limitan lo que se guarda (no es un enum).
const SPECIALTY_SUGGESTIONS = ['Híbrido', 'Running', 'Fuerza', 'Resistencia', 'Trail'];

type ProfileKey = 'full_name' | 'bio' | 'specialties' | 'certifications';

export function PerfilForm({ initial }: { initial: CoachProfile }) {
  const router = useRouter();

  const patch = (key: ProfileKey) => async (value: string | string[]): Promise<SaveResult> => {
    const res = await sendJson<{ profile: CoachProfile }>('/api/coach/profile', 'PATCH', { [key]: value });
    if (!res.ok) return res;
    // El nombre y la foto se pintan en el servidor (menú de cuenta): refrescar.
    if (key === 'full_name') router.refresh();
    return { ok: true };
  };

  return (
    <div className="flex flex-col gap-6">
      <SettingsSection title="Tú">
        <PhotoRow name={initial.full_name} initialUrl={initial.avatar_url} />
        <TextSetting
          label="Nombre"
          hint="Es el nombre que ven tus atletas como su entrenador."
          value={initial.full_name}
          save={patch('full_name')}
          maxLength={COACH_PROFILE_LIMITS.name}
          required
          autoComplete="name"
        />
        <TextSetting
          label="Bio"
          hint="Quién eres y cómo trabajas, en pocas líneas."
          value={initial.bio ?? ''}
          save={patch('bio')}
          maxLength={COACH_PROFILE_LIMITS.bio}
          multiline
          rows={4}
          showCount
        />
      </SettingsSection>

      <SettingsSection title="Trayectoria">
        <TagSetting
          label="Especialidades"
          hint="Enter para añadir cada una."
          values={initial.specialties}
          save={(next) => patch('specialties')(next)}
          placeholder="Escribe una especialidad"
          maxTags={COACH_PROFILE_LIMITS.tags}
          maxTagLength={COACH_PROFILE_LIMITS.tag}
          suggestions={SPECIALTY_SUGGESTIONS}
        />
        <TagSetting
          label="Titulaciones"
          hint="Tus certificaciones y acreditaciones."
          values={initial.certifications}
          save={(next) => patch('certifications')(next)}
          placeholder="Escribe una titulación"
          maxTags={COACH_PROFILE_LIMITS.tags}
          maxTagLength={COACH_PROFILE_LIMITS.tag}
        />
      </SettingsSection>
    </div>
  );
}

function PhotoRow({ name, initialUrl }: { name: string; initialUrl: string | null }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState<'subir' | 'quitar' | null>(null);
  const { state, error, run } = useSaveState();

  const pick = async (file: File) => {
    setBusy('subir');
    await run(async () => {
      try {
        setUrl(await uploadProfilePhoto(file));
        router.refresh();
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof ProfilePhotoUploadError ? err.message : 'No se ha podido subir la foto.',
        };
      }
    });
    setBusy(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const remove = async () => {
    setBusy('quitar');
    await run(async () => {
      try {
        await deleteProfilePhoto();
        setUrl(null);
        router.refresh();
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof ProfilePhotoUploadError ? err.message : 'No se ha podido quitar la foto.',
        };
      }
    });
    setBusy(null);
  };

  return (
    <SettingRow
      label="Foto"
      status={state}
      error={error}
      hint={`${PROFILE_PHOTO_ACCEPTED_LABEL} · hasta ${PROFILE_PHOTO_MAX_LABEL}. Se guarda al elegirla.`}
    >
      <div className="flex items-center gap-4">
        <Avatar
          name={name}
          src={profilePhotoUrl(url, PROFILE_PHOTO_VARIANTS.ficha)}
          className="size-16 text-[16px]"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            icon={Camera}
            loading={busy === 'subir'}
            disabled={busy !== null}
            onClick={() => fileRef.current?.click()}
          >
            {url ? 'Cambiar foto' : 'Subir foto'}
          </Button>
          {url ? (
            <Button variant="ghost" loading={busy === 'quitar'} disabled={busy !== null} onClick={() => void remove()}>
              Quitar
            </Button>
          ) : null}
        </div>
        {/* El selector del sistema: invisible, lo abre el botón de arriba. */}
        <input
          ref={fileRef}
          type="file"
          accept={PROFILE_PHOTO_ACCEPT_ATTR}
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pick(f);
          }}
        />
      </div>
    </SettingRow>
  );
}
