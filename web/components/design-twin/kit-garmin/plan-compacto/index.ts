// PLAN COMPACTO — el formato que lleva una sesión al reloj Garmin.
// El códec vive en shared (lo usan también el servidor y el endpoint del plan):
// `shared/domain/watch-plan/plan-compacto`. Diseño, medidas y huecos del modelo:
// docs/garmin-reloj/plan-compacto.md.

export * from '@fahybrid/shared/domain/watch-plan/plan-compacto';
