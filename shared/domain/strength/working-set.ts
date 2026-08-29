// Serie de TRABAJO vs aproximación / salto. Un solo predicado para volumen,
// serie más pesada y carga de fuerza (card 155).
//
// Dos ejes ortogonales.
//   status: ¿la hizo? done | scaled | skipped
//   is_approach: ¿qué clase? trabajo (false/ausente) | aproximación
//
// Ausente = trabajo. Así ninguna fila anterior a 0207 cambia de significado.
// El SQL que filtra set_executions debe espejar esto via SET_IS_WORKING
// (`web/lib/execution/set-work.ts`), no copiando el coalesce a mano.

export function isWorkingSet(set: {
  status?: string | null;
  is_approach?: boolean | null;
}): boolean {
  if (set.status === 'skipped') return false;
  return set.is_approach !== true;
}
