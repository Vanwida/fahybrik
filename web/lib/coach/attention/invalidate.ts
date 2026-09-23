import 'server-only';

// Invalidar la cola de atención de un coach tras escribirla.
//
// `updateTag` solo vale dentro de una Server Action: en Next 16 lanza desde un
// Route Handler («updateTag can only be called from within a Server Action»),
// y el barrido corre desde el cron `/api/cron/recompute-attention` y desde las
// rutas de snooze/bulk — por eso el cron fallaba en CADA pasada (después de
// haber escrito, así que los datos quedaban bien y el error solo era ruido que
// tapaba los de verdad). `revalidateTag` con expiración inmediata sirve en los
// dos contextos.
//
// Fuera de una petición de Next (tests, scripts) no hay almacén de caché y
// `revalidateTag` lanza: invalidar es un extra, nunca puede tumbar la escritura
// que ya se hizo.

import { revalidateTag } from 'next/cache';
import { attentionTag } from './queue';

export function invalidateAttention(coach_id: string | number | bigint): void {
  try {
    revalidateTag(attentionTag(coach_id), { expire: 0 });
  } catch {
    // Sin contexto de Next (test/script): no hay caché que invalidar.
  }
}
