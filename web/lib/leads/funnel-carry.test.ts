import { describe, expect, it } from 'vitest';
import {
  buildFunnelProfile,
  mapAvailability,
  mapFacilityType,
  mapGoalType,
  mapInjuries,
  mapSessionMinutes,
  mapSleepQuality,
  mapStressLevel,
  mapTargetRace,
  mapWatch,
  mapExperienceYears,
} from './funnel-carry';

describe('funnel-carry mappers', () => {
  it('maps objetivo → goal_type (all funnel codes, closest valid enum)', () => {
    expect(mapGoalType('primer_hyrox')).toBe('first_hyrox');
    expect(mapGoalType('mejorar_marca')).toBe('improve_hyrox_mark');
    expect(mapGoalType('podio')).toBe('improve_hyrox_mark');
    expect(mapGoalType('hibrido_general')).toBe('complete_fun');
    expect(mapGoalType('otro')).toBe('other');
    expect(mapGoalType(null)).toBeNull();
    expect(mapGoalType('unknown_code')).toBeNull(); // never an invalid enum
  });

  it('maps material → facility_type', () => {
    expect(mapFacilityType('box_completo')).toBe('crossfit_box');
    expect(mapFacilityType('gimnasio')).toBe('commercial_gym');
    expect(mapFacilityType('basico_casa')).toBe('other');
    expect(mapFacilityType('solo_running')).toBe('other');
  });

  it('maps duracion_sesion → session_minutes within the 10–360 CHECK', () => {
    for (const code of ['min_30_45', 'min_45_60', 'min_60_90', 'min_mas_90']) {
      const v = mapSessionMinutes(code)!;
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThanOrEqual(360);
    }
  });

  it('maps sueno/estres → 1–10 scores', () => {
    for (const v of [mapSleepQuality('bien_7_9'), mapSleepQuality('problemas')]) {
      expect(v!).toBeGreaterThanOrEqual(1);
      expect(v!).toBeLessThanOrEqual(10);
    }
    expect(mapStressLevel('bajo')!).toBeLessThan(mapStressLevel('muy_alto')!);
  });

  it('maps anos_entrenando → representative years', () => {
    expect(mapExperienceYears('menos_1')).toBe(1);
    expect(mapExperienceYears('mas_5')).toBe(6);
  });

  it('maps wearable → device_type, collapsing unknown brands to other+model', () => {
    expect(mapWatch('garmin')).toEqual({ brand: 'garmin', model: null });
    expect(mapWatch('apple_watch')).toEqual({ brand: 'apple_watch', model: null });
    expect(mapWatch('coros')).toEqual({ brand: 'other', model: 'Coros' });
    expect(mapWatch('polar')).toEqual({ brand: 'other', model: 'Polar' });
    expect(mapWatch('no_uso')).toEqual({ brand: null, model: null });
    expect(mapWatch(null)).toEqual({ brand: null, model: null });
  });

  it('maps flexibilidad_horaria → availability window', () => {
    expect(mapAvailability('cualquier_hora')).toEqual({
      schedule_flexible: true,
      available_from: null,
      available_to: null,
    });
    expect(mapAvailability('mananas').available_from).toBe('06:00');
    expect(mapAvailability('tardes_noches').available_to).toBe('22:00');
    expect(mapAvailability('muy_limitada').schedule_flexible).toBe(false);
    expect(mapAvailability(null).schedule_flexible).toBeNull();
  });

  it('maps injuries: active from lesion_actual+zonas, past from lesiones_pasadas', () => {
    const inj = mapInjuries('leve', ['rodilla', 'lumbar'], ['musculares']);
    expect(inj).toContainEqual({ area: 'rodilla', type: 'leve', active: true });
    expect(inj).toContainEqual({ area: 'lumbar', type: 'leve', active: true });
    expect(inj).toContainEqual({ area: 'musculares', type: 'antecedente', active: false });
  });

  it('injuries: none current + none past → empty', () => {
    expect(mapInjuries('ninguna', [], ['ninguna'])).toEqual([]);
  });

  it('injuries: current severity with no zone → a single general entry', () => {
    expect(mapInjuries('recuperandose', [], [])).toEqual([
      { area: 'general', type: 'recuperandose', active: true },
    ]);
  });
});

describe('mapTargetRace', () => {
  const NOW = new Date('2026-07-08T00:00:00Z');

  it('returns null unless the lead named a known race', () => {
    expect(mapTargetRace({ carrera_mente: 'todavia_no' }, NOW)).toBeNull();
    expect(mapTargetRace({ carrera_mente: 'si_no_se_cual' }, NOW)).toBeNull();
    expect(mapTargetRace({ carrera_mente: 'si_se_cual', carrera_cual: 'otra_fuera' }, NOW)).toBeNull();
  });

  it('builds a valid HYROX singles target from a novice individual profile', () => {
    const r = mapTargetRace(
      {
        carrera_mente: 'si_se_cual',
        carrera_cual: 'hyrox_barcelona',
        carrera_cuando: 'de_3_6m',
        categoria_objetivo: 'individual_open',
        sexo: 'hombre',
      },
      NOW,
    )!;
    expect(r.name).toBe('HYROX Barcelona');
    expect(r.event_type).toBe('hyrox');
    expect(r.format).toBe('singles');
    expect(r.division).toBe('open');
    expect(r.gender_category).toBe('men');
    expect(r.race_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(r.race_date).getTime()).toBeGreaterThan(NOW.getTime());
  });

  it('doubles pro category → doubles/pro/mixed; deka → deka event', () => {
    const dbl = mapTargetRace(
      { carrera_mente: 'si_se_cual', carrera_cual: 'hyrox_madrid', categoria_objetivo: 'dobles_pro', sexo: 'mujer' },
      NOW,
    )!;
    expect(dbl.format).toBe('doubles');
    expect(dbl.division).toBe('pro');
    expect(dbl.gender_category).toBe('mixed');
    const deka = mapTargetRace({ carrera_mente: 'si_se_cual', carrera_cual: 'deka' }, NOW)!;
    expect(deka.event_type).toBe('deka');
  });
});

describe('buildFunnelProfile — full row', () => {
  it('carries the structured columns and leaves absent ones null', () => {
    const p = buildFunnelProfile({
      objetivo: 'primer_hyrox',
      material: 'box_completo',
      duracion_sesion: 'min_45_60',
      sueno: 'suficiente',
      estres: 'alto',
      wearable: 'garmin',
      flexibilidad_horaria: 'mananas',
      anos_entrenando: 'de_1_3',
      lesion_actual: 'ninguna',
      lesion_zonas: [],
      lesiones_pasadas: ['ninguna'],
    });
    expect(p.goal_type).toBe('first_hyrox');
    expect(p.facility_type).toBe('crossfit_box');
    expect(p.session_minutes).toBe(52);
    expect(p.sleep_quality).toBe(6);
    expect(p.stress_level).toBe(7);
    expect(p.training_experience_years).toBe(2);
    expect(p.watch_brand).toBe('garmin');
    expect(p.schedule_flexible).toBe(false);
    expect(p.available_from).toBe('06:00');
    expect(p.injuries).toEqual([]);
  });

  it('an empty lead row yields all-null carry (no invented data)', () => {
    const p = buildFunnelProfile({});
    expect(p.goal_type).toBeNull();
    expect(p.facility_type).toBeNull();
    expect(p.session_minutes).toBeNull();
    expect(p.watch_brand).toBeNull();
    expect(p.injuries).toEqual([]);
  });
});
