'use client';

// Ficha del atleta: cabecera de 2 filas + 5 pestañas. Default = Resumen.

import { DetalleHeader } from './DetalleHeader';
import { LifecycleBanner } from './lifecycle/LifecycleBanner';
import { DetalleTabBar } from './DetalleTabBar';
import { ResumenTab } from './ResumenTab';
import { PlanTab } from './PlanTab';
import { RendimientoHome } from './RendimientoHome';
import { AtletaTab } from './AtletaTab';
import { ChatPeek } from './ChatPeek';
import { DelCoachTab } from './del-coach/DelCoachTab';
import { cuantosReclaman } from '@/lib/dashboard/v2/del-coach';
import { buildPendientes } from '@/lib/dashboard/v2/ficha-resumen';
import type {
  AtletaSeccion,
  AtletaVista,
  CarreraCapa,
  RendimientoVista,
  V2AthleteDetalle,
} from '@/lib/dashboard/v2/atleta-detalle-types';

export function AthleteDetalle({
  detalle,
  tab,
  rendimientoVista,
  carreraCapa,
  atletaSeccion,
  initialSessionId,
  coachName,
}: {
  detalle: V2AthleteDetalle;
  tab: AtletaVista;
  rendimientoVista: RendimientoVista;
  carreraCapa: CarreraCapa;
  atletaSeccion: AtletaSeccion;
  initialSessionId: string | null;
  coachName: string;
}) {
  const { header } = detalle;
  const comunicados = detalle.communications ?? [];
  const pendientes = buildPendientes(detalle);
  const atletaBadge =
    (header.status === 'alta' ? 1 : 0) + (detalle.billing?.status === 'past_due' ? 1 : 0);

  const dias = detalle.classification.training_days_per_week;
  const meta = [
    header.modality_label,
    dias != null ? `${dias} días/sem` : null,
    header.tenure_label,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="mx-auto flex w-full max-w-[1300px] flex-col">
      <div className="sticky top-14 z-[9] -mx-4 -mt-4 mb-4 border-b border-[color:var(--v2-border)] bg-[color:color-mix(in_srgb,var(--v2-bg)_92%,transparent)] px-4 pt-4 backdrop-blur sm:-mx-6 sm:-mt-6 sm:px-6 sm:pt-6">
        <DetalleHeader
          header={header}
          meta={meta}
          pendientes={pendientes}
          ocultarVerPlan={tab === 'plan'}
        />
        <div className="mt-3 -mb-px">
          <DetalleTabBar
            athlete_id={header.athlete_id}
            active={tab}
            badges={{
              atleta: atletaBadge,
              'del-coach': cuantosReclaman(comunicados),
            }}
          />
        </div>
      </div>

      <LifecycleBanner
        athleteId={header.athlete_id}
        athleteName={header.full_name}
        lifecycle={header.lifecycle}
      />

      {/* El chat es un PEEK sobre la ficha (nunca una pestaña sin salida):
          `?tab=mensajes` pinta Resumen detrás y el panel de chat encima. */}
      {tab === 'mensajes' ? (
        <ChatPeek
          athlete_id={header.athlete_id}
          athlete_name={header.full_name}
          chat={detalle.chat}
          phase_label={header.phase_label}
        />
      ) : null}

      <div className="v2-stagger">
        {tab === 'resumen' || tab === 'mensajes' ? (
          <ResumenTab detalle={detalle} />
        ) : tab === 'plan' ? (
          <PlanTab
            plan={detalle.plan}
            planMode={detalle.plan_mode}
            resumen={detalle.resumen}
            athlete_id={header.athlete_id}
            initialSessionId={initialSessionId}
            intakePending={header.status === 'alta'}
            weekChip={header.week_chip}
          />
        ) : tab === 'rendimiento' ? (
          <RendimientoHome
            detalle={detalle}
            vista={rendimientoVista}
            carreraCapa={carreraCapa}
            coachName={coachName}
          />
        ) : tab === 'del-coach' ? (
          <DelCoachTab
            athleteId={header.athlete_id}
            athleteName={header.full_name}
            coachName={coachName}
            communications={comunicados}
          />
        ) : tab === 'atleta' ? (
          <AtletaTab detalle={detalle} seccion={atletaSeccion} />
        ) : null}
      </div>
    </div>
  );
}
