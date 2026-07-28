// Tokens y datos de ejemplo del hub de dispositivos.
//
// Espaciados y radios son los de Theme.swift (Spacing xs4·s8·m12·l16·xl24·xxl32,
// Radius s6·m10·l14·xl20). Los colores NUNCA se escriben aquí: salen de las vars
// --twin-* de twin.css, que ya son el espejo de Theme.Color.

export const SP = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 } as const;
export const R = { s: 6, m: 10, l: 14, xl: 20 } as const;

/** Padding horizontal/vertical de las filas de Perfil (ProfileView.deviceRowContent). */
export const ROW_PAD = { x: 14, y: 14 } as const;

// ---------------------------------------------------------------------------
// Datos de ejemplo — el equipo de un atleta coherente. Nada de esto es una
// capacidad inventada: cada valor cae en un hueco que la app ya pinta.
// ---------------------------------------------------------------------------

/** Carreras que el planificador ya dejó en la app Entrenamiento del reloj. */
export const CARRERAS_EN_RELOJ = 3;

/** El erg recordado: la app guarda el nombre anunciado por el monitor. */
export const PM5_RECORDADO = 'PM5 430512345';

/** Los PM5 que aparecen al escanear en la sala (orden de descubrimiento). */
export const PM5_CERCANOS: ReadonlyArray<{ id: string; nombre: string }> = [
  { id: 'erg-430512345', nombre: 'PM5 430512345' },
  { id: 'erg-430518872', nombre: 'PM5 430518872 Ski' },
];

/** Host real del OAuth de Polar (web/lib/polar/config.ts → authorize). */
export const POLAR_AUTH_HOST = 'auth.polar.com';

/** Host donde aterriza el callback y se pinta la página de resultado propia. */
export const APP_HOST = 'app.fahybrid.com';

/** Email + código que WearablesService.garminPairCode devuelve para copiar. */
export const GARMIN_PAIR = { email: 'marc.puig@icloud.com', code: '481-902' } as const;
