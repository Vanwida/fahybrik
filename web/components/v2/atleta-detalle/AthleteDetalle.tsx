'use client';

// AthleteDetalle — the client orchestrator for the athlete detail screen. Renders
// the header band + stat cluster, the 5-tab underline nav, and the active sub-view
// (driven by the URL ?tab=). All data is loaded server-side and passed in via the
// `detalle` payload; this component is pure composition + the per-tab selectors.

import { DetalleHeader } from './DetalleHeader';
import { LifecycleBanner } from './lifecycle/LifecycleBanner';
import { DetalleTabBar } from './DetalleTabBar';
import { PerfilTab } from './PerfilTab';
import { PlanTab } from './PlanTab';
import { RitmosZonasTab } from './RitmosZonasTab';
import { CarrerasTab } from './CarrerasTab';
import { HistoricoTab } from './HistoricoTab';
import { BiometriaTab } from './BiometriaTab';
import { PagosTab } from './PagosTab';
import { MensajesTab } from './MensajesTab';
import { SessionReportsBlock } from '@/components/v2/sessions/SessionReportsBlock';
import { selectPerfilTab, type V2AthleteDetalle, type AtletaTab } from '@/lib/dashboard/v2/atleta-detalle-types';

export function AthleteDetalle({
  detalle,
  tab,
}: {
  detalle: V2AthleteDetalle;
  tab: AtletaTab;
}) {
  const { header } = detalle;

  return (
    <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-6">
      <DetalleHeader header={header} stats={detalle.stats} />

      {/* Lifecycle context (#13): pending pause request / en pausa / de baja. */}
      <LifecycleBanner
        athleteId={header.athlete_id}
        athleteName={header.full_name}
        lifecycle={header.lifecycle}
      />

      <DetalleTabBar athlete_id={header.athlete_id} active={tab} />

      <div className="v2-stagger">
        {tab === 'perfil' ? (
          <PerfilTab
            data={selectPerfilTab(detalle)}
            classification={detalle.classification}
            athleteId={header.athlete_id}
          />
        ) : tab === 'plan' ? (
          <PlanTab plan={detalle.plan} resumen={detalle.resumen} athlete_id={header.athlete_id} />
        ) : tab === 'ritmos' ? (
          <RitmosZonasTab
            athleteId={header.athlete_id}
            athleteName={header.full_name}
            profiles={detalle.zone_profiles}
          />
        ) : tab === 'carreras' ? (
          <CarrerasTab athleteId={header.athlete_id} />
        ) : tab === 'historico' ? (
          <HistoricoTab
            plan={detalle.plan}
            strengthMaxes={detalle.strength_maxes}
            benchmarks={detalle.benchmarks}
            jointSessions={detalle.joint_sessions}
            athleteName={header.full_name}
          />
        ) : tab === 'sesiones' ? (
          <div className="mx-auto w-full max-w-[880px]">
            <SessionReportsBlock
              subject={{ athlete_id: header.athlete_id }}
              sessions={detalle.sessions}
              isLead={false}
            />
          </div>
        ) : tab === 'biometria' ? (
          <BiometriaTab body={detalle.body} />
        ) : tab === 'pagos' ? (
          <PagosTab
            billing={detalle.billing}
            invoices={detalle.invoices}
            athleteId={header.athlete_id}
          />
        ) : (
          <MensajesTab
            athlete_id={header.athlete_id}
            athlete_name={header.full_name}
            chat={detalle.chat}
            phase_label={header.phase_label}
          />
        )}
      </div>
    </div>
  );
}
