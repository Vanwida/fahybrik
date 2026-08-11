// El error del alta, en su propio módulo para que `intake.ts` (el commit) y
// `intake-plan.ts` (lo que ese commit pone en pie) puedan lanzarlo los dos sin
// importarse en círculo. `@/lib/coach/intake` lo sigue reexportando: los
// llamadores de siempre no se enteran.

export class IntakeError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = 'IntakeError';
  }
}
