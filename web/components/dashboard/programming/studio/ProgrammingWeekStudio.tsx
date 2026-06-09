'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import type {
  BlockUseModifiers,
  WeekDayPart,
  WeekDayPartItem,
  WeekSlots,
} from '@fahybrid/shared/schema/program-templates';
import type { Block } from '@fahybrid/shared/schema/blocks';
import type { MethodologyGroup } from '@fahybrid/shared/schema/methodology-groups';
import { createPartFromLibraryBlock } from '@/lib/dashboard/programming/block-to-part';
import { emptyWeekSlots } from '@/lib/dashboard/coach/program-week-slots';
import {
  blocksForSession,
  clonePartWithNewUids,
  duplicateDay,
  duplicatePart,
  hydrateSlotsForStudio,
  initialExpandedSessions,
  movePartBetweenSessions,
  patchSessionBlocks,
  reorderItemsInPart,
} from '@/lib/dashboard/programming/day-composition';
import {
  useSlotsHistory,
  useUndoRedoShortcuts,
} from '@/lib/dashboard/programming/use-slots-history';
import { createItemFromExercise, createPartFromPresetId } from '@/lib/dashboard/programming/part-factory';
import type { CatalogExercise } from '@/lib/dashboard/exercises/types';
import {
  parseActiveDrag,
  resolveExerciseDropTarget,
  resolvePartDropTarget,
  selectionKey,
  type SessionIndex,
  type StudioSelection,
} from '@/lib/dashboard/programming/studio-types';
import {
  ProgrammingLibrary,
  type LibraryWeekRow,
} from '@/components/dashboard/programming/studio/ProgrammingLibrary';
import { ProgrammingWeekCanvas } from '@/components/dashboard/programming/studio/ProgrammingWeekCanvas';
import { SessionDrawer } from '@/components/dashboard/session-drawer';
import { StudioToolbar } from '@/components/dashboard/programming/studio/StudioToolbar';
import { dayLabel, type DayOfWeek } from '@/lib/dashboard/constants/calendar';
import {
  PabloIAComposeModal,
  type PabloIAComposeMode,
} from '@/components/dashboard/programming/studio/PabloIAComposeModal';
import { ExerciseEditModal } from '@/components/dashboard/programming/studio/ExerciseEditModal';
import { BlockLibraryPicker } from '@/components/dashboard/programming/studio/BlockLibraryPicker';
import { useDebouncedAutosave, useUnloadGuard } from '@/lib/dashboard/hooks/use-autosave';
import { useMediaQuery } from '@/lib/dashboard/programming/use-media-query';
import { StudioMobileDrawer } from '@/components/dashboard/programming/studio/StudioMobileDrawer';
import {
  SessionLibraryRail,
  type RailSession,
} from '@/components/dashboard/programming/studio/SessionLibraryRail';
import {
  templateBlocksToParts,
  type TemplateDetailWire,
} from '@/lib/dashboard/programming/template-session';
import type { TemplateRow } from '@/components/dashboard/programar/library-items';
import { MIcon } from '@/components/dashboard/MIcon';

export interface StudioToolbarRenderState {
  name: string;
  level: string;
  phaseHint: string | null;
  dirty: boolean;
  saving: boolean;
  savedFlash: boolean;
  saveError: string | null;
  onClear: () => void;
  onSave: () => void;
  onPabloIAWeek: () => void;
  // F11 — undo/redo del board.
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

interface ProgrammingWeekStudioProps {
  week: {
    id: string;
    name: string;
    level: string;
    focus: string | null;
    coach_notes: string | null;
    atr_block_hint: string | null;
    slots_json: WeekSlots;
  };
  /**
   * Texto de orientación del board (p.ej. "Semana 2 del microciclo · ACC").
   * F14 (opción B): el board edita una plantilla sin fecha de calendario; se
   * orienta con la posición en el microciclo + fase, nunca con fecha inventada.
   */
  weekContextLabel?: string | null;
  /** Optional library extension props — when provided, library shows tabs Ejercicios/Semanas. */
  libraryWeeks?: LibraryWeekRow[];
  onSelectWeek?: (weekId: string) => void;
  onCreateWeek?: () => void;
  /**
   * Optional override: replaces the built-in `StudioToolbar` with a custom
   * header rendered by the caller. The studio still owns autosave / save
   * status and exposes them via the render-state argument.
   */
  renderToolbar?: (state: StudioToolbarRenderState) => React.ReactNode;
}

function cloneSlots(slots: WeekSlots): WeekSlots {
  return hydrateSlotsForStudio(JSON.parse(JSON.stringify(slots)) as WeekSlots);
}

function sessionLabel(idx: SessionIndex): string {
  if (idx === 0) return 'Entreno';
  if (idx === 1) return '2.º entreno';
  return `${idx + 1}.º entreno`;
}

/** Día + sesión cuya SESIÓN completa está abierta en el SessionDrawer. */
interface OpenSession {
  day_of_week: number;
  session_index: SessionIndex;
}

const dropCollision: CollisionDetection = (args) => {
  const active = parseActiveDrag(String(args.active.id));
  if (active?.kind === 'exercise') {
    // Un ejercicio solo puede caer DENTRO de un bloque.
    const droppables = args.droppableContainers.filter((c) =>
      String(c.id).startsWith('part:'),
    );
    const hits = pointerWithin({ ...args, droppableContainers: droppables });
    if (hits.length > 0) return hits;
  }
  if (active?.kind === 'sort-part') {
    // Mover un bloque: prioriza otro bloque sortable (insertar junto a él);
    // si no, la zona de la sesión (soltar al final / en sesión vacía) — F13.
    const partHits = pointerWithin({
      ...args,
      droppableContainers: args.droppableContainers.filter((c) =>
        String(c.id).startsWith('sort-part:'),
      ),
    });
    if (partHits.length > 0) return partHits;
    const sessionHits = pointerWithin({
      ...args,
      droppableContainers: args.droppableContainers.filter((c) =>
        String(c.id).startsWith('session:'),
      ),
    });
    if (sessionHits.length > 0) return sessionHits;
  }
  const hits = pointerWithin(args);
  if (hits.length > 0) return hits;
  return closestCenter(args);
};

export function ProgrammingWeekStudio({
  week,
  weekContextLabel,
  libraryWeeks,
  onSelectWeek,
  onCreateWeek,
  renderToolbar,
}: ProgrammingWeekStudioProps) {
  const [slots, setSlots] = useState<WeekSlots>(() => cloneSlots(week.slots_json));
  const [secondaryExpanded, setSecondaryExpanded] = useState<Set<number>>(() =>
    initialExpandedSessions(week.slots_json),
  );
  const [selected, setSelected] = useState<StudioSelection | null>(null);
  // Sesión abierta en el SessionDrawer (redesign §2b). Independiente de
  // `selected` para que quitar/deshacer un bloque no cierre el drawer.
  const [openSession, setOpenSession] = useState<OpenSession | null>(null);
  const [exercises, setExercises] = useState<CatalogExercise[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [dragLabel, setDragLabel] = useState<string | null>(null);
  const [pabloIAMode, setPabloIAMode] = useState<PabloIAComposeMode | null>(null);
  const [editingExercise, setEditingExercise] = useState<CatalogExercise | null>(null);
  // Biblioteca de bloques (0037): cargada una vez, reusada en el picker.
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [methodologyGroups, setMethodologyGroups] = useState<MethodologyGroup[]>([]);
  const [loadingBlocks, setLoadingBlocks] = useState(true);
  // Entrenos propios del coach — alimentan el rail de biblioteca (spec §3b).
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  // Sesión destino del picker de bloques (null = cerrado).
  const [blockPickerTarget, setBlockPickerTarget] = useState<{
    day_of_week: number;
    session_index: SessionIndex;
  } | null>(null);
  // Drawer de la librería en móvil/tablet (<lg). En lg+ la librería es panel fijo.
  const [mobileLibraryOpen, setMobileLibraryOpen] = useState(false);
  // En pointer táctil desactivamos el drag&drop: con scroll horizontal del board
  // el sensor de arrastre secuestraría el gesto de scroll. El coach edita en
  // móvil vía menús/panel (ver brief); el drag sigue intacto en desktop.
  const isCoarsePointer = useMediaQuery('(pointer: coarse)');
  // Desktop = panel de detalle inline + librería fija. Por debajo, drawers. Se
  // usa para MONTAR solo una de las dos variantes del panel (evita instanciar
  // el SessionDrawer/portales dos veces). `lg` = 1024px (breakpoint Tailwind).
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const slotsRef = useRef(slots);
  const savingRef = useRef(false);
  const pendingSaveRef = useRef(false);

  // Espejo de `slots` para lecturas en callbacks/effects (save, duplicar, drag).
  // Se actualiza en effect, no en render (react-hooks/refs). Seguro porque solo
  // se lee tras el commit, nunca de forma síncrona durante el render.
  useEffect(() => {
    slotsRef.current = slots;
  }, [slots]);

  // Historial undo/redo del estado de slots (F11). Cada mutación del board
  // empuja el estado PREVIO; undo/redo devuelven el estado a aplicar.
  const history = useSlotsHistory(slots);

  /**
   * Punto único de commit de mutaciones del board: registra el estado previo en
   * el historial, aplica el nuevo y marca dirty (salvo que se indique). Todas las
   * mutaciones de slots (añadir/quitar/mover bloque, editar params, mover entre
   * días, aceptar IA, limpiar) pasan por aquí para que undo/redo sea consistente
   * y el autosave persista siempre el resultado.
   */
  const commitSlots = useCallback(
    (
      producer: WeekSlots | ((prev: WeekSlots) => WeekSlots),
      opts?: { dirty?: boolean; history?: boolean },
    ) => {
      const prev = slotsRef.current;
      const next = typeof producer === 'function' ? producer(prev) : producer;
      if (next === prev) return;
      // `history: false` se usa cuando un cambio COMPLETA una operación ya
      // registrada (p.ej. hidratar los ejercicios de un bloque de biblioteca
      // tras insertarlo) — no debe ser un paso de undo independiente.
      if (opts?.history !== false) history.push(prev);
      // Mantén el espejo síncrono: si un handler hace varios commits en el mismo
      // tick, el siguiente `prev` debe ver el resultado del anterior. El effect
      // espejo cubre los `setSlots` directos (rehidratar week / undo-redo).
      slotsRef.current = next;
      setSlots(next);
      if (opts?.dirty !== false) {
        setSaveError(null);
        setDirty(true);
      }
    },
    [history],
  );

  // Rehidratación al cambiar de semana (el padre pasa otro `week.id` SIN remount).
  // Es un reset atómico orquestado: slots + historial undo/redo + selección +
  // flags de guardado deben reiniciarse juntos y SOLO cuando cambia `week.id`
  // (no en cada cambio de `slots_json`, que pisaría ediciones en vuelo). El reset
  // del historial (`history.reset`) hace setState internamente, así que no se
  // puede mover a fase de render; tiene que vivir en effect. Es sincronización
  // legítima a un cambio de prop-clave (no un setState derivado en cada render),
  // por eso se desactiva set-state-in-effect de forma acotada en este bloque.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const base = cloneSlots(week.slots_json);
    setSlots(base);
    history.reset(base);
    setSecondaryExpanded(initialExpandedSessions(week.slots_json));
    setSelected(null);
    setOpenSession(null);
    setDirty(false);
    setSaveError(null);
    setSavedFlash(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week.id]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const pointerSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );
  const noSensors = useSensors();
  // Sin sensores en móvil/tablet táctil → el board se mueve con scroll, no
  // arrastra. En desktop (≥lg) el drag&drop sigue intacto aunque haya pantalla
  // táctil (portátiles híbridos).
  const sensors = isCoarsePointer && !isDesktop ? noSensors : pointerSensors;

  useEffect(() => {
    // `loadingLibrary` ya arranca en true; no re-seteamos síncrono aquí
    // (set-state-in-effect). El fetch corre una vez y baja el flag en finally.
    let cancelled = false;
    fetch('/api/exercises?limit=2000', { credentials: 'include' })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        setExercises((json as { exercises: CatalogExercise[] }).exercises ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoadingLibrary(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Biblioteca de bloques + los 10 grupos de metodología (para el picker).
  useEffect(() => {
    // `loadingBlocks` ya arranca en true; sin re-set síncrono (set-state-in-effect).
    let cancelled = false;
    Promise.all([
      fetch('/api/coach/blocks?group=all', { credentials: 'include' }).then((r) => r.json()),
      fetch('/api/coach/methodology-groups', { credentials: 'include' }).then((r) => r.json()),
      fetch('/api/coach/templates', { credentials: 'include' }).then((r) => r.json()),
    ])
      .then(([blocksJson, groupsJson, templatesJson]) => {
        if (cancelled) return;
        setBlocks((blocksJson as { blocks?: Block[] }).blocks ?? []);
        setMethodologyGroups((groupsJson as { groups?: MethodologyGroup[] }).groups ?? []);
        setTemplates((templatesJson as { templates?: TemplateRow[] }).templates ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setBlocks([]);
          setMethodologyGroups([]);
          setTemplates([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingBlocks(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Selección + apertura del drawer de sesión: el drawer muestra la SESIÓN
  // completa; `selected` mantiene el resaltado del canvas y el deep-link al
  // ejercicio expandido.
  const selectAndOpen = useCallback((sel: StudioSelection) => {
    setSelected(sel);
    setOpenSession({ day_of_week: sel.day_of_week, session_index: sel.session_index });
  }, []);

  const closeDrawer = useCallback(() => {
    setSelected(null);
    setOpenSession(null);
  }, []);

  const updateBlocks = (
    dayOfWeek: number,
    sessionIndex: SessionIndex,
    updater: (blocks: WeekDayPart[]) => WeekDayPart[],
    opts?: { history?: boolean },
  ) => {
    commitSlots((prev) => {
      const day = prev.days.find((d) => d.day_of_week === dayOfWeek);
      if (!day) return prev;
      const next = updater(blocksForSession(day, sessionIndex));
      return patchSessionBlocks(prev, dayOfWeek, sessionIndex, next);
    }, opts);
  };

  // "A medida": bloque vacío con el formato (preset) elegido. Es una de las 3
  // fuentes del verbo unificado "Añadir bloque" — absorbe el antiguo AddPartMenu.
  const handleAddCustomBlock = (
    dayOfWeek: number,
    sessionIndex: SessionIndex,
    presetId: string,
  ) => {
    const part = createPartFromPresetId(presetId);
    if (!part) return;
    updateBlocks(dayOfWeek, sessionIndex, (blocks) => [...blocks, part]);
    selectAndOpen({
      target: 'part',
      day_of_week: dayOfWeek,
      session_index: sessionIndex,
      part_uid: part.uid,
    });
  };

  const handleOpenBlockPicker = (dayOfWeek: number, sessionIndex: SessionIndex) => {
    setBlockPickerTarget({ day_of_week: dayOfWeek, session_index: sessionIndex });
  };

  // Vía ÚNICA de inserción de un bloque de Biblioteca en una sesión concreta.
  // Inserción optimista: el part verbatim (coach_note + modificadores) aparece
  // al instante y queda seleccionado. Sus ejercicios ESTRUCTURADOS llegan en
  // diferido vía GET /api/coach/blocks/[id] → block_exercises (Fase 3). Si el
  // bloque es needs_review (sin block_exercises), items queda [] y el panel
  // degrada a verbatim + añadir a medida (correcto). La usan el picker por-día
  // y el rail de biblioteca (click-to-add).
  const insertLibraryBlockAt = (
    target: { day_of_week: number; session_index: SessionIndex },
    block: Block,
    modifiers: BlockUseModifiers,
  ) => {
    const part = createPartFromLibraryBlock(block, modifiers);
    updateBlocks(target.day_of_week, target.session_index, (prev) => [...prev, part]);
    selectAndOpen({
      target: 'part',
      day_of_week: target.day_of_week,
      session_index: target.session_index,
      part_uid: part.uid,
    });

    // Hidrata los ejercicios estructurados del bloque en el mismo part (por uid).
    void fetch(`/api/coach/blocks/${block.id}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const items = (data?.items ?? []) as WeekDayPartItem[];
        if (items.length === 0) return; // needs_review → se queda verbatim
        // history:false — completa el insert del bloque, no es un paso de undo aparte.
        updateBlocks(
          target.day_of_week,
          target.session_index,
          (prev) => prev.map((p) => (p.uid === part.uid ? { ...p, items } : p)),
          { history: false },
        );
      })
      .catch(() => {
        // Fallo de red → el part se queda verbatim (degradación segura). El
        // coach puede reintentar reinsertando o añadiendo ejercicios a medida.
      });
  };

  const handleAddBlockFromLibrary = (block: Block, modifiers: BlockUseModifiers) => {
    if (!blockPickerTarget) return;
    insertLibraryBlockAt(blockPickerTarget, block, modifiers);
  };

  // Rail de biblioteca (spec §3b): añade una sesión completa a un día por
  // click. Bloque de Pablo → vía única de inserción; entreno propio → sus
  // bloques se materializan como parts y, si la sesión no tiene título, hereda
  // el nombre del entreno.
  const handleAddRailSession = async (dayOfWeek: number, session: RailSession) => {
    if (session.kind === 'pablo') {
      insertLibraryBlockAt({ day_of_week: dayOfWeek, session_index: 0 }, session.block, {});
      return;
    }
    const res = await fetch(`/api/coach/templates/${session.template.id}`, {
      credentials: 'include',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { template: TemplateDetailWire };
    const parts = templateBlocksToParts(json.template);
    if (parts.length === 0) return;
    commitSlots((prev) => {
      const day = prev.days.find((d) => d.day_of_week === dayOfWeek);
      const existing = day ? blocksForSession(day, 0) : [];
      const patched = patchSessionBlocks(prev, dayOfWeek, 0, [...existing, ...parts]);
      // Hereda el título del entreno si la sesión aún no tiene uno.
      return {
        days: patched.days.map((d) =>
          d.day_of_week !== dayOfWeek
            ? d
            : {
                ...d,
                sessions: d.sessions.map((s, i) =>
                  i === 0 && !s.focus
                    ? { ...s, focus: json.template.name.slice(0, 120) }
                    : s,
                ),
              },
        ),
      };
    });
    selectAndOpen({
      target: 'part',
      day_of_week: dayOfWeek,
      session_index: 0,
      part_uid: parts[0]!.uid,
    });
  };

  const handleAddItemToPart = (
    drop: { day_of_week: number; session_index: SessionIndex; part_uid: string },
    exercise: CatalogExercise,
  ) => {
    const item = createItemFromExercise(exercise);
    updateBlocks(drop.day_of_week, drop.session_index, (blocks) =>
      blocks.map((part) =>
        part.uid === drop.part_uid ? { ...part, items: [...part.items, item] } : part,
      ),
    );
    selectAndOpen({
      target: 'item',
      day_of_week: drop.day_of_week,
      session_index: drop.session_index,
      part_uid: drop.part_uid,
      item_uid: item.uid,
    });
  };

  // ── Handlers del SessionDrawer (operan sobre la sesión abierta) ───────────
  const handleDrawerChangePart = (next: WeekDayPart) => {
    if (!openSession) return;
    updateBlocks(openSession.day_of_week, openSession.session_index, (blocks) =>
      blocks.map((p) => (p.uid === next.uid ? next : p)),
    );
  };

  const handleDrawerRemovePart = (partUid: string) => {
    if (!openSession) return;
    updateBlocks(openSession.day_of_week, openSession.session_index, (blocks) =>
      blocks.filter((p) => p.uid !== partUid),
    );
    if (selected && selected.part_uid === partUid) setSelected(null);
  };

  // "Duplicar como propio": reemplaza el uso del bloque de biblioteca por una
  // copia PROPIA editable (uids nuevos, sin source_block_id ni modificadores).
  // La prescripción verbatim de Pablo se conserva en coach_note como nota del
  // bloque; la biblioteca original no se toca.
  const handleDrawerDuplicateAsOwn = (partUid: string) => {
    if (!openSession) return;
    updateBlocks(openSession.day_of_week, openSession.session_index, (blocks) =>
      blocks.map((p) => {
        if (p.uid !== partUid) return p;
        const own = clonePartWithNewUids(p);
        delete own.source_block_id;
        delete own.block_modifiers;
        return own;
      }),
    );
  };

  const handleDrawerAddExercise = (partUid: string, exercise: CatalogExercise) => {
    if (!openSession) return;
    handleAddItemToPart(
      {
        day_of_week: openSession.day_of_week,
        session_index: openSession.session_index,
        part_uid: partUid,
      },
      exercise,
    );
  };

  // Título de la sesión (vive en session.focus, máx 120 — schema compartido).
  const handleDrawerChangeTitle = (title: string) => {
    if (!openSession) return;
    commitSlots((prev) => ({
      days: prev.days.map((d) =>
        d.day_of_week !== openSession.day_of_week
          ? d
          : {
              ...d,
              sessions: d.sessions.map((s, i) =>
                i === openSession.session_index ? { ...s, focus: title || undefined } : s,
              ),
            },
      ),
    }));
  };

  const handleRemovePart = (target: Extract<StudioSelection, { target: 'part' }>) => {
    updateBlocks(target.day_of_week, target.session_index, (blocks) =>
      blocks.filter((p) => p.uid !== target.part_uid),
    );
    if (selected && selectionKey(selected) === selectionKey(target)) {
      setSelected(null);
    }
  };

  const handleRemoveItem = (target: Extract<StudioSelection, { target: 'item' }>) => {
    updateBlocks(target.day_of_week, target.session_index, (blocks) =>
      blocks.map((part) =>
        part.uid === target.part_uid
          ? { ...part, items: part.items.filter((i) => i.uid !== target.item_uid) }
          : part,
      ),
    );
    if (selected && selectionKey(selected) === selectionKey(target)) {
      setSelected(null);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const parsed = parseActiveDrag(String(event.active.id));
    if (!parsed) return;
    if (parsed.kind === 'exercise') {
      const ex = exercises.find((e) => e.id === parsed.id);
      setDragLabel(ex?.name ?? 'Ejercicio');
      return;
    }
    if (parsed.kind === 'sort-part') {
      const day = slots.days.find((d) => d.day_of_week === parsed.day_of_week);
      const part = day
        ? blocksForSession(day, parsed.session_index).find((p) => p.uid === parsed.part_uid)
        : null;
      setDragLabel(part?.title ?? 'Bloque');
      return;
    }
    const day = slots.days.find((d) => d.day_of_week === parsed.day_of_week);
    const part = day
      ? blocksForSession(day, parsed.session_index).find((p) => p.uid === parsed.part_uid)
      : null;
    const item = part?.items.find((i) => i.uid === parsed.item_uid);
    setDragLabel(item?.exercise_name ?? 'Ejercicio');
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDragLabel(null);
    const active = parseActiveDrag(String(event.active.id));
    if (!active) return;

    const overId = event.over ? String(event.over.id) : null;
    if (!overId) return;

    if (active.kind === 'sort-part') {
      // Reordenar dentro del día o mover el bloque a otro día/sesión (F13).
      const target = resolvePartDropTarget(overId);
      if (!target) return;
      if (
        target.day_of_week === active.day_of_week &&
        target.session_index === active.session_index &&
        target.before_part_uid === active.part_uid
      ) {
        return;
      }
      commitSlots((prev) => {
        const next = movePartBetweenSessions(
          prev,
          { day_of_week: active.day_of_week, session_index: active.session_index },
          { day_of_week: target.day_of_week, session_index: target.session_index },
          active.part_uid,
          target.before_part_uid,
        );
        return next ?? prev;
      });
      return;
    }

    if (active.kind === 'sort-item') {
      const over = parseActiveDrag(overId);
      if (
        over?.kind === 'sort-item' &&
        over.day_of_week === active.day_of_week &&
        over.session_index === active.session_index &&
        over.part_uid === active.part_uid
      ) {
        commitSlots((prev) => {
          const next = reorderItemsInPart(
            prev,
            active.day_of_week,
            active.session_index,
            active.part_uid,
            active.item_uid,
            over.item_uid,
          );
          return next ?? prev;
        });
      }
      return;
    }

    const drop = resolveExerciseDropTarget(overId);
    if (!drop) return;

    const exercise = exercises.find((e) => e.id === active.id);
    if (!exercise) return;

    handleAddItemToPart(drop, exercise);
  };

  const handleAddSecondSession = (dayOfWeek: number) => {
    setSecondaryExpanded((prev) => new Set(prev).add(dayOfWeek));
  };

  const handleExerciseSaved = (updated: CatalogExercise) => {
    setExercises((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
  };

  const handleOpenPabloIADay = (dayOfWeek: number, sessionIndex: SessionIndex) => {
    setPabloIAMode({ kind: 'day', day_of_week: dayOfWeek, session_index: sessionIndex });
  };

  const handleOpenPabloIAWeek = () => {
    setPabloIAMode({ kind: 'week' });
  };

  const handleAcceptBlocks = (newBlocks: WeekDayPart[]) => {
    if (!pabloIAMode || pabloIAMode.kind !== 'day') return;
    updateBlocks(pabloIAMode.day_of_week, pabloIAMode.session_index, (prev) => [
      ...prev,
      ...newBlocks,
    ]);
  };

  const handleAcceptWeek = (days: WeekSlots['days']) => {
    const next = hydrateSlotsForStudio({ days });
    commitSlots(next);
    setSecondaryExpanded(initialExpandedSessions({ days }));
    setSelected(null);
  };

  const handleClearWeek = () => {
    commitSlots(emptyWeekSlots());
    setSecondaryExpanded(new Set());
    setSelected(null);
  };

  // Aplica un estado restaurado por undo/redo: lo trata como dirty para que el
  // autosave persista SIEMPRE el resultado del deshacer/rehacer (requisito F11).
  // `secondaryExpanded` se deriva de los slots restaurados (no vive en el historial).
  const applyRestored = useCallback((restored: WeekSlots) => {
    setSlots(restored);
    setSecondaryExpanded(initialExpandedSessions(restored));
    setSelected(null);
    setSaveError(null);
    setDirty(true);
  }, []);

  const handleUndo = useCallback(() => {
    const restored = history.undo();
    if (restored) applyRestored(restored);
  }, [history, applyRestored]);

  const handleRedo = useCallback(() => {
    const restored = history.redo();
    if (restored) applyRestored(restored);
  }, [history, applyRestored]);

  // Atajos: Cmd/Ctrl+Z deshace, Cmd/Ctrl+Shift+Z (o +Y) rehace. Desactivados
  // durante un drag para no interferir con la operación de arrastre.
  useUndoRedoShortcuts({ onUndo: handleUndo, onRedo: handleRedo, enabled: !dragLabel });

  // F12 — Duplicar bloque: inserta una copia (uids nuevos) justo después del
  // original y la selecciona.
  const handleDuplicatePart = (target: Extract<StudioSelection, { target: 'part' }>) => {
    const result = duplicatePart(slotsRef.current, {
      day_of_week: target.day_of_week,
      session_index: target.session_index,
      part_uid: target.part_uid,
    });
    if (!result) return;
    commitSlots(result.slots);
    selectAndOpen({
      target: 'part',
      day_of_week: target.day_of_week,
      session_index: target.session_index,
      part_uid: result.new_part_uid,
    });
  };

  // F12 — Duplicar día: copia todas las sesiones del día origen a otro día de la
  // misma semana (sustituye su contenido).
  const handleDuplicateDay = (fromDayOfWeek: number, toDayOfWeek: number) => {
    commitSlots((prev) => duplicateDay(prev, fromDayOfWeek, toDayOfWeek) ?? prev);
    setSelected(null);
  };

  const handleSave = useCallback(async () => {
    if (savingRef.current) {
      pendingSaveRef.current = true;
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    setSavedFlash(false);

    try {
      const payload = hydrateSlotsForStudio(slotsRef.current);
      const res = await fetch(`/api/coach/program-weeks/${week.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: week.name,
          level: week.level,
          atr_block_hint: week.atr_block_hint,
          focus: week.focus,
          coach_notes: week.coach_notes,
          slots_json: payload,
        }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { message?: string };
        throw new Error(err.message ?? 'Error al guardar');
      }
      setDirty(false);
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 2500);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      savingRef.current = false;
      setSaving(false);
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        if (slotsRef.current) void handleSave();
      }
    }
  }, [
    week.id,
    week.name,
    week.level,
    week.atr_block_hint,
    week.focus,
    week.coach_notes,
  ]);

  useDebouncedAutosave({
    dirty,
    revision: slots,
    enabled: !dragLabel,
    delayMs: 800,
    onSave: handleSave,
  });

  useUnloadGuard({ when: dirty || saving });

  // La librería se renderiza en dos sitios: panel fijo en lg+ y dentro del
  // drawer móvil en <lg. Al seleccionar una semana en móvil, cerramos el drawer.
  const libraryNode = (
    <ProgrammingLibrary
      exercises={exercises}
      loading={loadingLibrary}
      weeks={libraryWeeks}
      activeWeekId={week.id}
      onSelectWeek={
        onSelectWeek
          ? (weekId) => {
              onSelectWeek(weekId);
              setMobileLibraryOpen(false);
            }
          : undefined
      }
      onCreateWeek={onCreateWeek}
      onEditExercise={setEditingExercise}
    />
  );

  // SessionDrawer (redesign §2b) — la sesión COMPLETA del día abierto, con el
  // editor de prescripción inline. Mismo contenido en panel-desktop y
  // drawer-móvil; se monta en UN solo sitio según viewport.
  const openDay = openSession
    ? slots.days.find((d) => d.day_of_week === openSession.day_of_week)
    : undefined;
  const openSessionData = openSession ? openDay?.sessions?.[openSession.session_index] : undefined;
  const drawerNode = openSession ? (
    <SessionDrawer
      kicker={[
        dayLabel(openSession.day_of_week as DayOfWeek),
        sessionLabel(openSession.session_index),
        weekContextLabel ?? week.atr_block_hint ?? null,
      ]
        .filter(Boolean)
        .join(' · ')}
      statePill="Plantilla"
      session={openSessionData}
      exercises={exercises}
      initialExpandedItemUid={selected?.target === 'item' ? selected.item_uid : null}
      saveState={{
        dirty,
        saving,
        savedFlash,
        saveError,
        canUndo: history.canUndo,
        canRedo: history.canRedo,
        onUndo: handleUndo,
        onRedo: handleRedo,
      }}
      onClose={closeDrawer}
      onChangeTitle={handleDrawerChangeTitle}
      onChangePart={handleDrawerChangePart}
      onRemovePart={handleDrawerRemovePart}
      onDuplicatePart={(partUid) =>
        handleDuplicatePart({
          target: 'part',
          day_of_week: openSession.day_of_week,
          session_index: openSession.session_index,
          part_uid: partUid,
        })
      }
      onDuplicateAsOwn={handleDrawerDuplicateAsOwn}
      onAddExercise={handleDrawerAddExercise}
      onAddBlockLibrary={() =>
        handleOpenBlockPicker(openSession.day_of_week, openSession.session_index)
      }
      onAddBlockPabloIA={() =>
        handleOpenPabloIADay(openSession.day_of_week, openSession.session_index)
      }
      onAddBlockCustom={(presetId) =>
        handleAddCustomBlock(openSession.day_of_week, openSession.session_index, presetId)
      }
    />
  ) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={dropCollision}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex h-full min-h-0 flex-1 overflow-hidden">
        {/* Librería: panel fijo solo en lg+. En <lg vive en el drawer (abajo).
            Se monta solo en desktop para no instanciar dos veces los listados. */}
        {isDesktop ? libraryNode : null}

        <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[color:var(--surface)]">
          {/* Barra de acciones móvil/tablet (<lg): abre la librería en drawer.
              El drag&drop está desactivado en touch, así que el coach añade
              bloques con "Añadir bloque" en cada día y ajusta en el panel. */}
          <div className="flex shrink-0 items-center gap-2 border-b border-[color:var(--border-subtle)] px-4 py-2 lg:hidden">
            <button
              type="button"
              onClick={() => setMobileLibraryOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={mobileLibraryOpen}
              className="focus-ring inline-flex items-center gap-2 rounded-[var(--r-sm)] border border-[color:var(--border-subtle)] px-3 py-1.5 text-[12px] font-bold uppercase tracking-wider text-[color:var(--fg)] transition-colors hover:bg-[color:var(--surface-container-high)]"
            >
              <MIcon name="library_books" size={16} />
              Librería
            </button>
            <span className="truncate text-[11px] text-[color:var(--text-muted)]">
              Desliza para ver los días · toca un bloque para editarlo
            </span>
          </div>

          {renderToolbar ? (
            // `renderToolbar` es un render-prop (función que el caller pasa para
            // producir la cabecera). El linter cree que alguno de los valores que
            // recibe es un ref leído en render — falso positivo: solo recibe state
            // y callbacks estables. Disable acotado a este uso del render-prop.
            // eslint-disable-next-line react-hooks/refs
            renderToolbar({
              name: week.name,
              level: week.level,
              phaseHint: week.atr_block_hint,
              dirty,
              saving,
              savedFlash,
              saveError,
              onClear: handleClearWeek,
              onSave: () => void handleSave(),
              onPabloIAWeek: handleOpenPabloIAWeek,
              canUndo: history.canUndo,
              canRedo: history.canRedo,
              onUndo: handleUndo,
              onRedo: handleRedo,
            })
          ) : (
            <StudioToolbar
              name={week.name}
              level={week.level}
              phaseHint={week.atr_block_hint}
              dirty={dirty}
              saving={saving}
              savedFlash={savedFlash}
              saveError={saveError}
              onClear={handleClearWeek}
              onSave={() => void handleSave()}
              onPabloIAWeek={handleOpenPabloIAWeek}
              canUndo={history.canUndo}
              canRedo={history.canRedo}
              onUndo={handleUndo}
              onRedo={handleRedo}
            />
          )}
          {saveError ? (
            <p className="shrink-0 border-b border-[color:var(--border-subtle)] px-5 py-1 text-xs text-[color:var(--danger)]">
              {saveError} — reintentaremos al siguiente cambio
            </p>
          ) : null}

          <div className="flex min-h-0 flex-1 overflow-hidden">
            <ProgrammingWeekCanvas
              slots={slots}
              selected={selected}
              secondaryExpanded={secondaryExpanded}
              phaseHint={week.atr_block_hint}
              weekContextLabel={weekContextLabel}
              onSelectPart={selectAndOpen}
              onSelectItem={selectAndOpen}
              onRemovePart={handleRemovePart}
              onRemoveItem={handleRemoveItem}
              onAddSecondSession={handleAddSecondSession}
              onAddBlockFromLibrary={handleOpenBlockPicker}
              onAddCustomBlock={handleAddCustomBlock}
              onPabloIADay={handleOpenPabloIADay}
              onDuplicatePart={handleDuplicatePart}
              onDuplicateDay={handleDuplicateDay}
            />

            {/* SessionDrawer: panel derecho (~40%) solo en lg+. En <lg va al
                drawer móvil a pantalla completa (abajo). Sin sesión abierta,
                ese lado lo ocupa el rail de biblioteca (spec §3b): sesiones
                sugeridas por la fase ATR del microciclo, click-to-add a un día. */}
            {isDesktop && openSession ? (
              <div className="h-full w-[40%] min-w-[440px] max-w-[680px] shrink-0">
                {drawerNode}
              </div>
            ) : isDesktop ? (
              <SessionLibraryRail
                blocks={blocks}
                templates={templates}
                phaseHint={week.atr_block_hint}
                loading={loadingBlocks}
                onAdd={handleAddRailSession}
              />
            ) : null}
          </div>
        </section>
      </div>

      {/* Drawers (móvil/tablet): solo se montan en <lg para no duplicar los
          listados de la librería ni el panel de detalle / sus portales. */}
      {!isDesktop ? (
        <>
          <StudioMobileDrawer
            open={mobileLibraryOpen}
            onClose={() => setMobileLibraryOpen(false)}
            side="left"
            title="Librería"
          >
            {libraryNode}
          </StudioMobileDrawer>

          <StudioMobileDrawer
            open={openSession != null}
            onClose={closeDrawer}
            side="right"
            title="Sesión"
          >
            {drawerNode}
          </StudioMobileDrawer>
        </>
      ) : null}

      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }}>
        {dragLabel ? (
          // Lifted, tactile ghost while dragging: rotates a hair, glows accent.
          <div className="flex -rotate-1 items-center gap-2 rounded-[var(--r-l)] border border-[color:var(--accent)] bg-[color:var(--surface-elevated)] px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-[color:var(--fg)] shadow-[0_20px_44px_-12px_rgba(0,0,0,0.8),0_0_0_1px_var(--accent)] cursor-grabbing">
            <span aria-hidden className="h-2 w-2 rounded-full bg-[color:var(--accent)]" />
            {dragLabel}
          </div>
        ) : null}
      </DragOverlay>

      <PabloIAComposeModal
        open={pabloIAMode != null}
        mode={pabloIAMode ?? { kind: 'week' }}
        atrBlockHint={week.atr_block_hint}
        level={week.level}
        onAcceptBlocks={handleAcceptBlocks}
        onAcceptWeek={handleAcceptWeek}
        onClose={() => setPabloIAMode(null)}
      />

      {editingExercise ? (
        <ExerciseEditModal
          exercise={editingExercise}
          onClose={() => setEditingExercise(null)}
          onSaved={handleExerciseSaved}
        />
      ) : null}

      <BlockLibraryPicker
        open={blockPickerTarget != null}
        blocks={blocks}
        groups={methodologyGroups}
        loading={loadingBlocks}
        phaseHint={week.atr_block_hint}
        onClose={() => setBlockPickerTarget(null)}
        onAdd={handleAddBlockFromLibrary}
      />
    </DndContext>
  );
}
