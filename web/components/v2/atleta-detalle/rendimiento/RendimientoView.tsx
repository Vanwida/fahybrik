'use client';

// Rendimiento — UN scroll ordenado por la pregunta del coach (informe C §4.3):
//   Zonas y tests · Running · Fuerza · Fisiología · Carreras.
// Una sección sin datos se pliega a UNA línea que dice qué falta y cómo
// conseguirlo; un fallo al cargar es un error con «Reintentar», nunca «sin datos».

import { useEffect, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { Button, EmptyState, ErrorState, FilterChip, SectionHeader } from '@/components/v2/ui';
import { RegistrarResultadoForm } from '../RegistrarResultadoForm';
import type { FichaRendimiento } from '@/lib/dashboard/v2/ficha-rendimiento';
import type { RendimientoSeccion } from '@/lib/dashboard/v2/atleta-detalle-types';
import { useFicha } from '../FichaContext';
import { RitmosZonasTab } from '../RitmosZonasTab';
import { TestsPanel } from '../tests/TestsPanel';
import { CorrerTab } from '../CorrerTab';
import { ZonasPanel } from './ZonasPanel';
import { CarrerasTab } from '../CarrerasTab';
import { LoadBlock } from './LoadBlock';
import { FuerzaBlock } from './FuerzaBlock';
import { FisiologiaBlock } from './FisiologiaBlock';

const SECTIONS: { id: RendimientoSeccion; label: string }[] = [
  { id: 'zonas', label: 'Zonas y tests' },
  { id: 'running', label: 'Running' },
  { id: 'fuerza', label: 'Fuerza' },
  { id: 'fisiologia', label: 'Fisiología' },
  { id: 'carreras', label: 'Carreras' },
];

function Section({ id, title, children }: { id: RendimientoSeccion; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="flex scroll-mt-24 flex-col gap-3">
      <SectionHeader id={`${id}-h`} title={title} variant="title" />
      {children}
    </section>
  );
}

export function RendimientoView({ data, seccion }: { data: FichaRendimiento; seccion: string | null }) {
  const { shell } = useFicha();
  const router = useRouter();
  const retry = () => router.refresh();
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    if (seccion) document.getElementById(seccion)?.scrollIntoView({ block: 'start' });
  }, [seccion]);

  const profiles = data.zones.ok ? data.zones.data : [];

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <nav aria-label="Secciones de rendimiento" className="flex flex-wrap gap-1.5">
        {SECTIONS.map((s) => (
          <FilterChip key={s.id} href={`#${s.id}`}>
            {s.label}
          </FilterChip>
        ))}
      </nav>

      <Section id="zonas" title="Zonas y tests">
        {data.zones.ok && profiles.length > 0 ? (
          <RitmosZonasTab athleteId={shell.athlete_id} athleteName={shell.name} profiles={profiles} />
        ) : data.zones.ok ? (
          <>
            <EmptyState
              title="Sin zonas todavía"
              description="salen de un resultado de test"
              action={
                <Button size="sm" onClick={() => setRecording((v) => !v)}>
                  {recording ? 'Cerrar' : 'Apuntar un resultado'}
                </Button>
              }
            />
            {recording ? (
              <RegistrarResultadoForm athleteId={shell.athlete_id} onDone={() => setRecording(false)} />
            ) : null}
          </>
        ) : (
          <ErrorState title="No se han podido cargar sus zonas" onRetry={retry} />
        )}
        {data.tests.ok ? (
          <TestsPanel
            athleteId={shell.athlete_id}
            athleteName={shell.name}
            coachName={shell.club_name}
            tests={data.tests.data.tests}
            library={data.tests.data.library}
          />
        ) : (
          <ErrorState title="No se han podido cargar sus tests" onRetry={retry} />
        )}
      </Section>

      <Section id="running" title="Running">
        <CorrerTab athleteId={shell.athlete_id} />
        <ZonasPanel athleteId={shell.athlete_id} athleteName={shell.name} coachName={shell.club_name} />
        {data.load.ok ? <LoadBlock load={data.load.data} /> : <ErrorState title="No se ha podido calcular su carga" onRetry={retry} />}
      </Section>

      <Section id="fuerza" title="Fuerza">
        {data.strength.ok && data.benchmarks.ok ? (
          <FuerzaBlock maxes={data.strength.data} benchmarks={data.benchmarks.data} />
        ) : (
          <ErrorState title="No se han podido cargar sus marcas" onRetry={retry} />
        )}
      </Section>

      <Section id="fisiologia" title="Fisiología">
        {data.body.ok ? (
          <FisiologiaBlock body={data.body.data} readiness={shell.readiness} today={shell.today} />
        ) : (
          <ErrorState title="No se han podido cargar sus datos de salud" onRetry={retry} />
        )}
      </Section>

      <Section id="carreras" title="Carreras">
        <CarrerasTab athleteId={shell.athlete_id} />
      </Section>
    </div>
  );
}
