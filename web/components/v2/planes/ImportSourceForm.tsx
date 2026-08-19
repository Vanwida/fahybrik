'use client';

// ImportSourceForm — el PRIMER paso del importador: de dónde sale la semana.
// Cuatro puertas al mismo camino (Excel · texto pegado · foto · IA), cada una con
// lo suyo, y una sola salida: «Extraer y revisar», que arma la petición y se la da
// al diálogo. Aquí no se guarda nada y no se llama a /proposal: eso es del
// diálogo, que es quien lleva las dos fases.
//
// Toda la elección del coach vive AQUÍ dentro y el diálogo lo mantiene montado
// mientras revisa (`hidden`), así que volver atrás desde la revisión devuelve el
// formulario tal y como lo dejó: el texto pegado, el rango, y las capturas ya
// subidas sin volver a subirlas.

import { useCallback, useEffect, useRef, useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';
import type { MicroWeekRef } from '@/lib/dashboard/v2/import-review';
import { looksLikeInstruction } from '@/lib/import/instruction-detect';
import { getLlmConfigured } from '@/components/v2/editor/ai-suggest-workout';
import { DAY_LABELS_FULL } from '@/lib/dashboard/constants/calendar';
import { ImportPhotoPicker, type PhotoDraft } from './ImportPhotoPicker';
import { ImportPhotoDestination, WeekSelect } from './import-destination';
import { usePhotoUploads } from './import-photo-upload';

export type ImportSourceMode = 'file' | 'paste' | 'photo' | 'generate';

type ImportVariant = 'estandar' | 'fuerza' | 'resistencia';

const VARIANTS: { value: ImportVariant; label: string }[] = [
  { value: 'estandar', label: 'Estándar' },
  { value: 'fuerza', label: 'Foco fuerza' },
  { value: 'resistencia', label: 'Foco resistencia' },
];

const SOURCE_LABEL: Record<ImportSourceMode, string> = {
  file: 'Subir Excel',
  paste: 'Pegar texto',
  photo: 'Subir foto',
  generate: 'Generar con IA',
};

/** Lo que el formulario le entrega al diálogo cuando el coach le da al botón. */
export interface ImportExtractRequest {
  /** El cuerpo de /api/coach/import/proposal, ya armado para este modo. */
  body: unknown;
  /**
   * La semana del microciclo por la que EMPIEZA lo importado. Pegar y generar
   * traen una sola, así que es su destino entero; una tanda de fotos puede traer
   * varias y se colocan a partir de esta, en el orden de las capturas.
   *
   * `null` solo en el Excel, que no pregunta dónde empieza: ahí se queda el mapeo
   * por defecto y el coach ajusta semana a semana en la revisión.
   */
  targetWeekId: string | null;
}

export function ImportSourceForm({
  hidden,
  microcycleId,
  microWeeks,
  sourceMode,
  onSelectSource,
  extracting,
  error,
  onError,
  onExtract,
  onCancel,
}: {
  /** Durante la revisión el formulario se OCULTA, no se desmonta: así el coach
   *  recupera su elección al volver atrás y no se re-suben las capturas. */
  hidden?: boolean;
  microcycleId: string;
  microWeeks: MicroWeekRef[];
  /** El modo lo lleva el diálogo: lo necesita después, ya en la revisión. */
  sourceMode: ImportSourceMode;
  onSelectSource: (mode: ImportSourceMode) => void;
  extracting: boolean;
  error: string | null;
  onError: (message: string | null) => void;
  onExtract: (request: ImportExtractRequest) => void;
  onCancel: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [variant, setVariant] = useState<ImportVariant>('estandar');
  const [rangeText, setRangeText] = useState('');
  const [xlsxBase64, setXlsxBase64] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pastedText, setPastedText] = useState('');
  // Modo FOTO: las capturas EN ORDEN. La posición decide el número de semana, así
  // que esta lista nunca se reordena sola — solo la mueve el coach.
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  // DÓNDE EMPIEZA lo que se importa. Lo comparten pegar, generar y foto, porque en
  // los tres es la misma pregunta y la respuesta se conserva al cambiar de modo.
  const [targetWeekId, setTargetWeekId] = useState<string>(microWeeks[0]?.id ?? '');
  const [pasteWeekday, setPasteWeekday] = useState<number>(1);
  /**
   * El día por el que empieza una tanda de FOTOS. `null` = toda la semana.
   *
   * Es OPCIONAL porque el número de días no hay que declararlo: el lector ya ve
   * las cabeceras de día en la captura y sabe si le has dado dos o siete. Lo único
   * que la foto no puede saber es a qué semana de ESTE microciclo va, porque en la
   * imagen pone «SEMANA 12» y eso no dice nada del plan que se está montando.
   */
  const [photoWeekday, setPhotoWeekday] = useState<number | null>(null);
  // Generate-flow (#48): the coach's natural-language week focus.
  const [generateFocus, setGenerateFocus] = useState('');
  // Shown when a pasted block reads like an instruction (steer to "Generar con IA").
  const [pasteInstructionHint, setPasteInstructionHint] = useState(false);
  // null = unknown (loading); false disables the AI tab (LLM not configured yet).
  const [llmConfigured, setLlmConfigured] = useState<boolean | null>(null);

  // Whether the coach-IA LLM is configured — gates the "Generar con IA" tab, the
  // same global flag the SuggestWorkoutModal's "Completo" mode reads.
  useEffect(() => {
    let live = true;
    void getLlmConfigured().then((ok) => {
      if (live) setLlmConfigured(ok);
    });
    return () => {
      live = false;
    };
  }, []);

  const selectSource = (m: ImportSourceMode) => {
    onSelectSource(m);
    setPasteInstructionHint(false);
    onError(null);
  };

  // Steer a mis-pasted instruction into the AI tab, carrying the typed text over.
  const switchToGenerateWithText = () => {
    setGenerateFocus(pastedText);
    onSelectSource('generate');
    setPasteInstructionHint(false);
  };

  const onFile = (f: File | undefined) => {
    if (!f) return;
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result ?? '');
      const comma = res.indexOf(',');
      setXlsxBase64(comma >= 0 ? res.slice(comma + 1) : '');
    };
    reader.readAsDataURL(f);
  };

  const patchPhoto = useCallback((id: string, patch: Partial<PhotoDraft>) => {
    setPhotos((cur) => cur.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);
  // Las capturas viajan ANTES de que el diálogo empiece a extraer, así que ese rato
  // tiene su propio ocupado: sin él el botón seguiría diciendo «Extraer y revisar»
  // mientras suben 40 MB, y el coach volvería a pulsarlo.
  const { uploading, uploadAll } = usePhotoUploads(photos, patchPhoto);
  const busy = extracting || uploading;

  const canExtract =
    !busy &&
    (sourceMode === 'paste'
      ? pastedText.trim().length > 0 && targetWeekId.length > 0
      : sourceMode === 'photo'
        ? photos.length > 0 && targetWeekId.length > 0
        : sourceMode === 'generate'
          ? generateFocus.trim().length >= 2 && targetWeekId.length > 0 && llmConfigured === true
          : rangeText.trim().length > 0);

  const submit = async () => {
    if (!canExtract) return;
    // Instruction guard (#48): a pasted INSTRUCTION would mis-parse as a session.
    // Detect it BEFORE hitting the parser and steer the coach to "Generar con IA".
    if (sourceMode === 'paste' && looksLikeInstruction(pastedText)) {
      setPasteInstructionHint(true);
      return;
    }

    if (sourceMode === 'paste') {
      onExtract({
        body: {
          microcycle_id: Number(microcycleId),
          variant: 'estandar' as const,
          pasted_text: pastedText,
          target_weekday: pasteWeekday,
        },
        targetWeekId,
      });
      return;
    }

    if (sourceMode === 'generate') {
      onExtract({
        body: {
          microcycle_id: Number(microcycleId),
          mode: 'generate' as const,
          focus: generateFocus.trim(),
        },
        targetWeekId,
      });
      return;
    }

    if (sourceMode === 'photo') {
      // Las capturas van ANTES y por su propio camino: los bytes no caben en el
      // cuerpo de la petición, así que suben firmadas y en la petición solo viajan
      // sus identificadores, en el orden de la pantalla.
      onError(null);
      const uploaded = await uploadAll();
      if (!uploaded) {
        onError('Revisa la captura marcada y vuelve a intentarlo.');
        return;
      }
      onExtract({
        body: {
          microcycle_id: Number(microcycleId),
          mode: 'photo' as const,
          images: uploaded.map((pathname) => ({ pathname })),
          target_week_id: Number(targetWeekId),
          ...(photoWeekday ? { target_weekday: photoWeekday } : {}),
        },
        targetWeekId,
      });
      return;
    }

    onExtract({
      body: {
        microcycle_id: Number(microcycleId),
        variant,
        range_text: rangeText.trim(),
        ...(xlsxBase64 ? { xlsx_base64: xlsxBase64 } : {}),
      },
      targetWeekId: null,
    });
  };

  return (
    <div hidden={hidden} className="space-y-4 overflow-y-auto p-5">
      {/* Source toggle */}
      <div className="inline-flex flex-wrap rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border)] p-0.5">
        {(['file', 'paste', 'photo', 'generate'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => selectSource(m)}
            className={cn(
              'v2-focus rounded-[var(--v2-r-pill)] px-3 py-1.5 text-xs font-semibold transition-colors',
              sourceMode === m
                ? 'bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)]'
                : 'text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]',
            )}
          >
            {SOURCE_LABEL[m]}
          </button>
        ))}
      </div>

      {sourceMode === 'file' ? (
        <div className="space-y-1.5">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="v2-focus flex w-full items-center gap-2 rounded-[var(--v2-r-s)] border border-dashed border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface-2)] px-3 py-3 text-left text-sm text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-accent)]"
          >
            <MIcon name="upload_file" size={18} className="text-[color:var(--v2-accent)]" />
            <span className="min-w-0 flex-1 truncate">
              {fileName ?? 'Elige tu Plantilla_HYROX (.xlsx)'}
            </span>
            {fileName ? (
              <MIcon name="check_circle" size={16} className="text-[color:var(--v2-ok)]" />
            ) : null}
          </button>
          <p className="v2-micro text-[color:var(--v2-faint)]">
            Sin archivo se usa la plantilla de ejemplo.
          </p>
        </div>
      ) : sourceMode === 'photo' ? (
        <div className="space-y-3">
          <ImportPhotoDestination
            microWeeks={microWeeks}
            weekId={targetWeekId}
            onWeekId={setTargetWeekId}
            weekday={photoWeekday}
            onWeekday={setPhotoWeekday}
          />
          <ImportPhotoPicker photos={photos} onChange={setPhotos} disabled={busy} />
        </div>
      ) : sourceMode === 'paste' ? (
        <label className="block space-y-1.5">
          <span className="v2-micro">Pega la sesión de un día</span>
          <textarea
            value={pastedText}
            onChange={(e) => {
              setPastedText(e.target.value);
              if (pasteInstructionHint) setPasteInstructionHint(false);
            }}
            rows={5}
            maxLength={20_000}
            placeholder={
              'Martes\nFUERZA: Tren inferior\n5 rounds Back Squat c/2\'30": 10/10/8/8/6 al 60/65/70/70/75% RM'
            }
            className="v2-focus w-full resize-y rounded-[var(--v2-r-s)] border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface-2)] px-3 py-2 text-sm leading-snug text-[color:var(--v2-fg)] outline-none placeholder:text-[color:var(--v2-faint)] focus:border-[color:var(--v2-accent)]"
          />
          {pasteInstructionHint ? (
            <div className="flex flex-col gap-2 rounded-[var(--v2-r-s)] border border-[color:var(--v2-warn)]/40 bg-[color:var(--v2-warn-soft)] px-3 py-2.5">
              <p className="flex items-start gap-1.5 text-xs leading-snug text-[color:var(--v2-fg)]">
                <MIcon
                  name="lightbulb"
                  size={15}
                  className="mt-px shrink-0 text-[color:var(--v2-warn)]"
                />
                Esto parece una instrucción, no una sesión pegada. Para que la IA te la genere usa
                «Generar con IA».
              </p>
              <button
                type="button"
                onClick={switchToGenerateWithText}
                className="v2-focus inline-flex w-fit items-center gap-1.5 rounded-[var(--v2-r-pill)] bg-[color:var(--v2-accent)] px-3.5 py-1.5 text-xs font-bold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)]"
              >
                <MIcon name="draw" size={14} /> Generar con IA
              </button>
            </div>
          ) : null}
        </label>
      ) : (
        <div className="space-y-3">
          <label className="block space-y-1.5">
            <span className="v2-micro">¿Qué semana quieres? (foco, sesiones, modalidades)</span>
            <textarea
              value={generateFocus}
              onChange={(e) => setGenerateFocus(e.target.value)}
              rows={4}
              maxLength={400}
              disabled={llmConfigured === false}
              placeholder={
                'p. ej. Semana de doble sesión combinando running e híbrido, foco HYROX. 6 días, domingo descanso.'
              }
              className="v2-focus w-full resize-y rounded-[var(--v2-r-s)] border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface-2)] px-3 py-2 text-sm leading-snug text-[color:var(--v2-fg)] outline-none placeholder:text-[color:var(--v2-faint)] focus:border-[color:var(--v2-accent)] disabled:opacity-50"
            />
          </label>
          <div className="space-y-1.5">
            <span className="v2-micro">¿En qué semana del microciclo la meto?</span>
            <WeekSelect microWeeks={microWeeks} value={targetWeekId} onChange={setTargetWeekId} />
            <p className="v2-micro text-[color:var(--v2-faint)]">
              La IA compone la semana entera con tu biblioteca. La revisas antes de guardar, nada
              entra sin ejercicio del catálogo.
            </p>
          </div>
          {llmConfigured === false ? (
            <p className="flex items-start gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 py-2 text-xs leading-snug text-[color:var(--v2-muted)]">
              <MIcon name="info" size={14} className="mt-px shrink-0 text-[color:var(--v2-warn)]" />
              La generación con IA está pendiente de configurar. Mientras tanto usa «Subir Excel» o
              «Pegar texto».
            </p>
          ) : null}
        </div>
      )}

      {/* Destination — a single DAY for paste, a WEEK RANGE for Excel. Generate
          targets a whole week, picked inside its own panel above. The photo flow
          brings whole weeks and the coach maps them one by one in the review. */}
      {sourceMode === 'paste' ? (
        <div className="space-y-1.5">
          <span className="v2-micro">¿En qué día del microciclo lo meto?</span>
          <div className="grid grid-cols-2 gap-2">
            <WeekSelect microWeeks={microWeeks} value={targetWeekId} onChange={setTargetWeekId} />
            <select
              aria-label="Día de la semana"
              value={pasteWeekday}
              onChange={(e) => setPasteWeekday(Number(e.target.value))}
              className="v2-focus w-full rounded-[var(--v2-r-s)] border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface-2)] px-3 py-2 text-sm font-semibold text-[color:var(--v2-fg)] outline-none focus:border-[color:var(--v2-accent)]"
            >
              {DAY_LABELS_FULL.map((label, i) => (
                <option key={label} value={i + 1}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <p className="v2-micro text-[color:var(--v2-faint)]">
            La sesión entra en ese día. El resto de la semana no se toca.
          </p>
        </div>
      ) : sourceMode === 'file' ? (
        <label className="block space-y-1.5">
          <span className="v2-micro">¿Qué rango meto en este microciclo?</span>
          <input
            type="text"
            value={rangeText}
            onChange={(e) => setRangeText(e.target.value)}
            maxLength={200}
            placeholder="de la semana 1 a la 4"
            className="v2-focus w-full rounded-[var(--v2-r-s)] border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface-2)] px-3 py-2 text-sm text-[color:var(--v2-fg)] outline-none placeholder:text-[color:var(--v2-faint)] focus:border-[color:var(--v2-accent)]"
          />
          <p className="v2-micro text-[color:var(--v2-faint)]">
            Ej.: «solo la semana 1» · «de la 4 a la 9» · «semanas 1, 3 y 5»
          </p>
        </label>
      ) : null}

      {/* Variant (Fork D) — only the Excel sheet has variants; paste has none. */}
      {sourceMode === 'file' ? (
        <div className="space-y-1.5">
          <span className="v2-micro">Variante de la hoja</span>
          <div className="flex flex-wrap gap-1.5">
            {VARIANTS.map((v) => (
              <button
                key={v.value}
                type="button"
                onClick={() => setVariant(v.value)}
                className={cn(
                  'v2-focus rounded-[var(--v2-r-pill)] px-3 py-1 text-xs font-semibold transition-colors',
                  variant === v.value
                    ? 'bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)]'
                    : 'border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]',
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="flex items-center gap-1.5 text-xs text-[color:var(--v2-danger)]">
          <MIcon name="error" size={14} />
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[color:var(--v2-border)] pt-3">
        {sourceMode === 'photo' ? (
          <span className="mr-auto text-xs text-[color:var(--v2-faint)]">
            No se guarda nada todavía.
          </span>
        ) : null}
        <button
          type="button"
          onClick={onCancel}
          className="v2-focus rounded-[var(--v2-r-pill)] px-3.5 py-2 text-sm font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!canExtract}
          className="v2-focus inline-flex h-10 items-center gap-1.5 rounded-[var(--v2-r-pill)] bg-[color:var(--v2-accent)] px-4 text-sm font-bold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)] disabled:opacity-50"
        >
          <MIcon
            name={
              busy
                ? 'progress_activity'
                : sourceMode === 'generate'
                  ? 'draw'
                  : sourceMode === 'photo'
                    ? 'photo_camera'
                    : 'document_scanner'
            }
            size={17}
            className={busy ? 'animate-spin' : undefined}
          />
          {uploading
            ? 'Subiendo fotos…'
            : extracting
              ? sourceMode === 'generate'
                ? 'Generando…'
                : sourceMode === 'photo'
                  ? 'Leyendo las capturas…'
                  : 'Extrayendo…'
              : sourceMode === 'generate'
                ? 'Generar y revisar'
                : 'Extraer y revisar'}
        </button>
      </div>
    </div>
  );
}
