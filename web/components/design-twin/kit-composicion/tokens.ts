// Tokens de composición del doble — espejo de ios/FAHYBRIK/Theme/Theme.swift.
//
// Existen porque el §0 del CONTRATO-UI manda usar el sitio compartido antes de
// escribir un número suelto, y las pantallas del censo (Chat: 1197 líneas, CERO
// `Theme.Spacing`) demuestran qué pasa cuando no lo hay. Estas cuatro pantallas
// se montan SOLO con estos valores.

/** Theme.Spacing (Theme.swift). */
export const S = {
  xs: 4,
  s: 8,
  m: 12,
  l: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

/** Theme.Radius (Theme.swift). */
export const R = {
  s: 6,
  m: 10,
  l: 14,
  xl: 20,
  pill: 9999,
} as const;

/**
 * Métricas del lienzo lógico (DeviceFrame: clase iPhone 17 Pro, 402×874 pt).
 * Sirven para MEDIR el alto muerto de las pantallas de hoy, que es lo que hay
 * que poder ver para aprobar el arreglo.
 */
export const LIENZO = {
  ancho: 402,
  alto: 874,
  safeTop: 59,
  safeBottom: 34,
  /** Alto realmente disponible para contenido en retrato. */
  get util() {
    return this.alto - this.safeTop - this.safeBottom; // 781
  },
} as const;

/** Alturas de cromo fijas, tomadas de la app. */
export const CROMO = {
  /** Barra de navegación en línea (UINavigationBar compacta). */
  navBar: 44,
  /** Barra de pestañas del TabView (Inicio · Plan · Analíticas · Carreras · Perfil). */
  tabBar: 49,
  /** Altura de ExpertPrimaryButton en el hub de tests (`height: 46`). */
  ctaTests: 46,
  /** Altura de la CTA primaria del doble (tw-btn-primary). */
  cta: 54,
} as const;

/**
 * Las cuatro estrategias de altura del §6.1. Una pantalla DECLARA la suya;
 * alinear arriba y dejar el resto muerto no es una de ellas.
 */
export type Estrategia = 'llena' | 'centra' | 'previsualiza' | 'gobierna';

export const ESTRATEGIA_LABEL: Record<Estrategia, string> = {
  llena: 'llena',
  centra: 'centra',
  previsualiza: 'previsualiza',
  gobierna: 'gobierna',
};
