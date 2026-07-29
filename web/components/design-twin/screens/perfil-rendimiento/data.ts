// Los tres estados del atleta, tomados de producción el 28-jul-2026 (lectura
// por HTTP a Neon, solo SELECT). El caso de diseño es el PRIMERO (§6.3).
//
//  · `nuevo`   → atleta 68 «Atleta Demo 2»: alta el 16-jul y nada más. Sin sexo,
//                sin fecha de nacimiento, sin nivel, sin dispositivo, cero filas
//                en athlete_strength_maxes / athlete_zone_profiles /
//                athlete_benchmarks / workout_executions. Es literal.
//  · `alex`    → atleta 64. Lo que de verdad hay hoy: dos 1RM, VO₂ del reloj,
//                CERO zonas (athlete_zone_profiles no tiene ni una fila suya) y
//                la batería 1RM a medias — le falta press banca.
//  · `veterano`→ un año dentro. Único inventado, y por eso el más conservador:
//                los números son plausibles para el nivel, no récords.
//
// La regla de honestidad que gobierna este fichero (docs/DECISIONS.md, 28-jul):
// lo que no se sabe es `null` y la pantalla lo declara. Ningún hueco se rellena
// con un valor «razonable».

export interface Levantamiento {
  label: string;
  kg: number;
  dias: number;
}

export interface EstadoAtleta {
  id: string;
  nombre: string;
  inicial: string;
  nivel: string | null;
  coach: string | null;
  altaHace: string;

  /** Batería de calibración del coach: 4 tests (coach_calibration_tests, coach 60). */
  tests: { completos: number; total: number; empezados: number; ultimoDias: number | null };

  /**
   * Zonas: sin ancla NO hay zonas y no se inventa ninguna (28-jul). El ancla se
   * busca por orden de evidencia: umbral medido → 0,88 × FC máxima medida →
   * 0,88 × Tanaka. `umbralPpm` null = ninguna de las tres.
   */
  zonas: { umbralPpm: number | null; origen: string | null; modalidades: number };

  /** Los tres grandes de la batería 1RM. Solo entra lo medido. */
  fuerza: Levantamiento[];

  /** Catálogo de marcas del coach y cuántas tiene con récord. */
  marcas: { conRecord: number; catalogo: number };

  /** VO₂ máx del reloj. `delta30` null cuando no hay 30 días de historial. */
  vo2: { valor: number; fuente: string; dias: number; delta30: number | null } | null;

  dispositivo: string | null;
}

/** Los tres grandes que pide la Batería 1RM (coach_test_results, test 3). */
export const BATERIA_1RM = ['Sentadilla', 'Peso muerto', 'Press banca'] as const;

export const NUEVO: EstadoAtleta = {
  id: 'nuevo',
  nombre: 'Marta Ruiz',
  inicial: 'M',
  nivel: null,
  coach: 'Pablo Amigo',
  altaHace: 'Alta hoy',
  tests: { completos: 0, total: 4, empezados: 0, ultimoDias: null },
  zonas: { umbralPpm: null, origen: null, modalidades: 0 },
  fuerza: [],
  marcas: { conRecord: 0, catalogo: 12 },
  vo2: null,
  dispositivo: null,
};

export const ALEX: EstadoAtleta = {
  id: 'alex',
  nombre: 'Alex',
  inicial: 'A',
  nivel: 'Intermedio',
  coach: 'Pablo Amigo',
  altaHace: 'Con Pablo desde el 8 de julio',
  // 0 tests completos: la batería 1RM tiene sentadilla y peso muerto, le falta
  // press banca — y los tres resultados son obligatorios (optional=false).
  tests: { completos: 0, total: 4, empezados: 1, ultimoDias: 1 },
  zonas: { umbralPpm: null, origen: null, modalidades: 0 },
  fuerza: [
    { label: 'Sentadilla', kg: 186.7, dias: 1 },
    { label: 'Peso muerto', kg: 245, dias: 2 },
  ],
  marcas: { conRecord: 2, catalogo: 12 },
  // 42,35 el 28-jul (healthkit). Media semanal 41,07 hace 30 días → +1,0.
  vo2: { valor: 42.35, fuente: 'Apple Watch', dias: 0, delta30: 1.0 },
  dispositivo: 'Apple Watch',
};

export const VETERANO: EstadoAtleta = {
  id: 'veterano',
  nombre: 'Nacho Prat',
  inicial: 'N',
  nivel: 'Avanzado',
  coach: 'Pablo Amigo',
  altaHace: 'Con Pablo desde hace 1 año',
  tests: { completos: 4, total: 4, empezados: 0, ultimoDias: 12 },
  zonas: { umbralPpm: 163, origen: 'Umbral medido · 5K del 12 jul', modalidades: 3 },
  fuerza: [
    { label: 'Sentadilla', kg: 190, dias: 12 },
    { label: 'Peso muerto', kg: 250, dias: 12 },
    { label: 'Press banca', kg: 122.5, dias: 12 },
  ],
  marcas: { conRecord: 9, catalogo: 12 },
  vo2: { valor: 52.8, fuente: 'Apple Watch', dias: 0, delta30: 0.6 },
  dispositivo: 'Apple Watch',
};

export const ESTADOS: Record<string, EstadoAtleta> = {
  nuevo: NUEVO,
  alex: ALEX,
  veterano: VETERANO,
};

/**
 * Copy EXACTO de las cinco filas de hoy (ProfileView.swift, `profileRowContent`).
 * Se transcribe literal porque el escenario «HOY» tiene que ser fiel: si lo
 * suavizo, el problema deja de verse.
 */
export const FILAS_HOY = [
  { titulo: 'Tus tests', subtitulo: 'Benchmarks con tu progreso · pruébate y calibra tus zonas' },
  { titulo: 'Tus marcas', subtitulo: 'Pruébate cuando quieras · 1 km, Cooper, 5K, remo y ski' },
  { titulo: 'Tu VO₂ máx', subtitulo: 'El techo de tu motor aeróbico · de tu reloj o del Cooper de 12 min' },
  { titulo: 'Mis zonas de ritmo', subtitulo: 'Tus bandas por modalidad · carrera /km, remo y ski /500m' },
  { titulo: 'Mi fuerza', subtitulo: 'Tus 1RM por levantamiento · sentadilla, peso muerto, press…' },
] as const;

/** Las cuatro filas de `settingsCard`, que hoy pintan etiqueta y valor a 13/13. */
export const AJUSTES_HOY = [
  { label: 'Modalidad', valor: 'HYROX' },
  { label: 'Suscripción', valor: 'Activa' },
  { label: 'Objetivo', valor: 'Mejorar en HYROX' },
  { label: 'Idioma', valor: 'Español' },
] as const;
