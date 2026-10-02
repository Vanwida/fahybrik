'use client';

import { Link } from '@/i18n/navigation';
import { Button, buttonVariants } from '@/components/v2/ui';
import type { ProgramRow } from '@/lib/dashboard/programming/programs';
import type { ProgramCopyAction } from './use-program-copy';
import { useLocale } from 'next-intl';
import { athleteStructureHref } from './program-context-link';

export function ProgramContextBar({ program, copy, returnHref }: { program: ProgramRow; copy: ProgramCopyAction; returnHref: string | null }) {
  const locale = useLocale();
  if (program.personal) return <div className="flex flex-wrap items-center justify-between gap-2 rounded-panel border border-v2-border p-3 t-body-sm text-v2-muted">
    <span>El contenido se actualiza en el plan de {program.personal.athlete_name}. Lo ya entrenado se conserva. La visibilidad de cada semana se gestiona desde su ficha.</span>
    <Link href={athleteStructureHref(program.personal.athlete_id, returnHref, locale)} className={buttonVariants({ size: 'sm' })}>Estructura y publicación</Link>
  </div>;
  if (!program.structure_locked) return null;
  return <div className="flex flex-wrap items-center justify-between gap-2 rounded-panel border border-v2-border p-3 t-body-sm text-v2-muted">
    <span>Este programa ya está asignado. Sus días se actualizan en los atletas; para cambiar el número de semanas, crea una copia y asígnala después.</span>
    <Button size="sm" loading={copy.busy} onClick={() => void copy.create()}>Crear copia para reasignar</Button>
  </div>;
}
