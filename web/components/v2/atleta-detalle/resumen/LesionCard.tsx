'use client';

import { Link } from '@/i18n/navigation';
import { useInjuries } from '../injuries/use-injuries';
import { INJURY_ZONE_LABEL } from '@fahybrid/shared/domain/coach/injury-taxonomy';
import { severityMeta, sinceOnset, statusMeta } from '../injuries/injury-presentation';
import { FichaCard, FichaLabel } from './piezas';

export function LesionCard({ athleteId }: { athleteId: string }) {
  const { injuries } = useInjuries(athleteId);
  const activa = (injuries ?? []).find((i) => i.status !== 'resuelta' && i.resolved_date == null);
  if (!activa) return null;

  const zona = INJURY_ZONE_LABEL[activa.zone] ?? activa.zone;
  const meta = statusMeta(activa.status);
  const evoluciones = activa.updates.length;

  return (
    <FichaCard className="shadow-[inset_3px_0_0_#E8A33D]">
      <div className="flex items-start justify-between gap-2">
        <FichaLabel>Lesión activa</FichaLabel>
        <span className="rounded-full bg-[#FAF0DC] px-2 py-0.5 text-[10.5px] font-semibold text-[#9A6B18]">
          {meta.label}
        </span>
      </div>
      <p className="mt-2 text-[16px] font-semibold tracking-[-0.01em] text-[color:var(--v2-fg)]">
        {activa.type ? `${zona} · ${activa.type}` : zona}
      </p>
      <p className="mt-1 text-[12.5px] text-[color:var(--v2-muted)]">
        {[severityMeta(activa.severity).label, sinceOnset(activa.onset_date), evoluciones > 0 ? `${evoluciones} ${evoluciones === 1 ? 'evolución' : 'evoluciones'}` : null]
          .filter(Boolean)
          .join(' · ')}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href={`/atletas/${athleteId}?tab=atleta`}
          className="v2-focus inline-flex h-[34px] items-center rounded-[8px] bg-[color:var(--v2-accent)] px-[15px] text-[12.5px] font-semibold text-[color:var(--v2-accent-fg)]"
        >
          Adaptar sesiones
        </Link>
        <Link
          href={`/atletas/${athleteId}?tab=atleta`}
          className="v2-focus inline-flex h-[34px] items-center rounded-[8px] border border-[color:var(--v2-border-strong)] px-[13px] text-[12.5px] font-semibold text-[color:var(--v2-fg)]"
        >
          Historial
        </Link>
      </div>
    </FichaCard>
  );
}
