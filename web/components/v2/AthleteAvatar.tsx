// AthleteAvatar — la cara de una persona: su foto cuando la hay, y sus iniciales
// cuando no. Relleno neutro (ningún color por persona) para que nunca compita con los
// ejes de color de modalidad y estado. Lo usan atletas y entrenadores por igual.
//
// SIN FOTO SE PINTAN LAS INICIALES, que es un vacío honesto. Nunca un muñeco gris: un
// marcador de posición se lee como «esta foto no cargó» y hace dudar de si el fallo es
// de la app.
//
// EL TAMAÑO SE PIDE, NO SE RECORTA AQUÍ. `imageUrl` es la BASE de entrega de Cloudflare
// Images —sin variante— y este componente le añade la variante que corresponde a SU
// tamaño. Es el único sitio de la app que hace esa traducción: por eso ninguna vista
// tiene que saber cuántos píxeles mide su círculo, y por eso un listado de cien atletas
// no descarga cien originales para meterlos en 28 px.
//
// `unoptimized` a propósito: Cloudflare ya entrega el tamaño exacto en el formato que
// soporte ese navegador. Pasarlo además por el optimizador de la plataforma sería pagar
// dos veces el mismo trabajo y añadir un salto de red por foto.

import Image from 'next/image';
import { initialsFromName } from '@/lib/dashboard/athletes/discipline-label';
import { PROFILE_PHOTO_VARIANTS, profilePhotoUrl } from '@/lib/profile/photo-source';
import { cn } from '@/lib/utils';

type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE: Record<AvatarSize, string> = {
  sm: 'h-7 w-7 text-eyebrow',
  md: 'h-9 w-9 text-xs',
  lg: 'h-12 w-12 text-sm',
  xl: 'h-16 w-16 text-base',
};

const SIZE_PX: Record<AvatarSize, number> = { sm: 28, md: 36, lg: 48, xl: 64 };

/** Qué variante pide cada tamaño. El retrato grande es el único que necesita la
 *  variante de ficha; los círculos de listado se sirven de sobra con la pequeña. */
const SIZE_VARIANT: Record<AvatarSize, (typeof PROFILE_PHOTO_VARIANTS)[keyof typeof PROFILE_PHOTO_VARIANTS]> =
  {
    sm: PROFILE_PHOTO_VARIANTS.lista,
    md: PROFILE_PHOTO_VARIANTS.lista,
    lg: PROFILE_PHOTO_VARIANTS.lista,
    xl: PROFILE_PHOTO_VARIANTS.ficha,
  };

export function AthleteAvatar({
  name,
  imageUrl,
  size = 'md',
  className,
}: {
  name: string;
  /** Base de entrega de la foto; cuando la hay, sustituye a las iniciales. */
  imageUrl?: string | null;
  size?: AvatarSize;
  className?: string;
}) {
  const base = cn(
    'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold',
    'bg-[color:var(--v2-surface-2)] text-[color:var(--v2-muted)]',
    'ring-1 ring-inset ring-[color:var(--v2-border)]',
    SIZE[size],
    className,
  );

  const src = profilePhotoUrl(imageUrl, SIZE_VARIANT[size]);

  if (src) {
    return (
      <span aria-hidden className={base}>
        <Image
          src={src}
          alt=""
          fill
          unoptimized
          sizes={`${SIZE_PX[size]}px`}
          className="object-cover"
        />
      </span>
    );
  }

  return (
    <span aria-hidden className={base}>
      {initialsFromName(name)}
    </span>
  );
}
