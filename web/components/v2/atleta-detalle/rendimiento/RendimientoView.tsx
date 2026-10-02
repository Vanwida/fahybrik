'use client';

// Rendimiento — las analíticas del atleta con el MISMO cálculo que ve él en su
// iPhone (docs/analiticas/modelo.md A1; contrato visual: la propuesta firmada el
// 29-09) y, debajo, lo que el coach usa para que esas analíticas se sostengan:
// sus umbrales con su peldaño (declarables de un toque), sus zonas y sus tests.
//
// Lo que sigue aparte del panel es lo que ningún bloque cubre: el detalle de
// correr, el tiempo en zonas con su «Dar feedback» (anotación del coach), los
// 1RM medidos (el motor de Progreso lee tests y series, no esta tabla), los
// check-ins y el VO₂ del reloj, y la lista de sus carreras.

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { useSearchParams } from 'next/navigation';
import { VENTANA_PANEL_POR_DEFECTO, type VentanaClave } from '@fahybrid/shared/domain/analytics/ventana';
import { Button, EmptyState, ErrorState, FilterChip, SectionHeader } from '@/components/v2/ui';
import { PanelRendimiento } from '@/components/v2/analiticas/PanelRendimiento';
import { Umbrales } from '@/components/v2/analiticas/Umbrales';
import { fuenteHttp } from '@/components/v2/analiticas/detalle';
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
import { RENDIMIENTO_VISTAS, rendimientoVista } from './rendimiento-navigation';

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="flex scroll-mt-24 flex-col gap-3">
      <SectionHeader id={`${id}-h`} title={title} variant="title" />
      {children}
    </section>
  );
}

export function RendimientoView({ data, seccion, comparar }: { data: FichaRendimiento; seccion: string | null; comparar: boolean }) {
  const { shell, openChat, openSession, refresh } = useFicha();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [cargando, startTransition] = useTransition();
  const [recording, setRecording] = useState(false);
  const retry = () => router.refresh();
  const vista = rendimientoVista(seccion);
  const irA = useCallback((id: string) => {
    const p = new URLSearchParams(window.location.search);
    p.set('tab', 'rendimiento');
    if (id === 'resumen') p.delete('seccion');
    else p.set('seccion', id);
    startTransition(() => router.replace(`${pathname}?${p.toString()}`, { scroll: false }));
  }, [pathname, router]);

  useEffect(() => {
    if (seccion) document.getElementById(seccion)?.scrollIntoView({ block: 'start' });
  }, [seccion]);

  // La ventana es de la URL: el servidor vuelve a calcular el MISMO panel para ella.
  const onVentana = useCallback(
    (v: VentanaClave) => {
      const p = new URLSearchParams(search.toString());
      p.set('tab', 'rendimiento');
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
    [openChat, shell.athlete_id, irA],
  );

  const panel = data.panel.ok ? data.panel.data : null;
  const profiles = data.zones.ok ? data.zones.data : [];
  const carrera = shell.race ? { nombre: shell.race.name, fecha: shell.race.date } : null;

  return (
    <div className="flex min-w-0 flex-col gap-10">
      <div className="flex flex-col gap-2">
        <nav aria-label="Qué analizar" className="flex flex-wrap gap-1.5">
          {RENDIMIENTO_VISTAS.map((v) => <FilterChip key={v.id} active={vista === v.id} onClick={() => irA(v.id)}>{v.label}</FilterChip>)}
        </nav>
        <p className="t-body-sm text-v2-muted">{RENDIMIENTO_VISTAS.find((v) => v.id === vista)?.description}</p>
      </div>
      {vista !== 'fisiologia' && vista !== 'zonas' ? panel ? (
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
          vista={vista}
          onSesiones={() => irA('tramos')}
          onSesionSinEjecucion={openSession}
        />
      ) : (
        <ErrorState title="No se han podido calcular sus analíticas" onRetry={retry} />
      ) : null}

      {vista === 'zonas' ? <Section id="zonas" title="Umbrales, zonas y tests">
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
      </Section> : null}

      {vista === 'carreras' ? <Section id="correr" title="Correr en detalle">
        <CorrerTab athleteId={shell.athlete_id} />
      </Section> : null}

      {vista === 'carga' ? <Section id="tiempo-en-zonas" title="Tiempo en zonas">
        <ZonasPanel athleteId={shell.athlete_id} athleteName={shell.name} coachName={shell.club_name} athleteToday={shell.today} />
      </Section> : null}

      {vista === 'progreso' ? <Section id="un-rm-medido" title="1RM medidos">
        {data.strength.ok ? <FuerzaBlock maxes={data.strength.data} /> : <ErrorState title="No se han podido cargar sus 1RM" onRetry={retry} />}
      </Section> : null}

      {vista === 'fisiologia' ? <Section id="fisiologia" title="Check-ins y VO₂">
        {data.body.ok ? <FisiologiaBlock body={data.body.data} /> : <ErrorState title="No se han podido cargar sus datos de salud" onRetry={retry} />}
      </Section> : null}

      {vista === 'carreras' ? <Section id="carreras" title="Carreras">
        <CarrerasTab athleteId={shell.athlete_id} />
      </Section> : null}
    </div>
  );
}
