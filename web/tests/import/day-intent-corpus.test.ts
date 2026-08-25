/**
 * Card 128 · hueco 3: prioridad y sustitución del día.
 * Cuenta el ciclo real, no ejemplos inventados. El coach las escribió
 * en el DÍA. FOCUS decía 47 líneas esenciales; el JSON tiene 47 días
 * y 0 líneas de trabajo con la palabra «esencial».
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  dayIntentByDow,
  dayIntentFromSource,
  readDeclaredPriorityFromText,
  readDeclaredSubstituteFromText,
  readDayIntent,
} from '@fahybrid/shared/domain/day-intent';
import {
  normalizeWeekDay,
  weekDaySchema,
  type WeekDay,
} from '@fahybrid/shared/schema/program-templates';
import { serializeDay } from '@/lib/dashboard/v2/editor-serialize';
import { buildReviewModel, buildConfirmBody } from '@/lib/dashboard/v2/import-review';
import { weekDaysToProposal } from '@/lib/import/generate-proposal';

interface Bloque {
  nombre: string;
  contenido: string;
}
interface Dia {
  dia: string;
  sesion: string;
  prioridad?: string;
  sustituible?: string;
  bloques?: Bloque[];
}
interface Semana {
  numero: number;
  dias: Dia[];
}
interface Macrociclo {
  semanas: Semana[];
}

const CORPUS: Macrociclo = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/macrociclo-hyrox-12-semanas.json'), 'utf8'),
) as Macrociclo;

function diasDelCorpus(): Dia[] {
  return CORPUS.semanas.flatMap((s) => s.dias);
}

function lineasDelCorpus(): string[] {
  const out: string[] = [];
  for (const d of diasDelCorpus()) {
    for (const b of d.bloques ?? []) {
      for (const raw of (b.contenido ?? '').split('\n')) {
        const texto = raw.trim();
        if (texto) out.push(texto);
      }
    }
  }
  return out;
}

function textoDelDia(d: Dia): string {
  return (d.bloques ?? []).map((b) => `${b.nombre}\n${b.contenido}`).join('\n');
}

describe('el ciclo declara la prioridad en el DÍA, no en la línea', () => {
  test('84 días, 47 esenciales, 12 importantes, 9 complementarias, 16 ausentes', () => {
    const dias = diasDelCorpus();
    expect(dias).toHaveLength(84);
    const cuenta = { essential: 0, important: 0, complementary: 0, ausente: 0 };
    for (const d of dias) {
      const intent = readDayIntent(d);
      if (intent.priority) cuenta[intent.priority] += 1;
      else cuenta.ausente += 1;
    }
    expect(cuenta).toEqual({ essential: 47, important: 12, complementary: 9, ausente: 16 });
  });

  test('ninguna línea de trabajo contiene «esencial»', () => {
    const hits = lineasDelCorpus().filter((t) => /esencial/i.test(t));
    expect(hits).toEqual([]);
  });

  test('el título de la sesión no se adivina como esencial', () => {
    for (const d of diasDelCorpus()) {
      expect(readDeclaredPriorityFromText(d.sesion), d.sesion).toBeUndefined();
    }
  });

  test('«Complementario de barra» es un bloque, no una prioridad', () => {
    expect(readDeclaredPriorityFromText('Complementario de barra')).toBeUndefined();
    const dia = diasDelCorpus().find((d) =>
      (d.bloques ?? []).some((b) => b.nombre === 'Complementario de barra'),
    );
    expect(dia, 'el bloque existe en el ciclo').toBeDefined();
    expect(readDeclaredPriorityFromText(textoDelDia(dia!))).toBeUndefined();
  });
});

describe('el ciclo declara el sustituto; no se inventa un segundo calendario', () => {
  test('31 de 84 días traen un sustituto en sustituible', () => {
    const phrases = diasDelCorpus()
      .map((d) => readDayIntent(d).substitute)
      .filter((s): s is string => !!s);
    expect(phrases).toHaveLength(31);
    const cuenta = new Map<string, number>();
    for (const p of phrases) cuenta.set(p, (cuenta.get(p) ?? 0) + 1);
    expect(cuenta.get('Clase S&C')).toBe(16);
    expect(cuenta.get('Clase S&C · el bloque de sled se mantiene aparte')).toBe(1);
    expect(cuenta.get('Clase S&C · bloque C aparte')).toBe(1);
    expect(cuenta.get('Clase S&C · bloque de sled aparte')).toBe(2);
    expect(cuenta.get('Clase HYROX · RPE 6-7')).toBe(1);
    expect(cuenta.get('Clase HYROX · RPE 7')).toBe(1);
    expect(cuenta.get('Clase HYROX · RPE 7-8')).toBe(1);
    expect(cuenta.get('Clase HYROX · RPE 8')).toBe(5);
    expect(cuenta.get('Clase HYROX · RPE 8-9')).toBe(3);
  });

  test('10 días escriben Alternativa: en el bloque y emitir el campo', () => {
    const fromText: string[] = [];
    for (const d of diasDelCorpus()) {
      const phrase = readDeclaredSubstituteFromText(textoDelDia(d));
      if (phrase) fromText.push(phrase);
    }
    expect(fromText).toEqual([
      "60-75' de bici en Zona 2",
      "70-80' de bici en Zona 2",
      "75-85' de bici en Zona 2",
      "75-85' de bici en Zona 2",
      "55-65' de bici en Zona 2",
      "75-85' de bici en Zona 2",
      "75-85' de bici en Zona 2",
      "60-80' de bici en Zona 2",
      "70-80' de bici en Zona 2",
      "2' ski -> 12' AB -> 2' row -> 12' AB -> 10' Concept 2",
    ]);
  });

  test('los 10 de Alternativa: no se mezclan con los 31 de clase', () => {
    let overlap = 0;
    for (const d of diasDelCorpus()) {
      const structured = readDayIntent(d).substitute;
      const fromText = readDeclaredSubstituteFromText(textoDelDia(d));
      if (structured && fromText) overlap += 1;
    }
    expect(overlap).toBe(0);
  });

  test('«No» y «-» no son un sustituto', () => {
    expect(readDayIntent({ sustituible: 'No' }).substitute).toBeUndefined();
    expect(readDayIntent({ sustituible: '-' }).substitute).toBeUndefined();
    expect(readDayIntent({ prioridad: '-' }).priority).toBeUndefined();
  });
});

describe('aliases del ciclo → campos tipados, y sobreviven al guardar', () => {
  test('prioridad Esencial + sustituible Clase S&C se levantan', () => {
    const day = weekDaySchema.parse(
      normalizeWeekDay({
        day_of_week: 1,
        sessions: [{ kind: 'workout' }],
        prioridad: 'Esencial',
        sustituible: 'Clase S&C',
      }),
    );
    expect(day.priority).toBe('essential');
    expect(day.substitute).toBe('Clase S&C');
  });

  test('normalizeWeekDay no tira los campos en forma nueva ni legacy', () => {
    const nuevo = normalizeWeekDay({
      day_of_week: 2,
      sessions: [{ kind: 'workout' }],
      priority: 'important',
      substitute: 'Clase HYROX · RPE 8',
    });
    expect(nuevo.priority).toBe('important');
    expect(nuevo.substitute).toBe('Clase HYROX · RPE 8');

    const legacy = normalizeWeekDay({
      day_of_week: 3,
      am: { kind: 'workout' },
      prioridad: 'Complementaria',
      sustituible: 'Clase S&C',
    });
    expect(legacy.priority).toBe('complementary');
    expect(legacy.substitute).toBe('Clase S&C');
  });

  test('serializeDay conserva, fija y limpia; en descanso los quita', () => {
    const original: WeekDay = {
      day_of_week: 1,
      sessions: [{ kind: 'workout', blocks: [] }],
      priority: 'essential',
      substitute: 'Clase S&C',
    };
    const kept = serializeDay({
      day_of_week: 1,
      sessions: [{ uid: 's', slot: 'am', blocks: [] }],
      original,
    });
    expect(kept.priority).toBe('essential');
    expect(kept.substitute).toBe('Clase S&C');

    const set = serializeDay({
      day_of_week: 1,
      sessions: [{ uid: 's', slot: 'am', blocks: [] }],
      original,
      priority: 'important',
      substitute: 'Clase HYROX · RPE 8',
    });
    expect(set.priority).toBe('important');
    expect(set.substitute).toBe('Clase HYROX · RPE 8');

    const cleared = serializeDay({
      day_of_week: 1,
      sessions: [{ uid: 's', slot: 'am', blocks: [] }],
      original,
      priority: null,
      substitute: null,
    });
    expect(cleared.priority).toBeUndefined();
    expect(cleared.substitute).toBeUndefined();

    const rest = serializeDay({
      day_of_week: 1,
      sessions: [],
      kind: 'rest',
      original,
    });
    expect(rest.kind).toBe('rest');
    expect(rest.priority).toBeUndefined();
    expect(rest.substitute).toBeUndefined();
  });

  test('los 47 + 31 del fixture caben en slots_json sin nota', () => {
    const dias = diasDelCorpus();
    let esenciales = 0;
    let sustitutos = 0;
    for (const d of dias) {
      const parsed = weekDaySchema.parse(
        normalizeWeekDay({
          day_of_week: 1,
          sessions: [{ kind: 'workout' }],
          prioridad: d.prioridad,
          sustituible: d.sustituible,
        }),
      );
      if (parsed.priority === 'essential') esenciales += 1;
      if (parsed.substitute) sustitutos += 1;
      expect(parsed.notes).toBeUndefined();
    }
    expect(esenciales).toBe(47);
    expect(sustitutos).toBe(31);
  });

  test('dayIntentByDow lee el weekday de un slots_json ya tipado', () => {
    const map = dayIntentByDow({
      days: [
        { day_of_week: 1, priority: 'essential', substitute: 'Clase S&C' },
        { day_of_week: 7, prioridad: '-', sustituible: '-' },
      ],
    });
    expect(map.get(1)).toEqual({ priority: 'essential', substitute: 'Clase S&C' });
    expect(map.has(7)).toBe(false);
  });
});

describe('el importador emite el campo si la fuente lo declaró', () => {
  test('una línea Alternativa: del ciclo llena substitute', () => {
    const literal =
      "2' ski -> 15' AB o Concept 2 -> 2' ski\n\nAlternativa: 60-75' de bici en Zona 2";
    expect(dayIntentFromSource({}, literal).substitute).toBe("60-75' de bici en Zona 2");
  });

  test('Prioridad: Esencial solo si está escrito así, no si el día se llama Test', () => {
    expect(dayIntentFromSource({}, 'Test running').priority).toBeUndefined();
    expect(dayIntentFromSource({}, 'Prioridad: Esencial').priority).toBe('essential');
  });

  test('el campo estructurado gana a la línea de texto', () => {
    const intent = dayIntentFromSource(
      { sustituible: 'Clase S&C' },
      "Alternativa: 60-75' de bici en Zona 2",
    );
    expect(intent.substitute).toBe('Clase S&C');
  });

  test('propuesta → confirmar conserva los campos del día', () => {
    const days = [
      {
        day_of_week: 1,
        priority: 'essential',
        substitute: 'Clase S&C',
        sessions: [
          {
            kind: 'workout',
            template_id: 500,
            blocks: [
              {
                uid: 'b1',
                format: 'sets',
                title: 'Fuerza',
                group: 'principal',
                items: [
                  {
                    uid: 'i1',
                    exercise_id: 42,
                    exercise_name: 'Back Squat',
                    prescription_json: {
                      scheme: 'sets',
                      modality: 'strength',
                      sets: [{ measure: { kind: 'reps', value: 5 }, target: { kind: 'percent_rm', value: 80 } }],
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    ] as unknown as WeekDay[];
    const proposal = weekDaysToProposal({ days, sheetLabel: 'Ciclo' });
    const monday = proposal.weeks[0]!.days[0]!;
    expect(monday.priority).toBe('essential');
    expect(monday.substitute).toBe('Clase S&C');
    const model = buildReviewModel(proposal, [{ id: '11', index: 0, label: 'S1', session_count: 0 }]);
    const body = buildConfirmBody('7', model);
    expect(body.weeks[0]!.priority).toBe('essential');
    expect(body.weeks[0]!.substitute).toBe('Clase S&C');
  });
});
