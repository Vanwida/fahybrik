'use client';

// Frases de carga del coach (mig 0209, card 130).
//
// «carga media» no es un objetivo: es una palabra suya. La traduce una vez
// a un objetivo ya existente y el importador la reutiliza. Vacío = se
// revisa, no se inventa un kilo.

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { ajustesButtonGhost, ajustesButtonPrimary, ajustesField } from './controls';
import {
  coachPhraseDictionaryPutSchema,
  type CoachPhraseDictionaryResponse,
} from '@fahybrid/shared/schema/coach-phrase-dictionary';
import type { PhraseMappingKind } from '@fahybrid/shared/domain/coach/phrase-dictionary';
import { cn } from '@/lib/utils';

const ENDPOINT = '/api/coach/phrase-dictionary';

const KIND_COPY: Record<PhraseMappingKind, string> = {
  competition_percent: '% del peso de competición',
  bodyweight_percent: '% del peso corporal',
  kg: 'kilos fijos',
};

interface Draft {
  phrase: string;
  as: PhraseMappingKind;
  value: string;
  value_max: string;
}

type Estado =
  | { fase: 'cargando' }
  | { fase: 'error' }
  | { fase: 'listo'; drafts: Draft[]; saved: Draft[] };

function emptyDraft(): Draft {
  return { phrase: '', as: 'competition_percent', value: '', value_max: '' };
}

function draftsFromResponse(data: CoachPhraseDictionaryResponse): Draft[] {
  if (data.entries.length === 0) return [emptyDraft()];
  return data.entries.map((e) => ({
    phrase: e.phrase,
    as: e.as,
    value: String(e.value),
    value_max: e.value_max == null ? '' : String(e.value_max),
  }));
}

function draftsEqual(a: Draft[], b: Draft[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function fetchDict(): Promise<Estado> {
  try {
    const res = await fetch(ENDPOINT, { cache: 'no-store' });
    if (!res.ok) return { fase: 'error' };
    const data = (await res.json()) as CoachPhraseDictionaryResponse;
    const drafts = draftsFromResponse(data);
    return { fase: 'listo', drafts, saved: drafts };
  } catch {
    return { fase: 'error' };
  }
}

export function PhraseDictionaryForm() {
  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next = await fetchDict();
      if (!cancelled) setEstado(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [recarga]);

  const dirty = estado.fase === 'listo' && !draftsEqual(estado.drafts, estado.saved);

  const save = async () => {
    if (estado.fase !== 'listo') return;
    const filled = estado.drafts.filter((d) => d.phrase.trim() && d.value.trim());
    const parsed = coachPhraseDictionaryPutSchema.safeParse({
      entries: filled.map((d) => ({
        phrase: d.phrase.trim(),
        as: d.as,
        value: Number(d.value.replace(',', '.')),
        ...(d.value_max.trim()
          ? { value_max: Number(d.value_max.replace(',', '.')) }
          : {}),
      })),
    });
    if (!parsed.success) {
      setError('Revisa las frases: un número mayor que cero, sin duplicar.');
      return;
    }
    setSaving(true);
    setError(null);
    setOk(false);
    try {
      const res = await fetch(ENDPOINT, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      const data = (await res.json().catch(() => null)) as CoachPhraseDictionaryResponse | null;
      if (!res.ok || !data) {
        setError('No se pudieron guardar los cambios.');
        return;
      }
      const drafts = draftsFromResponse(data);
      setEstado({ fase: 'listo', drafts, saved: drafts });
      setOk(true);
    } catch {
      setError('No se pudieron guardar los cambios. Reintenta.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <h2 className="v2-micro mb-2">Frases de carga</h2>
      {estado.fase === 'cargando' ? (
        <p className="text-label text-[color:var(--v2-muted)]">Cargando el diccionario.</p>
      ) : null}
      {estado.fase === 'error' ? (
        <p className="text-label text-[color:var(--v2-muted)]">
          No se pudo cargar.{' '}
          <button type="button" className={ajustesButtonGhost} onClick={() => setRecarga((n) => n + 1)}>
            Reintentar
          </button>
        </p>
      ) : null}
      {estado.fase === 'listo' ? (
        <Card className="flex flex-col gap-4 p-4 sm:p-5">
          <p className="text-label leading-relaxed text-[color:var(--v2-muted)]">
            «carga media», «ligera» o «pesada» son palabras tuyas, no un tipo. Las
            traduces una vez a un objetivo de verdad. Si la lista está vacía, el
            importador manda esa línea a revisión. No inventa kilos.
          </p>
          <div className="flex flex-col gap-3">
            {estado.drafts.map((d, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_5rem_5rem_auto]">
                <input
                  className={ajustesField}
                  value={d.phrase}
                  placeholder="carga media"
                  onChange={(e) => {
                    setOk(false);
                    setEstado((prev) =>
                      prev.fase === 'listo'
                        ? {
                            ...prev,
                            drafts: prev.drafts.map((row, j) =>
                              j === i ? { ...row, phrase: e.target.value } : row,
                            ),
                          }
                        : prev,
                    );
                  }}
                />
                <select
                  className={ajustesField}
                  value={d.as}
                  onChange={(e) => {
                    setOk(false);
                    const as = e.target.value as PhraseMappingKind;
                    setEstado((prev) =>
                      prev.fase === 'listo'
                        ? {
                            ...prev,
                            drafts: prev.drafts.map((row, j) => (j === i ? { ...row, as } : row)),
                          }
                        : prev,
                    );
                  }}
                >
                  {(Object.keys(KIND_COPY) as PhraseMappingKind[]).map((k) => (
                    <option key={k} value={k}>
                      {KIND_COPY[k]}
                    </option>
                  ))}
                </select>
                <input
                  className={ajustesField}
                  inputMode="decimal"
                  value={d.value}
                  placeholder="60"
                  onChange={(e) => {
                    setOk(false);
                    setEstado((prev) =>
                      prev.fase === 'listo'
                        ? {
                            ...prev,
                            drafts: prev.drafts.map((row, j) =>
                              j === i ? { ...row, value: e.target.value } : row,
                            ),
                          }
                        : prev,
                    );
                  }}
                />
                <input
                  className={ajustesField}
                  inputMode="decimal"
                  value={d.value_max}
                  placeholder="techo"
                  onChange={(e) => {
                    setOk(false);
                    setEstado((prev) =>
                      prev.fase === 'listo'
                        ? {
                            ...prev,
                            drafts: prev.drafts.map((row, j) =>
                              j === i ? { ...row, value_max: e.target.value } : row,
                            ),
                          }
                        : prev,
                    );
                  }}
                />
                <button
                  type="button"
                  className={ajustesButtonGhost}
                  onClick={() => {
                    setOk(false);
                    setEstado((prev) =>
                      prev.fase === 'listo'
                        ? { ...prev, drafts: prev.drafts.filter((_, j) => j !== i) }
                        : prev,
                    );
                  }}
                >
                  Quitar
                </button>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={ajustesButtonGhost}
              onClick={() => {
                setOk(false);
                setEstado((prev) =>
                  prev.fase === 'listo' ? { ...prev, drafts: [...prev.drafts, emptyDraft()] } : prev,
                );
              }}
            >
              Añadir frase
            </button>
            <button
              type="button"
              className={cn(ajustesButtonPrimary)}
              disabled={saving || !dirty}
              onClick={() => void save()}
            >
              {saving ? 'Guardando' : 'Guardar'}
            </button>
            {ok ? <span className="text-label text-[color:var(--v2-muted)]">Guardado.</span> : null}
            {error ? <span className="text-label text-[color:var(--v2-danger)]">{error}</span> : null}
          </div>
        </Card>
      ) : null}
    </section>
  );
}
