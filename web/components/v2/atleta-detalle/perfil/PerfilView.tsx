'use client';

// Perfil: quién es y qué le debo — datos, clasificación, días de entreno,
// lesiones, 1:1, pagos (mismo ancho que todo lo demás, H7) y UNA línea de tiempo.
// Una parte que no carga es un error con «Reintentar», no un hueco.

import { useEffect } from 'react';
import { useRouter } from '@/i18n/navigation';
import { Card, ErrorState, FilterChip, SectionHeader } from '@/components/v2/ui';
import { shortDate } from '@/components/v2/shared/format';
import type { FichaPerfil, PerfilSeccion, TimelineKind } from '@/lib/dashboard/v2/atleta-detalle-types';
import { useFicha } from '../FichaContext';
import { ClasificacionCard } from '../ClasificacionCard';
import { TrainingDaysCard } from '../TrainingDaysCard';
import { InjuryPanel } from '../injuries/InjuryPanel';
import { ReviewPanel } from '../reviews/ReviewPanel';
import { SessionReportsBlock } from '@/components/v2/sessions/SessionReportsBlock';
import { PagosTab } from '../PagosTab';
import { Timeline } from './Timeline';

const SECTIONS: { id: PerfilSeccion; label: string }[] = [
  { id: 'datos', label: 'Datos' },
  { id: 'lesiones', label: 'Lesiones' },
  { id: 'revisiones', label: '1:1' },
  { id: 'pagos', label: 'Pagos' },
  { id: 'historial', label: 'Historial' },
];

/** `title` = cabecera de sección; sin él, el panel de dentro lleva su propio rótulo. */
function Section({ id, title, children }: { id: PerfilSeccion; title?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={title ? `${id}-h` : undefined} className="flex scroll-mt-24 flex-col gap-3">
      {title ? <SectionHeader id={`${id}-h`} title={title} variant="title" /> : null}
      {children}
    </section>
  );
}

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3 border-b border-v2-border py-2 last:border-b-0 t-body-sm">
      <span className="text-v2-muted">{label}</span>
      <span className="min-w-0 truncate text-right text-v2-fg">{children}</span>
    </div>
  );
}

export function PerfilView({
  perfil,
  seccion,
  historial,
}: {
  perfil: FichaPerfil;
  seccion: string | null;
  historial: TimelineKind | null;
}) {
  const { shell } = useFicha();
  const router = useRouter();
  const retry = () => router.refresh();
  const failed = (k: FichaPerfil['errors'][number]) => perfil.errors.includes(k);

  useEffect(() => {
    if (seccion) document.getElementById(seccion)?.scrollIntoView({ block: 'start' });
  }, [seccion]);

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <nav aria-label="Secciones del perfil" className="flex flex-wrap gap-1.5">
        {SECTIONS.map((s) => (
          <FilterChip key={s.id} href={`#${s.id}`}>
            {s.label}
          </FilterChip>
        ))}
      </nav>

      <Section id="datos" title="Datos y clasificación">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <Dato label="Correo">{perfil.email ?? '—'}</Dato>
            <Dato label="Alta">{perfil.onboarded_at ? shortDate(perfil.onboarded_at) : 'aún sin cuestionario'}</Dato>
            <Dato label="Plan">{perfil.plan_mode === 'personal' ? 'Personal (solo para él)' : 'El de su grupo'}</Dato>
            <Dato label="Grupo">{shell.group?.name ?? 'sin grupo'}</Dato>
            <Dato label="Modalidad">{shell.division_label ?? '—'}</Dato>
          </Card>
          {failed('clasificacion') ? (
            <ErrorState title="No se ha podido cargar la clasificación" onRetry={retry} />
          ) : (
            <ClasificacionCard athleteId={shell.athlete_id} data={perfil.classification} planPersonal={perfil.plan_mode === 'personal'} />
          )}
        </div>
        {failed('dias') ? (
          <ErrorState title="No se han podido cargar sus días" onRetry={retry} />
        ) : (
          <TrainingDaysCard data={perfil.training_days} coachDaysPerWeek={perfil.classification.training_days_per_week} />
        )}
      </Section>

      <Section id="lesiones">
        <InjuryPanel athleteId={shell.athlete_id} lifecycle={shell.lifecycle} upcoming={perfil.upcoming} />
      </Section>

      <Section id="revisiones">
        {failed('revisiones') ? (
          <ErrorState title="No se han podido cargar sus revisiones" onRetry={retry} />
        ) : (
          <>
            <ReviewPanel athleteId={shell.athlete_id} athleteName={shell.name} review={perfil.review} />
            <SessionReportsBlock subject={{ athlete_id: shell.athlete_id }} sessions={perfil.sessions} isLead={false} />
          </>
        )}
      </Section>

      <Section id="pagos" title="Pagos">
        {failed('pagos') ? (
          <ErrorState title="No se han podido cargar sus pagos" onRetry={retry} />
        ) : (
          <PagosTab billing={perfil.billing} invoices={perfil.invoices} athleteId={shell.athlete_id} />
        )}
      </Section>

      <Section id="historial" title="Historial">
        {failed('historial') ? (
          <ErrorState title="No se ha podido cargar su historial" onRetry={retry} />
        ) : (
          <Timeline entries={perfil.timeline} today={shell.today} initial={historial} />
        )}
      </Section>
    </div>
  );
}
