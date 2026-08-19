'use client';

// REPONER BLOQUE — la puerta del ATLETA, la que faltaba.
//
// Hasta ahora la tira de asignación de Hoy solo sabía llevar a periodización:
// arreglar la RECETA de la celda (nivel × días). Para un atleta cuyo bloque ya
// terminó, eso no es su arreglo — el suyo es el siguiente bloque, y se puede dar
// sin secuencia ninguna (Marc recorrió un microciclo de biblioteca sin ella).
// El Plan del atleta mandaba de vuelta a Hoy y Hoy mandaba a periodización: el
// círculo se cerraba sin puerta. Esta es la puerta.
//
// Espejo de planes/AsignarAtletaModal: allí el microciclo está en contexto y se
// elige atleta; aquí el atleta está en contexto y se elige microciclo. Mismo
// backend, mismo contrato.
//
//   1. GET  /api/coach/program-months               → biblioteca de microciclos.
//   2. POST /api/coach/athletes/{id}/assign-draft   → lo materializa en BORRADOR.
//
// assign-draft, no assign-month: nada llega al atleta hasta que el coach abre su
// plan y pulsa «Publicar microciclo». Reponer no es publicar, y desde luego no es
// auto-asignar: el coach elige QUÉ bloque y CUÁNDO empieza. Aquí no se decide qué
// toca después de qué — eso es método del coach, no mecanismo nuestro.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';
import { upcomingMondayIso } from '@/lib/dashboard/v2/upcoming-monday';

interface LibraryMonth {
  id: string;
  name: string;
  level: string;
  focus: string | null;
  week_count: number;
}

export function ReponerBloqueModal({
  athleteId,
  athleteName,
  /** El titular del eje A — por qué estamos aquí. Se muestra tal cual. */
  titular,
  /** El bloque quedó creado. Quien llama retira al atleta de la tira. */
  onRepuesto,
  onClose,
}: {
  athleteId: number;
  athleteName: string;
  titular: string;
  onRepuesto: () => void;
  onClose: () => void;
}) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [months, setMonths] = useState<LibraryMonth[]>([]);

  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<string>(upcomingMondayIso());

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Solo el nombre: si la fila desapareciera de `months` entre la selección y la
  // respuesta, la pantalla de confirmación tiene que salir igual — el bloque se
  // creó, y callarlo sería peor que no saber cómo se llama.
  const [assigned, setAssigned] = useState<{ name: string } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/coach/program-months', { credentials: 'include' });
        const body = (await res.json().catch(() => null)) as
          | { months?: LibraryMonth[]; error?: { message?: string } }
          | null;
        if (!alive) return;
        if (!res.ok || !body?.months) {
          setLoadError(body?.error?.message ?? 'No se pudo cargar tu biblioteca de microciclos.');
          return;
        }
        setMonths(body.months);
      } catch {
        if (alive) setLoadError('No se pudo cargar tu biblioteca de microciclos.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return months;
    return months.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.level.toLowerCase().includes(q) ||
        (m.focus ?? '').toLowerCase().includes(q),
    );
  }, [months, query]);

  const canSubmit = selectedId != null && startDate.length === 10 && !submitting;

  async function handleAssign() {
    if (!canSubmit || !selectedId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/coach/athletes/${athleteId}/assign-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ month_template_id: selectedId, start_date: startDate }),
      });
      const body = (await res.json().catch(() => null)) as
        | { assign_draft?: { assignment_count?: number }; error?: { message?: string } }
        | null;
      if (!res.ok || !body?.assign_draft) {
        setError(body?.error?.message ?? 'No se pudo reponer el bloque.');
        return;
      }
      setAssigned({ name: months.find((m) => m.id === selectedId)?.name ?? 'El bloque' });
      onRepuesto();
    } catch {
      setError('No se pudo reponer el bloque. Inténtalo de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  function goToPlan() {
    router.push(`/atletas/${athleteId}?tab=plan`);
    onClose();
  }

  const inputCls = cn(
    'v2-focus h-10 w-full rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 text-sm',
    'text-[color:var(--v2-fg)] placeholder:text-[color:var(--v2-faint)]',
    'focus:border-[color:var(--v2-border-strong)]',
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Reponer bloque de ${athleteName}`}
    >
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-[color:var(--v2-scrim)]"
      />

      <div className="relative flex max-h-[88vh] w-full max-w-md flex-col rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-5 shadow-[var(--v2-shadow-pop)]">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="v2-display text-xl text-[color:var(--v2-fg)]">
            {assigned ? 'Bloque repuesto' : `Reponer bloque · ${athleteName}`}
          </h2>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="v2-focus inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--v2-r-s)] text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-fg)]"
          >
            <MIcon name="close" size={20} />
          </button>
        </div>
        {/* Eje A, otra vez: por qué esta puerta y no la de periodización. */}
        <p className="mb-4 text-xs text-[color:var(--v2-muted)]">{titular}</p>

        {assigned ? (
          <div className="flex flex-col gap-3.5">
            <div className="flex items-start gap-2.5 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-3">
              <MIcon
                name="check_circle"
                size={18}
                filled
                className="mt-0.5 shrink-0 text-[color:var(--v2-ok)]"
              />
              <p className="text-sm text-[color:var(--v2-muted)]">
                «<span className="font-semibold text-[color:var(--v2-fg)]">{assigned.name}</span>»
                queda en <span className="font-semibold text-[color:var(--v2-fg)]">borrador</span>{' '}
                para {athleteName}. Todavía no lo ve. Ábrelo en su plan y pulsa «Publicar
                microciclo» para entregarlo.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="v2-focus inline-flex h-9 items-center rounded-[var(--v2-r-s)] px-3 text-sm font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={goToPlan}
                className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-4 text-sm font-semibold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)]"
              >
                <MIcon name="arrow_forward" size={16} />
                Abrir plan y publicar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-col gap-3.5">
            <label className="flex flex-col gap-1.5">
              <span className="v2-micro">Microciclo de tu biblioteca</span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nombre, nivel o foco…"
                className={inputCls}
                autoFocus
              />
            </label>

            <div className="min-h-0 flex-1 overflow-y-auto rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)]">
              {loading ? (
                <p className="px-3 py-6 text-center text-xs text-[color:var(--v2-muted)]">
                  Cargando microciclos…
                </p>
              ) : loadError ? (
                <p className="px-3 py-6 text-center text-xs text-[color:var(--v2-danger)]">
                  {loadError}
                </p>
              ) : filtered.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-[color:var(--v2-muted)]">
                  {months.length === 0
                    ? 'Tu biblioteca no tiene microciclos todavía.'
                    : 'Sin resultados.'}
                </p>
              ) : (
                <ul className="flex flex-col">
                  {filtered.map((m) => {
                    const active = m.id === selectedId;
                    return (
                      <li key={m.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(m.id)}
                          aria-pressed={active}
                          className={cn(
                            'v2-focus flex w-full items-center justify-between gap-2 border-b border-[color:var(--v2-border)] px-3 py-2.5 text-left transition-colors last:border-0',
                            active
                              ? 'bg-[color:var(--v2-accent-soft)]'
                              : 'hover:bg-[color:var(--v2-surface-2)]',
                          )}
                        >
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate text-sm font-medium text-[color:var(--v2-fg)]">
                              {m.name}
                            </span>
                            {m.focus ? (
                              <span className="truncate text-eyebrow text-[color:var(--v2-faint)]">
                                {m.focus}
                              </span>
                            ) : null}
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            {m.level ? (
                              <span className="v2-num text-eyebrow font-semibold text-[color:var(--v2-muted)]">
                                {m.level}
                              </span>
                            ) : null}
                            <span className="v2-num text-eyebrow text-[color:var(--v2-faint)]">
                              {m.week_count} {m.week_count === 1 ? 'sem' : 'sems'}
                            </span>
                            {active ? (
                              <MIcon
                                name="check"
                                size={16}
                                className="text-[color:var(--v2-accent)]"
                              />
                            ) : null}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="v2-micro">Fecha de inicio (lunes)</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={cn(inputCls, 'v2-num')}
              />
            </label>

            {error ? (
              <p className="text-xs font-medium text-[color:var(--v2-danger)]">{error}</p>
            ) : null}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="v2-focus inline-flex h-9 items-center rounded-[var(--v2-r-s)] px-3 text-sm font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleAssign}
                disabled={!canSubmit}
                className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-4 text-sm font-semibold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)] disabled:opacity-50"
              >
                <MIcon name="playlist_add" size={16} />
                {submitting ? 'Reponiendo…' : 'Reponer en borrador'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
