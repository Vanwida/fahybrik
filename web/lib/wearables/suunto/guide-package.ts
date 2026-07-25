// Empaqueta un `WatchWorkout` en el ZIP que se sube a la Cloud API.
//
// El PDF ("Prepare Suuntoplus Guide File") pide un ZIP con EXACTAMENTE tres
// ficheros, con estos nombres:
//     manifest.json · guide.json · icon.png
// El manifest repite cuatro campos del guide; los derivamos del guide ya
// construido y validado para que no puedan divergir.

import { Buffer } from 'node:buffer';
import { buildSuuntoGuide, type BuildSuuntoGuideOpts } from './guide-builder';
import { buildGuideIconPng } from './icon';
import { guideManifestSchema, type SuuntoGuide, type SuuntoGuideManifest } from './guide-schema';
import { createZip } from './zip';
import type { WatchWorkout } from '@fahybrid/shared/domain/wearables/watch-workout';

export const GUIDE_FILE_NAMES = {
  manifest: 'manifest.json',
  guide: 'guide.json',
  icon: 'icon.png',
} as const;

/** `Content-Type` con el que la API acepta el cuerpo (POST y PUT). */
export const GUIDE_CONTENT_TYPE = 'application/zip';

export interface GuidePackage {
  zip: Uint8Array;
  guide: SuuntoGuide;
  manifest: SuuntoGuideManifest;
}

function toManifest(guide: SuuntoGuide): SuuntoGuideManifest {
  return guideManifestSchema.parse({
    name: guide.name,
    type: guide.type,
    owner: guide.owner,
    description: guide.description,
  });
}

function toJsonBytes(value: unknown): Uint8Array {
  return new Uint8Array(Buffer.from(JSON.stringify(value), 'utf8'));
}

/**
 * Construye el paquete completo. Devuelve también el guide y el manifest ya
 * validados: quien llama suele querer el `externalId` y el nombre para registrar
 * la subida sin volver a abrir el ZIP.
 */
export function buildGuidePackage(
  workout: WatchWorkout,
  opts: BuildSuuntoGuideOpts,
): GuidePackage {
  const guide = buildSuuntoGuide(workout, opts);
  const manifest = toManifest(guide);

  // El orden es fijo (manifest, guide, icono) para que el ZIP sea reproducible.
  const zip = createZip([
    { name: GUIDE_FILE_NAMES.manifest, data: toJsonBytes(manifest) },
    { name: GUIDE_FILE_NAMES.guide, data: toJsonBytes(guide) },
    { name: GUIDE_FILE_NAMES.icon, data: buildGuideIconPng() },
  ]);

  return { zip, guide, manifest };
}
