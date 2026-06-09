'use client';

import { useState } from 'react';
import { parseYouTubeVideoId } from '@fahybrid/shared/youtube';
import type { ExerciseCategory } from '@fahybrid/shared/schema/_primitives';
import type { CatalogExercise } from '@/lib/dashboard/exercises/types';
import { EXERCISE_CATEGORY_LABELS } from '@/lib/dashboard/exercises/filter-chips';
import { MIcon } from '@/components/dashboard/MIcon';
import { cn } from '@/lib/utils';

interface ExerciseEditModalProps {
  exercise: CatalogExercise;
  onClose: () => void;
  onSaved: (exercise: CatalogExercise) => void;
}

const CATEGORY_ORDER: ExerciseCategory[] = [
  'hyrox_station',
  'strength',
  'cardio',
  'skill',
  'plyometric',
  'core',
  'mobility',
];

const fieldClass = cn(
  'focus-ring w-full rounded-[var(--r-sm)] border border-[color:var(--border-subtle)]',
  'bg-[color:var(--surface)] px-3 py-2 text-sm text-[color:var(--fg)]',
  'placeholder:text-[color:var(--text-muted)]',
);

const labelClass =
  'text-[11px] font-bold uppercase tracking-wider text-[color:var(--text-muted)]';

export function ExerciseEditModal({ exercise, onClose, onSaved }: ExerciseEditModalProps) {
  const [name, setName] = useState(exercise.name);
  const [category, setCategory] = useState<ExerciseCategory>(exercise.category);
  const [description, setDescription] = useState(exercise.description ?? '');
  const [cues, setCues] = useState(exercise.cues ?? '');
  const [videoUrl, setVideoUrl] = useState(exercise.video_url ?? '');
  const [muscles, setMuscles] = useState(exercise.primary_muscle_groups.join(', '));
  const [equipment, setEquipment] = useState(exercise.equipment.join(', '));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedUrl = videoUrl.trim();
  const videoId = trimmedUrl ? parseYouTubeVideoId(trimmedUrl) : null;
  const urlInvalid = trimmedUrl !== '' && videoId === null;
  const nameInvalid = name.trim() === '';

  const parseList = (raw: string): string[] =>
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

  const handleSave = async () => {
    if (nameInvalid || urlInvalid || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/exercises/${exercise.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          category,
          description,
          cues,
          video_url: videoUrl,
          primary_muscle_groups: parseList(muscles),
          equipment: parseList(equipment),
        }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: { message?: string } };
        throw new Error(json.error?.message ?? 'No se pudo guardar');
      }
      const json = (await res.json()) as { exercise: CatalogExercise };
      onSaved(json.exercise);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal
      aria-label={`Editar ejercicio ${exercise.name}`}
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-[var(--r-l)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-lowest)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-[color:var(--border-subtle)] px-5 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
              Editar ejercicio
            </p>
            <h2 className="font-display text-lg font-bold text-[color:var(--fg)]">
              {exercise.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="focus-ring flex h-8 w-8 items-center justify-center rounded-[var(--r-sm)] text-[color:var(--text-muted)] hover:text-[color:var(--fg)]"
          >
            <MIcon name="close" size={20} />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div className="space-y-1.5">
            <label htmlFor="ex-name" className={labelClass}>
              Nombre
            </label>
            <input
              id="ex-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              className={fieldClass}
              placeholder="Nombre del ejercicio"
              aria-invalid={nameInvalid}
            />
            {nameInvalid ? (
              <p className="text-xs text-[color:var(--danger)]">El nombre es obligatorio.</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="ex-category" className={labelClass}>
              Categoría
            </label>
            <select
              id="ex-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as ExerciseCategory)}
              className={fieldClass}
            >
              {CATEGORY_ORDER.map((c) => (
                <option key={c} value={c}>
                  {EXERCISE_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="ex-desc" className={labelClass}>
              Descripción
            </label>
            <textarea
              id="ex-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={2000}
              className={fieldClass}
              placeholder="Qué es y cómo se ejecuta"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="ex-cues" className={labelClass}>
              Consejos / cues
            </label>
            <textarea
              id="ex-cues"
              value={cues}
              onChange={(e) => setCues(e.target.value)}
              rows={4}
              maxLength={2000}
              className={fieldClass}
              placeholder={'Una clave por línea\np. ej. Pecho alto en el lunge'}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="ex-video" className={labelClass}>
              Link de vídeo · YouTube
            </label>
            <input
              id="ex-video"
              type="url"
              inputMode="url"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              maxLength={500}
              className={cn(
                fieldClass,
                urlInvalid && 'border-[color:var(--danger)]',
              )}
              placeholder="https://www.youtube.com/watch?v=…"
              aria-invalid={urlInvalid}
              aria-describedby="ex-video-hint"
            />
            {urlInvalid ? (
              <p id="ex-video-hint" className="text-xs text-[color:var(--danger)]">
                Pega una URL de YouTube válida (youtube.com/watch, youtu.be o /embed).
              </p>
            ) : videoId ? (
              <div
                id="ex-video-hint"
                className="flex items-center gap-3 rounded-[var(--r-sm)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-low)] p-2"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`}
                  alt=""
                  width={96}
                  height={54}
                  className="h-[54px] w-24 shrink-0 rounded-[var(--r-xs,4px)] object-cover"
                />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[color:var(--fg)]">
                    Vídeo detectado
                  </p>
                  <p className="truncate text-[11px] text-[color:var(--text-muted)]">
                    ID: {videoId}
                  </p>
                </div>
              </div>
            ) : (
              <p id="ex-video-hint" className="text-[11px] text-[color:var(--text-muted)]">
                Pega un enlace de YouTube. Déjalo vacío para quitar el vídeo.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="ex-muscles" className={labelClass}>
                Músculos
              </label>
              <input
                id="ex-muscles"
                value={muscles}
                onChange={(e) => setMuscles(e.target.value)}
                className={fieldClass}
                placeholder="cuádriceps, glúteo"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="ex-equip" className={labelClass}>
                Material
              </label>
              <input
                id="ex-equip"
                value={equipment}
                onChange={(e) => setEquipment(e.target.value)}
                className={fieldClass}
                placeholder="kettlebell, sled"
              />
            </div>
          </div>
        </div>

        <footer className="border-t border-[color:var(--border-subtle)] p-5">
          {error ? (
            <p className="mb-2 text-xs text-[color:var(--danger)]">{error}</p>
          ) : null}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="focus-ring flex-1 rounded-[var(--r-sm)] border border-[color:var(--border-subtle)] px-3 py-2 text-sm font-semibold text-[color:var(--fg)] hover:bg-[color:var(--surface-container-low)]"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={saving || nameInvalid || urlInvalid}
              onClick={() => void handleSave()}
              className="focus-ring flex-1 rounded-[var(--r-sm)] bg-[color:var(--accent)] px-3 py-2 text-sm font-semibold text-[color:var(--accent-on)] disabled:opacity-50"
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
