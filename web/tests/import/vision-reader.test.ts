// El LECTOR DE FOTO del importador, con el modelo simulado (`fetchImpl` inyectado).
//
// Lo que se defiende aquí es el contrato del lector, no la puntería del modelo:
//   · el texto llega VERBATIM hasta `ImportedWeek` (si se normaliza, la gramática
//     de después lee otra cosa);
//   · lo que no es entreno NO se tipa como entreno;
//   · lo cortado se marca y no se completa;
//   · una respuesta con basura falla limpio, sin inventarse media semana;
//   · las N capturas viajan en UN solo turno multimodal.

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import {
  ImportVisionError,
  readWeekFromImages,
  readWeekVision,
} from '@/lib/import/vision-reader';
import { workoutCards } from '@/lib/import/imported-week';

const IMAGE = { image_base64: 'Zm90bw==', mime_type: 'image/png' };

// Envoltorio de respuesta del wire compatible con OpenRouter. SIN `usage` a
// propósito: con él, el cliente dispararía la telemetría de coste (que toca la DB).
function llmReply(payload: unknown): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

/** Lo que nos importa del cuerpo multimodal que se manda al modelo. */
type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };
interface LlmRequestBody {
  temperature: number;
  max_tokens: number;
  messages: Array<{ role: string; content: string | ContentPart[] }>;
}

/** Simula el modelo y guarda el cuerpo de la petición para poder auditarlo. */
function fakeModel(payload: unknown): {
  fetchImpl: typeof fetch;
  bodies: LlmRequestBody[];
} {
  const bodies: LlmRequestBody[] = [];
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body ?? '{}')) as LlmRequestBody);
    return llmReply(payload);
  }) as unknown as typeof fetch;
  return { fetchImpl, bodies };
}

// Una semana real tal y como la ve el modelo: lunes con DOS entrenos (uno cortado
// por la UI, con el icono mintiendo) y un martes de furniture del calendario.
const WEEK_PAYLOAD = {
  weeks: [
    {
      days: [
        {
          day_of_week: 1,
          cards: [
            {
              title: 'FUERZA PARTE ALTA',
              kind: 'workout',
              lines: ['A) 4 × 4 | RIR 2', 'Press Banca >78-80%', 'Dominada (lastrada)'],
              performed: [],
              modality_hint: 'strength',
              truncated: false,
              hidden_count: null,
            },
            {
              title: 'TRANSICIONES CARRERA',
              kind: 'workout',
              lines: ['3 RONDAS', '500 m carrera 3:45 min/km', '10+10 Step Ups Cajón', '2 minutos Air-b...'],
              // Lo ejecutado convive con el plan en la misma tarjeta.
              performed: ['0:46:02', 'FC media 158'],
              modality_hint: 'row',
              truncated: true,
              hidden_count: 4,
            },
          ],
        },
        {
          day_of_week: 2,
          cards: [
            {
              title: 'SEMANA 12',
              kind: 'note',
              lines: ['CONTROL TEST SALTO'],
              performed: [],
              modality_hint: null,
              truncated: false,
              hidden_count: null,
            },
            {
              title: null,
              kind: 'metrics',
              lines: ['Sleep Hours: 7.96 hrs', 'Body Battery: Low 29 High 77'],
              performed: [],
              modality_hint: null,
              truncated: false,
              hidden_count: null,
            },
          ],
        },
      ],
    },
  ],
  uncertain: ['jueves, tarjeta 2: texto borroso'],
  notes: null,
};

let savedModel: string | undefined;
let savedKey: string | undefined;

beforeAll(() => {
  savedModel = process.env.LLM_VISION_MODEL;
  savedKey = process.env.LLM_API_KEY;
  process.env.LLM_VISION_MODEL = 'test/vision-model';
  process.env.LLM_API_KEY = 'test-key';
});

afterAll(() => {
  if (savedModel === undefined) delete process.env.LLM_VISION_MODEL;
  else process.env.LLM_VISION_MODEL = savedModel;
  if (savedKey === undefined) delete process.env.LLM_API_KEY;
  else process.env.LLM_API_KEY = savedKey;
});

describe('lectura de una semana bien formada', () => {
  test('devuelve una ImportedWeek con sus 7 días y las tarjetas del modelo', async () => {
    const { fetchImpl } = fakeModel(WEEK_PAYLOAD);

    const weeks = await readWeekFromImages({ images: [IMAGE], fetchImpl });

    expect(weeks).toHaveLength(1);
    const week = weeks[0]!;
    expect(week.week).toBe(1);
    expect(week.sheet).toBe('foto');
    expect(week.fell_back).toBe(false);
    // La semana siempre trae los 7 días, con o sin contenido.
    expect(week.days.map((d) => d.day_of_week)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(week.days.map((d) => d.dow)).toEqual([
      'Lunes',
      'Martes',
      'Miércoles',
      'Jueves',
      'Viernes',
      'Sábado',
      'Domingo',
    ]);
    // Un día que se miró y estaba vacío es [], no undefined.
    expect(week.days[2]!.cards).toEqual([]);
    expect(week.days[2]!.session_text).toBeNull();
    expect(week.days[0]!.cards).toHaveLength(2);
  });

  test('el texto llega VERBATIM: ni se normaliza ni se reescribe', async () => {
    const { fetchImpl } = fakeModel(WEEK_PAYLOAD);

    const weeks = await readWeekFromImages({ images: [IMAGE], fetchImpl });
    const lunes = weeks[0]!.days[0]!;

    expect(lunes.cards![0]!.title).toBe('FUERZA PARTE ALTA');
    expect(lunes.cards![0]!.lines).toEqual([
      'A) 4 × 4 | RIR 2',
      'Press Banca >78-80%',
      'Dominada (lastrada)',
    ]);
    expect(lunes.cards![1]!.lines).toContain('500 m carrera 3:45 min/km');
    expect(lunes.cards![1]!.lines).toContain('10+10 Step Ups Cajón');
  });

  test('lo cortado se marca y NO se completa', async () => {
    const { fetchImpl } = fakeModel(WEEK_PAYLOAD);

    const weeks = await readWeekFromImages({ images: [IMAGE], fetchImpl });
    const cortada = weeks[0]!.days[0]!.cards![1]!;

    expect(cortada.truncated).toBe(true);
    expect(cortada.hidden_count).toBe(4);
    // La línea cortada sigue cortada: nadie le ha puesto el final.
    expect(cortada.lines).toContain('2 minutos Air-b...');
    expect(cortada.lines.join(' ')).not.toContain('Air-bike');
  });

  test('el icono manda solo sobre modality_hint, jamás sobre el contenido', async () => {
    const { fetchImpl } = fakeModel(WEEK_PAYLOAD);

    const weeks = await readWeekFromImages({ images: [IMAGE], fetchImpl });
    const carrera = weeks[0]!.days[0]!.cards![1]!;

    // El icono dice remo; el contenido es carrera. Se conservan LOS DOS.
    expect(carrera.modality_hint).toBe('row');
    expect(carrera.title).toBe('TRANSICIONES CARRERA');
  });

  test('lo REALIZADO no se cuela en las líneas del plan', async () => {
    const { fetchImpl } = fakeModel(WEEK_PAYLOAD);

    const weeks = await readWeekFromImages({ images: [IMAGE], fetchImpl });
    const lunes = weeks[0]!.days[0]!;

    const todo = lunes.cards!.flatMap((c) => c.lines).join(' ');
    expect(todo).not.toContain('0:46:02');
    expect(todo).not.toContain('FC media 158');
    expect(lunes.session_text ?? '').not.toContain('0:46:02');
  });

  test('las señales de honestidad del modelo se conservan', async () => {
    const { fetchImpl } = fakeModel(WEEK_PAYLOAD);

    const reading = await readWeekVision({ images: [IMAGE], fetchImpl });

    expect(reading.uncertain).toEqual(['jueves, tarjeta 2: texto borroso']);
    expect(reading.model).toBe('test/vision-model');
  });
});

describe('lo que NO es entreno no se tipa como entreno', () => {
  test('las métricas del dispositivo son "metrics", no "workout"', async () => {
    const { fetchImpl } = fakeModel(WEEK_PAYLOAD);

    const weeks = await readWeekFromImages({ images: [IMAGE], fetchImpl });
    const martes = weeks[0]!.days[1]!;

    const metricas = martes.cards!.find((c) => c.lines[0]?.startsWith('Sleep Hours'))!;
    expect(metricas.kind).toBe('metrics');
    expect(martes.cards!.find((c) => c.title === 'SEMANA 12')!.kind).toBe('note');

    // Ninguna llega a la gramática, ni por `cards` ni por el texto de sesión.
    expect(workoutCards(martes)).toEqual([]);
    expect(martes.session_text).toBeNull();
  });

  test('el texto de sesión solo lleva las tarjetas de entreno', async () => {
    const { fetchImpl } = fakeModel(WEEK_PAYLOAD);

    const weeks = await readWeekFromImages({ images: [IMAGE], fetchImpl });
    const lunes = weeks[0]!.days[0]!;

    expect(lunes.session_text).toBe(
      [
        'FUERZA PARTE ALTA',
        'A) 4 × 4 | RIR 2',
        'Press Banca >78-80%',
        'Dominada (lastrada)',
        '',
        'TRANSICIONES CARRERA',
        '3 RONDAS',
        '500 m carrera 3:45 min/km',
        '10+10 Step Ups Cajón',
        '2 minutos Air-b...',
      ].join('\n'),
    );
  });
});

describe('la basura falla limpio', () => {
  test('una respuesta sin la forma esperada no inventa nada', async () => {
    const { fetchImpl } = fakeModel({ resumen: 'el atleta entrenó fuerza el lunes', dias: 5 });

    await expect(readWeekFromImages({ images: [IMAGE], fetchImpl })).rejects.toMatchObject({
      name: 'CoachIaLlmError',
      code: 'invalid_json',
    });
  });

  test('una tarjeta sin "kind" tumba la lectura en vez de adivinarla', async () => {
    const { fetchImpl } = fakeModel({
      weeks: [{ days: [{ day_of_week: 1, cards: [{ title: 'X', lines: ['3 RONDAS'] }] }] }],
    });

    await expect(readWeekFromImages({ images: [IMAGE], fetchImpl })).rejects.toBeInstanceOf(
      ImportVisionError,
    );
  });

  test('un día fuera de rango no se recoloca a ojo', async () => {
    const { fetchImpl } = fakeModel({
      weeks: [{ days: [{ day_of_week: 9, cards: [] }] }],
    });

    await expect(readWeekFromImages({ images: [IMAGE], fetchImpl })).rejects.toMatchObject({
      code: 'invalid_json',
    });
  });

  test('una semana sin una sola tarjeta no ocupa número de semana', async () => {
    const { fetchImpl } = fakeModel({ weeks: [{ days: [{ day_of_week: 1, cards: [] }] }] });

    await expect(readWeekFromImages({ images: [IMAGE], fetchImpl })).resolves.toEqual([]);
  });
});

describe('varias capturas', () => {
  test('las N imágenes viajan en UN solo turno, en orden', async () => {
    const images = [
      { image_base64: 'dW5v', mime_type: 'image/png' },
      { image_base64: 'ZG9z', mime_type: 'image/jpeg' },
      { image_base64: 'dHJlcw==', mime_type: 'image/webp' },
    ];
    const { fetchImpl, bodies } = fakeModel(WEEK_PAYLOAD);

    await readWeekFromImages({ images, fetchImpl });

    expect(bodies).toHaveLength(1);
    const content = bodies[0]!.messages[1]!.content as ContentPart[];
    expect(content[0]!.type).toBe('text');
    const urls = content
      .filter((p): p is Extract<ContentPart, { type: 'image_url' }> => p.type === 'image_url')
      .map((p) => p.image_url.url);
    expect(urls).toEqual([
      'data:image/png;base64,dW5v',
      'data:image/jpeg;base64,ZG9z',
      'data:image/webp;base64,dHJlcw==',
    ]);
    // Transcribir no es redactar.
    expect(bodies[0]!.temperature).toBe(0);
  });

  test('dos semanas se numeran correlativas — numeración puramente interna, ya no configurable (start_week desapareció, ver photo-placement.ts)', async () => {
    const twoWeeks = {
      weeks: [
        { days: [{ day_of_week: 1, cards: [{ title: 'A', kind: 'workout', lines: ['10 × 400m'] }] }] },
        { days: [{ day_of_week: 3, cards: [{ title: 'B', kind: 'workout', lines: ['4 × 600 + 3 × 800'] }] }] },
      ],
    };
    const { fetchImpl } = fakeModel(twoWeeks);

    const weeks = await readWeekFromImages({ images: [IMAGE], fetchImpl });

    expect(weeks.map((w) => w.week)).toEqual([1, 2]);
    expect(weeks[1]!.days[2]!.cards![0]!.lines).toEqual(['4 × 600 + 3 × 800']);
  });

  test('el mismo día repetido en dos capturas fusiona sus tarjetas', async () => {
    const repeated = {
      weeks: [
        {
          days: [
            { day_of_week: 1, cards: [{ title: 'AM', kind: 'workout', lines: ['10 × 400m'] }] },
            { day_of_week: 1, cards: [{ title: 'PM', kind: 'workout', lines: ['90 seg Remo Z3'] }] },
          ],
        },
      ],
    };
    const { fetchImpl } = fakeModel(repeated);

    const weeks = await readWeekFromImages({ images: [IMAGE], fetchImpl });

    expect(weeks[0]!.days[0]!.cards!.map((c) => c.title)).toEqual(['AM', 'PM']);
  });

  test('sin ninguna imagen no se llama al modelo', async () => {
    const { fetchImpl, bodies } = fakeModel(WEEK_PAYLOAD);

    await expect(readWeekFromImages({ images: [], fetchImpl })).rejects.toMatchObject({
      code: 'invalid_request',
    });
    expect(bodies).toHaveLength(0);
  });
});
