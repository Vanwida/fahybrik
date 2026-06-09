// Labels legibles para `blocks.format` (set coarse de `blockFormat`, schema
// blocks.ts). Distinto del enum técnico `templates.format` (week-day-part-presets).
// Única fuente de verdad del label mostrado en la Biblioteca.

const BLOCK_FORMAT_LABEL: Record<string, string> = {
  strength_block: 'Fuerza',
  plyometric: 'Pliométrico',
  erg_intervals: 'Ergómetros',
  run_intervals: 'Running',
  zone2: 'Zona 2',
  metcon: 'Metcon',
  race_sim: 'Simulación',
  core_mobility: 'Core / Movilidad',
  functional_circuit: 'Circuito',
  tapering: 'Tapering',
};

/** Label legible de un `blocks.format`, o el valor con guiones bajos sustituidos. */
export function blockFormatLabel(format: string | null): string | null {
  if (!format) return null;
  return BLOCK_FORMAT_LABEL[format] ?? format.replace(/_/g, ' ');
}
