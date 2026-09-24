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

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import {
  Button,
  Checkbox,
  Field,
  IconButton,
  Input,
  SectionHeader,
  SegmentedControl,
  Textarea,
} from '@/components/v2/ui';
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
import { OptionTile } from '@/components/v2/editor/OptionTile';
import { type TestDraft } from './draft';

const DOW_ITEMS = (['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const).map((label, i) => ({
  value: String(i + 1),
  label,
}));

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
  const rootRef = useRef<HTMLDivElement>(null);

  // Escape cierra el editor — solo si el foco está en el propio editor. Un
  // desplegable abierto (Select, menú) vive en un portal y se cierra solo, sin
  // tirar el borrador entero.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const el = document.activeElement;
      if (el === document.body || (el && rootRef.current?.contains(el))) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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

  const title = draft.id === null ? 'Nuevo test' : 'Editar test';

  return (
    <div ref={rootRef} role="region" aria-label={title} className="flex flex-col rounded-panel border border-v2-border bg-v2-surface">
      <div className="flex items-center gap-3 border-b border-v2-border px-4 py-3">
        <h2 className="min-w-0 flex-1 t-title-sm text-v2-fg">{title}</h2>
        <IconButton icon={X} label="Cerrar" shortcut="Esc" onClick={onClose} />
      </div>

      <div className="flex flex-col gap-6 px-4 py-4">
        <Field label="Nombre">
          {({ id }) => (
            <Input
              id={id}
              size="lg"
              value={draft.name}
              onChange={(e) => onChange({ ...draft, name: e.target.value })}
              placeholder="5K control"
              maxLength={120}
              autoFocus
            />
          )}
        </Field>

        <Field label="Nota" optional hint="La lee el atleta justo antes de empezar.">
          {({ id, describedBy }) => (
            <Textarea
              id={id}
              aria-describedby={describedBy}
              value={draft.protocol}
              onChange={(e) => onChange({ ...draft, protocol: e.target.value })}
              placeholder="Calienta bien antes de salir a por todas."
              maxLength={4000}
            />
          )}
        </Field>

        {/* Contenido — el bloque real de la sesión: ejercicio + dosis, igual que
            un entreno normal (docs/DECISIONS.md, 2026-08-08). Sin bloques el test
            sigue siendo válido: el atleta lo hace según sus resultados, sin una
            sesión guiada (el mecanismo automático de siempre). */}
        <section className="flex flex-col gap-2">
          <SectionHeader
            title="Contenido"
            action={
              !blockPickerOpen ? (
                <>
                  {/* Escape para el test que SÍ tiene forma: una simulación
                      HYROX, un circuito, un EMOM. Secundario a propósito. */}
                  <Button size="sm" variant="ghost" onClick={() => setBlockPickerOpen(true)}>
                    Bloque con forma
                  </Button>
                  <Button size="sm" icon={Plus} onClick={addEsfuerzo}>
                    Añadir ejercicio
                  </Button>
                </>
              ) : null
            }
          />

          {contentLoading ? (
            <p className="t-body-sm text-v2-faint">Cargando el contenido…</p>
          ) : draft.content.length === 0 && !blockPickerOpen ? (
            /* El catálogo, de entrada y sin un clic previo: es el camino del 90 %
               de los tests. Picar uno lo deja montado y rellena el nombre. */
            <div className="@container flex flex-col gap-4">
              <p className="t-body-sm text-v2-muted">
                Elige uno y queda montado, o añade un ejercicio y fija tú la medida.
              </p>
              {TEST_FAMILY_ORDER.map((fam) => (
                <div key={fam} className="flex flex-col gap-2">
                  <span className="t-label text-v2-faint">{TEST_FAMILY_LABEL[fam]}</span>
                  <div className="grid grid-cols-1 gap-2 @md:grid-cols-2 @2xl:grid-cols-3">
                    {TEST_PRESETS_BY_FAMILY[fam].map((p) => (
                      <OptionTile key={p.id} title={p.label} detail={p.hint} onClick={() => pickPreset(p)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {draft.content.length > 0 ? (
            <div className="flex flex-col gap-3">
              {draft.content.map((block, i) => (
                <div key={block.uid} className="rounded-panel bg-v2-surface-2 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="t-meta text-v2-muted">Bloque {i + 1}</span>
                    <IconButton icon={X} label="Quitar bloque" size="sm" onClick={() => removeBlock(i)} />
                  </div>
                  <BlockEditor block={block} onChange={(next) => setBlock(i, next)} onAddItem={() => addItemTo(i)} />
                </div>
              ))}
            </div>
          ) : null}

          {blockPickerOpen ? (
            <div className="rounded-panel border border-v2-border-strong p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="t-body font-medium text-v2-fg">Elige el tipo de bloque</span>
                <IconButton icon={X} label="Cerrar el selector de tipo" size="sm" onClick={() => setBlockPickerOpen(false)} />
              </div>
              <ArchetypeGrid onPick={addBlock} />
            </div>
          ) : null}
        </section>

        {/* Qué mide — DEDUCIDO del contenido, no preguntado (test-derive.ts).
            En un esfuerzo máximo se mide la variable que NO fijas: pones 1000 m y
            se mide el tiempo; pones 10 min y se mide la distancia. */}
        {medido.length > 0 ? (
          <section className="flex flex-col gap-2">
            <SectionHeader title="Qué mide" />
            <ul className="divide-y divide-v2-border rounded-panel border border-v2-border">
              {medido.map((m) => (
                <li key={m.uid} className="flex items-baseline justify-between gap-3 px-3 py-2 t-body-sm">
                  <span className="truncate text-v2-fg">{m.nombre}</span>
                  <span className="shrink-0 text-v2-muted">
                    {m.texto}
                    {m.calibra ? <span className="ml-1.5 font-medium text-v2-fg">· calibra {m.calibra}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
            <p className="t-meta text-v2-faint">Al terminar, la app rellena la marca con lo que midió.</p>
          </section>
        ) : null}

        <section className="flex flex-col gap-2">
          <SectionHeader
            title="Agenda"
            action={
              <Button size="sm" icon={Plus} onClick={addSchedule}>
                Añadir semana
              </Button>
            }
          />
          {draft.schedule.length === 0 ? (
            <p className="t-body-sm text-v2-faint">
              Sin agenda: queda en tu batería pero no se programa solo.
            </p>
          ) : (
            <ul className="divide-y divide-v2-border rounded-panel border border-v2-border">
              {draft.schedule.map((s, i) => {
                const semanaCero = s.week_offset === 0;
                return (
                  <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
                    {/* SEMANA CERO (week_offset 0): los días entre que asignas el
                        plan y el lunes que arranca. Ahí el día es una PREFERENCIA:
                        lo que no cabe se desliza, y lo que no entra se dice. */}
                    <Button
                      size="sm"
                      aria-pressed={semanaCero}
                      onClick={() => setSchedule(i, { week_offset: semanaCero ? 1 : 0 })}
                      className={cn(semanaCero && 'border-v2-fg bg-v2-fg text-v2-bg hover:border-v2-fg hover:bg-v2-fg')}
                    >
                      Antes de empezar
                    </Button>
                    {semanaCero ? null : (
                      <label className="inline-flex items-center gap-2 t-body-sm text-v2-muted">
                        Semana
                        <Input
                          type="number"
                          size="sm"
                          min={1}
                          max={52}
                          value={s.week_offset}
                          onChange={(e) =>
                            setSchedule(i, { week_offset: Math.min(52, Math.max(1, Number(e.target.value) || 1)) })
                          }
                          className="w-16 text-center t-tnum"
                        />
                      </label>
                    )}
                    <SegmentedControl
                      size="sm"
                      aria-label="Día de la semana"
                      items={DOW_ITEMS}
                      value={String(s.day_of_week)}
                      onValueChange={(v) => setSchedule(i, { day_of_week: Number(v) })}
                    />
                    {/* Solo en semana cero: ahí las piezas se reparten y hay que
                        saber cuáles no pueden ir pegadas. */}
                    {semanaCero ? (
                      <Checkbox
                        label="Día libre detrás"
                        checked={(s.rest_days_after ?? 0) > 0}
                        onCheckedChange={(on) => setSchedule(i, { rest_days_after: on ? 1 : 0 })}
                        className="t-body-sm"
                      />
                    ) : null}
                    <IconButton icon={X} label="Quitar semana" size="sm" onClick={() => removeSchedule(i)} className="ml-auto" />
                  </li>
                );
              })}
            </ul>
          )}
          <p className="t-meta text-v2-faint">La semana 1 es la primera del plan del atleta. Añade más para repetirlo.</p>
        </section>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-v2-border px-4 py-3">
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="primary" icon={Check} loading={saving} onClick={onSave}>
          Guardar
        </Button>
      </div>
    </div>
  );
}
