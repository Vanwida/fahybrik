'use client';

// Option-based onboarding screens: single-select (auto-advance), multi-select
// (toggle + Seguir), the two-group composite (q-carrera-cual) and the closing
// datos screen (edad + sexo + ubicación). All render options FROM the shared
// definition, storing the CODE (single) or code[] (multi) by DB column.

import { useState } from 'react';
import { resolveLeadTitle, type LeadColumn } from '@fahybrid/shared/domain/leads/questions';
import { ArrowIcon, CheckIcon } from './icons';
import {
  AUTO_ADVANCE_MS,
  Frame,
  Head,
  optionsFor,
  readArray,
  readString,
  type AnswerPatch,
  type ScreenProps,
} from './screens.shared';

// ── SINGLE (auto-advance) ────────────────────────────────────────────────────
export function SingleScreen({ question, answers, nombre, cb }: ScreenProps) {
  const key = question.key as string;
  const [pending, setPending] = useState<string | null>(null);
  const active = pending ?? (readString(answers, key) || null);

  const choose = (code: string) => {
    if (pending) return;
    setPending(code);
    window.setTimeout(() => cb.onAdvance({ [key]: code }), AUTO_ADVANCE_MS);
  };

  return (
    <Frame
      body={
        <>
          <Head question={question} nombre={nombre} />
          <div
            className={`ob-opts${pending ? ' is-locked' : ''}`}
            role="radiogroup"
            aria-label={resolveLeadTitle(question, nombre)}
          >
            {optionsFor(question.optionsKey).map((opt) => {
              const selected = active === opt.code;
              return (
                <button
                  key={opt.code}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`ob-opt${selected ? ' is-selected' : ''}`}
                  onClick={() => choose(opt.code)}
                >
                  <span className="ob-mark">
                    <CheckIcon />
                  </span>
                  <span className="ob-label">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </>
      }
    />
  );
}

// ── MULTI (toggle + Seguir) ──────────────────────────────────────────────────
export function MultiScreen({ question, answers, nombre, cb }: ScreenProps) {
  const key = question.key as string;
  const exclusive = question.exclusive ?? [];
  const [sel, setSel] = useState<string[]>(() => readArray(answers, key));

  const toggle = (code: string) => {
    setSel((prev) => {
      if (prev.includes(code)) return prev.filter((c) => c !== code);
      if (exclusive.includes(code)) return [code];
      return [...prev.filter((c) => !exclusive.includes(c)), code];
    });
  };

  return (
    <Frame
      body={
        <>
          <Head question={question} nombre={nombre} />
          <div className="ob-opts" role="group" aria-label={resolveLeadTitle(question, nombre)}>
            {optionsFor(question.optionsKey).map((opt) => {
              const selected = sel.includes(opt.code);
              return (
                <button
                  key={opt.code}
                  type="button"
                  role="checkbox"
                  aria-checked={selected}
                  className={`ob-opt ob-opt--multi${selected ? ' is-selected' : ''}`}
                  onClick={() => toggle(opt.code)}
                >
                  <span className="ob-mark">
                    <CheckIcon />
                  </span>
                  <span className="ob-label">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </>
      }
      actions={
        <button
          type="button"
          className="ob-btn"
          disabled={sel.length === 0}
          onClick={() => cb.onAdvance({ [key]: sel })}
        >
          Seguir <ArrowIcon />
        </button>
      }
    />
  );
}

// ── COMPOSITE2 (q-carrera-cual: two single-select groups) ────────────────────
export function Composite2Screen({ question, answers, nombre, cb }: ScreenProps) {
  const groups = question.groups ?? [];
  const [state, setState] = useState<Record<string, string | undefined>>(() => {
    const init: Record<string, string | undefined> = {};
    for (const g of groups) init[g.key] = readString(answers, g.key) || undefined;
    return init;
  });
  const ready = groups.every((g) => state[g.key]);

  return (
    <Frame
      body={
        <>
          <Head question={question} nombre={nombre} />
          {groups.map((g) => (
            <div key={g.key} className="ob-group">
              <label className="ob-field-label">{g.label}</label>
              <div className="ob-opts" role="radiogroup" aria-label={g.label}>
                {optionsFor(g.key).map((opt) => {
                  const selected = state[g.key] === opt.code;
                  return (
                    <button
                      key={opt.code}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={`ob-opt${selected ? ' is-selected' : ''}`}
                      onClick={() => setState((prev) => ({ ...prev, [g.key]: opt.code }))}
                    >
                      <span className="ob-mark">
                        <CheckIcon />
                      </span>
                      <span className="ob-label">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      }
      actions={
        <button
          type="button"
          className="ob-btn"
          disabled={!ready}
          onClick={() => {
            const patch: AnswerPatch = {};
            for (const g of groups) patch[g.key] = state[g.key];
            cb.onAdvance(patch);
          }}
        >
          Seguir <ArrowIcon />
        </button>
      }
    />
  );
}

// ── DATOS (edad + sexo + ubicación) ──────────────────────────────────────────
export function DatosScreen({ question, answers, nombre, cb }: ScreenProps) {
  const [edad, setEdad] = useState<string>(() => readString(answers, 'edad'));
  const [sexo, setSexo] = useState<string | undefined>(() => readString(answers, 'sexo') || undefined);
  const [ubicacion, setUbicacion] = useState<string | undefined>(
    () => readString(answers, 'ubicacion') || undefined,
  );

  // Render helper (a plain function, not a nested component) so the pill groups
  // don't remount on every edad keystroke.
  const renderPills = (
    label: string,
    column: LeadColumn,
    value: string | undefined,
    onPick: (code: string) => void,
  ) => (
    <div className="ob-datos-group">
      <label className="ob-field-label">{label}</label>
      <div className="ob-opts" role="radiogroup" aria-label={label}>
        {optionsFor(column).map((opt) => {
          const selected = value === opt.code;
          return (
            <button
              key={opt.code}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`ob-opt${selected ? ' is-selected' : ''}`}
              onClick={() => onPick(opt.code)}
            >
              <span className="ob-mark">
                <CheckIcon />
              </span>
              <span className="ob-label">{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <Frame
      body={
        <>
          <Head question={question} nombre={nombre} />
          <div className="ob-stack ob-fields">
            <div>
              <label className="ob-field-label" htmlFor="ob-edad">
                Edad
              </label>
              <input
                id="ob-edad"
                className="ob-field"
                type="text"
                inputMode="numeric"
                placeholder="años"
                value={edad}
                onChange={(e) => setEdad(e.target.value)}
              />
            </div>
            {renderPills('Sexo', 'sexo', sexo, setSexo)}
            {renderPills('¿Dónde estás?', 'ubicacion', ubicacion, setUbicacion)}
          </div>
        </>
      }
      actions={
        <button
          type="button"
          className="ob-btn"
          onClick={() =>
            cb.onAdvance({
              edad: edad.trim() || undefined,
              sexo,
              ubicacion,
            })
          }
        >
          Seguir <ArrowIcon />
        </button>
      }
    />
  );
}
