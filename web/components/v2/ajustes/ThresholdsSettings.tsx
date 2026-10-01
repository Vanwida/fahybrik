'use client';

// Umbrales de avisos y bandas de readiness — método del coach con defectos a
// la vista. Cada número se guarda al salir (PUT de UNA clave; null = volver al
// defecto). El servidor rechaza combinaciones incoherentes (cautela por encima
// de «bien») y la fila dice por qué. «Restaurar valores por defecto» deja todo
// como el producto, con deshacer. Las secciones «Reloj…» son el método de la
// muñeca al correr (0282): números, interruptores, una lista corta y las once
// palabras del RPE, todo con su defecto.

import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import {
  COACH_THRESHOLD_KEYS,
  normalizedWeights,
  weightGroupOf,
  type CoachThresholdKey,
  type CoachThresholds,
} from '@fahybrid/shared/domain/coach/signal-thresholds';
import type { CoachSignalThresholdsResponse } from '@fahybrid/shared/schema/coach-signal-thresholds';
import { Button, useToast } from '@/components/v2/ui';
import { SettingsSection } from './SettingsKit';
import { sendJson } from './autosave';
import { useRouter } from 'next/navigation';
import { THRESHOLD_SECTIONS } from './threshold-copy';
import { ThresholdRow } from './ThresholdRows';
import { WristRpeWords } from './WristRpeWords';

const ENDPOINT = '/api/coach/signal-thresholds';

/** Lo que se manda en un PUT: números por clave y, aparte, las once palabras del RPE. */
type PutBody = Partial<Record<CoachThresholdKey, number | null>> & { wrist_rpe_words?: string[] | null };

function pick(res: CoachSignalThresholdsResponse): CoachThresholds {
  return Object.fromEntries(COACH_THRESHOLD_KEYS.map((k) => [k, res[k]])) as CoachThresholds;
}

/** Los pesos son relativos: lo que cuenta de verdad es su parte del total (entero %). */
function shareOf(values: CoachThresholds, k: CoachThresholdKey): number | null {
  const group = weightGroupOf(k);
  if (!group) return null;
  const w = normalizedWeights(values, group) as Record<string, number> | null;
  return w ? Math.round((w[k] ?? 0) * 100) : null;
}

export function ThresholdsSettings({ initial }: { initial: CoachSignalThresholdsResponse }) {
  const router = useRouter();
  const toast = useToast();
  const [values, setValues] = useState<CoachThresholds>(() => pick(initial));
  const [custom, setCustom] = useState<Set<CoachThresholdKey>>(() => new Set(initial.custom_keys));
  const [words, setWords] = useState<string[]>(initial.wrist_rpe_words);
  const [wordsCustom, setWordsCustom] = useState(initial.wrist_rpe_words_custom);
  const [version, setVersion] = useState(0);
  const [restoring, setRestoring] = useState(false);
  const defaults = initial.defaults;

  const apply = (res: CoachSignalThresholdsResponse) => {
    setValues(pick(res));
    setCustom(new Set(res.custom_keys));
    setWords(res.wrist_rpe_words);
    setWordsCustom(res.wrist_rpe_words_custom);
    router.refresh();
  };

  const put = async (body: PutBody) => {
    const res = await sendJson<CoachSignalThresholdsResponse>(ENDPOINT, 'PUT', body);
    if (res.ok) apply(res.data);
    return res;
  };

  const restoreAll = async () => {
    const before = [...custom];
    if (before.length === 0 && !wordsCustom) return;
    const previous: PutBody = Object.fromEntries(before.map((k) => [k, values[k]]));
    if (wordsCustom) previous.wrist_rpe_words = words;
    const reset: PutBody = Object.fromEntries(before.map((k) => [k, null]));
    if (wordsCustom) reset.wrist_rpe_words = null;
    setRestoring(true);
    const res = await put(reset);
    setRestoring(false);
    setVersion((v) => v + 1);
    if (!res.ok) {
      toast.toast({ title: 'No se han podido restaurar', description: res.message, tone: 'danger' });
      return;
    }
    toast.toast({
      title: 'Valores por defecto restaurados',
      tone: 'ok',
      undo: async () => {
        await put(previous);
        setVersion((v) => v + 1);
      },
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {THRESHOLD_SECTIONS.map((section, i) => (
        <SettingsSection
          key={section.title}
          title={section.title}
          action={
            i === 0 && (custom.size > 0 || wordsCustom) ? (
              <Button size="sm" variant="ghost" icon={RotateCcw} loading={restoring} onClick={() => void restoreAll()}>
                Restaurar valores por defecto
              </Button>
            ) : undefined
          }
        >
          {section.keys.map((key) => (
            <ThresholdRow
              key={`${key}-${version}`}
              k={key}
              value={values[key]}
              fallback={defaults[key]}
              isCustom={custom.has(key)}
              share={shareOf(values, key)}
              save={(v) => put({ [key]: v })}
            />
          ))}
          {section.extra === 'palabras_rpe' ? (
            <WristRpeWords
              key={`rpe-${version}`}
              words={words}
              defaults={initial.default_wrist_rpe_words}
              isCustom={wordsCustom}
              save={(v) => put({ wrist_rpe_words: v })}
            />
          ) : null}
        </SettingsSection>
      ))}
    </div>
  );
}
