'use client';

// Rendimiento — las analíticas del atleta con el MISMO cálculo que ve él en su
// iPhone (docs/analiticas/modelo.md A1; contrato visual: la propuesta firmada el
// 29-09) y, debajo, lo que el coach usa para que esas analíticas se sostengan:
// sus umbrales con su peldaño (declarables de un toque), sus zonas y sus tests.
//
// LO VIEJO SE RETIRA CUANDO LO NUEVO LO CUBRE (y no antes). La carga 42/7 fija
// (LoadBlock/PmcChart) ya no está: la cubren «Forma y fatiga». Mientras un
// bloque nuevo vaya en `pendientes`, su cálculo anterior sigue abajo y el
// bloque dice dónde: tiempo en zonas (→ Intensidad), 1RM y marcas (→ Progreso
// y Récords), variabilidad, reposo y sueño (→ Recuperación). Lo que ningún
// bloque cubre sigue siempre: el detalle de correr, los check-ins y el VO₂ del
// reloj, y la lista de sus carreras.

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { useSearchParams } from 'next/navigation';
import { VENTANA_PANEL_POR_DEFECTO, type VentanaClave } from '@fahybrid/shared/domain/analytics/ventana';
import { Button, EmptyState, ErrorState, SectionHeader } from '@/components/v2/ui';
import { PanelRendimiento } from '@/components/v2/analiticas/PanelRendimiento';
import { Umbrales } from '@/components/v2/analiticas/Umbrales';
import { fuenteHttp } from '@/components/v2/analiticas/detalle';
import type { BloqueTarjeta, Legado } from '@/components/v2/analiticas/huecos';
import type { ManejarAccion } from '@/components/v2/analiticas/piezas';
import { RegistrarResultadoForm } from '../RegistrarResultadoForm';
import type { FichaRendimiento } from '@/lib/dashboard/v2/ficha-rendimiento';
import { useFicha } from '../FichaContext';
import { RitmosZonasTab } from '../RitmosZonasTab';
import { TestsPanel } from '../tests/TestsPanel';
import { CorrerTab } from '../CorrerTab';
import { ZonasPanel } from './ZonasPanel';
import { CarrerasTab } from '../CarrerasTab';
import { FuerzaBlock } from './FuerzaBlock';
import { FisiologiaBlock } from './FisiologiaBlock';

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="flex scroll-mt-24 flex-col gap-3">
      <SectionHeader id={`${id}-h`} title={title} variant="title" />
      {children}
    </section>
  );
}

function irA(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function RendimientoView({ data, seccion, comparar }: { data: FichaRendimiento; seccion: string | null; comparar: boolean }) {
  const { shell, openChat, refresh } = useFicha();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [cargando, startTransition] = useTransition();
  const [recording, setRecording] = useState(false);
  const retry = () => router.refresh();

  useEffect(() => {
    if (seccion) document.getElementById(seccion)?.scrollIntoView({ block: 'start' });
  }, [seccion]);

  // La ventana es de la URL: el servidor vuelve a calcular el MISMO panel para ella.
  const onVentana = useCallback(
    (v: VentanaClave) => {
      const p = new URLSearchParams(search.toString());
      p.set('tab', 'rendimiento');
      p.delete('seccion');
      if (v === VENTANA_PANEL_POR_DEFECTO) p.delete('ventana');
      else p.set('ventana', v);
      startTransition(() => router.replace(`${pathname}?${p.toString()}`, { scroll: false }));
    },
    [pathname, router, search],
  );

  // «Comparar» no pide nada al servidor (la comparación ya viaja en el panel): solo queda en la URL, para enlazarla.
  const onComparar = useCallback((v: boolean) => {
    const p = new URLSearchParams(window.location.search);
    if (v) p.set('comparar', '1');
    else p.delete('comparar');
    const qs = p.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
  }, []);

  const fuente = useMemo(() => fuenteHttp(shell.athlete_id), [shell.athlete_id]);

  const manejar = useCallback<ManejarAccion>(
    (a) => {
      switch (a) {
        case 'plan':
          return { href: `/atletas/${shell.athlete_id}` };
        case 'escribir':
          return { onClick: openChat };
        case 'umbral':
          return { onClick: () => irA('umbrales') };
        case 'tests':
          return { onClick: () => irA('zonas') };
        default:
          return null;
      }
    },
    [openChat, shell.athlete_id],
  );

  const panel = data.panel.ok ? data.panel.data : null;
  const pendientes = new Set(panel?.pendientes ?? []);
  // Mientras un bloque nuevo no se sirva, su cálculo anterior sigue aquí y el bloque dice dónde.
  const legado: Partial<Record<BloqueTarjeta, Legado>> = {};
  if (pendientes.has('intensidad')) legado.intensidad = { seccion: 'Tiempo en zonas', href: '#tiempo-en-zonas' };
  if (pendientes.has('progreso')) legado.progreso = { seccion: 'Fuerza', href: '#fuerza' };
  if (pendientes.has('records')) legado.records = { seccion: 'Fuerza', href: '#fuerza' };
  if (pendientes.has('recuperacion')) legado.recuperacion = { seccion: 'Fisiología', href: '#fisiologia' };
  const recuperacionServida = panel != null && !pendientes.has('recuperacion');
  const fuerzaCubierta = panel != null && !pendientes.has('progreso') && !pendientes.has('records');
  const zonasCubiertas = panel != null && !pendientes.has('intensidad');

  const profiles = data.zones.ok ? data.zones.data : [];
  const carrera = shell.race ? { nombre: shell.race.name, fecha: shell.race.date } : null;

  return (
    <div className="flex min-w-0 flex-col gap-10">
      {panel ? (
        <PanelRendimiento
          panel={panel}
          atleta={{ nombre: shell.name, carrera }}
          onVentana={onVentana}
          cargandoVentana={cargando}
          compararInicial={comparar}
          onComparar={onComparar}
          metodoHref="/ajustes/metodo#analiticas"
          manejar={manejar}
          fuente={fuente}
          legado={legado}
        />
      ) : (
        <ErrorState title="No se han podido calcular sus analíticas" onRetry={retry} />
      )}

      <Section id="zonas" title="Umbrales, zonas y tests">
        <div id="umbrales" className="scroll-mt-24">
          {data.umbrales.ok ? (
            <Umbrales athleteId={shell.athlete_id} inicial={data.umbrales.data} hoy={shell.today} onGuardado={refresh} />
          ) : (
            <ErrorState title="No se han podido cargar sus umbrales" onRetry={retry} />
          )}
        </div>
        {data.zones.ok && profiles.length > 0 ? (
          <RitmosZonasTab athleteId={shell.athlete_id} athleteName={shell.name} profiles={profiles} />
        ) : data.zones.ok ? (
          <>
            <EmptyState
              title="Sin zonas de ritmo todavía"
              description="salen de un resultado de test"
              action={
                <Button size="sm" onClick={() => setRecording((v) => !v)}>
                  {recording ? 'Cerrar' : 'Apuntar un resultado'}
                </Button>
              }
            />
            {recording ? <RegistrarResultadoForm athleteId={shell.athlete_id} onDone={() => setRecording(false)} /> : null}
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

      <Section id="correr" title="Correr en detalle">
        <CorrerTab athleteId={shell.athlete_id} />
      </Section>

      {!zonasCubiertas ? (
        <Section id="tiempo-en-zonas" title="Tiempo en zonas">
          <ZonasPanel athleteId={shell.athlete_id} athleteName={shell.name} coachName={shell.club_name} athleteToday={shell.today} />
        </Section>
      ) : null}

      {!fuerzaCubierta ? (
        <Section id="fuerza" title="Fuerza">
          {data.strength.ok && data.benchmarks.ok ? (
            <FuerzaBlock maxes={data.strength.data} benchmarks={data.benchmarks.data} />
          ) : (
            <ErrorState title="No se han podido cargar sus marcas" onRetry={retry} />
          )}
        </Section>
      ) : null}

      <Section id="fisiologia" title={recuperacionServida ? 'Check-ins y VO₂' : 'Fisiología'}>
        {data.body.ok ? (
          <FisiologiaBlock body={data.body.data} soloLoQueNoEstaEnElPanel={recuperacionServida} />
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
