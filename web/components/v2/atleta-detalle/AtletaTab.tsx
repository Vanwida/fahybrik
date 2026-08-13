'use client';

// Atleta — perfil, 1:1 y pagos. Raíl interno hasta el pase de diseño propio.

import { Link } from '@/i18n/navigation';
import { InjuryPanel } from './injuries/InjuryPanel';
import { TrainingDaysCard } from './TrainingDaysCard';
import { PerfilTab } from './PerfilTab';
import { PagosTab } from './PagosTab';
import { SessionReportsBlock } from '@/components/v2/sessions/SessionReportsBlock';
import { ReviewPanel } from './reviews/ReviewPanel';
import { selectPerfilTab, type AtletaSeccion, type V2AthleteDetalle } from '@/lib/dashboard/v2/atleta-detalle-types';
import { cn } from '@/lib/utils';

const SECCIONES: { id: AtletaSeccion; label: string }[] = [
  { id: 'perfil', label: 'Perfil' },
  { id: 'sesiones', label: '1:1' },
  { id: 'pagos', label: 'Pagos' },
];

export function AtletaTab({
  detalle,
  seccion,
}: {
  detalle: V2AthleteDetalle;
  seccion: AtletaSeccion;
}) {
  const { header } = detalle;
  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Dentro de Atleta" className="flex flex-wrap gap-1">
        {SECCIONES.map((s) => (
          <Link
            key={s.id}
            href={`/atletas/${header.athlete_id}?tab=atleta&vista=${s.id}`}
            className={cn(
              'v2-focus rounded-full px-3 py-1 text-[12.5px] font-semibold',
              seccion === s.id
                ? 'bg-[color:var(--v2-fg)] text-[color:var(--v2-bg)]'
                : 'bg-[color:var(--v2-surface-2)] text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]',
            )}
          >
            {s.label}
          </Link>
        ))}
      </nav>

      {seccion === 'perfil' ? (
        <div className="flex flex-col gap-4">
          {header.status === 'alta' ? (
            <Link
              href={`/atletas/${header.athlete_id}/intake`}
              className="v2-focus rounded-[14px] border border-[color:var(--v2-danger)] bg-[color:var(--v2-danger-soft)] px-3.5 py-3 text-sm font-semibold text-[color:var(--v2-fg)]"
            >
              Revisar intake →
            </Link>
          ) : null}
          <InjuryPanel
            athleteId={header.athlete_id}
            lifecycle={header.lifecycle}
            plan={detalle.plan}
          />
          <TrainingDaysCard
            data={detalle.training_days}
            coachDaysPerWeek={detalle.classification.training_days_per_week}
          />
          <PerfilTab
            data={selectPerfilTab(detalle)}
            classification={detalle.classification}
            athleteId={header.athlete_id}
            athleteName={header.full_name}
            tests={detalle.tests}
            testLibrary={detalle.test_library}
          />
        </div>
      ) : seccion === 'sesiones' ? (
        <div className="mx-auto flex w-full max-w-[880px] flex-col gap-4">
          <ReviewPanel
            athleteId={header.athlete_id}
            athleteName={header.full_name}
            review={detalle.review}
          />
          <SessionReportsBlock
            subject={{ athlete_id: header.athlete_id }}
            sessions={detalle.sessions}
            isLead={false}
          />
        </div>
      ) : (
        <PagosTab billing={detalle.billing} invoices={detalle.invoices} athleteId={header.athlete_id} />
      )}
    </div>
  );
}
