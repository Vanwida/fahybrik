'use client';

// AthleteDetalle — the client orchestrator for the athlete detail screen. Renders
// the header band + stat cluster, the 5-tab underline nav, and the active sub-view
// (driven by the URL ?tab=). All data is loaded server-side and passed in via the
// `detalle` payload; this component is pure composition + the per-tab selectors.

import { DetalleHeader } from './DetalleHeader';
import { DetalleTabBar } from './DetalleTabBar';
import { PerfilTab } from './PerfilTab';
import { PlanTab } from './PlanTab';
import { HistoricoTab } from './HistoricoTab';
import { BiometriaTab } from './BiometriaTab';
import { MensajesTab } from './MensajesTab';
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

      <DetalleTabBar athlete_id={header.athlete_id} active={tab} />

      <div className="v2-stagger">
        {tab === 'perfil' ? (
          <PerfilTab data={selectPerfilTab(detalle)} />
        ) : tab === 'plan' ? (
          <PlanTab plan={detalle.plan} resumen={detalle.resumen} athlete_id={header.athlete_id} />
        ) : tab === 'historico' ? (
          <HistoricoTab plan={detalle.plan} performance={detalle.performance} />
        ) : tab === 'biometria' ? (
          <BiometriaTab body={detalle.body} />
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
