'use client';

// Formulario de cómo trabaja el coach. El servidor entrega el estado. El texto
// se guarda con PUT. El PDF se sube o se quita al instante (el fichero no
// puede esperar al botón).

import { useId, useRef, useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { Card } from '@/components/ui/card';
import {
  ajustesButtonGhost,
  ajustesButtonPrimary,
  ajustesButtonSecondary,
  ajustesField,
} from '@/components/v2/ajustes/controls';
import { HOW_I_WORK_BODY_MAX } from '@fahybrid/shared/domain/coach/how-i-work';
import type { CoachHowIWorkResponse } from '@fahybrid/shared/schema/coach-how-i-work';
import { cn } from '@/lib/utils';

const TEXT_ENDPOINT = '/api/coach/how-i-work';
const PDF_ENDPOINT = '/api/coach/how-i-work/pdf';

const EXAMPLES = [
  'Si el sueño es malo, bajo intensidad, no cancelo',
  'Primero estaciones, luego carrera',
  'Hablo de tú, frases cortas, sin motivacional',
] as const;

interface FormState {
  savedText: string;
  text: string;
  hasMethod: boolean;
  pdf: CoachHowIWorkResponse['pdf'];
}

function readPayload(data: CoachHowIWorkResponse, keepDraft?: string): FormState {
  const savedText = data.body_text ?? '';
  return {
    savedText,
    text: keepDraft ?? savedText,
    hasMethod: data.has_method,
    pdf: data.pdf,
  };
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function HowIWorkForm({ initial }: { initial: CoachHowIWorkResponse }) {
  const textId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<FormState>(() => readPayload(initial));
  const [saving, setSaving] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function saveText() {
    setSaving(true);
    setError(null);
    setOk(false);
    try {
      const res = await fetch(TEXT_ENDPOINT, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body_text: estado.text }),
      });
      if (!res.ok) {
        setError('No se ha podido guardar el texto.');
        return;
      }
      const data = (await res.json()) as CoachHowIWorkResponse;
      setEstado(readPayload(data));
      setOk(true);
    } catch {
      setError('No se ha podido guardar el texto.');
    } finally {
      setSaving(false);
    }
  }

  async function uploadPdf(file: File) {
    setPdfBusy(true);
    setError(null);
    setOk(false);
    try {
      const form = new FormData();
      form.set('file', file);
      const res = await fetch(PDF_ENDPOINT, { method: 'POST', body: form });
      if (!res.ok) {
        setError('No se ha podido subir el PDF. Tiene que ser un PDF tuyo de método.');
        return;
      }
      const data = (await res.json()) as CoachHowIWorkResponse;
      setEstado((prev) => readPayload(data, prev.text));
    } catch {
      setError('No se ha podido subir el PDF.');
    } finally {
      setPdfBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function removePdf() {
    setPdfBusy(true);
    setError(null);
    setOk(false);
    try {
      const res = await fetch(PDF_ENDPOINT, { method: 'DELETE' });
      if (!res.ok) {
        setError('No se ha podido quitar el PDF.');
        return;
      }
      const data = (await res.json()) as CoachHowIWorkResponse;
      setEstado((prev) => readPayload(data, prev.text));
    } catch {
      setError('No se ha podido quitar el PDF.');
    } finally {
      setPdfBusy(false);
    }
  }

  const dirty = estado.text !== estado.savedText;
  const overLimit = estado.text.length > HOW_I_WORK_BODY_MAX;

  return (
    <div className="flex flex-col gap-4">
      <div
        className={cn(
          'rounded-[var(--v2-r-m)] border px-4 py-3 text-sm',
          estado.hasMethod
            ? 'border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] text-[color:var(--v2-muted)]'
            : 'border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface-2)] text-[color:var(--v2-fg)]',
        )}
      >
        {estado.hasMethod
          ? 'Esto es lo que usará la IA para trabajar como tú. Todavía no está cableada.'
          : 'Todavía no has dicho cómo trabajas. Hasta que lo hagas, plan y chat no te imitan.'}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card className="flex flex-col p-4 sm:p-5">
          <label htmlFor={textId} className="text-sm font-semibold text-[color:var(--v2-fg)]">
            Cómo programas y cómo hablas
          </label>
          <p className="mt-1 text-xs text-[color:var(--v2-muted)]">
            Así sí — no es una plantilla:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[color:var(--v2-muted)]">
            {EXAMPLES.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <textarea
            id={textId}
            value={estado.text}
            onChange={(e) => {
              setOk(false);
              setEstado({ ...estado, text: e.target.value });
            }}
            rows={14}
            maxLength={HOW_I_WORK_BODY_MAX}
            className={cn(ajustesField, 'mt-4 min-h-64 resize-y')}
            placeholder="Escribe cómo trabajas."
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <p
              className={cn(
                'text-xs tabular-nums',
                overLimit ? 'text-[color:var(--v2-danger)]' : 'text-[color:var(--v2-faint)]',
              )}
            >
              {estado.text.length} / {HOW_I_WORK_BODY_MAX}
            </p>
            <button
              type="button"
              className={ajustesButtonPrimary}
              disabled={!dirty || saving || overLimit}
              onClick={() => void saveText()}
            >
              {saving ? 'Guardando…' : 'Guardar texto'}
            </button>
          </div>
        </Card>

        <Card className="flex flex-col p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-[color:var(--v2-fg)]">Tu PDF de método</h2>
          <p className="mt-1 text-xs text-[color:var(--v2-muted)]">
            El documento tuyo de cómo programas. No un paper.
          </p>

          {estado.pdf ? (
            <div className="mt-4 flex flex-col gap-3 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-3">
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--v2-r-s)] bg-[color:var(--v2-surface)] text-[color:var(--v2-fg)]"
                >
                  <MIcon name="picture_as_pdf" size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[color:var(--v2-fg)]">
                    {estado.pdf.filename}
                  </p>
                  <p className="text-xs text-[color:var(--v2-muted)]">
                    {formatBytes(estado.pdf.byte_size)}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <a href={PDF_ENDPOINT} className={ajustesButtonSecondary}>
                  Descargar
                </a>
                <button
                  type="button"
                  className={ajustesButtonGhost}
                  disabled={pdfBusy}
                  onClick={() => void removePdf()}
                >
                  Quitar
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-[color:var(--v2-muted)]">Todavía no hay PDF.</p>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadPdf(file);
            }}
          />
          <button
            type="button"
            className={cn(ajustesButtonSecondary, 'mt-4 self-start')}
            disabled={pdfBusy}
            onClick={() => fileRef.current?.click()}
          >
            {pdfBusy ? 'Subiendo…' : estado.pdf ? 'Sustituir PDF' : 'Subir PDF'}
          </button>
        </Card>
      </div>

      {error ? (
        <p className="text-sm text-[color:var(--v2-danger)]" role="alert">
          {error}
        </p>
      ) : null}
      {ok ? (
        <p className="text-sm text-[color:var(--v2-ok)]" role="status">
          Texto guardado.
        </p>
      ) : null}
    </div>
  );
}
