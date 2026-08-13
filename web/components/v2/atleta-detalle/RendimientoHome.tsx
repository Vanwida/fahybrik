'use client';

// Rendimiento — «¿el entrenamiento está aterrizando?»
// Tres anclas. Carrera tiene capas (aterrizaje · zonas · carreras) porque
// son la misma pregunta, no tres pestañas más.

import { Link } from '@/i18n/navigation';
import { CorrerTab } from './CorrerTab';
import { RitmosZonasTab } from './RitmosZonasTab';
import { CarrerasTab } from './CarrerasTab';
import { BiometriaTab } from './BiometriaTab';
import { EvaluarSemanaPanel } from './rendimiento/EvaluarSemanaPanel';
import { FuerzaVista } from './rendimiento/FuerzaVista';
import type {
  CarreraCapa,
  RendimientoVista,
  V2AthleteDetalle,
} from '@/lib/dashboard/v2/atleta-detalle-types';
import { cn } from '@/lib/utils';

const ANCLAS: { id: RendimientoVista; label: string }[] = [
  { id: 'carrera', label: 'Carrera' },
  { id: 'fuerza', label: 'Fuerza' },
  { id: 'cuerpo', label: 'Cuerpo' },
];

const CAPAS: { id: CarreraCapa; label: string }[] = [
  { id: 'aterrizaje', label: 'Cómo aterriza' },
  { id: 'zonas', label: 'Zonas' },
  { id: 'carreras', label: 'Carreras' },
];

export function RendimientoHome({
  detalle,
  vista,
  carreraCapa,
}: {
  detalle: V2AthleteDetalle;
  vista: RendimientoVista;
  carreraCapa: CarreraCapa;
  coachName: string;
}) {
  const id = detalle.header.athlete_id;

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Dentro de Rendimiento" className="flex flex-wrap gap-1">
        {ANCLAS.map((a) => (
          <Link
            key={a.id}
            href={`/atletas/${id}?tab=rendimiento&vista=${a.id}`}
            className={cn(
              'v2-focus rounded-full px-3 py-1 text-[12.5px] font-semibold',
              vista === a.id
                ? 'bg-[color:var(--v2-fg)] text-[color:var(--v2-bg)]'
                : 'bg-[color:var(--v2-surface-2)] text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]',
            )}
          >
            {a.label}
          </Link>
        ))}
      </nav>

      {vista === 'carrera' ? (
        <div className="flex flex-col gap-4">
          <nav aria-label="Dentro de Carrera" className="flex flex-wrap gap-x-3 gap-y-1 px-0.5">
            {CAPAS.map((c) => (
              <Link
                key={c.id}
                href={`/atletas/${id}?tab=rendimiento&vista=${c.id === 'aterrizaje' ? 'carrera' : c.id}`}
                className={cn(
                  'v2-focus text-[12.5px] font-semibold',
                  carreraCapa === c.id
                    ? 'text-[color:var(--v2-fg)] underline decoration-[color:var(--v2-accent)] underline-offset-4'
                    : 'text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]',
                )}
              >
                {c.label}
              </Link>
            ))}
          </nav>
          {carreraCapa === 'zonas' ? (
            <RitmosZonasTab
              athleteId={id}
              athleteName={detalle.header.full_name}
              profiles={detalle.zone_profiles}
            />
          ) : carreraCapa === 'carreras' ? (
            <CarrerasTab athleteId={id} />
          ) : (
            <CorrerTab athleteId={id} />
          )}
        </div>
      ) : vista === 'fuerza' ? (
        <FuerzaVista detalle={detalle} />
      ) : (
        <div className="flex flex-col gap-4">
          <EvaluarSemanaPanel athleteId={id} />
          <BiometriaTab
            body={detalle.body}
            athleteId={id}
            checkin={detalle.resumen?.checkin ?? null}
            checkinWeek={detalle.resumen?.checkin_week ?? []}
          />
        </div>
      )}
    </div>
  );
}
