import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

function source(path: string): string {
  return readFileSync(resolve(ROOT, path), 'utf8');
}

describe('station order · silencio en código de producto', () => {
  test('el dominio compartido no exporta copy ni API de station order', () => {
    const renderHonest = source('shared/domain/prescription/render-honest.ts');

    expect(renderHonest).not.toContain('COPY_CIRCUITO');
    expect(renderHonest).not.toContain('COPY_SEGUIDO');
    expect(renderHonest).not.toContain('stationOrderLabel');
    expect(renderHonest).not.toContain('showsStationOrder');
  });

  test('web no conserva el chip ni sus callers', () => {
    expect(
      existsSync(resolve(ROOT, 'web/components/v2/sesion/StationOrderMark.tsx')),
    ).toBe(false);
    expect(
      source('web/components/v2/editor/archetype-forms/ComponentsForm.tsx'),
    ).not.toContain('stationOrderLabel');

    const athletePreview = source('web/components/v2/editor/AthletePreviewLine.tsx');
    expect(athletePreview).not.toContain('stationOrderLead');
    expect(athletePreview).not.toContain('stationOrderLabel');

    const callers = [
      'web/components/v2/editor/compositor-chrome.tsx',
      'web/components/v2/editor/SessionPartCard.tsx',
      'web/components/v2/carrera/SesionScreen.tsx',
      'web/components/v2/atleta-detalle/SessionDetailDrawer.tsx',
    ];
    for (const path of callers) {
      expect(source(path)).not.toContain('StationOrderMark');
    }
  });

  test('la puerta de bloque iOS no conserva BlockPacing ni sus badges', () => {
    const gate = source('ios/FAHYBRIK/Workout/BlockPreviewGate.swift');

    expect(gate).not.toContain('enum BlockPacing');
    expect(gate).not.toContain('"CIRCUITO"');
    expect(gate).not.toContain('"SEGUIDO"');
    expect(gate).not.toContain('"ALTERNANDO"');
    expect(gate).not.toContain('pacingBadge');
    expect(gate).not.toContain('uno de cada por vuelta, en orden');
    expect(gate).not.toContain('todas las series de un ejercicio antes del siguiente');
    expect(gate).not.toContain('una serie de cada, y vuelta a empezar');

    const activeWorkout = source('ios/FAHYBRIK/Workout/ActiveWorkoutView.swift');
    expect(activeWorkout).not.toContain('blockPacing');
    expect(activeWorkout).not.toContain('BlockPacing');
  });

  test('la previa iOS deja vacía la etiqueta anterior al ejercicio', () => {
    const brief = source('ios/FAHYBRIK/Workout/PreWorkoutBriefView.swift');

    expect(brief).not.toContain('1º');
    expect(brief).not.toContain('Min impar');
    expect(brief).not.toContain('Min par');
    expect(brief).not.toContain('Min \\(');
    expect(brief).not.toContain('"Min ');
  });
});

describe('171 · esas frases no existen en producto', () => {
  test('medida y scheme no dicen no lo sé', () => {
    const renderHonest = source('shared/domain/prescription/render-honest.ts');
    expect(renderHonest).not.toContain('COPY_NO_LO_SE');
    expect(renderHonest).not.toContain('no lo sé');

    const formato = source('ios/FAHYBRIKCore/Theme/Formato.swift');
    expect(formato).not.toMatch(/noLoSe = "no lo sé"/);

    const renderer = source('ios/FAHYBRIKCore/Plan/PrescriptionRenderer.swift');
    expect(renderer).not.toContain('return Vocab.noLoSe');

    const dosis = source('web/components/design-twin/datos-reales.ts');
    expect(dosis).not.toContain('COPY_NO_LO_SE');
    expect(dosis).not.toContain("'no lo sé'");
  });

  test('DURATION_UNKNOWN_ES y su espejo iOS están vacíos', () => {
    const duration = source('shared/domain/prescription/duration.ts');
    expect(duration).not.toContain('Dura lo que tardes');
    expect(duration).not.toContain('Hasta donde aguantes');
    expect(duration).not.toContain('Según tu ritmo y tus descansos');
    expect(duration).not.toContain('Sin detallar');

    const prevista = source('ios/FAHYBRIK/Plan/DuracionPrevista.swift');
    expect(prevista).not.toContain('Dura lo que tardes');
    expect(prevista).not.toContain('Hasta donde aguantes');
    expect(prevista).not.toContain('Según tu ritmo y tus descansos');
    expect(prevista).not.toContain('Sin detallar');

    const bloque = source('web/components/design-twin/screens/plan-bloque/pantalla.tsx');
    expect(bloque).not.toContain('unos ${');
    expect(source('web/components/design-twin/screens/plan-bloque/index.tsx')).not.toContain(
      'Dura lo que tardes',
    );

    const semana = source('web/components/design-twin/screens/plan-semana/pantalla.tsx');
    expect(semana).not.toContain('unos ${');
  });

  test('el umbral sin test no habla', () => {
    const note = source('shared/domain/methodology/zone-onboarding.ts');
    expect(note).not.toContain('no lo sé. Falta');
    expect(note).not.toContain('Falta el test de umbral');
  });

  test('los huecos que narraban están vacíos', () => {
    const maquina = source('web/components/design-twin/screens/vivo-fuerza/maquina.tsx');
    expect(maquina).not.toContain('el plan no trae repeticiones');
    expect(maquina).not.toContain('el plan solo trae el nombre');

    const descanso = source('web/components/design-twin/screens/vivo-erg/descanso.tsx');
    expect(descanso).not.toContain('El coach no escribió descanso');

    const previa = source('web/components/design-twin/screens/sesion-previa/atoms.tsx');
    expect(previa).not.toContain('viene sin cuánto');

    const planDia = source('web/components/design-twin/screens/plan-dia/atoms.tsx');
    expect(planDia).not.toContain('sin detalle en el plan');

    const gate = source('ios/FAHYBRIK/Workout/BlockPreviewGate.swift');
    expect(gate).not.toContain('Sin detalle — empieza cuando estés listo.');

    const brief = source('ios/FAHYBRIK/Workout/PreWorkoutBriefView.swift');
    expect(brief).not.toContain('ALTERNA CADA MINUTO');
    expect(brief).not.toContain('SE ALTERNAN');
    expect(brief).not.toContain('SEGÚN TU 1RM');
  });

  test('el juicio no se pinta', () => {
    const progress = source('shared/domain/running/progress.ts');
    expect(progress).not.toContain("'Vas mejor'");
    expect(progress).not.toContain("'Cargando de más'");
    expect(progress).not.toContain("'Vas más lento'");
    expect(progress).not.toContain("'Te mantienes'");

    const voz = source('web/components/design-twin/screens/lectura-carrera/voz.ts');
    expect(voz).not.toContain("'Dentro'");
    expect(voz).not.toContain("'Más rápida'");

    const resumen = source('ios/FAHYBRIK/Workout/PostWorkout/ResumenCarreraPiezas.swift');
    expect(resumen).not.toContain('"Aguantaste"');
    expect(resumen).not.toContain('"De menos a más"');
    expect(resumen).not.toContain('"Se te fue al final"');

    const speech = source('ios/FAHYBRIK/Workout/Audio/CoachSpeech.swift');
    expect(speech).not.toContain('return "Aprieta un poco."');
    expect(speech).not.toContain('return "Vas rápido, afloja un poco."');

    const outdoor = source('ios/FAHYBRIK/Workout/Outdoor/OutdoorRunHUDView.swift');
    expect(outdoor).not.toContain('Aprieta un poco para volver');
    expect(outdoor).not.toContain('Afloja un poco y vuelve');

    const cinta = source('ios/FAHYBRIK/Devices/Treadmill/TreadmillHUDComponents.swift');
    expect(cinta).not.toContain('return "Afloja"');
    expect(cinta).not.toContain('return "Aprieta"');

    const runLive = source('web/components/design-twin/screens/run-live/data.ts');
    expect(runLive).not.toContain("return 'Afloja'");
    expect(runLive).not.toContain("return 'Aprieta'");

    const rodaje = source('ios/FAHYBRIKCore/Watch/Guiones/GuionRodaje.swift');
    expect(rodaje).not.toContain('te pasas · afloja');
    expect(rodaje).not.toContain('vas corto · aprieta');

    const hechos = source('shared/domain/analytics/hechos.ts');
    expect(hechos).not.toContain('Aprieta menos esta semana');
    expect(hechos).not.toContain('Has subido un');

    const carga = source('ios/FAHYBRIK/Analytics/BloqueDeCarga.swift');
    expect(carga).not.toContain('Vas a más o te pasas');
  });
});
