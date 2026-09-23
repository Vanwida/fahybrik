'use client';

// Programar › Biblioteca: Entrenos · Bloques · Ejercicios como tablas densas.
// La vista y el filtro viven en la URL (?ver=, ?filtro=) para poder enlazarlos.

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown, Plus } from 'lucide-react';
import type { LibraryRow } from '@/lib/dashboard/programming/library';
import { Button, ErrorState, Menu, PageHeader, SegmentedControl } from '@/components/v2/ui';
import { LibraryTable } from './LibraryTable';
import { parseLibFilter, type LibFilter } from './library-filter';
import { EjerciciosTable } from './EjerciciosTable';

type Ver = 'entrenos' | 'bloques' | 'ejercicios';

export function BibliotecaView({ data }: { data: { entrenos: LibraryRow[]; bloques: LibraryRow[] } | null }) {
  const locale = useLocale();
  const router = useRouter();
  const path = usePathname() ?? '';
  const params = useSearchParams();
  const ver: Ver = params?.get('ver') === 'entrenos' ? 'entrenos' : params?.get('ver') === 'ejercicios' ? 'ejercicios' : 'bloques';
  const filter = parseLibFilter(params?.get('filtro'));
  const [createExercise, setCreateExercise] = useState(0);

  const go = (next: { ver?: Ver; filtro?: LibFilter }) => {
    const sp = new URLSearchParams(params?.toString() ?? '');
    if (next.ver) {
      sp.set('ver', next.ver);
      sp.delete('filtro');
    }
    if (next.filtro) sp.set('filtro', next.filtro);
    router.replace(`${path}?${sp.toString()}`, { scroll: false });
  };

  const live = (rows: LibraryRow[]) => rows.filter((r) => !r.archived).length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Biblioteca"
        actions={
          <Menu
            trigger={
              <Button variant="primary" icon={Plus} iconEnd={ChevronDown}>
                Nuevo
              </Button>
            }
            items={[
              { label: 'Entreno', onSelect: () => router.push(`/${locale}/programar/biblioteca/entreno/nuevo`) },
              { label: 'Bloque', onSelect: () => router.push(`/${locale}/programar/biblioteca/bloque/nuevo`) },
              { label: 'Ejercicio', onSelect: () => { go({ ver: 'ejercicios' }); setCreateExercise((n) => n + 1); } },
            ]}
          />
        }
      >
        <SegmentedControl
          aria-label="Qué ver"
          value={ver}
          onValueChange={(v) => go({ ver: v })}
          items={[
            { value: 'entrenos', label: data ? `Entrenos · ${live(data.entrenos)}` : 'Entrenos' },
            { value: 'bloques', label: data ? `Bloques · ${live(data.bloques)}` : 'Bloques' },
            { value: 'ejercicios', label: 'Ejercicios' },
          ]}
          className="self-start"
        />
      </PageHeader>
      {ver === 'ejercicios' ? (
        <EjerciciosTable createSignal={createExercise} />
      ) : data === null ? (
        <ErrorState variant="page" description="La biblioteca no ha cargado." onRetry={() => router.refresh()} />
      ) : (
        <LibraryTable
          key={ver}
          rows={ver === 'entrenos' ? data.entrenos : data.bloques}
          noun={ver === 'entrenos' ? 'entreno' : 'bloque'}
          filter={filter}
          onFilter={(f) => go({ filtro: f })}
        />
      )}
    </div>
  );
}
