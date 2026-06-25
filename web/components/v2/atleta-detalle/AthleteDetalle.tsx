'use client';

// AthleteDetalle — the client orchestrator for the athlete detail screen. Renders
// the header band + stat cluster, the 5-tab underline nav, and the active sub-view
// (driven by the URL ?tab=). All data is loaded server-side and passed in via the
// `detalle` payload; this component is pure composition + the per-tab selectors.

import { DetalleHeader } from './DetalleHeader';
import { DetalleTabBar } from './DetalleTabBar';
import { PerfilTab } from './PerfilTab';
import { PlanTab } from './PlanTab';
import { RitmosZonasTab } from './RitmosZonasTab';
import { RendimientoTab } from './RendimientoTab';
import { HistoricoTab } from './HistoricoTab';
import { BiometriaTab } from './BiometriaTab';
import { DoblesTab } from './DoblesTab';
import { MensajesTab } from './MensajesTab';
import {
  selectPerfilTab,
  visibleAtletaTabs,
  DEFAULT_ATLETA_TAB,
  type V2AthleteDetalle,
  type AtletaTab,
} from '@/lib/dashboard/v2/atleta-detalle-types';

export function AthleteDetalle({
  detalle,
  tab,
}: {
  detalle: V2AthleteDetalle;
  tab: AtletaTab;
}) {
  const { header } = detalle;

  // A deep-link to a tab that isn't visible for this athlete (e.g. ?tab=dobles on
  // an Individual athlete) collapses to the default tab — the bar never shows it,
  // so the body must agree.
  const visible = visibleAtletaTabs(header);
  const active = visible.includes(tab) ? tab : DEFAULT_ATLETA_TAB;

  return (
    <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-6">
      <DetalleHeader header={header} stats={detalle.stats} />

      <DetalleTabBar header={header} active={active} />

      <div className="v2-stagger">
        {active === 'perfil' ? (
          <PerfilTab data={selectPerfilTab(detalle)} />
        ) : active === 'plan' ? (
          <PlanTab plan={detalle.plan} resumen={detalle.resumen} athlete_id={header.athlete_id} />
        ) : active === 'ritmos' ? (
          <RitmosZonasTab
            athleteId={header.athlete_id}
            athleteName={header.full_name}
            profiles={detalle.zone_profiles}
          />
        ) : active === 'rendimiento' ? (
          <RendimientoTab performance={detalle.performance} />
        ) : active === 'historico' ? (
          <HistoricoTab plan={detalle.plan} performance={detalle.performance} />
        ) : active === 'biometria' ? (
          <BiometriaTab body={detalle.body} />
        ) : active === 'dobles' ? (
          <DoblesTab
            athlete_id={header.athlete_id}
            athlete_name={header.full_name}
            partner_name={header.partner_name}
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
