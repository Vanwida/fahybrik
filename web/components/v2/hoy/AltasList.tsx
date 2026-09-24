'use client';

// La vista «Altas» de Hoy (lo que era /altas): una fila por alta pendiente, la
// más antigua primero, con su espera y «Revisar alta». «Revisar en fila» va a la
// primera y lleva el resto en `?fila=` para pasar a la siguiente.

import { Link } from '@/i18n/navigation';
import { Avatar, EmptyState, List, ListRow, SectionHeader, Tag, buttonVariants } from '@/components/v2/ui';
import type { HoyPerson } from '@/app/[locale]/(v2)/hoy/_data/hoy-extras';
import { agoLabel } from './hoy-format';
import { intakeQueueHref, sortIntakes } from './hoy-model';

export function AltasList({
  people,
  now,
  onOpen,
}: {
  people: ReadonlyArray<HoyPerson>;
  now: Date;
  onOpen: (p: HoyPerson) => void;
}) {
  const sorted = sortIntakes(people);
  const queue = intakeQueueHref(sorted.map((p) => p.athlete_id));
  if (sorted.length === 0) {
    return <EmptyState title="No hay altas pendientes." description="Cuando un atleta termine su cuestionario de entrada, aparece aquí." />;
  }
  return (
    <section className="flex flex-col gap-2" aria-labelledby="hoy-altas">
      <SectionHeader
        id="hoy-altas"
        title="Altas pendientes"
        count={sorted.length}
        action={
          queue && sorted.length > 1 ? (
            <Link href={queue} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              Revisar en fila
            </Link>
          ) : null
        }
      />
      <List aria-label="Altas pendientes" className="@container">
        {sorted.map((p, i) => (
          <ListRow
            key={p.athlete_id}
            onClick={() => onOpen(p)}
            leading={<Avatar name={p.name} src={p.avatar_url} size="md" />}
            title={
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate">{p.name}</span>
                {p.level_label ? <Tag className="hidden @min-[520px]:inline-flex">{p.level_label}</Tag> : null}
              </span>
            }
            detail={
              <span className="truncate">
                {p.onboarded_at ? `${agoLabel(p.onboarded_at, now)} · ` : ''}cuestionario de entrada por revisar
              </span>
            }
            trailing={
              <Link
                href={intakeQueueHref(sorted.slice(i).map((x) => x.athlete_id)) ?? `/atletas/${p.athlete_id}/intake`}
                className={buttonVariants({ variant: 'secondary', size: 'sm' })}
              >
                Revisar alta
              </Link>
            }
          />
        ))}
      </List>
    </section>
  );
}
