import type { ProgramLevel } from '../../schema/program-templates';
import { programLevelFromAthleteLevel } from '../../schema/program-templates';

export type TrainingLevelSuggestion = {
  suggested_level: ProgramLevel;
  confidence: 'low' | 'medium' | 'high';
  reasons: string[];
};

/** Suggest training level from onboarding answers + optional self-declared PRs. */
export function suggestAthleteTrainingLevel(input: {
  athlete_level?: 1 | 2 | 3 | 4 | null;
  hyrox_experience?: 'none' | '1-2' | '3+' | null;
  weekly_hours?: number | null;
  has_self_declared_prs?: boolean;
  self_declared_elite_signals?: boolean;
}): TrainingLevelSuggestion {
  const reasons: string[] = [];

  if (input.athlete_level === 4 || input.self_declared_elite_signals) {
    reasons.push('Nivel elite indicado en onboarding');
    return { suggested_level: 'elite', confidence: 'medium', reasons };
  }

  if (input.athlete_level != null) {
    const base = programLevelFromAthleteLevel(
      Math.min(3, input.athlete_level) as 1 | 2 | 3,
    );
    reasons.push(`Nivel intake ${input.athlete_level}`);
    if (input.hyrox_experience === '3+') {
      reasons.push('Experiencia HYROX 3+ carreras');
      if (base === 'intermediate') {
        return { suggested_level: 'pro', confidence: 'medium', reasons };
      }
    }
    if (input.weekly_hours != null && input.weekly_hours >= 12 && base === 'pro') {
      reasons.push('≥12h/semana entrenamiento');
      return { suggested_level: 'pro', confidence: 'high', reasons };
    }
    return { suggested_level: base, confidence: 'high', reasons };
  }

  if (input.hyrox_experience === 'none') {
    return { suggested_level: 'beginner', confidence: 'low', reasons: ['Sin experiencia HYROX'] };
  }

  return { suggested_level: 'intermediate', confidence: 'low', reasons: ['Datos insuficientes — revisar intake'] };
}

/** Map intake level 1-4 to program level including elite. */
export function intakeLevelToProgramLevel(level: 1 | 2 | 3 | 4): ProgramLevel {
  if (level === 4) return 'elite';
  return programLevelFromAthleteLevel(level as 1 | 2 | 3);
}
