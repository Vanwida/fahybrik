// Exercise-catalog row shape + shared editor atoms used by ExercisePicker.tsx
// and its edit-form sibling (ExerciseEditForm.tsx). Split out so BOTH depend on
// ONE row type / ONE YouTube-field component instead of each restating it (repo
// DRY rule), and to keep ExercisePicker.tsx from growing past its already-over-
// limit line count when the edit form gained a third editable field.
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

import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';
import type { Modality } from '@fahybrid/shared/domain/prescription';
import type { ExerciseCategory } from '@fahybrid/shared/schema/_primitives';
import { isValidYouTubeUrl } from '@fahybrid/shared/youtube';
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

// The exercise shape the API returns (GET list / POST create / PATCH edit).
// POST create returns a bare CatalogExercise (lib/dashboard/exercises/types.ts) —
// no origin/coach_id/base_*/override_* at all, since create-exercise.ts always
// mints a brand-new OWN row with nothing yet to fork against. GET/PATCH return
// the full CoachExerciseRow (lib/exercises/coach-override.ts), where all of
// those are always present. `toCatalogRow` below normalizes both into one shape.
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

// ── Shared YouTube input (create + edit — one source, one validator) ──────────
export type VideoState = 'empty' | 'valid' | 'invalid';

export function videoFieldState(value: string): VideoState {
  const v = value.trim();
  if (!v) return 'empty';
  return isValidYouTubeUrl(v) ? 'valid' : 'invalid';
}

export function YouTubeField({
  value,
  onChange,
  state,
  forEdit,
}: {
  value: string;
  onChange: (v: string) => void;
  state: VideoState;
  forEdit?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <span className="v2-micro">
        Vídeo de YouTube <span className="text-[color:var(--v2-faint)]">(opcional)</span>
      </span>
      <input
        type="url"
        inputMode="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Pega el link de YouTube…"
        aria-label="Vídeo de YouTube"
        className={cn(
          'v2-focus w-full rounded-[var(--v2-r-s)] border bg-[color:var(--v2-surface-2)] px-3 py-2 text-sm text-[color:var(--v2-fg)] outline-none placeholder:text-[color:var(--v2-faint)]',
          state === 'invalid'
            ? 'border-[color:var(--v2-danger)]'
            : 'border-[color:var(--v2-border-strong)] focus:border-[color:var(--v2-accent)]',
        )}
      />
      {state === 'valid' ? (
        <p className="flex items-center gap-1.5 text-[11px] text-[color:var(--v2-ok)]">
          <MIcon name="play_circle" size={13} />
          Link válido. El atleta verá el vídeo en el detalle del ejercicio en iOS.
        </p>
      ) : state === 'invalid' ? (
        <p className="flex items-center gap-1.5 text-[11px] text-[color:var(--v2-danger)]">
          <MIcon name="error" size={13} />
          No es una URL de YouTube válida.
        </p>
      ) : forEdit ? (
        <p className="flex items-center gap-1.5 text-[11px] text-[color:var(--v2-faint)]">
          <MIcon name="info" size={13} />
          Sin vídeo todavía. Pega un link y el atleta lo verá al abrir este ejercicio.
        </p>
      ) : null}
    </div>
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
