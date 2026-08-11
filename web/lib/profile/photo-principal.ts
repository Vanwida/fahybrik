import 'server-only';

// QUIÉN ESTÁ PIDIENDO CAMBIAR SU FOTO.
//
// Hay exactamente DOS clases de persona con foto en el sistema —el entrenador y el
// atleta— y cada uno cambia LA SUYA: el entrenador desde el panel con su sesión, el
// atleta desde su móvil con su bearer. **Un entrenador no sube la foto de un atleta.**
// No es una restricción de permisos que se pueda relajar luego: la foto la elige quien
// sale en ella.
//
// POR ESO EL PRINCIPAL NO VIAJA EN EL CUERPO de ninguna petición. Se resuelve de la
// credencial y punto: si llegara como un campo más, la ruta tendría que comprobar
// después que ese campo coincide con quien pide, y esa comprobación es exactamente la
// que un día se olvida.
//
// VIVE APARTE de `photo.ts` a propósito: aquel sabe de fotos, de Cloudflare y de
// columnas; éste sabe de credenciales. Mezclarlos ataría el módulo de almacenamiento a
// la librería de sesión del panel, que no tiene nada que ver con guardar una imagen.

import { getCoachSession } from '@/lib/auth/coach-session';
import { extractBearerToken, getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';

/** Quién está pidiendo. Sale SIEMPRE de la credencial, nunca del cuerpo. */
export interface PhotoPrincipal {
  kind: 'coach' | 'athlete';
  id: bigint;
}

/**
 * Quién pide, resuelto de la credencial que trae.
 *
 * El bearer MANDA sobre la sesión de panel cuando viene: una credencial explícita gana
 * siempre a una cookie ambiente, así que un bearer inválido es un «no» y no una caída
 * silenciosa a otra identidad. En la práctica no se solapan —la app de iOS nunca tiene
 * cookie de Clerk y el panel nunca manda bearer—, pero el orden tiene que estar decidido
 * aquí y no depender de que eso siga siendo verdad.
 */
export async function resolvePhotoPrincipal(request: Request): Promise<PhotoPrincipal | null> {
  const authorization = request.headers.get('authorization');
  if (extractBearerToken(authorization)) {
    const athlete = await getAthleteSessionFromBearer(authorization);
    return athlete ? { kind: 'athlete', id: athlete.athlete_id } : null;
  }

  const coach = await getCoachSession();
  return coach ? { kind: 'coach', id: coach.coach_id } : null;
}
