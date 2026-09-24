'use client';

// ImportMissingExercisesPanel — dar de alta de una vez los ejercicios que la
// importación necesita y el catálogo no tiene.
//
// EL PROBLEMA QUE RESUELVE. Una semana real deja 30 nombres sin catalogar. Uno a
// uno son treinta formularios y la función se abandona en la primera importación,
// que es donde se decide si se usa.
//
// POR QUÉ VA AGRUPADO POR TARJETA. Porque ahí vive el contexto que falta. La
// modalidad de un «Cat Cow» no se deduce de su nombre — `modalityFrom` no sabe
// devolver fuerza, funcional ni core — pero la tarjeta en la que está sí lo dice.
// Agrupando, el coach resuelve una vez por bloque en vez de una vez por
// ejercicio: 30 decisiones se vuelven media docena.
//
// LO QUE NUNCA HACE: crear con una modalidad inventada. Sin evidencia el campo
// sale vacío y bloquea, porque un «Cat Cow» creado como fuerza materializa tres
// series en el entreno en vivo, ensucia la analítica del coach para siempre y
// tumba el envío de la carrera del día al reloj.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ListPlus, Undo2, X } from 'lucide-react';
import { Button, Dialog, IconButton, Input, Menu, Select, StatusBadge } from '@/components/v2/ui';
import { cn } from '@/lib/utils';
import type { Modality } from '@fahybrid/shared/domain/prescription';
import type { ExerciseCategory } from '@fahybrid/shared/schema/_primitives';
import { MODALITY_OPTIONS } from '@/lib/dashboard/exercises/catalog-ui';
import { CATEGORY_OPTIONS } from '@/components/v2/editor/exercise-catalog';
import { defaultCategoryForModality } from '@/lib/dashboard/v2/pick-exercise';
import type { ScoredCandidate } from '@/lib/dashboard/exercises/near-match';
import {
  collectMissingExercises,
  type MissingExercise,
  type MissingExerciseDecisions,
  type ResolvedToken,
} from '@/lib/dashboard/v2/import-missing';
import type { ReviewWeek } from '@/lib/dashboard/v2/import-review';

/** Qué se decide para cada nombre. Son las tres salidas del modelo, no hay más. */
type Action = 'create' | 'merge' | 'discard';

interface Decision {
  action: Action;
  name: string;
  category: ExerciseCategory | null;
  modality: Modality | null;
  mergeId: number | null;
  mergeName: string | null;
}

const SIN_TARJETA = 'Sin tarjeta';

function initialDecision(missing: MissingExercise): Decision {
  return {
    // Lo que no parece un ejercicio entra ya descartado: si no, un «crear todos»
    // mete el título de una tarjeta en el catálogo sin que nadie se entere.
    action: missing.notAnExercise ? 'discard' : 'create',
    name: missing.token,
    category: missing.suggestedCategory,
    modality: missing.suggestedModality,
    mergeId: null,
    mergeName: null,
  };
}

/** Un nombre cortado por la fuente no se puede crear tal cual: metería unos
 *  puntos suspensivos en el catálogo para siempre. */
function nameIsTruncated(name: string): boolean {
  return /(\.{3}|…)\s*$/.test(name.trim());
}

/** Lo que le falta a esta fila para poder crearse. Vacío = lista. */
function blockers(decision: Decision): string[] {
  if (decision.action !== 'create') return [];
  const out: string[] = [];
  if (!decision.name.trim()) out.push('nombre');
  else if (nameIsTruncated(decision.name)) out.push('el nombre viene cortado');
  if (!decision.modality) out.push('modalidad');
  if (!decision.category) out.push('tipo');
  return out;
}

export function ImportMissingExercisesPanel({
  weeks,
  onResolved,
  onClose,
}: {
  weeks: ReviewWeek[];
  /**
   * Crear/fusionar + descartar. El caller estampa ids Y quita las líneas
   * descartadas — sin lo segundo el confirm sigue bloqueado.
   */
  onResolved: (decisions: MissingExerciseDecisions) => void;
  onClose: () => void;
}) {
  const missing = useMemo(() => collectMissingExercises(weeks), [weeks]);
  const [decisions, setDecisions] = useState<Map<string, Decision>>(
    () => new Map(missing.map((m) => [m.key, initialDecision(m)])),
  );
  const [candidates, setCandidates] = useState<Map<string, ScoredCandidate[]>>(new Map());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Feedback del «Todos → elige»: el select se resetea a vacío a propósito
   *  (es un atajo, no un estado), y sin esto el coach cree que no hizo nada. */
  const [groupApplied, setGroupApplied] = useState<Map<string, string>>(() => new Map());

  // Las coincidencias las busca el servidor: el catálogo vive allí y bajarse
  // cientos de ejercicios para compararlos en el navegador sería peor.
  useEffect(() => {
    let live = true;
    const tokens = missing.map((m) => m.token);
    if (tokens.length === 0) return;
    void fetch('/api/coach/exercises/missing', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tokens }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { matches?: Array<{ token: string; candidates: ScoredCandidate[] }> } | null) => {
        if (!live || !data?.matches) return;
        const byKey = new Map<string, ScoredCandidate[]>();
        for (const m of missing) {
          const hit = data.matches.find((x) => x.token === m.token);
          if (hit && hit.candidates.length > 0) byKey.set(m.key, hit.candidates);
        }
        setCandidates(byKey);
      })
      // Sin sugerencias la pantalla sigue sirviendo: se crean sin fusionar.
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [missing]);

  const patch = useCallback((key: string, next: Partial<Decision>) => {
    setDecisions((cur) => {
      const copy = new Map(cur);
      const prev = copy.get(key);
      if (prev) copy.set(key, { ...prev, ...next });
      return copy;
    });
  }, []);

  /** Todas las de una tarjeta a la misma modalidad: es el atajo que convierte
   *  treinta decisiones en media docena. */
  const setGroupModality = (title: string, keys: string[], modality: Modality) => {
    setDecisions((cur) => {
      const copy = new Map(cur);
      for (const key of keys) {
        const prev = copy.get(key);
        if (prev && prev.action === 'create') {
          copy.set(key, { ...prev, modality, category: defaultCategoryForModality(modality) });
        }
      }
      return copy;
    });
    const label = MODALITY_OPTIONS.find((o) => o.value === modality)?.label ?? modality;
    setGroupApplied((cur) => {
      const copy = new Map(cur);
      copy.set(title, label);
      return copy;
    });
  };

  const groups = useMemo(() => {
    const byTitle = new Map<string, MissingExercise[]>();
    for (const m of missing) {
      const title = m.blockTitles[0] ?? SIN_TARJETA;
      const list = byTitle.get(title) ?? [];
      list.push(m);
      byTitle.set(title, list);
    }
    return [...byTitle.entries()];
  }, [missing]);

  const toCreate = missing.filter((m) => decisions.get(m.key)?.action === 'create');
  const toMerge = missing.filter((m) => decisions.get(m.key)?.action === 'merge');
  const toDiscard = missing.filter((m) => decisions.get(m.key)?.action === 'discard');
  const pending = toCreate.filter((m) => blockers(decisions.get(m.key)!).length > 0);
  // Se puede enviar solo descartando (sin crear): saca basura y desbloquea.
  const canSubmit =
    !saving && pending.length === 0 && toCreate.length + toMerge.length + toDiscard.length > 0;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const resolved: ResolvedToken[] = [];
      for (const m of toMerge) {
        const d = decisions.get(m.key)!;
        if (d.mergeId) {
          resolved.push({ key: m.key, exercise_id: d.mergeId, exercise_name: d.mergeName ?? d.name });
        }
      }

      if (toCreate.length > 0) {
        const res = await fetch('/api/coach/exercises/bulk', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            exercises: toCreate.map((m) => {
              const d = decisions.get(m.key)!;
              return { name: d.name.trim(), category: d.category!, modality: d.modality! };
            }),
          }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          setError(data?.error?.message ?? 'No se pudieron crear los ejercicios.');
          return;
        }
        const data = (await res.json()) as { created: Array<{ id: string; name: string }> };
        // El orden se conserva: la respuesta viene en el mismo orden que se pidió.
        toCreate.forEach((m, i) => {
          const created = data.created[i];
          if (created) {
            resolved.push({
              key: m.key,
              exercise_id: Number(created.id),
              exercise_name: created.name,
            });
          }
        });
      }

      onResolved({
        resolved: [...resolved],
        discardedKeys: toDiscard.map((m) => m.key),
      });
    } catch {
      setError('No se pudo conectar. Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const realCount = missing.filter((m) => !m.notAnExercise).length;

  const submitLabel = saving
    ? 'Aplicando…'
    : (() => {
        const parts: string[] = [];
        if (toCreate.length > 0) parts.push(`Crear ${toCreate.length}`);
        if (toMerge.length > 0) parts.push(`unir ${toMerge.length}`);
        if (toDiscard.length > 0 && toCreate.length + toMerge.length === 0) {
          return toDiscard.length === 1 ? 'Descartar 1 y seguir' : `Descartar ${toDiscard.length} y seguir`;
        }
        if (parts.length === 0) return 'Aplicar';
        return parts.join(' y ');
      })();

  return (
    <Dialog
      open
      size="lg"
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
      title={realCount === 1 ? 'Falta 1 ejercicio en tu catálogo' : `Faltan ${realCount} ejercicios en tu catálogo`}
      description="Se crean como tuyos. Al confirmar, se aprende cómo los escribe tu fuente y la próxima vez entran solos."
      footer={
        <>
          {error ? (
            <p role="alert" className="mr-auto t-body-sm text-v2-danger">
              {error}
            </p>
          ) : pending.length > 0 ? (
            <StatusBadge
              tone="warn"
              className="mr-auto"
              label={
                pending.length === 1
                  ? 'A 1 le falta la modalidad o el tipo'
                  : `A ${pending.length} les falta la modalidad o el tipo`
              }
            />
          ) : null}
          <Button onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="primary" icon={ListPlus} loading={saving} disabled={!canSubmit} onClick={submit}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {groups.map(([title, rows]) => (
          <section key={title} className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="t-label text-v2-faint">{title}</h3>
              <Menu
                trigger={
                  <Button size="sm" variant="ghost" iconEnd={ChevronDown} aria-label={`Modalidad para todos los ejercicios de ${title}`}>
                    {groupApplied.get(title) ? `Todos: ${groupApplied.get(title)}` : 'Modalidad para todos'}
                  </Button>
                }
                items={MODALITY_OPTIONS.map((o) => ({
                  label: o.label,
                  onSelect: () => setGroupModality(title, rows.map((r) => r.key), o.value),
                }))}
              />
            </div>

            <ul className="divide-y divide-v2-border rounded-panel border border-v2-border">
              {rows.map((m) => {
                const d = decisions.get(m.key)!;
                const falta = blockers(d);
                const sugerencias = candidates.get(m.key) ?? [];
                return (
                  <li key={m.key} className={cn('p-3', d.action === 'discard' && 'opacity-60')}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        type="text"
                        value={d.name}
                        maxLength={120}
                        disabled={d.action !== 'create'}
                        aria-label={`Nombre del ejercicio, leído «${m.token}»`}
                        onChange={(e) => patch(m.key, { name: e.target.value })}
                        className="min-w-0 flex-1 basis-48"
                      />
                      <span className="t-meta text-v2-faint t-tnum">
                        {m.lineCount === 1 ? '1 línea' : `${m.lineCount} líneas`}
                      </span>
                      <IconButton
                        icon={d.action === 'discard' ? Undo2 : X}
                        size="sm"
                        onClick={() => patch(m.key, { action: d.action === 'discard' ? 'create' : 'discard' })}
                        label={d.action === 'discard' ? `Volver a incluir «${m.token}»` : `No crear «${m.token}»`}
                      />
                    </div>

                    {m.notAnExercise && d.action === 'discard' ? (
                      <p className="mt-1.5 t-meta text-v2-faint">
                        {m.notAnExercise === 'titulo'
                          ? 'Esto es el título de una tarjeta, no un ejercicio.'
                          : 'Esto no parece el nombre de un ejercicio.'}
                      </p>
                    ) : null}

                    {d.action !== 'discard' && sugerencias.length > 0 ? (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="t-meta text-v2-muted">Ya tienes:</span>
                        {sugerencias.map((c) => {
                          const elegido = d.mergeId === c.id;
                          return (
                            <Button
                              key={c.id}
                              size="sm"
                              aria-pressed={elegido}
                              icon={elegido ? Check : undefined}
                              onClick={() =>
                                patch(
                                  m.key,
                                  elegido
                                    ? { action: 'create', mergeId: null, mergeName: null }
                                    : { action: 'merge', mergeId: c.id, mergeName: c.name },
                                )
                              }
                              className={cn(elegido && 'border-v2-fg bg-v2-fg text-v2-bg hover:border-v2-fg hover:bg-v2-fg')}
                            >
                              {c.name}
                              <span className={elegido ? 'opacity-70' : 'text-v2-faint'}>
                                · {MODALITY_OPTIONS.find((o) => o.value === c.modality)?.label}
                              </span>
                            </Button>
                          );
                        })}
                      </div>
                    ) : null}

                    {d.action === 'create' ? (
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-1.5 t-meta text-v2-muted">
                          Modalidad
                          <Select
                            size="sm"
                            placeholder="Elige"
                            value={d.modality ?? null}
                            aria-label={`Modalidad de ${d.name || m.token}`}
                            onValueChange={(modality: Modality) =>
                              patch(m.key, { modality, category: defaultCategoryForModality(modality) })
                            }
                            options={MODALITY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                          />
                        </label>
                        <label className="flex items-center gap-1.5 t-meta text-v2-muted">
                          Tipo
                          <Select
                            size="sm"
                            placeholder="Elige"
                            value={d.category ?? null}
                            aria-label={`Tipo de ${d.name || m.token}`}
                            onValueChange={(category: ExerciseCategory) => patch(m.key, { category })}
                            options={CATEGORY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                          />
                        </label>
                        {m.evidence !== 'ninguna' && d.modality ? (
                          <span className="t-meta text-v2-faint">
                            {m.evidence === 'linea' ? 'Sugerida por la línea' : 'Sugerida por la tarjeta'}
                          </span>
                        ) : null}
                        {falta.length > 0 ? (
                          <StatusBadge size="sm" tone="warn" label={`Falta ${falta.join(' y ')}`} />
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
