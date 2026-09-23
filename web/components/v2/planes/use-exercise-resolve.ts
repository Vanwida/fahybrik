'use client';

// La palabra tecleada → ejercicio del catálogo del coach, con caché por sesión
// de página (la misma palabra no vuelve a la red) y aprendizaje: cuando el coach
// elige un ejercicio distinto del propuesto (o uno para una palabra sin
// propuesta), se guarda como sinónimo suyo y la próxima vez sale solo.

import { useEffect, useState } from 'react';

export interface ResolveCandidate {
  id: string;
  name: string;
  score: number;
}

export interface Resolution {
  best: { id: string; name: string } | null;
  confidence: number;
  candidates: ResolveCandidate[];
}

const cache = new Map<string, Resolution>();
const key = (t: string) => t.trim().toLowerCase();

export async function resolveTokens(tokens: string[]): Promise<Resolution[] | null> {
  const missing = [...new Set(tokens.map(key))].filter((t) => t && !cache.has(t));
  if (missing.length > 0) {
    const res = await fetch('/api/coach/exercises/resolve', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tokens: missing }),
    }).catch(() => null);
    if (!res?.ok) return null;
    const body = (await res.json()) as { results: Resolution[] };
    missing.forEach((t, i) => {
      const r = body.results[i];
      if (r) cache.set(t, { best: r.best, confidence: r.confidence, candidates: r.candidates });
    });
  }
  return tokens.map((t) => cache.get(key(t)) ?? { best: null, confidence: 0, candidates: [] });
}

/** Resuelve las palabras con una pequeña espera tras el último tecleo. */
export function useResolve(tokens: string[]): { results: Resolution[] | null; loading: boolean; failed: boolean } {
  const joined = tokens.join('\u0000');
  const [state, setState] = useState<{ for: string; results: Resolution[] | null; failed: boolean }>({ for: '', results: null, failed: false });
  useEffect(() => {
    if (!joined) return;
    let alive = true;
    const list = joined.split('\u0000');
    const cached = list.every((t) => cache.has(key(t)));
    const t = window.setTimeout(
      () => {
        void resolveTokens(list).then((r) => {
          if (alive) setState({ for: joined, results: r, failed: r === null });
        });
      },
      cached ? 0 : 180,
    );
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [joined]);
  if (!joined) return { results: [], loading: false, failed: false };
  const fresh = state.for === joined;
  return { results: fresh ? state.results : null, loading: !fresh, failed: fresh && state.failed };
}

/** El coach eligió `exercise` para `term`: se aprende (best-effort, sin bloquear). */
export function learnSynonym(term: string, exercise: { id: string; name: string }) {
  const k = key(term);
  const prev = cache.get(k);
  cache.set(k, {
    best: exercise,
    confidence: 1,
    candidates: [{ id: exercise.id, name: exercise.name, score: 1 }, ...(prev?.candidates ?? []).filter((c) => c.id !== exercise.id)],
  });
  void fetch('/api/coach/exercises/resolve', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ term, exercise_id: exercise.id }),
  }).catch(() => null);
}
