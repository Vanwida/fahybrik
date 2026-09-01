'use client';

// circuit-config-fields — los campos de BLOQUE del Circuito (docs/DECISIONS.md,
// 2026-08-07 «"Circuito" pasa a ser un tipo de bloque real»). Rondas + pacing +
// los dos descansos viven UNA vez en `WeekDayPart.circuit`, no duplicados en
// cada estación (el bug real de `applyHead` en ComponentsForm.tsx: 2 de 22
// grupos reales en producción tenían el campo en una estación y no en la
// otra). `work_seconds` (el tope duro por estación) SOLO existe bajo pacing
// `por_reloj` — pedirlo siempre, aunque el circuito sea `por_tarea` (sin
// reloj), era la confusión de «ventana trabajo» que Alex reportó. Extraído de
// component-stations.tsx (su hermano `FormatParamField`) para no repetir el
// mismo techo de 500 líneas que sacó ese fichero de ComponentsForm.

import type { CircuitConfig, CircuitPacing } from '@fahybrid/shared/schema/program-templates';
import { Stepper } from '@/components/v2/controls/Stepper';
import { RestChips, ROUND_REST_VALUES } from '../dose-controls';
import { ClockCell, Field, InlineToggle } from './form-controls';

const DEFAULT_CIRCUIT_ROUNDS = 3;
const DEFAULT_CIRCUIT_WORK_SECONDS = 60;

const CIRCUIT_PACING_OPTIONS: { value: CircuitPacing['kind']; label: string }[] = [
  { value: 'por_tarea', label: 'Por tarea' },
  { value: 'por_reloj', label: 'Por reloj' },
];

/**
 * Campos de bloque del Circuito: rondas (Stepper), pacing (por tarea / por
 * reloj), la ventana de trabajo (solo si por_reloj) y los dos descansos
 * (entre estaciones dentro de una ronda, entre rondas completas — ambos
 * opcionales, «—» honesto = sin pausa). Sin `config` guardada (bloque recién
 * creado antes del primer toque, o legado sin completar) se muestran valores
 * de arranque razonables — mismo patrón que `head?.rounds ?? 1` de
 * `FormatParamField` (component-stations.tsx) — pero no se escribe nada hasta
 * que el coach toca un control: cada control manda el objeto `CircuitConfig`
 * COMPLETO (rounds y pacing son obligatorios en el schema), nunca un parche a
 * medias.
 */
export function CircuitConfigFields({
  config,
  onChange,
}: {
  config: CircuitConfig | undefined;
  onChange: (next: CircuitConfig) => void;
}) {
  const rounds = config?.rounds ?? DEFAULT_CIRCUIT_ROUNDS;
  const pacing: CircuitPacing = config?.pacing ?? { kind: 'por_tarea' };
  const restStations = config?.rest_between_stations_seconds ?? null;
  const restRounds = config?.rest_between_rounds_seconds ?? null;

  const build = (over: {
    rounds?: number;
    pacing?: CircuitPacing;
    restStations?: number | null;
    restRounds?: number | null;
  }): CircuitConfig => {
    const next: CircuitConfig = {
      rounds: over.rounds ?? rounds,
      pacing: over.pacing ?? pacing,
    };
    const rs = over.restStations !== undefined ? over.restStations : restStations;
    const rr = over.restRounds !== undefined ? over.restRounds : restRounds;
    // Ambos descansos son `.optional()` en el schema, NUNCA nullable — «sin
    // pausa» es la clave AUSENTE, no un `null` que el server rechazaría.
    if (rs != null) next.rest_between_stations_seconds = rs;
    if (rr != null) next.rest_between_rounds_seconds = rr;
    return next;
  };

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label="Rondas">
        <Stepper
          value={rounds}
          min={1}
          max={60}
          ariaLabel="Número de rondas del circuito"
          onChange={(v) => onChange(build({ rounds: v }))}
        />
      </Field>

      <Field label="Ritmo">
        <InlineToggle
          ariaLabel="Ritmo del circuito"
          value={pacing.kind}
          options={CIRCUIT_PACING_OPTIONS}
          onChange={(kind) => {
            if (kind === pacing.kind) return;
            onChange(
              build({
                pacing:
                  kind === 'por_reloj'
                    ? { kind: 'por_reloj', work_seconds: DEFAULT_CIRCUIT_WORK_SECONDS }
                    : { kind: 'por_tarea' },
              }),
            );
          }}
        />
      </Field>

      {pacing.kind === 'por_reloj' ? (
        <Field label="Ventana trabajo">
          <ClockCell
            seconds={pacing.work_seconds}
            ariaLabel="Ventana de trabajo por estación (m:ss)"
            onChange={(s) =>
              onChange(
                build({ pacing: { kind: 'por_reloj', work_seconds: s ?? pacing.work_seconds } }),
              )
            }
          />
        </Field>
      ) : null}

      <Field label="Descanso entre estaciones" className="sm:col-span-2">
        <RestChips
          seconds={restStations}
          values={ROUND_REST_VALUES}
          allowNone
          ariaLabel="Descanso entre estaciones"
          onChange={(s) => onChange(build({ restStations: s }))}
        />
      </Field>

      <Field label="Descanso entre rondas" className="sm:col-span-2">
        <RestChips
          seconds={restRounds}
          values={ROUND_REST_VALUES}
          allowNone
          ariaLabel="Descanso entre rondas"
          onChange={(s) => onChange(build({ restRounds: s }))}
        />
      </Field>
    </div>
  );
}
