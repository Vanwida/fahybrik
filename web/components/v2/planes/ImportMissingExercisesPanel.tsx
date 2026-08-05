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
import { MIcon } from '@/components/ui/MIcon';
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
  /** Los tokens ya resueltos, para estampar sus ids en las líneas. */
  onResolved: (resolved: ResolvedToken[]) => void;
  onClose: () => void;
}) {
  const missing = useMemo(() => collectMissingExercises(weeks), [weeks]);
  const [decisions, setDecisions] = useState<Map<string, Decision>>(
    () => new Map(missing.map((m) => [m.key, initialDecision(m)])),
  );
  const [candidates, setCandidates] = useState<Map<string, ScoredCandidate[]>>(new Map());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const setGroupModality = (keys: string[], modality: Modality) => {
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
  const pending = toCreate.filter((m) => blockers(decisions.get(m.key)!).length > 0);
  const canSubmit = !saving && pending.length === 0 && toCreate.length + toMerge.length > 0;

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

      onResolved(resolved);
    } catch {
      setError('No se pudo conectar. Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const realCount = missing.filter((m) => !m.notAnExercise).length;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[color:var(--v2-scrim)] p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal
        aria-label="Crear los ejercicios que faltan"
        onClick={(e) => e.stopPropagation()}
        className="flex h-[min(90vh,900px)] w-full max-w-[880px] flex-col overflow-hidden rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] shadow-[var(--v2-shadow-pop)]"
      >
        <header className="flex items-start justify-between gap-3 border-b border-[color:var(--v2-border)] px-5 py-4">
          <div className="min-w-0">
            <h2 className="v2-display text-xl">
              {realCount === 1
                ? 'Falta 1 ejercicio en tu catálogo'
                : `Faltan ${realCount} ejercicios en tu catálogo`}
            </h2>
            <p className="mt-1 max-w-prose text-label leading-snug text-[color:var(--v2-muted)]">
              Se crean como tuyos y solo los verás tú. Al confirmar la importación se aprende cómo
              los escribe tu fuente, así que la próxima semana estos ya entrarán solos.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="v2-focus flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--v2-r-s)] text-[color:var(--v2-muted)] transition-colors hover:bg-[color:var(--v2-surface-2)] hover:text-[color:var(--v2-fg)]"
          >
            <MIcon name="close" size={20} />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {groups.map(([title, rows]) => (
            <section key={title} className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-label font-bold uppercase tracking-wide text-[color:var(--v2-accent)]">
                  {title}
                </h3>
                <label className="flex items-center gap-1.5 text-label text-[color:var(--v2-muted)]">
                  Todos
                  <select
                    aria-label={`Modalidad para todos los ejercicios de ${title}`}
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        setGroupModality(rows.map((r) => r.key), e.target.value as Modality);
                      }
                    }}
                    className="v2-focus rounded-[var(--v2-r-s)] border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface-2)] px-2 py-1 text-xs font-semibold text-[color:var(--v2-fg)] outline-none focus:border-[color:var(--v2-accent)]"
                  >
                    <option value="">— elige —</option>
                    {MODALITY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <ul className="space-y-2">
                {rows.map((m) => {
                  const d = decisions.get(m.key)!;
                  const falta = blockers(d);
                  const sugerencias = candidates.get(m.key) ?? [];
                  return (
                    <li
                      key={m.key}
                      className={cn(
                        'rounded-[var(--v2-r-m)] border p-3',
                        d.action === 'discard'
                          ? 'border-dashed border-[color:var(--v2-border)] opacity-60'
                          : falta.length > 0
                            ? 'border-[color:var(--v2-warn)]/50 bg-[color:var(--v2-warn-soft)]'
                            : 'border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)]',
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          value={d.name}
                          maxLength={120}
                          disabled={d.action !== 'create'}
                          aria-label={`Nombre del ejercicio, leído «${m.token}»`}
                          onChange={(e) => patch(m.key, { name: e.target.value })}
                          className="v2-focus min-w-0 flex-1 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface)] px-2.5 py-1.5 text-sm text-[color:var(--v2-fg)] outline-none focus:border-[color:var(--v2-accent)] disabled:opacity-60"
                        />
                        <span className="text-nano text-[color:var(--v2-faint)]">
                          {m.lineCount === 1 ? '1 línea' : `${m.lineCount} líneas`}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            patch(m.key, { action: d.action === 'discard' ? 'create' : 'discard' })
                          }
                          aria-label={
                            d.action === 'discard'
                              ? `Volver a incluir «${m.token}»`
                              : `No crear «${m.token}»`
                          }
                          className="v2-focus flex h-7 w-7 items-center justify-center rounded-[var(--v2-r-s)] text-[color:var(--v2-muted)] transition-colors hover:bg-[color:var(--v2-surface)] hover:text-[color:var(--v2-fg)]"
                        >
                          <MIcon name={d.action === 'discard' ? 'undo' : 'close'} size={16} />
                        </button>
                      </div>

                      {m.notAnExercise && d.action === 'discard' ? (
                        <p className="mt-1.5 text-nano text-[color:var(--v2-faint)]">
                          {m.notAnExercise === 'titulo'
                            ? 'Esto es el título de una tarjeta, no un ejercicio.'
                            : 'Esto no parece el nombre de un ejercicio.'}
                        </p>
                      ) : null}

                      {d.action !== 'discard' && sugerencias.length > 0 ? (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className="text-nano text-[color:var(--v2-muted)]">Ya tienes:</span>
                          {sugerencias.map((c) => {
                            const elegido = d.mergeId === c.id;
                            return (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() =>
                                  patch(
                                    m.key,
                                    elegido
                                      ? { action: 'create', mergeId: null, mergeName: null }
                                      : { action: 'merge', mergeId: c.id, mergeName: c.name },
                                  )
                                }
                                className={cn(
                                  'v2-focus inline-flex items-center gap-1 rounded-[var(--v2-r-pill)] border px-2 py-0.5 text-nano font-semibold transition-colors',
                                  elegido
                                    ? 'border-[color:var(--v2-ok)] bg-[color:var(--v2-ok)]/15 text-[color:var(--v2-ok)]'
                                    : 'border-[color:var(--v2-border)] text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]',
                                )}
                              >
                                {elegido ? <MIcon name="check" size={12} /> : null}
                                {c.name}
                                <span className="text-[color:var(--v2-faint)]">
                                  · {MODALITY_OPTIONS.find((o) => o.value === c.modality)?.label}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ) : null}

                      {d.action === 'create' ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <select
                            value={d.modality ?? ''}
                            aria-label={`Modalidad de ${d.name || m.token}`}
                            onChange={(e) => {
                              const modality = e.target.value as Modality;
                              patch(m.key, {
                                modality,
                                category: defaultCategoryForModality(modality),
                              });
                            }}
                            className={cn(
                              'v2-focus rounded-[var(--v2-r-s)] border bg-[color:var(--v2-surface)] px-2 py-1 text-xs font-semibold text-[color:var(--v2-fg)] outline-none focus:border-[color:var(--v2-accent)]',
                              d.modality
                                ? 'border-[color:var(--v2-border-strong)]'
                                : 'border-dashed border-[color:var(--v2-warn)]',
                            )}
                          >
                            <option value="">— modalidad —</option>
                            {MODALITY_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                          <select
                            value={d.category ?? ''}
                            aria-label={`Tipo de ${d.name || m.token}`}
                            onChange={(e) =>
                              patch(m.key, { category: e.target.value as ExerciseCategory })
                            }
                            className={cn(
                              'v2-focus rounded-[var(--v2-r-s)] border bg-[color:var(--v2-surface)] px-2 py-1 text-xs font-semibold text-[color:var(--v2-fg)] outline-none focus:border-[color:var(--v2-accent)]',
                              d.category
                                ? 'border-[color:var(--v2-border-strong)]'
                                : 'border-dashed border-[color:var(--v2-warn)]',
                            )}
                          >
                            <option value="">— tipo —</option>
                            {CATEGORY_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                          {m.evidence !== 'ninguna' && d.modality ? (
                            <span className="text-nano text-[color:var(--v2-warn)]">
                              {m.evidence === 'linea'
                                ? 'sugerida por la línea'
                                : 'sugerida por la tarjeta'}
                            </span>
                          ) : null}
                          {falta.length > 0 ? (
                            <span className="text-nano text-[color:var(--v2-warn)]">
                              Falta {falta.join(' y ')}.
                            </span>
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

        <footer className="space-y-2 border-t border-[color:var(--v2-border)] px-5 py-3">
          {error ? (
            <p className="flex items-start gap-1.5 text-xs text-[color:var(--v2-danger)]">
              <MIcon name="error" size={14} className="mt-px shrink-0" />
              {error}
            </p>
          ) : pending.length > 0 ? (
            <p className="flex items-center gap-1.5 text-xs text-[color:var(--v2-warn)]">
              <MIcon name="info" size={14} />
              {pending.length === 1
                ? 'A 1 ejercicio le falta decidir la modalidad o el tipo.'
                : `A ${pending.length} ejercicios les falta decidir la modalidad o el tipo.`}
            </p>
          ) : null}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="v2-focus rounded-[var(--v2-r-s)] px-3 py-2 text-sm font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)] disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="v2-focus inline-flex h-10 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-4 text-sm font-bold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)] disabled:opacity-50"
            >
              <MIcon
                name={saving ? 'progress_activity' : 'library_add'}
                size={17}
                className={saving ? 'animate-spin' : undefined}
              />
              {saving
                ? 'Creando…'
                : toMerge.length > 0 && toCreate.length > 0
                  ? `Crear ${toCreate.length} y unir ${toMerge.length}`
                  : toMerge.length > 0
                    ? `Unir ${toMerge.length}`
                    : `Crear ${toCreate.length}`}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
