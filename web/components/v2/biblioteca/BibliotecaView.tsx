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
import { ComunicadosLibrary } from './ComunicadosLibrary';
import { LIBRARY_VIEWS, firstLibraryView, libraryView, libraryViewParams, type LibraryView } from './library-view';
import { useViewerChoice } from '../shell/viewer-prefs';

type Ver = LibraryView;

export function BibliotecaView({ data, coachId, coachName }: { data: { entrenos: LibraryRow[]; bloques: LibraryRow[] } | null; coachId: string; coachName: string }) {
  const locale = useLocale();
  const router = useRouter();
  const path = usePathname() ?? '';
  const params = useSearchParams();
  // El fallback no se guarda: solo una elección hecha por la persona llama a remember.
  const [remembered, remember] = useViewerChoice(`fahybrid:library:${coachId}`, LIBRARY_VIEWS, firstLibraryView(data));
  const ver = libraryView(new URLSearchParams(params?.toString()), remembered);
  const filter = parseLibFilter(params?.get('filtro'));
  const [createExercise, setCreateExercise] = useState(0);

  const go = (next: { ver?: Ver; filtro?: LibFilter }) => {
    const current = new URLSearchParams(params?.toString() ?? '');
    const sp = next.ver ? libraryViewParams(current, next.ver) : current;
    if (next.ver) {
      remember(next.ver);
    }
    if (next.filtro) sp.set('filtro', next.filtro);
    router.replace(`${path}?${sp.toString()}`, { scroll: false });
  };

  const live = (rows: LibraryRow[]) => rows.filter((r) => !r.archived).length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Biblioteca"
        actions={ver === 'comunicados' ? undefined :
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
            { value: 'comunicados', label: 'Comunicados' },
          ]}
          className="max-w-full flex-wrap self-start"
        />
      </PageHeader>
      {ver === 'comunicados' ? (
        <ComunicadosLibrary coachName={coachName} />
      ) : ver === 'ejercicios' ? (
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
          relatedCategory={{
            count: live(ver === 'entrenos' ? data.bloques : data.entrenos),
            label: ver === 'entrenos' ? 'bloques' : 'entrenos',
            href: `${path}?${libraryViewParams(new URLSearchParams(params?.toString()), ver === 'entrenos' ? 'bloques' : 'entrenos')}`,
            onOpen: () => remember(ver === 'entrenos' ? 'bloques' : 'entrenos'),
          }}
        />
      )}
    </div>
  );
}
