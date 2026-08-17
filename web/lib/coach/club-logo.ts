import 'server-only';

// Logo del club — la misma danza que la foto de perfil (reservar → Cloudflare
// → confirmar), pero escribe coaches.club_logo_url. No toca avatar_url.

import { sql } from '@/lib/db';
import {
  CloudflareMediaError,
  cloudflareAccountFetch,
} from '@/lib/cloudflare/api';
import { reserveProfilePhotoUpload } from '@/lib/profile/photo';
import { profilePhotoBaseFrom, profilePhotoImageId } from '@/lib/profile/photo-source';

interface ImagesDetail {
  id: string;
  meta?: Record<string, string> | null;
  variants?: string[] | null;
}

function ownerTag(coach_id: bigint): string {
  return `coach:${coach_id}`;
}

export function reserveClubLogoUpload(args: {
  coach_id: bigint;
  filename: string;
}) {
  return reserveProfilePhotoUpload({
    principal: { kind: 'coach', id: args.coach_id },
    filename: args.filename,
  });
}

async function readImage(imageId: string): Promise<ImagesDetail | null> {
  return cloudflareAccountFetch<ImagesDetail>(`/images/v1/${encodeURIComponent(imageId)}`, {
    method: 'GET',
    allowMissing: true,
  });
}

async function deleteImage(imageId: string): Promise<void> {
  await cloudflareAccountFetch(`/images/v1/${encodeURIComponent(imageId)}`, {
    method: 'DELETE',
    allowMissing: true,
  });
}

async function readStoredLogo(coach_id: bigint): Promise<string | null> {
  const rows = await sql<{ club_logo_url: string | null }[]>`
    select club_logo_url from coaches where id = ${Number(coach_id)} limit 1
  `;
  return rows[0]?.club_logo_url ?? null;
}

async function writeStoredLogo(coach_id: bigint, url: string | null): Promise<void> {
  await sql`
    update coaches
    set club_logo_url = ${url}, updated_at = now()
    where id = ${Number(coach_id)}
  `;
}

export async function confirmClubLogo(args: {
  coach_id: bigint;
  image_id: string;
}): Promise<{ logo_url: string }> {
  const image = await readImage(args.image_id);
  if (!image || image.meta?.owner !== ownerTag(args.coach_id)) {
    throw new CloudflareMediaError('not_found', 'Ese logo no se ha subido.', 404);
  }

  const base = profilePhotoBaseFrom(image.variants?.[0]);
  if (!base) {
    throw new CloudflareMediaError(
      'storage_unavailable',
      'El logo se subió pero no se pudo localizar.',
      502,
    );
  }

  const previous = profilePhotoImageId(await readStoredLogo(args.coach_id));
  await writeStoredLogo(args.coach_id, base);
  if (previous && previous !== image.id) await deleteImage(previous);

  return { logo_url: base };
}

export async function removeClubLogo(coach_id: bigint): Promise<void> {
  const current = profilePhotoImageId(await readStoredLogo(coach_id));
  await writeStoredLogo(coach_id, null);
  if (current) await deleteImage(current);
}
