'use client';

// Free-input onboarding screens: text/email, the optional HYROX time, the free
// textarea, the four best-marks number fields, and the closing contacto screen
// (teléfono + RGPD) that fires the phase-2 full submit. Each writes its value(s)
// to the answers store by DB column.

import { useState } from 'react';
import { resolveLeadTitle } from '@fahybrid/shared/domain/leads/questions';
import { ArrowIcon, CheckIcon } from './icons';
import {
  EMAIL_RE,
  Frame,
  Head,
  readString,
  type AnswerPatch,
  type ScreenProps,
} from './screens.shared';

// ── TEXT / EMAIL ─────────────────────────────────────────────────────────────
export function TextLikeScreen({ question, answers, nombre, cb }: ScreenProps) {
  const isEmail = question.kind === 'email';
  const key = question.key as string;
  const [value, setValue] = useState<string>(() => readString(answers, key));
  const valid = isEmail ? EMAIL_RE.test(value.trim()) : value.trim().length > 0;

  const submit = () => {
    if (!valid) return;
    if (isEmail) cb.onEmailAdvance(value.trim());
    else cb.onAdvance({ [key]: value.trim() });
  };

  return (
    <Frame
      body={
        <>
          <Head question={question} nombre={nombre} />
          <div className="ob-field-wrap">
            <input
              className="ob-field"
              type={isEmail ? 'email' : 'text'}
              inputMode={isEmail ? 'email' : 'text'}
              autoComplete={isEmail ? 'email' : 'given-name'}
              placeholder={question.placeholder ?? ''}
              aria-label={resolveLeadTitle(question, nombre)}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            {question.note ? <p className="ob-field-note">{question.note}</p> : null}
          </div>
        </>
      }
      actions={
        <button type="button" className="ob-btn" disabled={!valid} onClick={submit}>
          Seguir <ArrowIcon />
        </button>
      }
    />
  );
}

// ── TIME (optional + skip) ───────────────────────────────────────────────────
export function TimeScreen({ question, answers, nombre, cb }: ScreenProps) {
  const key = question.key as string;
  const [value, setValue] = useState<string>(() => readString(answers, key));
  const commit = () => cb.onAdvance({ [key]: value.trim() || undefined });

  return (
    <Frame
      body={
        <>
          <Head question={question} nombre={nombre} />
          <div className="ob-field-wrap">
            <input
              className="ob-field"
              type="text"
              inputMode="numeric"
              placeholder={question.placeholder ?? ''}
              aria-label={resolveLeadTitle(question, nombre)}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commit();
                }
              }}
            />
          </div>
        </>
      }
      actions={
        <div className="ob-btn-row">
          <button type="button" className="ob-btn" onClick={commit}>
            Seguir <ArrowIcon />
          </button>
          <button
            type="button"
            className="ob-btn ob-btn--ghost"
            onClick={() => cb.onAdvance({ [key]: undefined })}
          >
            {question.skipLabel ?? 'Saltar'}
          </button>
        </div>
      }
    />
  );
}

// ── TEXTAREA (optional) ──────────────────────────────────────────────────────
export function TextareaScreen({ question, answers, nombre, cb }: ScreenProps) {
  const key = question.key as string;
  const [value, setValue] = useState<string>(() => readString(answers, key));

  return (
    <Frame
      body={
        <>
          <Head question={question} nombre={nombre} />
          <div className="ob-field-wrap">
            <textarea
              className="ob-field"
              placeholder={question.placeholder ?? ''}
              aria-label={resolveLeadTitle(question, nombre)}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
        </>
      }
      actions={
        <button
          type="button"
          className="ob-btn"
          onClick={() => cb.onAdvance({ [key]: value.trim() || undefined })}
        >
          {question.cta ?? 'Seguir'} <ArrowIcon />
        </button>
      }
    />
  );
}

// ── NUMBER FIELDS (q-marcas: 4 optional + skip-all) ──────────────────────────
export function NumberFieldsScreen({ question, answers, nombre, cb }: ScreenProps) {
  const fields = question.fields ?? [];
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of fields) init[f.key] = readString(answers, f.key);
    return init;
  });

  const commit = () => {
    const patch: AnswerPatch = {};
    for (const f of fields) patch[f.key] = values[f.key]?.trim() || undefined;
    cb.onAdvance(patch);
  };
  const skip = () => {
    const patch: AnswerPatch = {};
    for (const f of fields) patch[f.key] = undefined;
    cb.onAdvance(patch);
  };

  return (
    <Frame
      body={
        <>
          <Head question={question} nombre={nombre} />
          <div className="ob-stack ob-fields">
            <div className="ob-grid2">
              {fields.map((f) => (
                <div key={f.key}>
                  <label className="ob-field-label" htmlFor={`ob-${f.key}`}>
                    {f.label}
                  </label>
                  <input
                    id={`ob-${f.key}`}
                    className="ob-field"
                    type="text"
                    inputMode={f.numeric ? 'numeric' : 'text'}
                    placeholder={f.placeholder}
                    value={values[f.key] ?? ''}
                    onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          </div>
        </>
      }
      actions={
        <div className="ob-btn-row">
          <button type="button" className="ob-btn" onClick={commit}>
            Seguir <ArrowIcon />
          </button>
          <button type="button" className="ob-btn ob-btn--ghost" onClick={skip}>
            {question.skipLabel ?? 'Saltar'}
          </button>
        </div>
      }
    />
  );
}

// ── CONTACTO (teléfono + RGPD → phase-2 submit) ──────────────────────────────
export function ContactoScreen({ question, answers, nombre, cb }: ScreenProps) {
  const [phone, setPhone] = useState<string>(() => readString(answers, 'telefono'));
  const [consent, setConsent] = useState<boolean>(answers.consent_rgpd === true);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);

  const canSubmit = phone.trim().length >= 6 && consent && !sending;

  const submit = async () => {
    if (!canSubmit) return;
    setFailed(false);
    setSending(true);
    const ok = await cb.onComplete({ telefono: phone.trim(), consent_rgpd: true });
    if (!ok) {
      setSending(false);
      setFailed(true);
    }
    // On success the orchestrator advances to the final screen (this unmounts).
  };

  return (
    <Frame
      body={
        <>
          <Head question={question} nombre={nombre} />
          <div className="ob-field-wrap">
            <input
              className="ob-field"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="Tu número"
              aria-label="Tu teléfono"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void submit();
                }
              }}
            />
            <p className="ob-field-note">Para confirmarte la llamada y recordártela.</p>
          </div>

          <label className="ob-check">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span className="ob-check-box">
              <CheckIcon />
            </span>
            <span className="ob-check-txt">
              Acepto la{' '}
              <a href={`/${cb.locale}/privacy`} target="_blank" rel="noopener noreferrer">
                política de privacidad
              </a>{' '}
              y el tratamiento de mis datos, incluidos los de salud, para preparar mi plan.
            </span>
          </label>
        </>
      }
      actions={
        <>
          {failed ? (
            <p className="ob-error" role="alert">
              No hemos podido enviar tu solicitud. Revisa tu conexión e inténtalo de nuevo.
            </p>
          ) : null}
          <button
            type="button"
            className="ob-btn"
            disabled={!canSubmit}
            aria-busy={sending}
            onClick={() => void submit()}
          >
            {sending ? (
              <>
                <span className="ob-spinner" aria-hidden="true" /> Enviando…
              </>
            ) : failed ? (
              <>
                Reintentar <ArrowIcon />
              </>
            ) : (
              <>
                Enviar <ArrowIcon />
              </>
            )}
          </button>
        </>
      }
    />
  );
}
