'use client';

// Cargas de competición del coach (mig 0208, card 130).
//
// El motor decide QUÉ es un peso de competición (estación × división × género)
// y cómo se traduce a HyroxStationLoad. Eso es mecanismo. Los kilos los escribe
// aquí el coach: método suyo, y por eso nacen vacíos. Vacío = no lo sé. La app
// no inventa un número.
//
// Carga sola contra GET /api/coach/station-loads, como SignalThresholdsForm:
// una tabla que aún no existe en un entorno no tumba el resto de Ajustes.

import { useEffect, useMemo, useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { Card } from '@/components/ui/card';
import { ajustesButtonPrimary, ajustesButtonSecondary, ajustesField } from './controls';
import {
  COACH_STATION_DAMPER_MAX,
  COACH_STATION_DAMPER_MIN,
  COACH_STATION_LOAD_DIVISIONS,
  COACH_STATION_LOAD_GENDERS,
  COACH_STATION_LOAD_KG_MAX,
  coachStationLoadCellKey,
  coachStationLoadStations,
  type CoachStationLoadCell,
} from '@fahybrid/shared/domain/coach/station-loads';
import {
  coachStationLoadsPutSchema,
  type CoachStationLoadsResponse,
} from '@fahybrid/shared/schema/coach-station-loads';
import type { RaceDivision, RaceGender } from '@fahybrid/shared/schema/races';
import { cn } from '@/lib/utils';

const ENDPOINT = '/api/coach/station-loads';

const DIVISION_COPY: Record<RaceDivision, string> = {
  open: 'Open',
  pro: 'Pro',
  elite: 'Elite',
};

const GENDER_COPY: Record<RaceGender, string> = {
  men: 'Hombres',
  women: 'Mujeres',
  mixed: 'Mixto',
};

type Estado =
  | { fase: 'cargando' }
  | { fase: 'error' }
  | {
      fase: 'listo';
      saved: Record<string, string>;
      values: Record<string, string>;
      filledCount: number;
      cellCount: number;
    };

function cellValue(cell: CoachStationLoadCell): string {
  if (cell.load_axis === 'damper') return cell.damper == null ? '' : String(cell.damper);
  return cell.kg == null ? '' : String(cell.kg);
}

function valuesFromCells(cells: CoachStationLoadCell[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const cell of cells) {
    out[coachStationLoadCellKey(cell.station_slug, cell.division, cell.gender)] = cellValue(cell);
  }
  return out;
}

function sameValues(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if ((a[key] ?? '') !== (b[key] ?? '')) return false;
  }
  return true;
}

function parseCellNumber(raw: string, damper: boolean): number | null {
  const t = raw.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return damper ? Math.round(n) : n;
}

function cellsFromValues(values: Record<string, string>) {
  const stations = coachStationLoadStations();
  const cells: Array<{
    station_slug: string;
    division: RaceDivision;
    gender: RaceGender;
    kg?: number | null;
    damper?: number | null;
  }> = [];
  for (const st of stations) {
    for (const division of COACH_STATION_LOAD_DIVISIONS) {
      for (const gender of COACH_STATION_LOAD_GENDERS) {
        const raw = values[coachStationLoadCellKey(st.slug, division, gender)] ?? '';
        const n = parseCellNumber(raw, st.load_axis === 'damper');
        if (n == null) continue;
        cells.push(
          st.load_axis === 'damper'
            ? { station_slug: st.slug, division, gender, damper: n }
            : { station_slug: st.slug, division, gender, kg: n },
        );
      }
    }
  }
  return cells;
}

async function fetchLoads(): Promise<Estado> {
  try {
    const res = await fetch(ENDPOINT);
    if (!res.ok) return { fase: 'error' };
    const data = (await res.json()) as CoachStationLoadsResponse;
    const values = valuesFromCells(data.cells);
    return {
      fase: 'listo',
      saved: values,
      values,
      filledCount: data.filled_count,
      cellCount: data.cell_count,
    };
  } catch {
    return { fase: 'error' };
  }
}

export function StationLoadsForm() {
  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' });
  const [division, setDivision] = useState<RaceDivision>('open');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [recarga, setRecarga] = useState(0);
  const stations = useMemo(() => coachStationLoadStations(), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next = await fetchLoads();
      if (!cancelled) setEstado(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [recarga]);

  const retry = () => {
    setEstado({ fase: 'cargando' });
    setError(null);
    setOk(false);
    setRecarga((n) => n + 1);
  };

  const setCell = (key: string, next: string) => {
    setOk(false);
    setEstado((prev) =>
      prev.fase === 'listo' ? { ...prev, values: { ...prev.values, [key]: next } } : prev,
    );
  };

  const save = async () => {
    if (estado.fase !== 'listo') return;
    const parsed = coachStationLoadsPutSchema.safeParse({ cells: cellsFromValues(estado.values) });
    if (!parsed.success) {
      setError('Revisa los números: kilos mayores que cero, damper entre 1 y 10.');
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
      const data = (await res.json().catch(() => null)) as CoachStationLoadsResponse | null;
      if (!res.ok || !data) {
        setError('No se pudieron guardar los cambios.');
        return;
      }
      const values = valuesFromCells(data.cells);
      setEstado({
        fase: 'listo',
        saved: values,
        values,
        filledCount: data.filled_count,
        cellCount: data.cell_count,
      });
      setOk(true);
    } catch {
      setError('No se pudieron guardar los cambios. Reintenta.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <h2 className="v2-micro mb-2">Cargas de competición</h2>

      {estado.fase === 'cargando' ? <Cargando /> : null}
      {estado.fase === 'error' ? <NoCarga onRetry={retry} /> : null}

      {estado.fase === 'listo' ? (
        <Card className="flex flex-col gap-4 p-4 sm:p-5">
          <p className="text-label leading-relaxed text-[color:var(--v2-muted)]">
            Kilos (o el ajuste del damper) por estación, división y género. Vacío significa que no
            lo sabes. La app no inventa estos números: si una celda está vacía, un objetivo «a peso
            de competición» se queda sin kilos.
          </p>
          <p className="text-label text-[color:var(--v2-faint)]">
            {estado.filledCount === 0
              ? `Ninguna celda rellena de ${estado.cellCount}.`
              : `${estado.filledCount} de ${estado.cellCount} celdas con dato.`}
          </p>

          <div className="flex flex-wrap gap-2" role="tablist" aria-label="División">
            {COACH_STATION_LOAD_DIVISIONS.map((d) => (
              <button
                key={d}
                type="button"
                role="tab"
                aria-selected={division === d}
                onClick={() => setDivision(d)}
                className={cn(
                  'v2-focus rounded-[var(--v2-r-pill)] px-3 py-1.5 text-sm font-semibold',
                  division === d
                    ? 'bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)]'
                    : 'border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] text-[color:var(--v2-fg)]',
                )}
              >
                {DIVISION_COPY[d]}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] border-collapse text-sm">
              <thead>
                <tr className="text-left text-[color:var(--v2-muted)]">
                  <th className="pb-2 pr-3 font-medium">Estación</th>
                  {COACH_STATION_LOAD_GENDERS.map((g) => (
                    <th key={g} className="pb-2 px-1 font-medium">
                      {GENDER_COPY[g]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stations.map((st) => (
                  <tr key={st.slug} className="border-t border-[color:var(--v2-border)]">
                    <td className="py-2 pr-3 align-top">
                      <div className="font-semibold text-[color:var(--v2-fg)]">{st.label}</div>
                      <div className="text-label text-[color:var(--v2-faint)]">
                        {st.load_axis === 'damper'
                          ? 'Ajuste del damper (1-10)'
                          : st.load_axis === 'per_implement'
                            ? `kg de cada implemento (lleva ${st.implements})`
                            : st.load_axis === 'sled'
                              ? 'kg totales del trineo'
                              : 'kg'}
                      </div>
                    </td>
                    {COACH_STATION_LOAD_GENDERS.map((g) => {
                      const key = coachStationLoadCellKey(st.slug, division, g);
                      const damper = st.load_axis === 'damper';
                      return (
                        <td key={g} className="py-2 px-1 align-top">
                          <input
                            type="number"
                            inputMode="decimal"
                            min={damper ? COACH_STATION_DAMPER_MIN : 0.1}
                            max={damper ? COACH_STATION_DAMPER_MAX : COACH_STATION_LOAD_KG_MAX}
                            step={damper ? 1 : 0.5}
                            placeholder="Sin dato"
                            aria-label={`${st.label}, ${DIVISION_COPY[division]}, ${GENDER_COPY[g]}`}
                            value={estado.values[key] ?? ''}
                            onChange={(e) => setCell(key, e.target.value)}
                            className={cn(ajustesField, 'w-[5.5rem] tabular-nums')}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col items-start gap-3 border-t border-[color:var(--v2-border)] pt-4 sm:flex-row sm:items-center">
            <div className="min-h-[1.25rem] text-xs" aria-live="polite">
              {error ? (
                <span className="text-[color:var(--v2-danger)]">{error}</span>
              ) : ok ? (
                <span className="inline-flex items-center gap-1 text-[color:var(--v2-ok)]">
                  <MIcon name="check_circle" size={14} aria-hidden />
                  Guardado
                </span>
              ) : sameValues(estado.values, estado.saved) ? null : (
                <span className="text-[color:var(--v2-muted)]">Cambios sin guardar</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || sameValues(estado.values, estado.saved)}
              className={cn(ajustesButtonPrimary, 'sm:ml-auto')}
            >
              {saving ? (
                <>
                  <MIcon name="progress_activity" size={16} className="animate-spin" aria-hidden />
                  Guardando…
                </>
              ) : (
                'Guardar cambios'
              )}
            </button>
          </div>
        </Card>
      ) : null}
    </section>
  );
}

function Cargando() {
  return (
    <Card className="flex flex-col gap-4 p-4 sm:p-5" role="status" aria-busy="true">
      <span className="sr-only">Cargando tus cargas de competición…</span>
      <Bar className="h-4 w-[min(220px,60%)]" />
      <Bar className="h-3 w-full" />
      <Bar className="h-40 w-full" />
    </Card>
  );
}

function NoCarga({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="flex flex-col items-start gap-3 p-4 sm:p-5">
      <p role="alert" className="text-sm text-[color:var(--v2-fg)]">
        No hemos podido cargar tus cargas de competición. Tus números siguen guardados, es esta
        pantalla la que no los ve.
      </p>
      <button type="button" onClick={onRetry} className={ajustesButtonSecondary}>
        <MIcon name="refresh" size={16} aria-hidden />
        Reintentar
      </button>
    </Card>
  );
}

function Bar({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'animate-pulse rounded-[var(--v2-r-m)] bg-[color:var(--v2-surface-2)] motion-reduce:animate-none',
        className,
      )}
    />
  );
}
