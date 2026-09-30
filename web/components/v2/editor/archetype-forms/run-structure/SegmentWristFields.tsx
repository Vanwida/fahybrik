'use client';

// SegmentWristFields — lo que un tramo de correr dice al reloj y al entorno, todo
// OPCIONAL (nunca se obliga estructura al coach):
//   · Dónde se corre: calle · cinta · pista. La cinta enseña su inclinación; la
//     pista es plana y no la tiene (el servidor la rechaza).
//   · Aviso: hacia dónde vibra el reloj si el ritmo o el pulso se salen. Solo
//     aparece con un objetivo que medir (ritmo, zona de ritmo o de pulso) y dice
//     qué pasa si no se toca: eso lo manda el método del coach (Ajustes › Método).
//   · Frase para el reloj: coaching corto («mirar el pulso»), una línea. No es
//     prescripción: no lleva nada que medir.
// Sigue el patrón del resto de la fila: lo que no se usa se ve como un chip «+»,
// lo usado se ve como su campo con una ✕ para quitarlo.

import { useId, useState } from 'react';
import type { Segment } from '@fahybrid/shared/domain/prescription';
import {
  RUN_CUE_MAX_LENGTH,
  type RunAlertDirection,
  type RunEnvironment,
} from '@fahybrid/shared/domain/prescription/run-structure';
import { cn } from '@/lib/utils';
import { Input } from '@/components/v2/ui';
import { NumberCell } from '../../fields';
import { InlineToggle } from '../form-controls';
import { useWristAlertMethod } from '../../use-wrist-alert-method';
import { alertHintText, alertNeedsMethod } from '@/lib/dashboard/v2/run-structure-view';
import { alertApplies } from './tree-ops';
import { AddChip, IconBtn } from './row-atoms';
import type { RowHandlers } from './SegmentRow';

const ENVIRONMENT_OPTIONS: { value: RunEnvironment; label: string }[] = [
  { value: 'calle', label: 'Calle' },
  { value: 'cinta', label: 'Cinta' },
  { value: 'pista', label: 'Pista' },
];

type AlertChoice = RunAlertDirection | 'default';

// «Se pasa» = más rápido o con más pulso; «no llega» = al revés. El aviso se
// razona en intensidad, igual que en el modelo.
const ALERT_OPTIONS: { value: AlertChoice; label: string }[] = [
  { value: 'default', label: 'Por defecto' },
  { value: 'arriba', label: 'Si se pasa' },
  { value: 'abajo', label: 'Si no llega' },
  { value: 'ambos', label: 'Los dos' },
  { value: 'ninguno', label: 'Nunca' },
];

/** Desde cuántos caracteres el contador avisa de que la frase se acaba. */
const CUE_NEAR_LIMIT = RUN_CUE_MAX_LENGTH - 10;

const INCLINE_MAX_PCT = 15;
const INCLINE_STEP_PCT = 0.5;

export function SegmentWristFields({
  segment,
  path,
  handlers,
}: {
  segment: Segment;
  path: number[];
  handlers: RowHandlers;
}) {
  const { environment, cue, alert } = segment;
  // «Frase» abierta con el campo aún vacío: el campo se ve aunque `cue` no exista.
  const [cueOpen, setCueOpen] = useState(false);
  const showCue = cue !== undefined || cueOpen;

  return (
    <div className="mt-3 space-y-2.5 border-t border-v2-border pt-2.5">
      {environment ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <span className="t-meta text-v2-muted">Dónde se corre</span>
          <InlineToggle
            ariaLabel="Dónde se corre este tramo"
            value={environment}
            options={ENVIRONMENT_OPTIONS}
            onChange={(next) => handlers.setEnvironment(path, next)}
          />
          {environment === 'cinta' ? (
            <label className="flex items-center gap-1.5">
              <span className="t-meta text-v2-muted">Inclin.</span>
              <NumberCell
                value={segment.incline_pct ?? null}
                ariaLabel="Inclinación de la cinta (%)"
                min={0}
                max={INCLINE_MAX_PCT}
                step={INCLINE_STEP_PCT}
                suffix="%"
                className="w-16"
                onChange={(v) =>
                  v === null ? handlers.removeField(path, 'incline_pct') : handlers.patchSegment(path, { incline_pct: v })
                }
              />
            </label>
          ) : null}
          {environment === 'pista' ? <span className="t-meta text-v2-faint">Plana, sin inclinación.</span> : null}
          <IconBtn icon="close" label="Quitar dónde se corre" onClick={() => handlers.setEnvironment(path, null)} />
        </div>
      ) : null}

      {alertApplies(segment.target) ? (
        <AlertField
          segment={segment}
          value={alert ?? 'default'}
          onChange={(next) => handlers.setAlert(path, next === 'default' ? null : next)}
        />
      ) : null}

      {showCue ? (
        <CueField
          cue={cue}
          autoFocus={cue === undefined}
          onChange={(next) => handlers.setCue(path, next)}
          onRemove={() => {
            setCueOpen(false);
            handlers.setCue(path, null);
          }}
        />
      ) : null}

      {!environment || !showCue ? (
        <div className="flex flex-wrap items-center gap-2">
          {!environment ? (
            <AddChip icon="route" label="Dónde se corre" onClick={() => handlers.setEnvironment(path, 'calle')} />
          ) : null}
          {!showCue ? <AddChip icon="format_quote" label="Frase para el reloj" onClick={() => setCueOpen(true)} /> : null}
        </div>
      ) : null}
    </div>
  );
}

// ── Aviso ─────────────────────────────────────────────────────────────────────

function AlertField({
  segment,
  value,
  onChange,
}: {
  segment: Segment;
  value: AlertChoice;
  onChange: (next: AlertChoice) => void;
}) {
  const hintId = useId();
  // Solo un objetivo a zona se apoya en el método del coach: no se le pide nada
  // al servidor para el resto.
  const method = useWristAlertMethod(value === 'default' && alertNeedsMethod(segment.target));
  const hint = alertHintText(value === 'default' ? undefined : value, segment.target, method);
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="t-meta text-v2-muted">Aviso en el reloj</span>
        <InlineToggle
          ariaLabel="Cuándo avisa el reloj en este tramo"
          value={value}
          options={ALERT_OPTIONS}
          onChange={onChange}
        />
      </div>
      {hint ? (
        <p id={hintId} className="t-meta text-v2-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

// ── Frase para el reloj ───────────────────────────────────────────────────────

function CueField({
  cue,
  autoFocus,
  onChange,
  onRemove,
}: {
  cue: string | undefined;
  autoFocus: boolean;
  onChange: (next: string | null) => void;
  onRemove: () => void;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const counterId = `${id}-count`;
  // El borrador conserva los espacios que el coach va tecleando; lo que viaja al
  // servidor va recortado (el Zod lo recorta igual) y vacío = sin frase.
  const [draft, setDraft] = useState(cue ?? '');
  // Si la frase cambia desde fuera (deshacer, otro tramo en la misma fila), el
  // borrador la sigue; los espacios que el coach está tecleando no cuentan.
  const [seenCue, setSeenCue] = useState(cue);
  if (seenCue !== cue) {
    setSeenCue(cue);
    if (draft.trim() !== (cue ?? '')) setDraft(cue ?? '');
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="t-meta text-v2-muted">
          Frase para el reloj
        </label>
        <span
          id={counterId}
          className={cn('t-meta t-tnum', draft.length >= CUE_NEAR_LIMIT ? 'text-v2-warn' : 'text-v2-faint')}
        >
          {draft.length}/{RUN_CUE_MAX_LENGTH}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <Input
          id={id}
          value={draft}
          maxLength={RUN_CUE_MAX_LENGTH}
          placeholder="Mirar el pulso"
          autoFocus={autoFocus}
          aria-describedby={`${hintId} ${counterId}`}
          onChange={(e) => {
            // Una sola línea sin sangrado: un salto pegado desde otro sitio se vuelve
            // un espacio y los de delante no cuentan (los de detrás sí, al teclear).
            const next = e.target.value.replace(/[\r\n]+/g, ' ').replace(/^\s+/, '');
            setDraft(next);
            const trimmed = next.trim();
            onChange(trimmed === '' ? null : trimmed);
          }}
        />
        <IconBtn icon="close" label="Quitar la frase" onClick={onRemove} />
      </div>
      <p id={hintId} className="t-meta text-v2-faint">
        Una línea que el atleta lee en la muñeca durante este tramo. Coaching corto, sin cifras que cumplir.
      </p>
    </div>
  );
}
