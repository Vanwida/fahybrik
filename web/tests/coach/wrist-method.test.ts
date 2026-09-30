// El método de la muñeca al correr es dato del coach con defecto (0282, HARD RULE
// Nº0): los defectos son los números de HOY (kit del doble y Swift), el PUT valida
// en servidor, las reglas cruzadas no cruzan grupos, y cada clave tiene su
// castellano. Puro: sin base de datos (la tabla real la prueba wrist-method.db.test.ts).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COACH_THRESHOLD_KEYS,
  COACH_THRESHOLD_SPEC,
  DEFAULT_COACH_THRESHOLDS,
  WRIST_AUTO_LAP_MIN_M,
  mergeCoachThresholds,
  thresholdIssues,
  type CoachThresholdKey,
  type CoachThresholds,
} from '@fahybrid/shared/domain/coach/signal-thresholds';
import {
  DEFAULT_WRIST_RPE_WORDS,
  WRIST_ALERT_DIRECTIONS,
  WRIST_AUTO_LAP_CLASSES,
  WRIST_AUTO_LAP_KEYS,
  WRIST_RPE_WORD_COUNT,
  WRIST_RPE_WORD_MAX_LENGTH,
  buildWristMethod,
  effectiveWristRpeWords,
  wristRpeWordsSchema,
} from '@fahybrid/shared/domain/coach/wrist-method';
import { coachSignalThresholdsPutSchema } from '@fahybrid/shared/schema/coach-signal-thresholds';
import { REGLAS_AVISO_DEFECTO } from '@/components/design-twin/kit-reloj/paso';
import { METODO_RESUMEN_DEFECTO } from '@/components/design-twin/kit-reloj/despues';
import { RPE_PALABRA_DEFECTO } from '@/components/design-twin/kit-reloj/tokens';
import { THRESHOLD_COPY, THRESHOLD_SECTIONS } from '@/components/v2/ajustes/threshold-copy';

const wristKeys = COACH_THRESHOLD_KEYS.filter((k) => k.startsWith('wrist_'));
const DEFAULT_METHOD = buildWristMethod(DEFAULT_COACH_THRESHOLDS);

describe('el método de la muñeca: los defectos son los de hoy', () => {
  it('hay 26 claves numéricas y todas tienen defecto dentro de sus límites', () => {
    expect(wristKeys).toHaveLength(26);
    for (const k of wristKeys) {
      const s = COACH_THRESHOLD_SPEC[k];
      expect(s.default, k).toBeGreaterThanOrEqual(s.min);
      expect(s.default, k).toBeLessThanOrEqual(s.max);
    }
  });

  it('los avisos por defecto son los del kit del doble (REGLAS_AVISO_DEFECTO)', () => {
    const r = REGLAS_AVISO_DEFECTO;
    const a = DEFAULT_METHOD.alerts;
    expect(a.slack).toEqual({
      pace_s: r.holgura.ritmo,
      hr_bpm: r.holgura.ppm,
      split500_s: r.holgura.split500,
      watts: r.holgura.vatios,
      cadence_spm: r.holgura.cadencia,
    });
    expect(a.gap_s).toBe(r.cadenciaS);
    expect(a.confirm_s).toBe(r.confirmacionS);
    expect(a.zone_grace_s).toBe(r.graciaZonaS);
    expect(a.prewarn_s).toBe(r.preavisoS);
    expect(a.prewarn_m).toBe(r.preavisoM);
    expect(a.prewarn_min_step_s).toBe(r.preavisoMinimoS);
    expect(a.in_warmup).toBe(r.avisarEnCalentamiento);
    expect(a.in_recovery).toBe(r.avisarEnRecuperacion);
  });

  it('el cierre por defecto es el del kit (METODO_RESUMEN_DEFECTO)', () => {
    expect(DEFAULT_METHOD.finish.short_rep_done_fraction).toBe(METODO_RESUMEN_DEFECTO.umbralHecho);
    expect(DEFAULT_METHOD.finish.idle_save_s).toBe(METODO_RESUMEN_DEFECTO.guardarQuietoS);
  });

  it('las palabras del RPE por defecto son las del kit (RPE_PALABRA_DEFECTO, del 0 al 10)', () => {
    expect(DEFAULT_WRIST_RPE_WORDS).toHaveLength(WRIST_RPE_WORD_COUNT);
    DEFAULT_WRIST_RPE_WORDS.forEach((w, n) => expect(w, `RPE ${n}`).toBe(RPE_PALABRA_DEFECTO[n]));
    expect(DEFAULT_METHOD.rpe_words).toEqual([...DEFAULT_WRIST_RPE_WORDS]);
  });

  it('la vuelta automática por defecto es de 1000 m en rodajes y tiradas, y una tirada es de 75 min o 16 km', () => {
    expect(DEFAULT_METHOD.auto_lap).toEqual({ every_m: 1000, classes: ['rodaje', 'tirada'] });
    expect(DEFAULT_METHOD.run).toEqual({ long_run_s: 75 * 60, long_run_m: 16_000, stride_max_s: 30, gate: 'auto' });
  });

  it('un rodaje a zona avisa por defecto solo por arriba (el tope de pulso, P9)', () => {
    expect(DEFAULT_METHOD.alerts.continuous_zone).toBe('arriba');
    expect(WRIST_ALERT_DIRECTIONS).toEqual(['ninguno', 'arriba', 'ambos']);
  });
});

/**
 * Paridad con Swift: mientras el reloj lleve el número escrito, tiene que ser el
 * del servidor. Si otro trabajo lo sustituye por el método que llega del servidor
 * (el fichero pasa a nombrar `WristMethod`), ese literal ya no existe y no hay
 * nada que comparar: se acepta. Cualquier otra cosa es un literal que divergió.
 */
describe('paridad con el Swift del reloj', () => {
  const swift = (rel: string) => readFileSync(resolve(__dirname, '../../../ios/FAHYBRIKCore/Vivo', rel), 'utf8');

  function literal(source: string, pattern: RegExp): number | null {
    const m = source.match(pattern);
    if (m) return Number(m[1]!.replace(/_/g, ''));
    expect(source, 'el literal ya no está: tiene que haberlo sustituido el método (WristMethod)').toMatch(/WristMethod/);
    return null;
  }

  it('Vivo.reglasAvisoDefecto', () => {
    const src = swift('Vivo+Paso.swift');
    const block = src.match(/static let reglasAvisoDefecto = ReglasAviso\(([\s\S]*?)\n    \)/)?.[1];
    if (!block) {
      expect(src).toMatch(/WristMethod/);
      return;
    }
    const num = (name: string) => Number(block.match(new RegExp(`${name}:\\s*(\\d+)`))![1]);
    const a = DEFAULT_METHOD.alerts;
    expect(num('ritmo')).toBe(a.slack.pace_s);
    expect(num('ppm')).toBe(a.slack.hr_bpm);
    expect(num('split500')).toBe(a.slack.split500_s);
    expect(num('vatios')).toBe(a.slack.watts);
    expect(num('cadencia')).toBe(a.slack.cadence_spm);
    expect(num('cadenciaS')).toBe(a.gap_s);
    expect(num('confirmacionS')).toBe(a.confirm_s);
    expect(num('graciaZonaS')).toBe(a.zone_grace_s);
    expect(num('preavisoS')).toBe(a.prewarn_s);
    expect(num('preavisoM')).toBe(a.prewarn_m);
    expect(num('preavisoMinimoS')).toBe(a.prewarn_min_step_s);
    expect(block).toMatch(/avisarEnCalentamiento:\s*false/);
    expect(block).toMatch(/avisarEnRecuperacion:\s*false/);
  });

  it('Vivo.UmbralesCorrer', () => {
    const src = swift('Vivo+Correr.swift');
    const tiradaS = literal(src, /tiradaDesdeS:\s*Double\s*=\s*(\d+)\s*\*\s*60/);
    if (tiradaS != null) expect(tiradaS * 60).toBe(DEFAULT_METHOD.run.long_run_s);
    const tiradaM = literal(src, /tiradaDesdeM:\s*Double\s*=\s*([\d_]+)/);
    if (tiradaM != null) expect(tiradaM).toBe(DEFAULT_METHOD.run.long_run_m);
    const stride = literal(src, /strideHastaS:\s*Double\s*=\s*(\d+)/);
    if (stride != null) expect(stride).toBe(DEFAULT_METHOD.run.stride_max_s);
  });

  it('la vuelta automática de 1000 m en rodajes y tiradas', () => {
    const src = swift('Vivo+PlanDeSesion.swift');
    const lines = src.split('\n').filter((l) => /vueltaAutoM:\s*\(clase == \.rodaje \|\| clase == \.tirada\)/.test(l));
    if (lines.length === 0) {
      expect(src).toMatch(/WristMethod/);
      return;
    }
    for (const l of lines) expect(Number(l.match(/\?\s*(\d+)\s*:\s*nil/)![1])).toBe(DEFAULT_METHOD.auto_lap.every_m);
    expect(DEFAULT_METHOD.auto_lap.classes).toEqual(['rodaje', 'tirada']);
  });
});

/**
 * Vector de oro TS → Swift: el JSON que el test de Swift (WristMethodTests) decodifica
 * es EXACTAMENTE lo que el servidor manda a un coach que no ha tocado nada.
 */
describe('el cable: lo que decodifica Swift es lo que manda el servidor', () => {
  const swiftTest = readFileSync(resolve(__dirname, '../../../ios/FAHYBRIKTests/Plan/WristMethodTests.swift'), 'utf8');

  it('el literal de oro del test de Swift es buildWristMethod con los defectos', () => {
    const golden = swiftTest.match(/GOLDEN-BEGIN[^\n]*\n[\s\S]*?"""\n([\s\S]*?)\n\s*"""\s*\n\s*\/\/ GOLDEN-END/)?.[1];
    expect(golden, 'no se encuentra el literal de oro entre GOLDEN-BEGIN y GOLDEN-END').toBeTruthy();
    expect(JSON.parse(golden!)).toEqual(JSON.parse(JSON.stringify(DEFAULT_METHOD)));
  });

  it('toda clave del cable es snake_case (Swift la decodifica con convertFromSnakeCase)', () => {
    const keys: string[] = [];
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') {
        for (const [k, child] of Object.entries(v)) {
          keys.push(k);
          walk(child);
        }
      }
    };
    walk(DEFAULT_METHOD);
    expect(keys.length).toBeGreaterThan(20);
    for (const k of keys) expect(k, k).toMatch(/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/);
  });
});

describe('buildWristMethod: lo del coach manda, lo demás es el defecto', () => {
  it('convierte a las unidades del reloj y respeta los interruptores', () => {
    const t = mergeCoachThresholds({
      wrist_long_run_min: 90,
      wrist_long_run_km: 20,
      wrist_short_rep_done_pct: 80,
      wrist_idle_save_min: 5,
      wrist_gate_manual: 1,
      wrist_alert_in_warmup: 1,
      wrist_alert_continuous_zone: 2,
      wrist_auto_lap_m: 0,
      wrist_auto_lap_tempo: 1,
      wrist_auto_lap_rodaje: 0,
    });
    const m = buildWristMethod(t, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k']);
    expect(m.run).toMatchObject({ long_run_s: 5400, long_run_m: 20_000, gate: 'manual' });
    expect(m.finish).toEqual({ short_rep_done_fraction: 0.8, idle_save_s: 300 });
    expect(m.alerts.in_warmup).toBe(true);
    expect(m.alerts.continuous_zone).toBe('ambos');
    expect(m.auto_lap).toEqual({ every_m: 0, classes: ['tirada', 'tempo'] });
    expect(m.rpe_words[10]).toBe('k');
  });

  it('cada clase de vuelta automática tiene su columna, en orden', () => {
    expect(WRIST_AUTO_LAP_CLASSES.map((c) => WRIST_AUTO_LAP_KEYS[c])).toEqual(
      wristKeys.filter((k) => k.startsWith('wrist_auto_lap_') && k !== 'wrist_auto_lap_m'),
    );
  });

  it('sin palabras o con las que no son once, salen las de fábrica', () => {
    expect(effectiveWristRpeWords(null)).toEqual([...DEFAULT_WRIST_RPE_WORDS]);
    expect(effectiveWristRpeWords(['solo una'])).toEqual([...DEFAULT_WRIST_RPE_WORDS]);
  });
});

describe('las reglas de coherencia de la muñeca', () => {
  it('los defectos son coherentes', () => {
    expect(thresholdIssues(DEFAULT_COACH_THRESHOLDS)).toEqual([]);
  });

  it('una vuelta automática de 1 a 99 m no tiene sentido; 0 la apaga y 100 vale', () => {
    const bad = mergeCoachThresholds({ wrist_auto_lap_m: 50 });
    expect(thresholdIssues(bad).map((i) => i.key)).toEqual(['wrist_auto_lap_m']);
    expect(thresholdIssues(mergeCoachThresholds({ wrist_auto_lap_m: 0 }))).toEqual([]);
    expect(thresholdIssues(mergeCoachThresholds({ wrist_auto_lap_m: WRIST_AUTO_LAP_MIN_M }))).toEqual([]);
  });

  it('el paso más corto con preaviso tiene que durar al menos el doble del preaviso', () => {
    const bad = mergeCoachThresholds({ wrist_prewarn_s: 20 });
    expect(thresholdIssues(bad).map((i) => i.key)).toEqual(['wrist_prewarn_min_step_s']);
    expect(thresholdIssues(mergeCoachThresholds({ wrist_prewarn_s: 20, wrist_prewarn_min_step_s: 40 }))).toEqual([]);
    // Sin preaviso no hay nada que comparar.
    expect(thresholdIssues(mergeCoachThresholds({ wrist_prewarn_s: 0, wrist_prewarn_min_step_s: 0 }))).toEqual([]);
  });
});

/**
 * Ninguna regla cruza grupos. El editor guarda campo a campo: si una regla
 * mirase dos claves de secciones distintas, el orden de edición podría dejar al
 * coach sin poder llegar a un estado válido. Se comprueba muestreando: para cada
 * par de claves de GRUPOS DISTINTOS y sus valores extremos, los avisos de la
 * mezcla no pueden ser más que los de cada una por su lado.
 */
describe('las reglas cruzadas no cruzan grupos', () => {
  const issuesKey = (t: CoachThresholds) => new Set(thresholdIssues(t).map((i) => `${i.key}:${i.message}`));
  const extremes = (k: CoachThresholdKey) => [COACH_THRESHOLD_SPEC[k].min, COACH_THRESHOLD_SPEC[k].max];
  const set = (k: CoachThresholdKey, v: number): CoachThresholds => ({ ...DEFAULT_COACH_THRESHOLDS, [k]: v });

  function crossGroupViolations(check: (t: CoachThresholds) => Set<string>): string[] {
    const bad: string[] = [];
    for (const a of COACH_THRESHOLD_KEYS) {
      for (const b of COACH_THRESHOLD_KEYS) {
        if (a >= b || COACH_THRESHOLD_SPEC[a].group === COACH_THRESHOLD_SPEC[b].group) continue;
        for (const va of extremes(a)) {
          for (const vb of extremes(b)) {
            const mixed = check({ ...DEFAULT_COACH_THRESHOLDS, [a]: va, [b]: vb });
            const alone = new Set([...check(set(a, va)), ...check(set(b, vb))]);
            for (const issue of mixed) if (!alone.has(issue)) bad.push(`${a}=${va} + ${b}=${vb} → ${issue}`);
          }
        }
      }
    }
    return bad;
  }

  it('ninguna mezcla de dos grupos crea un problema que no tuviera cada clave sola', () => {
    expect(crossGroupViolations(issuesKey)).toEqual([]);
  });

  it('el detector se prueba a sí mismo: una regla inventada que cruza grupos SÍ salta', () => {
    const inventada = (t: CoachThresholds) =>
      new Set([...issuesKey(t), ...(t.wrist_alert_gap_s < t.readiness_drop_days ? ['inventada'] : [])]);
    expect(crossGroupViolations(inventada).length).toBeGreaterThan(0);
  });
});

describe('el PUT valida en servidor', () => {
  const parse = (body: unknown) => coachSignalThresholdsPutSchema.safeParse(body);

  it('acepta una clave de la muñeca, y null para volver al defecto', () => {
    expect(parse({ wrist_auto_lap_m: 500 }).success).toBe(true);
    expect(parse({ wrist_gate_manual: 1 }).success).toBe(true);
    expect(parse({ wrist_alert_continuous_zone: null }).success).toBe(true);
  });

  it('rechaza lo que no es un número entero dentro de sus límites', () => {
    expect(parse({ wrist_gate_manual: 2 }).success).toBe(false);
    expect(parse({ wrist_alert_continuous_zone: 3 }).success).toBe(false);
    expect(parse({ wrist_auto_lap_m: 10001 }).success).toBe(false);
    expect(parse({ wrist_long_run_km: 4 }).success).toBe(false);
    expect(parse({ wrist_alert_gap_s: 1.5 }).success).toBe(false);
    expect(parse({ wrist_inventada: 1 }).success).toBe(false);
  });

  it('las palabras del RPE: once, ni vacías ni largas; null vuelve a las de fábrica', () => {
    const once = Array.from({ length: WRIST_RPE_WORD_COUNT }, (_, n) => `palabra ${n}`);
    expect(parse({ wrist_rpe_words: once }).success).toBe(true);
    expect(parse({ wrist_rpe_words: null }).success).toBe(true);
    expect(parse({ wrist_rpe_words: once.slice(1) }).success).toBe(false);
    expect(parse({ wrist_rpe_words: [...once.slice(0, 10), '   '] }).success).toBe(false);
    expect(parse({ wrist_rpe_words: [...once.slice(0, 10), 'x'.repeat(WRIST_RPE_WORD_MAX_LENGTH + 1)] }).success).toBe(false);
    expect(wristRpeWordsSchema.parse([...once.slice(0, 10), '  recorte  '])[10]).toBe('recorte');
  });
});

describe('Ajustes › Método: cada clave de la muñeca, con su castellano', () => {
  it('las listas cortas traen una palabra por posición y los interruptores no traen lista', () => {
    for (const k of wristKeys) {
      const spec = COACH_THRESHOLD_SPEC[k];
      const copy = THRESHOLD_COPY[k];
      expect(copy.label, k).toBeTruthy();
      expect(copy.hint, k).toBeTruthy();
      if (spec.unit === 'sentido') expect(copy.options, k).toHaveLength(spec.max - spec.min + 1);
      else expect(copy.options, k).toBeUndefined();
      if (spec.unit === 'si_no' || spec.unit === 'sentido') expect(copy.unit, k).toBe('');
      else expect(copy.unit, k).not.toBe('');
    }
  });

  it('las cuatro secciones «Reloj» llevan todas las claves, y las palabras del RPE van en la última', () => {
    const reloj = THRESHOLD_SECTIONS.filter((s) => s.title.startsWith('Reloj'));
    expect(reloj).toHaveLength(4);
    expect(reloj.flatMap((s) => s.keys).sort()).toEqual([...wristKeys].sort());
    expect(reloj.filter((s) => s.extra === 'palabras_rpe').map((s) => s.title)).toEqual(['Reloj: al terminar']);
  });

  it('el copy no usa guiones largos ni jerga de aparato', () => {
    const all = wristKeys.flatMap((k) => [THRESHOLD_COPY[k].label, THRESHOLD_COPY[k].hint, THRESHOLD_COPY[k].unit, ...(THRESHOLD_COPY[k].options ?? [])]);
    for (const text of all) {
      expect(text).not.toMatch(/[—–]/);
      expect(text).not.toMatch(/\b(PM5|FTMS|BLE)\b|histéresis/i);
    }
  });
});
