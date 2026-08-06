'use client';

// ImportWorkoutsDialog — #28 importer entry point, inside the microciclo screen.
// TWO phases in one overlay:
//   · FORM  — de dónde sale la semana: Excel, texto pegado, FOTO o IA. Lo lleva
//             entero `ImportSourceForm`, que arma la petición; aquí solo se
//             dispara /proposal (que no guarda nada).
//   · REVIEW — the weeks×days grid (ImportReviewGrid) where the coach fixes the
//             amber/red days, maps each imported week to a container week and
//             picks WHAT gets imported (per-day / per-week exclusion), then
//             "Confirmar" POSTs /confirm (the only write). Nothing untyped,
//             unresolved or excluded is ever sent — the grid gates the confirm
//             button and buildConfirmBody drops the excluded days/weeks.
//
// El formulario NO se desmonta al pasar a revisar, solo se oculta: volver atrás
// devuelve la elección del coach intacta, incluidas las capturas ya subidas.

import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';
import {
  buildConfirmBody,
  buildReviewModel,
  type MicroWeekRef,
  type ReviewWeek,
} from '@/lib/dashboard/v2/import-review';
import type { ImportProposal } from '@/lib/import/build-proposal';
import type { WeekNotice } from '@/lib/dashboard/coach/ai/week-notices';
import { ImportReviewGrid } from './ImportReviewGrid';
import {
  ImportSourceForm,
  type ImportExtractRequest,
  type ImportSourceMode,
} from './ImportSourceForm';
import { MAX_PHOTOS } from './import-photo-upload';

type Phase = 'form' | 'review';

/**
 * Lo que el servidor puede decir del modo foto, dicho para un entrenador. Su
 * mensaje sirve casi siempre, pero de dos avisos no se puede fiar la pantalla: el
 * de configuración nombra una variable de entorno y el de validación viene del
 * validador. Los demás pasan tal cual.
 */
const PHOTO_ERROR_COPY: Record<string, string> = {
  vision_not_configured:
    'La lectura de fotos todavía no está activada. Mientras tanto puedes usar «Subir Excel» o «Pegar texto».',
  invalid_request: `Sube entre 1 y ${MAX_PHOTOS} capturas para importar.`,
  vision_failed:
    'No se pudo leer alguna de las capturas. Prueba con una foto más nítida y con la semana entera a la vista.',
  timeout:
    'La lectura de las capturas está tardando demasiado. Prueba con menos capturas o una imagen más ligera.',
  network_timeout:
    'No se pudo descargar alguna captura a tiempo. Vuelve a intentarlo; si se repite, usa una imagen más ligera.',
  empty_reading: 'No se ha reconocido ningún entreno en las capturas.',
  week_overflow:
    'Las capturas necesitan más semanas de las que quedan en este microciclo a partir de la semana elegida.',
};

/** Client abort under the route's 300s ceiling so the coach never sits on a
 *  dead spinner after Vercel already killed the function (opaque 504, no JSON). */
const PHOTO_CLIENT_TIMEOUT_MS = 275_000;

async function readError(res: Response): Promise<{ code?: string; message?: string }> {
  try {
    const data = (await res.json()) as { error?: { code?: string; message?: string } };
    return data.error ?? {};
  } catch {
    return {};
  }
}

/** El mensaje del servidor, salvo que este modo tenga uno mejor para ese código. */
async function readErrorMessage(
  res: Response,
  fallback: string,
  copy: Record<string, string> = {},
): Promise<string> {
  const { code, message } = await readError(res);
  return (code ? copy[code] : undefined) ?? message ?? fallback;
}

export function ImportWorkoutsDialog({
  microcycleId,
  microWeeks,
  onClose,
  onDone,
}: {
  microcycleId: string;
  microWeeks: MicroWeekRef[];
  onClose: () => void;
  onDone: () => void;
}) {
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>('form');
  const [sourceMode, setSourceMode] = useState<ImportSourceMode>('file');

  const [extracting, setExtracting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [reviewWeeks, setReviewWeeks] = useState<ReviewWeek[]>([]);
  // Lo que la IA no pudo honrar del foco (contenido sin tipar, IA caída…). Viene
  // con la propuesta y se enseña en la revisión: callarlo es el fallo original.
  const [notices, setNotices] = useState<WeekNotice[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const extract = async ({ body, targetWeekId }: ImportExtractRequest) => {
    setExtracting(true);
    setFormError(null);
    try {
      const res = await fetch('/api/coach/import/proposal', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        ...(sourceMode === 'photo'
          ? { signal: AbortSignal.timeout(PHOTO_CLIENT_TIMEOUT_MS) }
          : {}),
      });
      if (!res.ok) {
        setFormError(
          await readErrorMessage(
            res,
            sourceMode === 'generate'
              ? 'No se pudo generar la semana.'
              : sourceMode === 'photo'
                ? 'No se pudieron leer las capturas.'
                : 'No se pudo extraer la propuesta.',
            sourceMode === 'photo' ? PHOTO_ERROR_COPY : {},
          ),
        );
        return;
      }
      const proposal = (await res.json()) as ImportProposal;
      const model = buildReviewModel(proposal, microWeeks);
      setNotices(proposal.notices ?? []);
      // El coach dijo DÓNDE EMPIEZA, así que lo importado se coloca a partir de
      // ahí y no desde la primera semana: la 1ª leída va a la que eligió, la 2ª a
      // la siguiente, y así. Con pegar y generar, que traen una sola, esto es lo
      // mismo de siempre; con una tanda de fotos es la diferencia entre llenar de
      // la 3 a la 7 o machacar de la 1 a la 5.
      //
      // Sin destino elegido (el Excel) se queda el mapeo por defecto de
      // `buildReviewModel`, y el coach lo ajusta semana a semana en la revisión.
      if (targetWeekId) {
        const ordered = [...microWeeks].sort((a, b) => a.index - b.index);
        const start = ordered.findIndex((w) => w.id === targetWeekId);
        if (start >= 0) {
          model.forEach((week, i) => {
            const mw = ordered[start + i];
            // Más semanas leídas que semanas por delante: las que sobran se quedan
            // sin destino y la revisión las bloquea hasta que él diga dónde van.
            week.target_week_id = mw?.id ?? null;
            if (mw) week.week = mw.index + 1;
          });
        }
      }
      setReviewWeeks(model);
      setConfirmError(null);
      setPhase('review');
    } catch (err) {
      const timedOut =
        (err instanceof DOMException && err.name === 'TimeoutError') ||
        (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError'));
      setFormError(
        timedOut && sourceMode === 'photo'
          ? PHOTO_ERROR_COPY.timeout
          : 'No se pudo conectar. Inténtalo de nuevo.',
      );
    } finally {
      setExtracting(false);
    }
  };

  const confirm = async () => {
    setConfirming(true);
    setConfirmError(null);
    try {
      const res = await fetch('/api/coach/import/confirm', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(buildConfirmBody(microcycleId, reviewWeeks)),
      });
      if (!res.ok) {
        setConfirmError(await readErrorMessage(res, 'No se pudo confirmar la importación.'));
        return;
      }
      router.refresh();
      onDone();
    } catch {
      setConfirmError('No se pudo conectar. Inténtalo de nuevo.');
    } finally {
      setConfirming(false);
    }
  };

  const isReview = phase === 'review';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[color:var(--v2-scrim)] p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal
        aria-label="Importar entrenos"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'flex max-h-[92vh] w-full flex-col overflow-hidden rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] shadow-[var(--v2-shadow-pop)]',
          isReview
            ? 'h-[min(90vh,900px)] max-w-[1080px]'
            : // Las miniaturas necesitan ancho para que quepan cuatro por fila.
              sourceMode === 'photo'
              ? 'max-w-lg'
              : 'max-w-md',
        )}
      >
        <header className="flex items-center justify-between gap-3 border-b border-[color:var(--v2-border)] px-5 py-4">
          <div className="min-w-0">
            <h2 className="v2-display text-xl">Importar entrenos</h2>
            <p className="v2-micro mt-0.5">
              {isReview
                ? 'Revisa y elige qué entra — nada se guarda sin ejercicio del catálogo'
                : 'De tu metodología a este microciclo, tipado'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="v2-focus flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--v2-r-s)] text-[color:var(--v2-muted)] transition-colors hover:bg-[color:var(--v2-surface-2)] hover:text-[color:var(--v2-fg)]"
          >
            <MIcon name="close" size={20} />
          </button>
        </header>

        {isReview ? (
          <ImportReviewGrid
            reviewWeeks={reviewWeeks}
            microWeeks={microWeeks}
            notices={notices}
            onChange={setReviewWeeks}
            onConfirm={confirm}
            confirming={confirming}
            error={confirmError}
            onBack={() => setPhase('form')}
            onAddPhoto={
              sourceMode === 'photo'
                ? () => {
                    // Vuelve al mismo sitio de donde salió, con las capturas que ya
                    // había: se añade la del entreno abierto y se vuelve a extraer.
                    setPhase('form');
                    setSourceMode('photo');
                  }
                : undefined
            }
          />
        ) : null}

        {/* Oculto, no desmontado: al volver atrás el formulario sigue como estaba.
            `hidden` además lo saca del recorrido de teclado y del árbol accesible,
            así que durante la revisión no hay dos pantallas navegables a la vez. */}
        <ImportSourceForm
          hidden={isReview}
          microcycleId={microcycleId}
          microWeeks={microWeeks}
          sourceMode={sourceMode}
          onSelectSource={setSourceMode}
          extracting={extracting}
          error={formError}
          onError={setFormError}
          onExtract={extract}
          onCancel={onClose}
        />
      </div>
    </div>
  );
}
