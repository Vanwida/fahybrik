'use client';

// BibliotecaView — client orchestrator for the v2 Biblioteca screen. Owns the
// active tab (mirrored to ?tab= so it's linkable), the two filter axes (modality
// rail + objective rail) and the live search. Filtering is client-side over the
// server-shaped data passed in via props; the footer count reflects the FILTERED
// view so the coach always sees how many items match.
//
// LA ESCALERA — Ejercicio › Bloque › Sesión › Microciclo, de lo más pequeño a lo
// más grande. Las pestañas van en ESE orden porque el orden ES la enseñanza: un
// movimiento arma un bloque, los bloques arman una sesión, las sesiones arman un
// microciclo. Cada pestaña lee SU tabla (ejercicios / blocks / templates /
// program_month_templates) — antes "Sesiones" leía `blocks` y llamaba sesión a un
// bloque, así que las sesiones reales no se veían en ninguna parte.
//
// Ejercicios es lo único agnóstico (nuestro); de Bloque para arriba es el método
// del coach. Ese panel lo construye `build-ejercicios`; aquí solo se monta.
//
// COMUNICADOS va DESPUÉS de la escalera y fuera de ella: no es un peldaño (no se
// compone de sesiones ni arma un microciclo), es el otro contenido reutilizable
// del coach — lo que le publica al atleta fuera del entreno. Su panel carga sus
// propios datos, como Ejercicios.

import { useMemo, useState, useCallback } from 'react';
import { useRouter, usePathname } from '@/i18n/navigation';
import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { SegmentedControl } from '@/components/v2/SegmentedControl';
import {
  IntroStrip,
  InfoDot,
  PipelineCue,
  ContextHint,
  useOrientationState,
  type IntroMicroStep,
} from '@/components/v2/orientacion';
import type { PipelineProgress, PipelineStepKey } from '@/lib/dashboard/v2/orientacion-types';
import { CategoryRail } from '@/components/v2/biblioteca/CategoryRail';
import { NuevoMicrocicloModal } from '@/components/v2/biblioteca/NuevoMicrocicloModal';
import { EjerciciosPanel } from '@/components/v2/biblioteca/EjerciciosPanel';
import { BloquesPanel } from '@/components/v2/biblioteca/BloquesPanel';
import { SesionesPanel } from '@/components/v2/biblioteca/SesionesPanel';
import { MicrociclosPanel } from '@/components/v2/biblioteca/MicrociclosPanel';
import { ComunicadosPanel } from '@/components/v2/biblioteca/ComunicadosPanel';
import {
  LIB_MODALITY_FILTERS,
  LIB_OBJECTIVES,
  LIB_READINESS,
  type V2LibModalityFilter,
  type V2LibObjective,
  type V2LibReadiness,
} from '@/lib/dashboard/v2/biblioteca-axes';
import type { V2BibliotecaData } from '@/lib/dashboard/v2/biblioteca-data';
import {
  NUEVA_SESION_HREF,
  NUEVO_BLOQUE_HREF,
  type BibliotecaTab,
} from '@/components/v2/biblioteca/biblioteca-nav';
import { cn } from '@/lib/utils';

export type { BibliotecaTab };

// ── Inline orientation (shared primitives) ──────────────────────────────────
const SECTION_KEY = 'biblioteca';

// Biblioteca owns the Sesiones + Microciclos steps of the build pipeline.
const BIBLIOTECA_STEPS: readonly PipelineStepKey[] = ['sesiones', 'microciclos'];

// The IntroStrip line defines the CURRENT tab (one sentence each, ≤22 words).
const TAB_INTRO_LINE: Record<BibliotecaTab, React.ReactNode> = {
  ejercicios: (
    <>
      Un <b>ejercicio</b> es un movimiento — la pieza más pequeña, con la que armas tus bloques.
    </>
  ),
  bloques: (
    <>
      Un <b>bloque</b> es una pieza reutilizable — el ladrillo con el que armas los días.
    </>
  ),
  sesiones: (
    <>
      Una <b>sesión</b> es un entreno entero — lo que tu atleta hace un día.
    </>
  ),
  microciclos: (
    <>
      Un <b>microciclo</b> es una estructura de varias semanas — la unidad que vivirá tu atleta.
    </>
  ),
  comunicados: (
    <>
      Una <b>plantilla</b> es un comunicado escrito una vez, listo para publicárselo a quien
      quieras.
    </>
  ),
};

// Los 4 micro-pasos enseñan el orden de tamaño — la confusión típica en Biblioteca.
const INTRO_STEPS: IntroMicroStep[] = [
  { title: 'Ejercicio', body: <>Un movimiento. La pieza más pequeña.</> },
  { title: 'Bloque', body: <>Una pieza reutilizable. El ladrillo de cada día.</> },
  { title: 'Sesión', body: <>Un entreno entero. Lo que hace tu atleta un día.</> },
  { title: 'Microciclo', body: <>Varias semanas de días. Lo que ordenas en Secuencias.</> },
];

const TAB_OPTIONS = (
  counts: V2BibliotecaData['counts'],
): ReadonlyArray<{ value: BibliotecaTab; label: string }> => [
  // Ejercicios aún no trae contador: su panel carga sus propios datos.
  { value: 'ejercicios', label: 'Ejercicios' },
  { value: 'bloques', label: `Bloques · ${counts.bloques}` },
  { value: 'sesiones', label: `Sesiones · ${counts.sesiones}` },
  { value: 'microciclos', label: `Microciclos · ${counts.microciclos}` },
  // Comunicados tampoco trae contador: su panel carga sus propios datos.
  { value: 'comunicados', label: 'Comunicados' },
];

type ModalityRailId = 'todas' | V2LibModalityFilter;

/** Las pestañas que se filtran por modalidad/objetivo (las que llevan grupo). */
const RAIL_TABS: readonly BibliotecaTab[] = ['bloques', 'sesiones'];

function matchesText(haystack: string, q: string): boolean {
  return haystack.toLowerCase().includes(q);
}

export function BibliotecaView({
  data,
  initialTab,
  coachKey,
  progress,
}: {
  data: V2BibliotecaData;
  initialTab: BibliotecaTab;
  coachKey: string;
  progress: PipelineProgress;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const orient = useOrientationState(coachKey, SECTION_KEY);

  const [tab, setTab] = useState<BibliotecaTab>(initialTab);
  const [modality, setModality] = useState<ModalityRailId>('todas');
  const [objective, setObjective] = useState<V2LibObjective | null>(null);
  const [readiness, setReadiness] = useState<V2LibReadiness | null>(null);
  const [query, setQuery] = useState('');
  const [nuevoMicroOpen, setNuevoMicroOpen] = useState(false);
  // La acción principal de Comunicados vive en la cabecera (como el resto), pero
  // el compositor lo monta su panel, que es quien tiene la lista que refrescar.
  const [nuevaPlantillaOpen, setNuevaPlantillaOpen] = useState(false);
  const q = query.trim().toLowerCase();

  const railVisible = RAIL_TABS.includes(tab);

  // Tab change → update state + reflect in the URL (shallow, no scroll jump).
  // Modality/objective solo aplican a las pestañas con grupo; al salir de ellas
  // se limpian para que una selección vieja nunca filtre otra pestaña en silencio.
  const onTab = useCallback(
    (next: BibliotecaTab) => {
      setTab(next);
      if (!RAIL_TABS.includes(next)) {
        setModality('todas');
        setObjective(null);
      }
      // El estado es un eje SOLO de bloques: al salir se limpia siempre.
      if (next !== 'bloques') setReadiness(null);
      // Salir con el compositor pedido lo dejaría esperando: al volver se abriría
      // solo, sin que nadie lo hubiera pulsado.
      if (next !== 'comunicados') setNuevaPlantillaOpen(false);
      router.replace(`${pathname}?tab=${next}`, { scroll: false });
    },
    [router, pathname],
  );

  // ── Filtered collections (per active tab) ─────────────────────────────────
  const bloques = useMemo(() => {
    return data.bloques.filter((b) => {
      if (modality !== 'todas' && b.modality_filter !== modality) return false;
      if (objective && b.objective !== objective) return false;
      if (readiness && b.readiness !== readiness) return false;
      // El source_ref ("S9 – Martes") entra en la búsqueda: los títulos
      // importados se repiten y la procedencia es lo que los distingue.
      if (q && !matchesText(`${b.title} ${b.description} ${b.group_label} ${b.source_ref ?? ''}`, q))
        return false;
      return true;
    });
  }, [data.bloques, modality, objective, readiness, q]);

  // Contadores del eje de estado. Sobre TODOS los bloques, no sobre los filtrados:
  // el rail dice cuánto trabajo hay en la biblioteca entera, no en la vista.
  const readinessCounts = useMemo(() => {
    const acc: Partial<Record<V2LibReadiness, number>> = { sin_dosis: 0, sin_tipar: 0, listo: 0 };
    for (const b of data.bloques) acc[b.readiness] = (acc[b.readiness] ?? 0) + 1;
    return acc;
  }, [data.bloques]);

  const sesiones = useMemo(() => {
    return data.sesiones.filter((s) => {
      if (modality !== 'todas' && s.modality_filter !== modality) return false;
      if (objective && s.objective !== objective) return false;
      if (q && !matchesText(`${s.title} ${s.group_label ?? ''} ${s.format_label ?? ''}`, q))
        return false;
      return true;
    });
  }, [data.sesiones, modality, objective, q]);

  // Microciclos are not modality/objective scoped — only text-filtered.
  const microciclos = useMemo(() => {
    if (!q) return data.microciclos;
    return data.microciclos.filter((m) => matchesText(`${m.name} ${m.level}`, q));
  }, [data.microciclos, q]);

  const FILTERED_COUNT: Record<BibliotecaTab, number | null> = {
    ejercicios: null, // su panel cuenta lo suyo
    bloques: bloques.length,
    sesiones: sesiones.length,
    microciclos: microciclos.length,
    comunicados: null, // su panel cuenta lo suyo
  };
  const COUNT_NOUN: Record<BibliotecaTab, string> = {
    ejercicios: '',
    bloques: 'bloques',
    sesiones: 'sesiones',
    microciclos: 'microciclos',
    comunicados: '',
  };
  const filteredCount = FILTERED_COUNT[tab];

  return (
    <div className="mx-auto flex w-full max-w-[var(--v2-container)] flex-col">
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="v2-display text-3xl sm:text-4xl">
            <span className="text-[color:var(--v2-fg)]">Biblioteca</span>
            {orient.hydrated && !orient.visible ? (
              <InfoDot onClick={orient.recall} className="ml-2" />
            ) : null}
          </h1>
          <p className="text-sm text-[color:var(--v2-muted)]">Codificar el método.</p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {/* Search */}
          <label className="relative flex items-center">
            <span className="pointer-events-none absolute left-2.5 text-[color:var(--v2-faint)]">
              <MIcon name="search" size={18} />
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="buscar…"
              aria-label="Buscar en la biblioteca"
              className={cn(
                'v2-focus h-9 w-40 rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] pl-8 pr-3 text-sm sm:w-52',
                'text-[color:var(--v2-fg)] placeholder:text-[color:var(--v2-faint)]',
                'focus:border-[color:var(--v2-border-strong)]',
              )}
            />
          </label>
          <PrimaryAction
            tab={tab}
            onCreateMicro={() => setNuevoMicroOpen(true)}
            onCreatePlantilla={() => setNuevaPlantillaOpen(true)}
          />
        </div>
      </div>

      {/* ── Inline orientation: pipeline cue + intro strip ───────────────── */}
      <div className="mt-5">
        <PipelineCue
          coachKey={coachKey}
          sectionKey={SECTION_KEY}
          activeKeys={BIBLIOTECA_STEPS}
          progress={progress}
          line={
            <>
              Tu <b>contenido</b> reutilizable: Bloques → Sesiones → Microciclos. Lo que ordenas en
              Periodización.
            </>
          }
        />
        {orient.visible ? (
          <IntroStrip
            icon="dashboard"
            line={TAB_INTRO_LINE[tab]}
            steps={INTRO_STEPS}
            expanded={orient.expanded}
            onToggle={orient.toggleExpanded}
            onDismiss={orient.dismiss}
          />
        ) : null}
      </div>

      {/* ── Tab bar ──────────────────────────────────────────────────────────
           `overflow-x-auto`: la tira de pastillas no cabe en 390 y sin esto
           empuja la PÁGINA, que entonces scrollea de lado entera. Lo que
           desborda scrollea dentro de su caja, nunca el cuerpo. */}
      <div className="mt-1 overflow-x-auto border-b border-[color:var(--v2-border)] pb-3">
        <SegmentedControl<BibliotecaTab>
          options={TAB_OPTIONS(data.counts)}
          value={tab}
          onChange={onTab}
          ariaLabel="Tipo de biblioteca"
        />
      </div>

      {/* El orden de tamaño — la confusión típica de la Biblioteca. En Comunicados
          la confusión es OTRA (¿esto no es el chat?), así que la pista cambia. */}
      {tab === 'comunicados' ? (
        <ContextHint className="mt-3">
          Esto no es el chat: un comunicado se <b>publica</b> y se <b>sigue</b> (si lo ha abierto,
          si lo ha hecho, qué te ha contestado). El día a día sigue en Mensajes.
        </ContextHint>
      ) : (
        <ContextHint className="mt-3">
          De lo más pequeño a lo más grande: <b>Ejercicio</b> (un movimiento) → <b>Bloque</b> (una
          pieza) → <b>Sesión</b> (un entreno) → <b>Microciclo</b> (varias semanas).
        </ContextHint>
      )}

      {/* ── Two-pane: category rail + grid ───────────────────────────────── */}
      <div className={cn('mt-4 grid gap-4', railVisible ? 'lg:grid-cols-[200px_1fr]' : 'grid-cols-1')}>
        {railVisible ? (
          <CategoryRail
            modality={modality}
            onModality={setModality}
            objective={objective}
            onObjective={setObjective}
            modalityOptions={LIB_MODALITY_FILTERS}
            objectiveOptions={LIB_OBJECTIVES}
            showModality
            // El estado solo existe para los bloques: una sesión no se "tipa".
            {...(tab === 'bloques'
              ? {
                  readiness,
                  onReadiness: setReadiness,
                  readinessOptions: LIB_READINESS,
                  readinessCounts,
                }
              : {})}
          />
        ) : null}

        <div className="min-w-0">
          {tab === 'ejercicios' ? <EjerciciosPanel query={q} /> : null}
          {tab === 'bloques' ? (
            <BloquesPanel items={bloques} hasAny={data.bloques.length > 0} />
          ) : null}
          {tab === 'sesiones' ? (
            <SesionesPanel items={sesiones} hasAny={data.sesiones.length > 0} />
          ) : null}
          {tab === 'microciclos' ? (
            <MicrociclosPanel
              items={microciclos}
              hasAny={data.microciclos.length > 0}
              onCreate={() => setNuevoMicroOpen(true)}
            />
          ) : null}
          {tab === 'comunicados' ? (
            <ComunicadosPanel
              query={q}
              nuevaPlantilla={nuevaPlantillaOpen}
              onNuevaPlantilla={setNuevaPlantillaOpen}
            />
          ) : null}

          {/* Footer count — honest, reflects active filters. */}
          {filteredCount != null && filteredCount > 0 ? (
            <p className="mt-4 text-xs text-[color:var(--v2-faint)]">
              <span className="v2-num">{filteredCount}</span> {COUNT_NOUN[tab]}
            </p>
          ) : null}
        </div>
      </div>

      {nuevoMicroOpen ? <NuevoMicrocicloModal onClose={() => setNuevoMicroOpen(false)} /> : null}
    </div>
  );
}

/** Acción principal de cada pestaña. Ejercicios la trae su propio panel. */
function PrimaryAction({
  tab,
  onCreateMicro,
  onCreatePlantilla,
}: {
  tab: BibliotecaTab;
  onCreateMicro: () => void;
  onCreatePlantilla: () => void;
}) {
  const CLS =
    'v2-focus inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[var(--v2-r-pill)] bg-[color:var(--v2-accent)] px-3.5 text-sm font-semibold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)]';

  if (tab === 'ejercicios') return null;
  if (tab === 'microciclos') {
    return (
      <button type="button" onClick={onCreateMicro} className={CLS}>
        <MIcon name="add" size={18} />
        Nuevo microciclo
      </button>
    );
  }
  if (tab === 'comunicados') {
    return (
      <button type="button" onClick={onCreatePlantilla} className={CLS}>
        <MIcon name="add" size={18} />
        Nueva plantilla
      </button>
    );
  }
  const href = tab === 'bloques' ? NUEVO_BLOQUE_HREF : NUEVA_SESION_HREF;
  return (
    <Link href={href} className={CLS}>
      <MIcon name="add" size={18} />
      {tab === 'bloques' ? 'Nuevo bloque' : 'Nueva sesión'}
    </Link>
  );
}
