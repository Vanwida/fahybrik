import { describe, expect, it } from 'vitest';
import { toCatalogRow, type ApiExercise } from '@/components/v2/editor/exercise-catalog';
import { exerciseDisplayName, exerciseMeasureLabels, filterExerciseCatalog } from '@/lib/dashboard/exercises/catalog-search';

function exercise(input: Partial<ApiExercise> & Pick<ApiExercise, 'id' | 'name'>): ApiExercise {
  return {
    category: 'strength', modality: 'strength', video_url: null, cues: null, description: null,
    equipment: [], primary_muscle_groups: [], origin: 'base', ...input,
  };
}

// Real names and aliases from the read-only catalog snapshot of 1 October 2026.
const catalog = [
  exercise({ id: '3484', name: 'Back Squat', name_es: 'Sentadilla trasera', name_en: 'Back Squat', slug: 'back-squat', equipment: ['barbell'] }),
  exercise({ id: '2800', name: 'Single-leg Romanian deadlift', name_es: 'Peso muerto rumano a una pierna', search_terms: 'peso muerto unilateral', is_unilateral: true, equipment: ['dumbbell'] }),
  exercise({ id: '2', name: 'Sled Push', name_es: 'Empuje de trineo', category: 'hyrox_station', modality: 'functional', equipment: ['sled'] }),
  exercise({ id: '3481', name: 'Rowing', name_es: 'Remo', category: 'cardio', modality: 'row', equipment: ['rower'] }),
  exercise({ id: '3491', name: 'Barbell Row', name_es: 'Remo con barra', equipment: ['barbell'] }),
  exercise({ id: '3738', name: '90/90 Hip Stretch', name_es: 'Estiramiento de cadera 90/90', category: 'mobility', modality: 'mobility', default_metrics_json: { duration_seconds: true } }),
  exercise({ id: '3734', name: 'Single Leg Glute Bridge', name_es: 'Puente de glúteo a una pierna', category: 'core', modality: 'core', is_unilateral: true }),
  exercise({ id: '3760', name: 'Pallof Press', name_es: 'Press Pallof', category: 'core', modality: 'core' }),
  exercise({ id: '3723', name: 'Hip Flexor Stretch', name_es: 'Estiramiento de flexor de cadera', category: 'mobility', modality: 'mobility' }),
  exercise({ id: '6', name: 'Farmers Carry', name_es: 'Paseo del granjero', category: 'hyrox_station', modality: 'functional', implement_count: 2 }),
  exercise({ id: '2807', name: 'Hip mobility flow', name_es: 'Flujo de movilidad de cadera', category: 'mobility', modality: 'mobility', archived_at: '2026-08-11T16:15:37.348Z' }),
].map(toCatalogRow);

describe('catalog search in Biblioteca and the exercise selector', () => {
  it.each([
    ['sentadilla trasera', '3484'],
    ['trasera sentadillas', '3484'],
    ['back squat', '3484'],
    ['peso muerto unilateral', '2800'],
    ['unilateral muerto', '2800'],
    ['empuje de trineo', '2'],
    ['remo', '3481'],
    ['barra remo', '3491'],
    ['90-90', '3738'],
    ['stretch hip', '3738'],
    ['PUENTE GLÚTEO', '3734'],
    ['pallof press', '3760'],
    ['flexor cadera', '3723'],
    ['paseo granjero', '6'],
  ])('finds «%s» without requiring the displayed language or word order', (query, id) => {
    expect(filterExerciseCatalog(catalog, { query }).map((ex) => ex.id)).toContain(id);
  });

  it('keeps the rowing ergometer and strength rows discoverable without merging their identities', () => {
    expect(filterExerciseCatalog(catalog, { query: 'remo' }).map((ex) => ex.id)).toEqual(['3481', '3491']);
    expect(filterExerciseCatalog(catalog, { query: 'remo', category: 'cardio' }).map((ex) => ex.id)).toEqual(['3481']);
    expect(filterExerciseCatalog(catalog, { query: 'remo', equipment: 'barbell' }).map((ex) => ex.id)).toEqual(['3491']);
  });

  it('never offers retired rows, including an exact name and an unfiltered catalog used for recents', () => {
    expect(filterExerciseCatalog(catalog).map((ex) => ex.id)).not.toContain('2807');
    expect(filterExerciseCatalog(catalog, { query: 'Hip mobility flow' })).toEqual([]);
    expect(filterExerciseCatalog(catalog, { query: 'Flujo de movilidad de cadera' })).toEqual([]);
  });

  it('does not turn unrelated words into matches', () => {
    expect(filterExerciseCatalog(catalog, { query: 'remo cadera' })).toEqual([]);
  });

  it('finds band exercises regardless of historical spelling or material alternatives', () => {
    const rows = [
      { ...catalog[0]!, id: 'band', equipment: ['band'] },
      { ...catalog[0]!, id: 'pallof', equipment: ['cable_or_band'] },
      { ...catalog[0]!, id: 'shoulder', equipment: ['band_or_pvc_pipe'] },
      { ...catalog[0]!, id: 'new', equipment: ['resistance_band'] },
    ];
    expect(filterExerciseCatalog(rows, { equipment: 'resistance_band' }).map((row) => row.id))
      .toEqual(['band', 'pallof', 'shoulder', 'new']);
    expect(filterExerciseCatalog(rows, { equipment: 'pvc_pipe' }).map((row) => row.id)).toEqual(['shoulder']);
    expect(filterExerciseCatalog(rows, { equipment: 'cable' }).map((row) => row.id)).toEqual(['pallof']);
  });
});

describe('exercise display name', () => {
  it('uses the viewer language with the canonical name as an honest fallback', () => {
    const squat = catalog[0]!;
    expect(exerciseDisplayName(squat, 'es')).toBe('Sentadilla trasera');
    expect(exerciseDisplayName(squat, 'en-GB')).toBe('Back Squat');
    expect(exerciseDisplayName({ ...squat, name_es: null }, 'es')).toBe('Back Squat');
  });

  it('preserves a coach rename even though the shared exercise has a translation', () => {
    const customized = { ...catalog[0]!, name: 'Mi sentadilla de competición', override_name: 'Mi sentadilla de competición' };
    expect(exerciseDisplayName(customized, 'es')).toBe('Mi sentadilla de competición');
    expect(exerciseDisplayName(customized, 'en')).toBe('Mi sentadilla de competición');
    expect(filterExerciseCatalog([customized], { query: 'competición sentadilla' })).toEqual([customized]);
    expect(filterExerciseCatalog([customized], { query: 'back squat' })).toEqual([customized]);
  });
});

describe('catalog metadata at the selector boundary', () => {
  it('shows available canonical work measures without implying amounts or a unilateral dose', () => {
    expect(exerciseMeasureLabels({ time: true, reps: false, distance: true, weight: true })).toEqual(['Tiempo', 'Distancia']);
    expect(exerciseMeasureLabels({ reps: true, time: true, calories: true })).toEqual(['Reps', 'Tiempo', 'Calorías']);
    expect(exerciseMeasureLabels({})).toEqual([]);
  });
  it('retains work measures, unilateral dose, implements, aliases and retirement through normalization', () => {
    const input = exercise({
      id: '6', name: 'Farmers Carry', slug: 'hyrox-farmers-carry', name_es: 'Paseo del granjero', name_en: 'Farmers Carry',
      search_terms: 'farmer carry paseo del granjero', category: 'hyrox_station', modality: 'functional',
      default_metrics_json: { load_kg: true, distance_meters: true }, movement_pattern: 'carry',
      is_unilateral: false, implement_count: 2, hyrox_station_position: 6, archived_at: '2026-08-11T16:15:37.348Z',
    });
    expect(toCatalogRow(input)).toMatchObject(input);
    expect(catalog.find((ex) => ex.id === '3738')?.default_metrics_json).toEqual({ duration_seconds: true });
    expect(catalog.find((ex) => ex.id === '2800')?.is_unilateral).toBe(true);
  });
});
