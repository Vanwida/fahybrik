// Deshacer hecho — el veredicto de la escritura.
//
// Hecho en el Plan es `workout_assignments.status`. Deshacer es una escritura:
// o borra a la primera (no hay trabajo real), o pide confirmación (sí lo hay).
// El cliente no adivina: reacciona a `needs_confirmation`.
//
// Qué cuenta como trabajo real lo decide el SELECT del route (duración, RPE,
// notas, score, tramos). Aquí solo se aplica esa respuesta. Un import pasivo
// no entra en esta función: no debió flippear el día (card 183).

export type SessionResetVerdict =
  | { action: 'already_scheduled' }
  | { action: 'not_undoable' }
  | { action: 'needs_confirmation' }
  | { action: 'reset' };

export function verdictForSessionReset(input: {
  status: string;
  hasRecordedWork: boolean;
  confirm: boolean;
}): SessionResetVerdict {
  if (input.status === 'scheduled') return { action: 'already_scheduled' };
  if (input.status !== 'completed' && input.status !== 'partial') {
    return { action: 'not_undoable' };
  }
  if (input.hasRecordedWork && !input.confirm) {
    return { action: 'needs_confirmation' };
  }
  return { action: 'reset' };
}
