'use client';

// Client data layer for the coach injury panel (#16). Loads the athlete's injury
// history from the coach GET endpoint and exposes the three write actions the panel
// needs — register, update (transition / evolution note), adapt sessions — each
// routed to the existing, server-validated coach endpoints. After any mutation we
// refetch the panel AND router.refresh() so the server-rendered plan (adaptation
// tags) and the roster badge stay in sync. No schema is duplicated here.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  InjuryDTO,
  InjuryCreateInput,
  InjuryUpdateInput,
} from '@fahybrid/shared/schema/injuries';
import type { InjuryAdaptation } from '@fahybrid/shared/domain/coach/injury-taxonomy';

interface MutationResult {
  ok: boolean;
  /** The backend's honest error message on failure, else null. */
  error: string | null;
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return body?.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

export function useInjuries(athleteId: string) {
  const router = useRouter();
  const [injuries, setInjuries] = useState<InjuryDTO[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch(`/api/coach/athletes/${athleteId}/injuries`, { cache: 'no-store' });
      if (!res.ok) {
        setLoadError(await readError(res, 'No se pudieron cargar las lesiones.'));
        setLoading(false);
        return;
      }
      const body = (await res.json()) as { injuries: InjuryDTO[] };
      setInjuries(body.injuries ?? []);
    } catch {
      setLoadError('Error de red al cargar las lesiones.');
    }
    setLoading(false);
  }, [athleteId]);

  useEffect(() => {
    // Carga inicial real desde red (no hay forma de saberla en el primer
    // render): no cabe evitar el efecto, así que se silencia la regla aquí.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  /** Refetch the panel + re-render the server (plan tags / roster badge) after a write. */
  const afterMutation = useCallback(async () => {
    await reload();
    router.refresh();
  }, [reload, router]);

  const create = useCallback(
    async (input: InjuryCreateInput): Promise<MutationResult> => {
      try {
        const res = await fetch(`/api/coach/athletes/${athleteId}/injuries`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input),
        });
        if (!res.ok) return { ok: false, error: await readError(res, 'No se pudo registrar la lesión.') };
        await afterMutation();
        return { ok: true, error: null };
      } catch {
        return { ok: false, error: 'Error de red. Reintenta.' };
      }
    },
    [athleteId, afterMutation],
  );

  const update = useCallback(
    async (injuryId: string, input: InjuryUpdateInput): Promise<MutationResult> => {
      try {
        const res = await fetch(`/api/coach/injuries/${injuryId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input),
        });
        if (!res.ok) return { ok: false, error: await readError(res, 'No se pudo actualizar la lesión.') };
        await afterMutation();
        return { ok: true, error: null };
      } catch {
        return { ok: false, error: 'Error de red. Reintenta.' };
      }
    },
    [afterMutation],
  );

  const adapt = useCallback(
    async (
      injuryId: string,
      adaptations: { assignment_id: number; adaptation: InjuryAdaptation }[],
    ): Promise<MutationResult> => {
      try {
        const res = await fetch(`/api/coach/injuries/${injuryId}/adapt-sessions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ injury_id: Number(injuryId), adaptations }),
        });
        if (!res.ok) return { ok: false, error: await readError(res, 'No se pudieron adaptar las sesiones.') };
        await afterMutation();
        return { ok: true, error: null };
      } catch {
        return { ok: false, error: 'Error de red. Reintenta.' };
      }
    },
    [afterMutation],
  );

  return { injuries, loading, loadError, reload, create, update, adapt };
}
