// Serie de TRABAJO vs aproximación / salto. Un solo predicado para volumen,
// serie más pesada y carga de fuerza (card 155).
//
// Dos ejes ortogonales.
//   status: ¿la hizo? done | scaled | skipped
//   is_approach: ¿qué clase? trabajo (false/ausente) | aproximación
//
// Ausente = trabajo.
//
// DÓNDE VIVE LA MARCA (card 178)
// La prescripción ya la lleva (`sets[].is_approach`, card 151). Al ejecutar,
// el snapshot de esa prescripción queda en `segment_executions.prescription_snapshot`
// (mig 0120 — esa columna SÍ está en el esquema de producción).
// `set_executions.is_approach` (mig 0207) no está en producción. Nombrarla
// en SQL es inventar una columna: 42703. Un esquema. El SQL no la nombra.
// Se resuelve aquí, del snapshot, y `isWorkingSet` filtra en JS.

export function approachFromPrescription(snapshot: unknown, setIndex: number): boolean | undefined {
  if (snapshot == null || typeof snapshot !== 'object') return undefined;
  const sets = (snapshot as { sets?: unknown }).sets;
  if (!Array.isArray(sets)) return undefined;
  const raw = sets[setIndex - 1];
  if (raw == null || typeof raw !== 'object') return undefined;
  const v = (raw as { is_approach?: unknown }).is_approach;
  return typeof v === 'boolean' ? v : undefined;
}

/** Cable manda; si omite, se lee la prescripción. Ausente en las dos = trabajo. */
export function resolveIsApproach(
  wire: boolean | undefined,
  snapshot: unknown,
  setIndex: number,
): boolean {
  if (typeof wire === 'boolean') return wire;
  return approachFromPrescription(snapshot, setIndex) === true;
}

export function isWorkingSet(set: {
  status?: string | null;
  is_approach?: boolean | null;
}): boolean {
  if (set.status === 'skipped') return false;
  return set.is_approach !== true;
}
