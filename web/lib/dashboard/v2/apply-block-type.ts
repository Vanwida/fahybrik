// Cambiar el TIPO de un bloque que ya existe: mismos ejercicios y la misma
// dosis, otra etiqueta de trabajo. El tipo se elegía solo al crear; si el
// asistente o el coach lo dejaban mal, no había corrección (card 158).
//
// No se inventa dosis. No se borra el nombre. La superserie sigue siendo el
// único caso que mueve el descanso (es de la VUELTA, no de cada serie) — esa
// lógica vive en applyBlockFormat, que este módulo también exporta.

import type { Prescription, PrescriptionSet } from '@fahybrid/shared/domain/prescription';
import type { EditorBlock, EditorItem } from '@/lib/dashboard/v2/editor-types';
import {
  DEFAULT_CIRCUIT_CONFIG,
  archetypeForFormat,
  getArchetype,
  schemeOfArchetype,
  type ArchetypeId,
} from '@/lib/dashboard/v2/archetypes';

/** El tipo que el selector debe mostrar como seleccionado ahora. */
export function selectedArchetypeId(block: EditorBlock): ArchetypeId | '' {
  if (block.archetype_id) return block.archetype_id;
  const fromFormat = archetypeForFormat(block.format);
  if (fromFormat) return fromFormat.id;
  // Series rectas con 2+ ejercicios se guardan como format `sets` SIN arquetipo
  // (si no, el compositor de fuerza esconde el segundo ejercicio). El selector
  // igual tiene que decir Fuerza.
  if (block.format === 'sets') return 'strength';
  return '';
}

function withoutSetRest(set: PrescriptionSet): PrescriptionSet {
  if (set.rest_s === undefined) return set;
  const { rest_s: _rest_s, ...rest } = set;
  void _rest_s;
  return rest;
}

function inheritedRotationRest(first: EditorItem | undefined): number | undefined {
  const p = first?.prescription;
  if (!p) return undefined;
  const setRest = (p.sets ?? []).find((s) => s.rest_s !== undefined)?.rest_s;
  return setRest ?? p.rest_s;
}

function isSupersetBlock(block: EditorBlock): boolean {
  return (
    block.archetype_id === 'superset' ||
    block.format === 'superset' ||
    block.items.some((it) => it.prescription.scheme === 'superset')
  );
}

/**
 * Series rectas ↔ superserie. Extraído del compositor para que cambiar el TIPO
 * a/desde superserie use el mismo camino (un solo sitio mueve el descanso).
 */
export function applyBlockFormat(block: EditorBlock, toSuperset: boolean): EditorBlock {
  const scheme: Prescription['scheme'] = toSuperset ? 'superset' : 'sets';
  const rotationRest = toSuperset ? inheritedRotationRest(block.items[0]) : undefined;
  const items = block.items.map((it) => {
    const prescription: Prescription = { ...it.prescription, scheme };
    if (toSuperset) {
      prescription.sets = (prescription.sets ?? []).map(withoutSetRest);
      if (rotationRest !== undefined) prescription.rest_s = rotationRest;
      else delete prescription.rest_s;
    }
    return { ...it, prescription };
  });

  const { archetype_id: _origin, ...withoutArchetype } = block;
  void _origin;

  if (toSuperset) {
    return { ...withoutArchetype, format: 'superset', archetype_id: 'superset', items };
  }
  if (block.items.length > 1) {
    return { ...withoutArchetype, format: 'sets', items };
  }
  return { ...withoutArchetype, format: 'strength_block', archetype_id: 'strength', items };
}

/**
 * Aplica un tipo del selector a un bloque que YA tiene ejercicios.
 * Conserva título, líneas y dosis; cambia format + scheme para que el chip, el
 * color y el móvil coincidan.
 */
export function applyBlockType(block: EditorBlock, id: ArchetypeId): EditorBlock {
  if (selectedArchetypeId(block) === id) return block;

  if (id === 'superset') return applyBlockFormat(block, true);
  if (id === 'strength') return applyBlockFormat(block, false);

  // Salir de superserie: el descanso de la vuelta vuelve a las series, luego
  // se etiqueta el tipo pedido. Los ejercicios y su dosis no se tocan.
  const base = isSupersetBlock(block) ? applyBlockFormat(block, false) : block;
  const archetype = getArchetype(id);
  const scheme = schemeOfArchetype(id);
  const { archetype_id: _old, circuit: _circuit, ...rest } = base;
  void _old;
  void _circuit;

  const items = base.items.map((it) => ({
    ...it,
    prescription: { ...it.prescription, scheme },
  }));

  return {
    ...rest,
    format: archetype.format,
    archetype_id: id,
    items,
    ...(id === 'circuit_core' ? { circuit: base.circuit ?? DEFAULT_CIRCUIT_CONFIG } : {}),
  };
}
