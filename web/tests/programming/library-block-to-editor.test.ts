import { describe, expect, it } from 'vitest';
import {
  isInsertableBlockModel,
  libraryBlockToEditorBlocks,
} from '@/lib/dashboard/v2/library-block-to-editor';
import { serializeDay } from '@/lib/dashboard/v2/editor-serialize';
import type { BlockEditorModel, EditorBlock, EditorItem } from '@/lib/dashboard/v2/editor-types';
import type { Prescription } from '@fahybrid/shared/domain/prescription';
import { templateFormat } from '@fahybrid/shared/schema/_primitives';
import { weekDayPartSchema } from '@fahybrid/shared/schema/program-templates';

// El mapeo bloque de biblioteca → EditorBlock[] que el editor de día inserta.
// Los fixtures reproducen lo que `loadBlockEditorModel` devuelve de verdad para
// los bloques REALES del coach 60 (verificado contra prod):
//   • 52 "10' row z2" → 4 posiciones (Rowing / SkiErg / Assault Bike / Run),
//     block_title NULL en las 4 → el loader emite "Bloque 1..4".
//   • 53 "10' row z2" → 5 posiciones, las dos últimas son Run + Run.
//   • un solo-prosa (27 de los 99) → sin block_exercises → blocks: [].

// Las prescripciones son las REALES del bloque 52 en la biblioteca del coach 60,
// copiadas verbatim de la respuesta del endpoint (10' en zona 2 por modalidad).
// Sin casts: si el fixture no tipa como `Prescription`, es que no es real.
const STEADY_ROW: Prescription = {
  scheme: 'steady',
  modality: 'row',
  total_s: 600,
  target: { kind: 'hr_zone', value: 2 },
};

const STEADY_RUN: Prescription = {
  scheme: 'steady',
  modality: 'run',
  total_s: 600,
  target: { kind: 'hr_zone', value: 2 },
};

/** Una pieza tal y como la emite `loadBlockEditorModel` (uid determinista, título de relleno). */
function part(index: number, items: EditorItem[], title?: string): EditorBlock {
  return {
    uid: `be-block-${index}`,
    title: title ?? `Bloque ${index + 1}`,
    format: 'zone2',
    group: 'principal',
    items,
  };
}

function item(position: number, name: string, prescription: Prescription): EditorItem {
  return {
    uid: `be-item-${position}`,
    exercise_id: 100 + position,
    exercise_name: name,
    prescription,
  };
}

/** Bloque 52 — el caso canónico: un título, cuatro modalidades. */
function block52(): BlockEditorModel {
  return {
    block_id: 52,
    title: "10' row z2",
    description: "10' row z2 + 10' skierg z2 + 10' AB z2 + 10' run z2",
    methodology_group_id: 5,
    format: 'zone2',
    blocks: [
      part(0, [item(0, 'Rowing', STEADY_ROW)]),
      part(1, [item(1, 'SkiErg', STEADY_ROW)]),
      part(2, [item(2, 'Assault Bike', STEADY_ROW)]),
      part(3, [item(3, 'Run', STEADY_RUN)]),
    ],
  };
}

describe('libraryBlockToEditorBlocks', () => {
  it('un bloque multi-posición da N EditorBlocks en orden', () => {
    const blocks = libraryBlockToEditorBlocks(block52());

    expect(blocks).toHaveLength(4);
    expect(blocks.map((b) => b.title)).toEqual(['Rowing', 'SkiErg', 'Assault Bike', 'Run']);
    expect(blocks.map((b) => b.items[0]?.exercise_name)).toEqual([
      'Rowing',
      'SkiErg',
      'Assault Bike',
      'Run',
    ]);
  });

  it('la prescripción sobrevive ESTRUCTURADA (no se degrada a legacy)', () => {
    const model = block52();
    const blocks = libraryBlockToEditorBlocks(model);

    // Misma prescripción, campo a campo — nada de re-derivar desde params_json.
    expect(blocks[0]!.items[0]!.prescription).toEqual(STEADY_ROW);
    expect(blocks[3]!.items[0]!.prescription).toEqual(STEADY_RUN);
    expect(blocks[0]!.items[0]!.prescription.scheme).toBe('steady');
    expect(blocks[0]!.items[0]!.prescription.modality).toBe('row');
    // Y el ejercicio sigue enganchado (sin líneas huérfanas).
    expect(blocks.every((b) => b.items.every((it) => it.exercise_id !== null))).toBe(true);
  });

  it('pone source_block_id y methodology_group_id en TODAS las piezas', () => {
    const blocks = libraryBlockToEditorBlocks(block52());

    expect(blocks.every((b) => b.source_block_id === 52)).toBe(true);
    expect(blocks.every((b) => b.methodology_group_id === 5)).toBe(true);
  });

  // La procedencia se PINTA ("Desde tu bloque «X»"), así que el título del origen
  // tiene que viajar ya en la inserción — sin esperar a recargar el día.
  it('cada pieza sabe de qué bloque salió, para poder decirlo', () => {
    const blocks = libraryBlockToEditorBlocks(block52());

    expect(blocks.every((b) => b.source_block_title === "10' row z2")).toBe(true);
  });

  // El título del origen es DERIVADO: si se persistiera, renombrar el bloque en la
  // Biblioteca dejaría el día mintiendo con el nombre viejo. El serializador solo
  // escribe campos de WeekDayPart, y el schema no tiene `source_block_title` → esta
  // prueba fija esa frontera: lo que va a la BD conserva el id, nunca el título.
  //
  // El `format` se PARSEA en vez de castearse: `EditorBlock.format` es `string | null`
  // (el tipo laxo del cliente) y el serializador pide el enum `TemplateFormat`, que es
  // justo la frontera que cruza el guardado real (el editor manda por HTTP y la ruta
  // valida con Zod). Parsear aquí reproduce esa frontera Y afirma el invariante: si
  // `toDayFormat` dejara de devolver un formato del enum, esto revienta — que es
  // exactamente el bug que hacía que 87 de 99 bloques dieran 400 al guardar.
  it('el título del origen NO llega a la BD; el id sí', () => {
    const blocks = libraryBlockToEditorBlocks(block52()).map((b) => ({
      ...b,
      format: templateFormat.parse(b.format),
    }));

    const day = serializeDay({
      day_of_week: 2,
      sessions: [{ uid: 's1', slot: 'am', blocks }],
      original: { day_of_week: 2, sessions: [] },
    });

    const parts = day.sessions[0]?.blocks ?? [];
    expect(parts).toHaveLength(4);
    expect(parts.every((p) => p.source_block_id === 52)).toBe(true);
    expect(parts.every((p) => !('source_block_title' in p))).toBe(true);
    // Y el resultado es válido para la BD: el schema es la frontera real.
    expect(parts.every((p) => weekDayPartSchema.safeParse(p).success)).toBe(true);
  });

  it('dos inserciones del MISMO bloque no comparten ningún uid', () => {
    const first = libraryBlockToEditorBlocks(block52());
    const second = libraryBlockToEditorBlocks(block52());

    const uids = [...first, ...second].flatMap((b) => [b.uid, ...b.items.map((it) => it.uid)]);
    expect(new Set(uids).size).toBe(uids.length);
    // Y ninguno arrastra el uid determinista del loader (`be-block-0`, `be-item-0`),
    // que es justo el que colisionaría.
    expect(uids.some((u) => u.startsWith('be-'))).toBe(false);
  });

  it('un bloque solo-prosa se rechaza (no se puede insertar)', () => {
    const proseOnly: BlockEditorModel = {
      block_id: 91,
      title: 'Tirada larga',
      description: '60 min rodaje suave, terreno mixto, hablar sin ahogarse.',
      methodology_group_id: 7,
      format: 'zone2',
      blocks: [], // sin block_exercises = solo la prosa verbatim del coach
    };

    expect(isInsertableBlockModel(proseOnly)).toBe(false);
    expect(libraryBlockToEditorBlocks(proseOnly)).toEqual([]);
    expect(isInsertableBlockModel(block52())).toBe(true);
  });

  describe('cadena de títulos', () => {
    it('1 · usa block_title cuando el coach ya nombró la pieza', () => {
      const model = block52();
      model.blocks[0] = part(0, [item(0, 'Rowing', STEADY_ROW)], 'Remo de entrada');

      expect(libraryBlockToEditorBlocks(model).map((b) => b.title)).toEqual([
        'Remo de entrada',
        'SkiErg',
        'Assault Bike',
        'Run',
      ]);
    });

    it('2 · un bloque de UNA pieza usa blocks.title (más rico que el ejercicio)', () => {
      const model: BlockEditorModel = {
        block_id: 18,
        title: '6r Hang power clean 70%',
        description: '',
        methodology_group_id: 2,
        format: 'plyometric',
        blocks: [part(0, [item(0, 'Hang Power Clean', STEADY_ROW)])],
      };

      expect(libraryBlockToEditorBlocks(model).map((b) => b.title)).toEqual([
        '6r Hang power clean 70%',
      ]);
    });

    it('3 · una pieza con UN ejercicio usa el nombre del ejercicio', () => {
      expect(libraryBlockToEditorBlocks(block52())[1]!.title).toBe('SkiErg');
    });

    it('4 · una pieza con varios ejercicios cae a "titulo · N"', () => {
      const model = block52();
      model.blocks[0] = part(0, [
        item(0, 'Run', STEADY_RUN),
        item(1, 'Rowing', STEADY_ROW),
      ]);

      expect(libraryBlockToEditorBlocks(model)[0]!.title).toBe("10' row z2 · 1");
    });

    it('nunca deja dos piezas del mismo bloque con el mismo nombre', () => {
      // Bloque 53 real: row + ski + bike + run + run → la regla 3 daría "Run" dos veces.
      const model: BlockEditorModel = {
        ...block52(),
        block_id: 53,
        blocks: [
          part(0, [item(0, 'Rowing', STEADY_ROW)]),
          part(1, [item(1, 'SkiErg', STEADY_ROW)]),
          part(2, [item(2, 'Assault Bike', STEADY_ROW)]),
          part(3, [item(3, 'Run', STEADY_RUN)]),
          part(4, [item(4, 'Run', STEADY_RUN)]),
        ],
      };

      const titles = libraryBlockToEditorBlocks(model).map((b) => b.title);
      expect(titles).toEqual(['Rowing', 'SkiErg', 'Assault Bike', 'Run · 4', 'Run · 5']);
      expect(new Set(titles).size).toBe(titles.length);
    });

    it('nunca emite el relleno "Bloque N" del loader', () => {
      const titles = libraryBlockToEditorBlocks(block52()).map((b) => b.title);
      expect(titles.some((t) => /^Bloque \d+$/.test(t))).toBe(false);
    });
  });

  it('no arrastra el `group` inferido del título de relleno (el día es agnóstico)', () => {
    const blocks = libraryBlockToEditorBlocks(block52());
    expect(blocks.every((b) => b.group === undefined)).toBe(true);
  });

  // El día valida `format` contra el enum `templateFormat`. `blocks.format` es texto
  // libre con el vocabulario del IMPORTADOR, que NO es ese enum: sin traducir,
  // guardar el día devuelve 400 para 87 de los 99 bloques del coach (verificado
  // contra la BD real antes de arreglarlo).
  describe('format traducido al vocabulario del día', () => {
    it('traduce el vocabulario del importador a un templateFormat válido', () => {
      const blocks = libraryBlockToEditorBlocks(block52()); // blocks.format = 'zone2'

      expect(blocks.every((b) => b.format === 'tempo')).toBe(true);
      expect(blocks.every((b) => templateFormat.safeParse(b.format).success)).toBe(true);
    });

    it('TODOS los formatos reales del coach salen válidos para el día', () => {
      // Los 10 valores que existen de verdad en `blocks.format` del coach 60.
      const REAL_FORMATS = [
        'run_intervals',
        'race_sim',
        'strength_block',
        'zone2',
        'erg_intervals',
        'metcon',
        'core_mobility',
        'plyometric',
        'tapering',
        'functional_circuit',
      ];

      for (const format of REAL_FORMATS) {
        const model: BlockEditorModel = { ...block52(), format };
        // block_format es NULL en las 121 filas importadas → la pieza hereda el del bloque.
        model.blocks = model.blocks.map((p) => ({ ...p, format }));
        const out = libraryBlockToEditorBlocks(model);
        for (const b of out) {
          expect(
            templateFormat.safeParse(b.format),
            `${format} → ${b.format} no es un templateFormat válido`,
          ).toMatchObject({ success: true });
        }
      }
    });

    it('respeta un templateFormat que ya es válido (bloque creado en la Biblioteca)', () => {
      const model: BlockEditorModel = { ...block52(), format: 'strength_block' };
      model.blocks = [part(0, [item(0, 'Front Squat', STEADY_ROW)], 'Fuerza')];
      model.blocks[0]!.format = 'strength_block';

      expect(libraryBlockToEditorBlocks(model)[0]!.format).toBe('strength_block');
    });
  });
});
