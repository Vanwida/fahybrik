// Exercise-catalog row shape + shared editor atoms used by ExercisePicker.tsx
// and its edit-form sibling (ExerciseEditForm.tsx). Split out so BOTH depend on
// ONE row type instead of each restating it (repo DRY rule), and to keep
// ExercisePicker.tsx from growing past its already-over-limit line count when
// the edit form gained a third editable field.
//
// EL CAMPO DE VÍDEO YA NO VIVE AQUÍ. Aquí había un `YouTubeField` con su propia
// validación, hermano del que tenía el editor de la Biblioteca: dos campos para
// lo mismo, ninguno de los dos enseñaba el vídeo. Ahora los dos formularios
// montan `components/media/VideoUrlField`, que es el único y sí lo reproduce.
//
// ROW SHAPE mirrors migration 0132's ownership + fork model — see
// lib/exercises/coach-override.ts (`CoachExerciseRow`), the single SQL-side
// source of the rule this restates client-side for typing only:
//   • plain name/cues/description/video_url = MERGED (coalesce(override, base))
//     server-side — the value to DISPLAY. Never re-derive this precedence here;
//     read the field directly.
//   • base_*      = the shared BASE value — the edit form's placeholder.
//   • override_*  = THIS coach's raw override (null = not overridden) — the edit
//     form's VALUE.
//   • origin      = 'base' | 'customized' | 'own', for the catalog's label.

import { cn } from '@/lib/utils';
import type { Modality } from '@fahybrid/shared/domain/prescription';
import type { ExerciseCategory } from '@fahybrid/shared/schema/_primitives';
import type { ExerciseOrigin } from '@/lib/exercises/coach-override';

export interface CatalogRow {
  id: string;
  name: string;
  category: ExerciseCategory;
  modality: Modality;
  primary_muscle_groups: string[];
  equipment: string[];
  coach_id: string | null;
  origin: ExerciseOrigin;
  // MERGED content — what every non-editor consumer (search rows, the athlete's
  // plan) DISPLAYS. Read directly; do not re-apply override-precedence to these.
  video_url: string | null;
  cues: string | null;
  description: string | null;
  // The shared BASE value — the edit form's placeholder ("heredado de la base").
  base_name: string;
  base_cues: string | null;
  base_description: string | null;
  base_video_url: string | null;
  // THIS coach's RAW override per field (null = inheriting the base). Edited by
  // ExerciseEditForm; never read for display outside the editor.
  override_name: string | null;
  override_cues: string | null;
  override_description: string | null;
  override_video_url: string | null;
}

// The exercise shape the API returns (GET list / POST create / PATCH edit) — the
// full CoachExerciseRow (lib/exercises/coach-override.ts) on all three now that POST
// re-reads the row it just created (app/api/exercises/route.ts).
//
// The optional fields below are kept optional ON PURPOSE, and `toCatalogRow` keeps
// filling them: they are the client's insurance, not a description of today's
// server. POST used to answer a bare CatalogExercise with no `origin`, and the
// Biblioteca catalog — which has no normalizer — crashed on it. One shape at the
// boundary, one normalizer, and a missing field degrades instead of throwing.
export type ApiExercise = {
  id: string;
  name: string;
  category: ExerciseCategory;
  modality: Modality;
  primary_muscle_groups?: string[];
  equipment?: string[];
  coach_id?: string | null;
  origin?: ExerciseOrigin;
  video_url: string | null;
  cues: string | null;
  description: string | null;
  base_name?: string;
  base_cues?: string | null;
  base_description?: string | null;
  base_video_url?: string | null;
  override_name?: string | null;
  override_cues?: string | null;
  override_description?: string | null;
  override_video_url?: string | null;
};

export function toCatalogRow(ex: ApiExercise): CatalogRow {
  return {
    id: ex.id,
    name: ex.name,
    category: ex.category,
    modality: ex.modality,
    primary_muscle_groups: ex.primary_muscle_groups ?? [],
    equipment: ex.equipment ?? [],
    // Unknown on a POST-create response (the coach's own numeric id isn't echoed
    // back) — harmless: nothing here branches on coach_id, only on `origin`.
    coach_id: ex.coach_id ?? null,
    // A response with no `origin` at all can only be POST-create, which always
    // mints the coach's OWN exercise (create-exercise.ts) — never base/customized.
    origin: ex.origin ?? 'own',
    video_url: ex.video_url,
    cues: ex.cues,
    description: ex.description,
    // A POST-create response has no separate base row — the just-created content
    // IS the only content there is, so it doubles as its own "base" reference.
    base_name: ex.base_name ?? ex.name,
    base_cues: ex.base_cues ?? ex.cues,
    base_description: ex.base_description ?? ex.description,
    base_video_url: ex.base_video_url ?? ex.video_url,
    override_name: ex.override_name ?? null,
    override_cues: ex.override_cues ?? null,
    override_description: ex.override_description ?? null,
    override_video_url: ex.override_video_url ?? null,
  };
}

// Coach-facing category chips → real enum. Mirrors EXERCISE_CATEGORY_LABELS but
// kept here as the ordered create/filter set (the create form needs the same).
export const CATEGORY_OPTIONS: { value: ExerciseCategory; label: string }[] = [
  { value: 'strength', label: 'Fuerza' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'hyrox_station', label: 'HYROX' },
  { value: 'core', label: 'Core' },
  { value: 'plyometric', label: 'Pliometría' },
  { value: 'skill', label: 'Skill' },
  { value: 'mobility', label: 'Movilidad' },
];

export const CATEGORY_LABEL: Record<ExerciseCategory, string> = Object.fromEntries(
  CATEGORY_OPTIONS.map((c) => [c.value, c.label]),
) as Record<ExerciseCategory, string>;

// The origin badge text — deliberately absent for 'base' (the unmarked default;
// most rows are base, so labeling every one would be noise, not signal). Kept
// restrained per the picker's density: a word woven into existing captions, not
// a new pill/icon — that richer treatment belongs to the Biblioteca catalog.
export const ORIGIN_LABEL: Partial<Record<ExerciseOrigin, string>> = {
  customized: 'Personalizado',
  own: 'Mío',
};

// The picker's pill — a filter in the search body, a single-choice option in the
// create form, y el eje de contenido del panel de Ejercicios. Same control, same
// size, same hit area: the two bodies are one sheet and a chip that changed shape
// between them would read as a different widget.
export function FilterChip({
  label,
  active,
  onClick,
  count,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  /** Cuántos hay. Un 0 se pinta igual: saber que no queda ninguno es información. */
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'v2-focus inline-flex items-center gap-1.5 rounded-[var(--v2-r-pill)] px-2.5 py-1 text-label font-bold transition-colors',
        active
          ? 'bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)]'
          : 'border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]',
      )}
    >
      {label}
      {count != null ? (
        <span className={cn('v2-num', active ? 'opacity-70' : 'text-[color:var(--v2-faint)]')}>
          {count}
        </span>
      ) : null}
    </button>
  );
}

// Parse the server's { error: { message } } body for a non-ok fetch response —
// shared by the create and edit forms so a refusal (e.g. 409 shared_identity)
// surfaces the server's actual Spanish reason instead of a canned string that
// would misdescribe WHY the save failed.
export async function extractApiErrorMessage(res: Response): Promise<string | null> {
  try {
    const data = (await res.json()) as { error?: { message?: string } };
    return data?.error?.message ?? null;
  } catch {
    return null;
  }
}
