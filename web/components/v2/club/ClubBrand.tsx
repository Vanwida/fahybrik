'use client';

// Lockup del club en el chrome del dashboard: icono + wordmark.
// Vacío = marca de este binario. El color lo pinta --v2-accent en .v2-root.

import type { CSSProperties } from 'react';
import {
  BRAND_WORDMARK,
  resolveClubBrand,
  splitWordmark,
} from '@fahybrid/shared/domain/coach/club-skin';
import { PROFILE_PHOTO_VARIANTS, profilePhotoUrl } from '@/lib/profile/photo-source';
import { cn } from '@/lib/utils';

export function ClubMark({
  src,
  alt,
  className,
  style,
}: {
  src: string;
  alt: string;
  className?: string;
  /** Solo para pintarlo sobre un lienzo que no es el del panel (vista previa). */
  style?: CSSProperties;
}) {
  const painted = profilePhotoUrl(src, PROFILE_PHOTO_VARIANTS.lista) ?? src;
  return (
    <img
      src={painted}
      alt={alt}
      className={cn('rounded-[var(--v2-r-s)] object-contain', className)}
      style={style}
    />
  );
}

/**
 * El wordmark en dos tintas es un rasgo de NUESTRA marca (FA + HYBRID), no una
 * regla tipográfica que valga para cualquier nombre: partir «CrossFit Bar» y
 * pintar «Bar» del color del club sale mal. El nombre de un club se pinta de
 * una pieza; el split se reserva para la marca del binario.
 */
export function ClubWordmark({ name, split = false }: { name: string; split?: boolean }) {
  const { lead, accent } = splitWordmark(name);
  if (!split) {
    return <span className="v2-display tracking-[-0.02em] text-[color:var(--v2-fg)]">{name}</span>;
  }
  return (
    <span className="v2-display tracking-[-0.02em]">
      {lead ? <span className="text-[color:var(--v2-fg)]">{lead}</span> : null}
      <span className="text-[color:var(--v2-accent-text)]">{accent}</span>
    </span>
  );
}

export function ClubLockup({
  name,
  logo_url,
  markClassName,
  wordmarkClassName,
}: {
  name: string | null;
  logo_url: string | null;
  markClassName?: string;
  wordmarkClassName?: string;
}) {
  const brand = resolveClubBrand({ name, logo_url });
  return (
    <>
      <ClubMark src={brand.logo_src} alt={brand.wordmark} className={markClassName} />
      <span className={wordmarkClassName}>
        <ClubWordmark name={brand.wordmark} split={brand.using_default_name} />
      </span>
    </>
  );
}

export function clubBrandLabel(name: string | null): string {
  return resolveClubBrand({ name, logo_url: null }).wordmark || BRAND_WORDMARK;
}
