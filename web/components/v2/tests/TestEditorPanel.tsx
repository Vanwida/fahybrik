'use client';

// #34 — el panel de crear/editar un test del coach. Un test ES UN ENTRENO: se
// monta con el MISMO editor que cualquier sesión (bloques → ejercicio → campos
// numéricos), y lo único suyo es el CUÁNDO (agenda). Nombre · Nota · Contenido ·
// Agenda, y nada más.
//
// Ya NO se pregunta "qué mide" (2026-08-08): se DEDUCE del contenido — en un
// esfuerzo máximo se mide la variable que no fijas (1000 m → tiempo; 10 min →
// distancia; un lift a tope → carga). Preguntarlo aparte, en una lista abstracta
// con su propio vocabulario, era decir dos veces lo mismo y romper el esquema
// del resto de la app. Ver shared/domain/coach/test-derive.ts.

import { useEffect, useMemo, useState } from 'react';
import { SidePanel, Field, TextInput, TextArea } from '@/components/v2/periodizacion/SidePanel';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';
import {
  derivedMeasureFor,
  calibrationLabelFor,
} from '@fahybrid/shared/domain/coach/test-derive';
import type { EditorBlock } from '@/lib/dashboard/v2/editor-types';
import { createBlockFromArchetype, type ArchetypeId } from '@/lib/dashboard/v2/archetypes';
import { createHyroxSimBlock } from '@/lib/dashboard/v2/hyrox-template';
import {
  TEST_FAMILY_LABEL,
  TEST_FAMILY_ORDER,
  TEST_PRESETS_BY_FAMILY,
  type TestPreset,
} from '@fahybrid/shared/domain/coach/test-catalog';
import { BlockEditor } from '@/components/v2/editor/BlockEditor';
import { ArchetypeGrid } from '@/components/v2/editor/ArchetypePicker';
import { PanelButton } from './chrome';
import { type TestDraft } from './draft';

const DOW_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const;

/**
 * El bloque por defecto de un test: UN ESFUERZO. Sin `format` ni `archetype_id`,
 * así que `patternForBlock` no resuelve ningún patrón y BlockEditor cae a su vía
 * directa — selector de EJERCICIO + campos numéricos. Que es lo que un test es:
 * «1000 m de remo», no una forma de sesión. Elegir antes «Carrera continua / WOD
 * / EMOM» para acabar cambiando el ejercicio a mano era pedirle al coach que
 * pasara por un vocabulario que no es el suyo aquí (Alex, 8-ago).
 */
function nuevoEsfuerzo(seq: number): EditorBlock {
  return {
    uid: `test-blk-${seq}`,
    title: 'Esfuerzo',
    format: null,
    items: [
      {
        uid: `test-it-${seq}`,
        exercise_id: null,
        exercise_name: '',
        prescription: {
          scheme: 'steady',
          sets: [{ measure: { kind: 'distance', meters: 1000 } }],
        },
      },
    ],
  };
}

export function TestEditorPanel({
  draft,
  onChange,
  onSave,
  onClose,
  saving,
  contentLoading = false,
}: {
  draft: TestDraft;
  onChange: (d: TestDraft) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
  /** El contenido de un test existente se hidrata aparte (GET), después de abrir
   *  el panel — mientras llega, «Contenido» lo dice en vez de parecer vacío. */
  contentLoading?: boolean;
}) {
  const [blockPickerOpen, setBlockPickerOpen] = useState(false);

  // slug del catálogo → ejercicio real. Es lo que permite que picar «Remo 2 km»
  // deje el bloque montado y no un hueco que el coach tenga que rellenar. Si el
  // ejercicio no existe en esta base, el preset entra igual con su nombre y el
  // coach lo elige a mano: degrada, no rompe.
  const [porSlug, setPorSlug] = useState<Map<string, { id: string; name: string }>>(new Map());
  useEffect(() => {
    let vivo = true;
    fetch('/api/exercises?limit=2000', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { exercises?: Array<{ id: string; name: string; slug?: string }> } | null) => {
        if (!vivo || !d?.exercises) return;
        const m = new Map<string, { id: string; name: string }>();
        for (const e of d.exercises) if (e.slug) m.set(e.slug, { id: e.id, name: e.name });
        setPorSlug(m);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, []);

  /** Picar un test del catálogo: queda montado y el nombre se rellena solo. */
  const pickPreset = (p: TestPreset) => {
    const seq = draft.content.length + 1;
    const nombre = draft.name.trim() || p.id;
    if (p.results && p.results.length > 0) {
      onChange({
        ...draft,
        name: nombre,
        ...(p.note && !draft.protocol.trim() ? { protocol: p.note } : {}),
        results: p.results.map((r) => ({
          kind: 'baseline' as const,
          measure: r.measure,
          unit: 'cm' as const,
          label: r.label,
          optional: r.optional === true,
        })),
      });
      return;
    }
    if (p.hyrox) {
      onChange({ ...draft, name: nombre, content: [...draft.content, createHyroxSimBlock()] });
      return;
    }
    // Un PROTOCOLO (el HCT) monta un bloque por estación, en orden.
    const fuentes = p.stations ?? [
      { label: p.label, exercise: p.exercise, exerciseLabel: p.exerciseLabel, prescription: p.prescription },
    ];
    const bloques: EditorBlock[] = fuentes.map((st, k) => {
      const hit = st.exercise.map((sl) => porSlug.get(sl)).find(Boolean);
      return {
        uid: `test-blk-${seq}-${k}`,
        title: st.label,
        format: null,
        items: [
          {
            uid: `test-it-${seq}-${k}`,
            exercise_id: hit ? Number(hit.id) : null,
            exercise_name: hit?.name ?? st.exerciseLabel,
            prescription: st.prescription,
          },
        ],
      };
    });
    onChange({
      ...draft,
      name: nombre,
      // La nota del protocolo solo se pone si el coach no había escrito la suya.
      ...(p.note && !draft.protocol.trim() ? { protocol: p.note } : {}),
      content: [...draft.content, ...bloques],
    });
  };

  const setBlock = (i: number, b: EditorBlock) =>
    onChange({ ...draft, content: draft.content.map((x, j) => (j === i ? b : x)) });
  const addBlock = (id: ArchetypeId) => {
    onChange({ ...draft, content: [...draft.content, createBlockFromArchetype(id)] });
    setBlockPickerOpen(false);
  };
  const addEsfuerzo = () =>
    onChange({ ...draft, content: [...draft.content, nuevoEsfuerzo(draft.content.length + 1)] });
  const addItemTo = (i: number) => {
    const b = draft.content[i];
    if (!b) return;
    const extra = nuevoEsfuerzo(Date.now()).items[0]!;
    setBlock(i, { ...b, items: [...b.items, extra] });
  };
  const removeBlock = (i: number) =>
    onChange({ ...draft, content: draft.content.filter((_, j) => j !== i) });

  // Qué medirá el test, leído del contenido que el coach acaba de construir.
  // Se recalcula solo: cambia «1000 m» por «10 min» y esto pasa de tiempo a
  // distancia sin que haya que tocar nada más.
  const medido = useMemo(
    () =>
      draft.content.flatMap((b) =>
        b.items.flatMap((it) => {
          const d = derivedMeasureFor({
            exercise_name: it.exercise_name,
            prescription: it.prescription,
          });
          if (!d) return [];
          return [{
            uid: it.uid,
            nombre: it.exercise_name || 'Sin ejercicio',
            texto: `Se mide ${d.label}`,
            calibra: calibrationLabelFor({
              exercise_name: it.exercise_name,
              prescription: it.prescription,
            }),
          }];
        }),
      ),
    [draft.content],
  );

  const setSchedule = (i: number, patch: Partial<TestDraft['schedule'][number]>) => {
    onChange({
      ...draft,
      schedule: draft.schedule.map((s, j) => (j === i ? { ...s, ...patch } : s)),
    });
  };
  const addSchedule = () =>
    onChange({ ...draft, schedule: [...draft.schedule, { week_offset: 1, day_of_week: 1 }] });
  const removeSchedule = (i: number) =>
    onChange({ ...draft, schedule: draft.schedule.filter((_, j) => j !== i) });

  return (
    <SidePanel
      title={draft.id === null ? 'Nuevo test' : 'Editar test'}
      onClose={onClose}
      footer={
        <>
          <PanelButton variant="ghost" onClick={onClose}>
            Cancelar
          </PanelButton>
          <PanelButton variant="primary" onClick={onSave} disabled={saving}>
            <MIcon name="check" size={15} /> {saving ? 'Guardando…' : 'Guardar'}
          </PanelButton>
        </>
      }
    >
      <Field label="Nombre">
        <TextInput
          value={draft.name}
          onChange={(v) => onChange({ ...draft, name: v })}
          placeholder="5K control"
          maxLength={120}
          autoFocus
        />
      </Field>

      <Field label="Nota" hint="la lee el atleta justo antes de empezar · opcional">
        <TextArea
          value={draft.protocol}
          onChange={(v) => onChange({ ...draft, protocol: v })}
          placeholder="Calienta bien antes de salir a por todas."
          maxLength={4000}
        />
      </Field>

      {/* Contenido — el bloque real de la sesión: ejercicio + dosis, igual que
          un entreno normal (docs/DECISIONS.md, 2026-08-08). Sin bloques el test
          sigue siendo válido: el atleta lo hace según sus resultados, sin una
          sesión guiada (el mecanismo automático de siempre). */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-label font-bold uppercase tracking-[0.05em] text-[color:var(--v2-muted)]">
            Contenido
          </span>
          {!blockPickerOpen ? (
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={addEsfuerzo}
                className="v2-focus inline-flex items-center gap-1 rounded-[var(--v2-r-s)] px-1.5 py-0.5 text-label font-bold text-[color:var(--v2-accent)] hover:bg-[color:var(--v2-accent-soft)]"
              >
                <MIcon name="add" size={14} /> Añadir ejercicio
              </button>
              {/* Escape para el test que SÍ tiene forma: una simulación HYROX, un
                  circuito, un EMOM. Secundario a propósito: es la excepción. */}
              <button
                type="button"
                onClick={() => setBlockPickerOpen(true)}
                className="v2-focus rounded-[var(--v2-r-s)] px-1.5 py-0.5 text-label font-semibold text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-fg)]"
              >
                o un bloque con forma
              </button>
            </div>
          ) : null}
        </div>

        {contentLoading ? (
          <p className="rounded-[var(--v2-r-s)] border border-dashed border-[color:var(--v2-border)] px-3 py-2.5 text-label leading-snug text-[color:var(--v2-faint)]">
            Cargando el contenido…
          </p>
        ) : draft.content.length === 0 && !blockPickerOpen ? (
          /* El catálogo, de entrada y sin un clic previo: es el camino del 90 %
             de los tests. Picar uno lo deja montado y rellena el nombre. */
          <div className="@container">
            <p className="mb-3 text-label leading-snug text-[color:var(--v2-faint)]">
              <b className="text-[color:var(--v2-muted)]">Atajos</b>: picas uno y
              queda montado. ¿Otra cosa (10 min de remo, 40 cal, lo que sea)? Dale
              a <b className="text-[color:var(--v2-accent)]">Añadir ejercicio</b>{' '}
              y lo montas tú: ejercicio, medida (distancia · tiempo · calorías ·
              reps) y el número.
            </p>
            <div className="flex flex-col gap-4">
              {TEST_FAMILY_ORDER.map((fam) => (
                <div key={fam}>
                  <span className="mb-1.5 block text-label font-bold uppercase tracking-[0.05em] text-[color:var(--v2-faint)]">
                    {TEST_FAMILY_LABEL[fam]}
                  </span>
                  <div className="grid grid-cols-1 gap-2 @md:grid-cols-2 @2xl:grid-cols-3">
                    {TEST_PRESETS_BY_FAMILY[fam].map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => pickPreset(p)}
                        className="v2-focus flex min-w-0 flex-col gap-0.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 py-2.5 text-left transition-colors hover:border-[color:var(--v2-accent)]"
                      >
                        <span className="truncate text-body font-bold text-[color:var(--v2-fg)]">
                          {p.label}
                        </span>
                        <span className="text-label leading-snug text-[color:var(--v2-muted)]">
                          {p.hint}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {draft.content.length > 0 ? (
          <div className="flex flex-col gap-3">
            {draft.content.map((block, i) => (
              <div
                key={block.uid}
                className="rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-3"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-label font-bold text-[color:var(--v2-faint)]">
                    Bloque {i + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeBlock(i)}
                    aria-label="Quitar bloque"
                    className="v2-focus flex h-7 w-7 items-center justify-center rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] text-[color:var(--v2-faint)] transition-colors hover:border-[color:var(--v2-danger)] hover:text-[color:var(--v2-danger)]"
                  >
                    <MIcon name="close" size={14} />
                  </button>
                </div>
                <BlockEditor
                  block={block}
                  onChange={(next) => setBlock(i, next)}
                  onAddItem={() => addItemTo(i)}
                />
              </div>
            ))}
          </div>
        ) : null}

        {blockPickerOpen ? (
          <div className="mt-2.5 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface)] p-3.5">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <span className="text-body font-bold text-[color:var(--v2-fg)]">
                Elige el tipo de bloque
              </span>
              <button
                type="button"
                onClick={() => setBlockPickerOpen(false)}
                aria-label="Cerrar el selector de tipo"
                className="v2-focus shrink-0 rounded-[var(--v2-r-s)] p-1 text-[color:var(--v2-muted)] transition-colors hover:bg-[color:var(--v2-surface-2)] hover:text-[color:var(--v2-fg)]"
              >
                <MIcon name="close" size={16} />
              </button>
            </div>
            <ArchetypeGrid onPick={addBlock} />
          </div>
        ) : null}
      </div>

      {/* Qué mide — DEDUCIDO del contenido, no preguntado (test-derive.ts).
          En un esfuerzo máximo se mide la variable que NO fijas: pones 1000 m y
          se mide el tiempo; pones 10 min y se mide la distancia. Pedírselo
          aparte al coach era decir dos veces lo mismo, y permitía que las dos
          se contradijeran. */}
      {medido.length > 0 ? (
        <div>
          <span className="mb-1.5 block text-label font-bold uppercase tracking-[0.05em] text-[color:var(--v2-muted)]">
            Qué mide
          </span>
          <div className="flex flex-col gap-1 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-2.5">
            {medido.map((m) => (
              <div key={m.uid} className="flex items-baseline justify-between gap-3 text-label">
                <span className="truncate text-[color:var(--v2-fg)]">{m.nombre}</span>
                <span className="shrink-0 text-[color:var(--v2-muted)]">
                  {m.texto}
                  {m.calibra ? (
                    <span className="ml-1.5 font-bold text-[color:var(--v2-accent)]">
                      · calibra {m.calibra}
                    </span>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-1 text-label leading-snug text-[color:var(--v2-faint)]">
            Se deduce de lo que fijas en cada bloque. Al terminar, la app rellena
            la marca con lo que midió.
          </p>
        </div>
      ) : null}
      {/* Agenda */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-label font-bold uppercase tracking-[0.05em] text-[color:var(--v2-muted)]">
            Agenda
          </span>
          <button
            type="button"
            onClick={addSchedule}
            className="v2-focus inline-flex items-center gap-1 rounded-[var(--v2-r-s)] px-1.5 py-0.5 text-label font-bold text-[color:var(--v2-accent)] hover:bg-[color:var(--v2-accent-soft)]"
          >
            <MIcon name="add" size={14} /> Añadir semana
          </button>
        </div>
        {draft.schedule.length === 0 ? (
          <p className="rounded-[var(--v2-r-s)] border border-dashed border-[color:var(--v2-border)] px-3 py-2.5 text-label leading-snug text-[color:var(--v2-faint)]">
            Sin agenda: el test queda en tu catálogo pero no se programa solo. Añade una semana para que se inyecte en el plan del atleta.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {draft.schedule.map((s, i) => (
              <div
                key={i}
                className="flex flex-wrap items-center gap-2 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-2"
              >
                {/* SEMANA CERO (week_offset 0): los días entre que asignas el
                    plan y el lunes que arranca. La ventana mide de 1 a 7 días
                    según cuándo asignes, así que ahí el día es una PREFERENCIA:
                    lo que no cabe se desliza, y lo que no entra se dice. */}
                <button
                  type="button"
                  onClick={() =>
                    setSchedule(i, { week_offset: s.week_offset === 0 ? 1 : 0 })
                  }
                  aria-pressed={s.week_offset === 0}
                  title="Antes de que arranque el plan, en los días que queden libres"
                  className={cn(
                    'v2-focus h-7 rounded-[var(--v2-r-pill)] px-2.5 text-label font-bold transition-colors',
                    s.week_offset === 0
                      ? 'bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)]'
                      : 'border border-[color:var(--v2-border)] text-[color:var(--v2-muted)] hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]',
                  )}
                >
                  Antes de empezar
                </button>
                {s.week_offset === 0 ? null : (
                  <label className="inline-flex items-center gap-1.5 text-label font-semibold text-[color:var(--v2-muted)]">
                    Semana
                    <input
                      type="number"
                      min={1}
                      max={52}
                      value={s.week_offset}
                      onChange={(e) =>
                        setSchedule(i, {
                          week_offset: Math.min(52, Math.max(1, Number(e.target.value) || 1)),
                        })
                      }
                      className="v2-focus h-7 w-14 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-2 text-center text-body text-[color:var(--v2-fg)]"
                    />
                  </label>
                )}
                <div className="flex items-center gap-1">
                  {DOW_LABELS.map((lbl, idx) => {
                    const dow = idx + 1;
                    const active = s.day_of_week === dow;
                    return (
                      <button
                        key={dow}
                        type="button"
                        onClick={() => setSchedule(i, { day_of_week: dow })}
                        aria-label={`Día ${lbl}`}
                        aria-pressed={active}
                        className={cn(
                          'v2-focus flex h-7 w-7 items-center justify-center rounded-[var(--v2-r-pill)] text-label font-bold transition-colors',
                          active
                            ? 'bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)]'
                            : 'border border-[color:var(--v2-border)] text-[color:var(--v2-muted)] hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]',
                        )}
                      >
                        {lbl}
                      </button>
                    );
                  })}
                </div>
                {/* Solo en semana cero: ahí las piezas se reparten y hay que
                    saber cuáles no pueden ir pegadas. En una semana del plan el
                    día es fijo y no hay nada que deslizar. */}
                {s.week_offset === 0 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setSchedule(i, { rest_days_after: (s.rest_days_after ?? 0) > 0 ? 0 : 1 })
                    }
                    aria-pressed={(s.rest_days_after ?? 0) > 0}
                    title="Deja un día libre detrás (para un test que fatiga)"
                    className={cn(
                      'v2-focus h-7 rounded-[var(--v2-r-pill)] px-2.5 text-label font-semibold transition-colors',
                      (s.rest_days_after ?? 0) > 0
                        ? 'border border-[color:var(--v2-accent)] bg-[color:var(--v2-accent-soft)] text-[color:var(--v2-accent)]'
                        : 'border border-dashed border-[color:var(--v2-border)] text-[color:var(--v2-faint)] hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-muted)]',
                    )}
                  >
                    + día libre detrás
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => removeSchedule(i)}
                  aria-label="Quitar ocurrencia"
                  className="v2-focus ml-auto flex h-7 w-7 items-center justify-center rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] text-[color:var(--v2-faint)] transition-colors hover:border-[color:var(--v2-danger)] hover:text-[color:var(--v2-danger)]"
                >
                  <MIcon name="close" size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="mt-1.5 text-label leading-snug text-[color:var(--v2-faint)]">
          Repite un test en varias semanas (re-tests) añadiendo más filas. La semana 1 es la primera del plan del atleta.
        </p>
      </div>
    </SidePanel>
  );
}
