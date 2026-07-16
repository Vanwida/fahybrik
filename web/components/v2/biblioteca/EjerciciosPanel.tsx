'use client';

// EjerciciosPanel — el peldaño más pequeño de la escalera: el MOVIMIENTO.
//
// Ejercicio es lo ÚNICO agnóstico (nuestro) de la biblioteca. De Bloque para
// arriba, todo es contenido del coach. Por eso este panel — y sólo este — tiene
// que explicar de DÓNDE viene cada fila: Base (nuestra, la tienen todos),
// Personalizado (una Base con la voz de este coach) o Mío (suyo, de cero).
//
// BUSCADOR: no lleva uno propio. La Biblioteca ya tiene el suyo en la cabecera y
// nos pasa `query` — dos cajas de buscar en la misma pantalla serían dos sitios
// donde escribir lo mismo.
//
// SE TRAE EL CATÁLOGO ENTERO UNA VEZ (?limit=2000) y filtra en cliente, igual que
// el ExercisePicker contra este mismo endpoint y que los paneles hermanos (que
// filtran sobre datos ya cargados). El filtro de origen se hace sobre `row.origin`,
// que el servidor deriva con la MISMA expresión que usa su propio filtro
// (`exerciseOriginExpr` / `exerciseOriginFilter`): lo que dice la etiqueta y lo que
// devolvería el filtro del servidor no pueden discrepar.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { EmptyState } from '@/components/v2/EmptyState';
import { SegmentedControl } from '@/components/v2/SegmentedControl';
import { ContextHint } from '@/components/v2/orientacion';
import { EjercicioRow } from '@/components/v2/biblioteca/EjercicioRow';
import { EjercicioEditor } from '@/components/v2/biblioteca/EjercicioEditor';
import type { ExerciseCategory } from '@fahybrid/shared/schema/_primitives';
import type { CoachExerciseRow } from '@/lib/exercises/coach-override';
import {
  ORIGIN_FACET_OPTIONS,
  matchesExerciseQuery,
  type OriginFacet,
} from '@/lib/dashboard/exercises/catalog-ui';

type EditorState =
  | { mode: 'edit'; ex: CoachExerciseRow }
  | { mode: 'create'; seed: { name: string; category: ExerciseCategory } | null }
  | null;

const CTA_CLS =
  'v2-focus inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-3 text-sm font-semibold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)]';

export function EjerciciosPanel({ query }: { query?: string }) {
  const [rows, setRows] = useState<CoachExerciseRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [facet, setFacet] = useState<OriginFacet>('todos');
  const [editor, setEditor] = useState<EditorState>(null);
  const [reload, setReload] = useState(0);

  // Limpiar el error es lo que hace el botón de reintentar, no el efecto: dentro
  // del efecto sería un setState síncrono (renders en cascada) y además dejaría en
  // dos sitios la respuesta a "¿cuándo deja de haber error?".
  const retry = useCallback(() => {
    setFailed(false);
    setReload((n) => n + 1);
  }, []);

  useEffect(() => {
    let alive = true;
    fetch('/api/exercises?limit=2000', { credentials: 'include' })
      .then((r) => (r.ok ? (r.json() as Promise<{ exercises: CoachExerciseRow[] }>) : null))
      .then((data) => {
        if (!alive) return;
        if (data?.exercises) setRows(data.exercises);
        else setFailed(true);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [reload]);

  // La Biblioteca ya manda `query` recortada y en minúsculas; se normaliza igual
  // aquí para no depender de ese detalle del padre.
  const q = (query ?? '').trim().toLowerCase();

  const visible = useMemo(() => {
    if (!rows) return [];
    return rows.filter(
      (ex) => (facet === 'todos' || ex.origin === facet) && matchesExerciseQuery(ex, q),
    );
  }, [rows, facet, q]);

  /** Una fila editada vuelve a su sitio con su origen NUEVO — si el filtro activo
   *  ya no la incluye, desaparecer es lo correcto: acaba de dejar de ser Base. */
  const onSaved = useCallback((row: CoachExerciseRow) => {
    setRows((prev) => (prev ? prev.map((r) => (r.id === row.id ? row : r)) : prev));
    setEditor(null);
  }, []);

  const onCreated = useCallback((row: CoachExerciseRow) => {
    setRows((prev) => (prev ? [row, ...prev] : [row]));
    // El recién creado es "Mío": si el filtro puesto lo escondería, se afloja el
    // filtro en vez de dejar al coach mirando una lista donde no está lo que acaba
    // de crear.
    setFacet((f) => (f === 'todos' || f === 'own' ? f : 'todos'));
    setEditor(null);
  }, []);

  const closeEditor = useCallback(() => setEditor(null), []);
  const openEdit = useCallback((ex: CoachExerciseRow) => setEditor({ mode: 'edit', ex }), []);
  const openCreateOwn = useCallback(
    (seed: { name: string; category: ExerciseCategory }) => setEditor({ mode: 'create', seed }),
    [],
  );

  return (
    <div className="flex flex-col">
      {/* ── Barra: origen + crear ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl<OriginFacet>
          options={ORIGIN_FACET_OPTIONS}
          value={facet}
          onChange={setFacet}
          size="sm"
          ariaLabel="Origen del ejercicio"
        />
        <button
          type="button"
          onClick={() => setEditor({ mode: 'create', seed: null })}
          className={`${CTA_CLS} ml-auto`}
        >
          <MIcon name="add" size={18} />
          Nuevo ejercicio
        </button>
      </div>

      {/* ── Lista ─────────────────────────────────────────────────────────── */}
      <div className="mt-3">
        {rows === null && !failed ? <SkeletonList /> : null}

        {failed ? (
          <EmptyState
            icon="cloud_off"
            title="No se pudo cargar tu catálogo"
            description="Puede ser un fallo de red puntual."
            action={
              <button type="button" onClick={retry} className={CTA_CLS}>
                <MIcon name="refresh" size={16} />
                Reintentar
              </button>
            }
          />
        ) : null}

        {rows !== null && visible.length === 0 ? <NoResults facet={facet} hasQuery={q !== ''} /> : null}

        {visible.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {visible.map((ex) => (
              <EjercicioRow key={ex.id} ex={ex} onEdit={openEdit} />
            ))}
          </ul>
        ) : null}
      </div>

      {/* ── Pie: cuenta honesta + qué significan los orígenes ─────────────── */}
      {visible.length > 0 ? (
        <p className="mt-4 text-xs text-[color:var(--v2-faint)]">
          <span className="v2-num">{visible.length}</span>{' '}
          {visible.length === 1 ? 'ejercicio' : 'ejercicios'}
        </p>
      ) : null}

      {rows !== null ? (
        <ContextHint
          className="mt-3"
          more={
            <>
              Personalizar una <b>Base</b> no afecta a nadie más — tu versión es tuya. Lo que define
              el movimiento (categoría, músculos, material) es igual para todos: si necesitas otro
              movimiento, crea uno <b>tuyo</b>.
            </>
          }
        >
          Los <b>Base</b> son nuestros y los tienes siempre. Si le cambias el nombre, las claves, la
          descripción o el vídeo pasa a ser <b>Personalizado</b>, sólo para ti. Los <b>Míos</b> los
          has creado tú.
        </ContextHint>
      ) : null}

      {editor ? (
        <EjercicioEditor
          // `key` = REMONTAJE obligatorio al cambiar de destino. Sin él, pasar de
          // editar una Base a "crear un ejercicio propio" reusaría la instancia
          // (mismo tipo, misma posición): los `useState` no se reinicializan y el
          // formulario nuevo arrancaría con los valores del ejercicio anterior.
          key={editor.mode === 'edit' ? `edit-${editor.ex.id}` : `create-${editor.seed?.name ?? ''}`}
          ex={editor.mode === 'edit' ? editor.ex : null}
          seed={editor.mode === 'create' ? editor.seed : null}
          onClose={closeEditor}
          onSaved={onSaved}
          onCreated={onCreated}
          onCreateOwn={openCreateOwn}
        />
      ) : null}
    </div>
  );
}

/** Nada que enseñar: o el filtro aprieta, o el coach aún no ha creado nada suyo. */
function NoResults({ facet, hasQuery }: { facet: OriginFacet; hasQuery: boolean }) {
  // "Míos" vacío no es un filtro que no encuentra: es el estado normal de quien
  // aún no ha creado ninguno. Merece explicar para qué sirve, no un "sin
  // resultados". Con búsqueda puesta, no: ahí sí es el filtro.
  if (facet === 'own' && !hasQuery) {
    return (
      <EmptyState
        icon="exercise"
        title="Aún no has creado ningún ejercicio tuyo"
        description="Los que crees serán sólo tuyos. Úsalos cuando un movimiento no esté en la base o lo hagas a tu manera."
      />
    );
  }
  if (facet === 'customized' && !hasQuery) {
    return (
      <EmptyState
        icon="edit_note"
        title="No has personalizado ninguno todavía"
        description="Abre un ejercicio de la base y ponle tu nombre, tus claves o tu vídeo: se guardará sólo para ti."
      />
    );
  }
  return (
    <EmptyState
      icon="filter_alt_off"
      title="Ningún ejercicio con estos filtros"
      description="Prueba con otra búsqueda o cambia el origen."
    />
  );
}

/** Carga: la forma de la lista, no un spinner — así no salta al llegar. */
function SkeletonList() {
  return (
    <ul className="flex flex-col gap-1.5" aria-hidden>
      {Array.from({ length: 6 }, (_, i) => (
        <li
          key={i}
          className="h-[52px] animate-pulse rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)]"
          style={{ animationDelay: `${i * 60}ms` }}
        />
      ))}
    </ul>
  );
}
