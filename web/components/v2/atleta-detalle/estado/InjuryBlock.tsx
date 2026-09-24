'use client';

// Lesión activa en la columna Estado: zona, gravedad y desde cuándo, y «Adaptar
// sesiones», que abre el diálogo de adaptar directamente (R8: antes los dos
// botones llevaban a otra pestaña). Sin lesión: una línea y «Registrar».

import { useState } from 'react';
import { Button, useToast } from '@/components/v2/ui';
import { apiJson, errorMessage } from '@/components/v2/shared/api';
import { shortDate } from '@/components/v2/shared/format';
import type { InjuryAdaptation } from '@fahybrid/shared/domain/coach/injury-taxonomy';
import type { CalSession, FichaEstado } from '@/lib/dashboard/v2/atleta-detalle-types';
import { dayLabel } from '@/lib/dashboard/v2/ficha-dates';
import { useFicha } from '../FichaContext';
import { AdaptSessionsDialog, RegisterInjuryDialog } from '../injuries/injury-dialogs';

type Result = { ok: boolean; error: string | null };

async function call(url: string, body: unknown): Promise<Result> {
  try {
    await apiJson(url, { method: 'POST', body });
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export function InjuryBlock({ injury, upcoming }: { injury: FichaEstado['injury']; upcoming: CalSession[] }) {
  const { shell, bumpCalendar, refresh } = useFicha();
  const { toast } = useToast();
  const [dialog, setDialog] = useState<null | 'adapt' | 'register'>(null);

  return (
    <div className="flex flex-col gap-1.5 border-t border-v2-border pt-3">
      <span className="t-label text-v2-faint">Lesión</span>
      {injury ? (
        <>
          <span className="t-body text-v2-fg">
            {injury.zone_label} · {injury.severity_label.toLowerCase()}
            <span className="text-v2-muted">
              {' '}
              · {injury.status === 'en_recuperacion' ? 'en recuperación' : 'activa'} desde el {shortDate(injury.onset_date)}
            </span>
          </span>
          <Button size="sm" className="self-start" disabled={upcoming.length === 0} onClick={() => setDialog('adapt')}>
            Adaptar sesiones
          </Button>
        </>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <span className="t-body-sm text-v2-faint">Sin lesión activa</span>
          <Button size="sm" variant="ghost" onClick={() => setDialog('register')}>
            Registrar
          </Button>
        </div>
      )}

      {dialog === 'adapt' && injury ? (
        <AdaptSessionsDialog
          sessions={upcoming.map((s) => ({
            assignment_id: s.id,
            iso_date: s.date,
            title: s.title,
            date_label: dayLabel(s.date),
          }))}
          onClose={() => setDialog(null)}
          onSubmit={async (adaptations: { assignment_id: number; adaptation: InjuryAdaptation }[]) => {
            const r = await call(`/api/coach/injuries/${injury.id}/adapt-sessions`, {
              injury_id: Number(injury.id),
              adaptations,
            });
            if (r.ok) {
              toast({ title: `${adaptations.length} ${adaptations.length === 1 ? 'entreno adaptado' : 'entrenos adaptados'}`, tone: 'ok' });
              bumpCalendar();
            }
            return r;
          }}
        />
      ) : null}
      {dialog === 'register' ? (
        <RegisterInjuryDialog
          onClose={() => setDialog(null)}
          onSubmit={async (input) => {
            const r = await call(`/api/coach/athletes/${shell.athlete_id}/injuries`, input);
            if (r.ok) refresh();
            return r;
          }}
        />
      ) : null}
    </div>
  );
}
