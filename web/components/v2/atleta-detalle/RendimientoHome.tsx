'use client';

// Raíl temporal. El destino son 3 anclas (Carrera · Fuerza · Cuerpo).
// Hasta ese pase, las superficies viejas siguen alcanzables.

import { Link } from '@/i18n/navigation';
import { RitmosZonasTab } from './RitmosZonasTab';
import { CarrerasTab } from './CarrerasTab';
import { HistoricoTab } from './HistoricoTab';
import { BiometriaTab } from './BiometriaTab';
import { RendimientoTab } from './RendimientoTab';
import { CorrerTab } from './CorrerTab';
import type { RendimientoVista, V2AthleteDetalle } from '@/lib/dashboard/v2/atleta-detalle-types';
import { cn } from '@/lib/utils';

const VISTAS: { id: RendimientoVista; label: string }[] = [
  { id: 'diagnostico', label: 'Diagnóstico' },
  { id: 'correr', label: 'Cómo corre' },
  { id: 'zonas', label: 'Zonas' },
  { id: 'carreras', label: 'Carreras' },
  { id: 'historico', label: 'Histórico' },
  { id: 'cuerpo', label: 'Cuerpo' },
];

export function RendimientoHome({
  detalle,
  vista,
  coachName,
}: {
  detalle: V2AthleteDetalle;
  vista: RendimientoVista;
  coachName: string;
}) {
  const id = detalle.header.athlete_id;
  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Dentro de Rendimiento" className="flex flex-wrap gap-1">
        {VISTAS.map((v) => (
          <Link
            key={v.id}
            href={`/atletas/${id}?tab=rendimiento&vista=${v.id}`}
            className={cn(
              'v2-focus rounded-full px-3 py-1 text-[12.5px] font-semibold',
              vista === v.id
                ? 'bg-[color:var(--v2-fg)] text-[color:var(--v2-bg)]'
                : 'bg-[color:var(--v2-surface-2)] text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]',
            )}
          >
            {v.label}
          </Link>
        ))}
      </nav>

      {vista === 'diagnostico' ? (
        <RendimientoTab athleteId={id} athleteName={detalle.header.full_name} coachName={coachName} />
      ) : vista === 'correr' ? (
        <CorrerTab athleteId={id} />
      ) : vista === 'zonas' ? (
        <RitmosZonasTab
          athleteId={id}
          athleteName={detalle.header.full_name}
          profiles={detalle.zone_profiles}
        />
      ) : vista === 'carreras' ? (
        <CarrerasTab athleteId={id} />
      ) : vista === 'historico' ? (
        <HistoricoTab
          plan={detalle.plan}
          strengthMaxes={detalle.strength_maxes}
          benchmarks={detalle.benchmarks}
          jointSessions={detalle.joint_sessions}
          athleteName={detalle.header.full_name}
        />
      ) : (
        <BiometriaTab
          body={detalle.body}
          athleteId={id}
          checkin={detalle.resumen?.checkin ?? null}
          checkinWeek={detalle.resumen?.checkin_week ?? []}
        />
      )}
    </div>
  );
}
