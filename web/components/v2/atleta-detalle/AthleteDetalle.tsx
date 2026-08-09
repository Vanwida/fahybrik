'use client';

// AthleteDetalle — el orquestador de la ficha del atleta: la banda de identidad,
// la navegación de pestañas y la sub-vista activa (la manda `?tab=` en la URL).
// El dato se carga en servidor y llega por `detalle`; aquí sólo hay composición.
//
// COMPOSICIÓN (§6.2 «Detalle»): el sujeto es el dato que te trajo a abrirla, y
// antes tardaba 440 px en aparecer —las diez pestañas arrancaban en y=440 y el
// contenido en y=508, o sea el 56 % de la primera pantalla era cromo—. A 390 la
// pantalla ENTERA era cromo: 844 px sin un solo dato.
//
// Ahora identidad y pestañas viven en una banda FIJA que se queda pegada bajo la
// barra de la app, así que el coach cambia de pestaña sin volver arriba y el
// contenido empieza donde antes empezaban las pestañas. La banda se pega a
// `top-14` porque esa es la altura de la barra del shell (V2Shell).

import { DetalleHeader } from './DetalleHeader';
import { LifecycleBanner } from './lifecycle/LifecycleBanner';
import { InjuryPanel } from './injuries/InjuryPanel';
import { TrainingDaysCard } from './TrainingDaysCard';
import { DetalleTabBar } from './DetalleTabBar';
import { PerfilTab } from './PerfilTab';
import { PlanTab } from './PlanTab';
import { RitmosZonasTab } from './RitmosZonasTab';
import { CarrerasTab } from './CarrerasTab';
import { HistoricoTab } from './HistoricoTab';
import { BiometriaTab } from './BiometriaTab';
import { RendimientoTab } from './RendimientoTab';
import { PagosTab } from './PagosTab';
import { MensajesTab } from './MensajesTab';
import { DelCoachTab } from './del-coach/DelCoachTab';
import { SessionReportsBlock } from '@/components/v2/sessions/SessionReportsBlock';
import { ReviewPanel } from './reviews/ReviewPanel';
import { cuantosReclaman } from '@/lib/dashboard/v2/del-coach';
import { selectPerfilTab, type V2AthleteDetalle, type AtletaTab } from '@/lib/dashboard/v2/atleta-detalle-types';

export function AthleteDetalle({
  detalle,
  tab,
  coachName,
}: {
  detalle: V2AthleteDetalle;
  tab: AtletaTab;
  /** El nombre del club: es con el que el atleta ve firmado un comunicado. */
  coachName: string;
}) {
  const { header } = detalle;
  const comunicados = detalle.communications ?? [];

  return (
    <div className="mx-auto flex w-full max-w-[var(--v2-container)] flex-col">
      {/* ── Banda fija: identidad + pestañas ─────────────────────────────────
           Se estira hasta los bordes de <main> (los márgenes negativos) para que
           el fondo cubra de lado a lado al quedarse pegada; el contenido de
           dentro conserva el acolchado de la página. */}
      <div className="sticky top-14 z-[9] -mx-4 -mt-4 mb-4 border-b border-[color:var(--v2-border)] bg-[color:color-mix(in_srgb,var(--v2-bg)_92%,transparent)] px-4 pt-4 backdrop-blur sm:-mx-6 sm:-mt-6 sm:px-6 sm:pt-6">
        <DetalleHeader
          header={header}
          stats={detalle.stats}
          training_days={detalle.training_days}
        />
        <div className="mt-2.5 -mb-px">
          <DetalleTabBar
            athlete_id={header.athlete_id}
            active={tab}
            badges={{ 'del-coach': cuantosReclaman(comunicados) }}
          />
        </div>
      </div>

      {/* Contexto de ciclo de vida (#13): pausa pedida / en pausa / de baja. */}
      <LifecycleBanner
        athleteId={header.athlete_id}
        athleteName={header.full_name}
        lifecycle={header.lifecycle}
      />

      <div className="v2-stagger">
        {tab === 'perfil' ? (
          <div className="flex flex-col gap-4">
            {/* Salud primero: la lesión es el contexto que condiciona todo el plan (#16). */}
            <InjuryPanel
              athleteId={header.athlete_id}
              lifecycle={header.lifecycle}
              plan={detalle.plan}
            />
            {/* Días reales del atleta (#47). La tira de la banda fija los enseña
                SIEMPRE (que es lo que pedía el #47); la tarjeta entera —con el
                porqué cuando el atleta aún no los ha marcado— vive aquí, que es
                donde el coach viene a leer su perfil. */}
            <TrainingDaysCard data={detalle.training_days} />
            <PerfilTab
              data={selectPerfilTab(detalle)}
              classification={detalle.classification}
              athleteId={header.athlete_id}
              athleteName={header.full_name}
              tests={detalle.tests}
              testLibrary={detalle.test_library}
            />
          </div>
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
          <div className="mx-auto flex w-full max-w-[880px] flex-col gap-4">
            {/* Revisiones 1:1 (#21): cadencia + estado + proponer/cancelar, encima del histórico. */}
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
        ) : tab === 'biometria' ? (
          <BiometriaTab body={detalle.body} />
        ) : tab === 'rendimiento' ? (
          <RendimientoTab athleteId={header.athlete_id} />
        ) : tab === 'pagos' ? (
          <PagosTab
            billing={detalle.billing}
            invoices={detalle.invoices}
            athleteId={header.athlete_id}
          />
        ) : tab === 'del-coach' ? (
          <DelCoachTab
            athleteId={header.athlete_id}
            athleteName={header.full_name}
            coachName={coachName}
            communications={comunicados}
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
