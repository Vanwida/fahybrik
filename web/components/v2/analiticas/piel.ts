// LA PIEL DE LOS GRÁFICOS — «un cálculo, dos pintores» (A1) vale también para
// el dibujo: el mismo componente SVG pinta la pestaña Rendimiento del coach
// (esta piel, con los tokens `--v2-*` del panel) y las propuestas del iPhone
// del doble (su `PIEL_IPHONE`, en `design-twin/kit-analiticas/tokens.ts`). Lo
// que cambia es la PIEL: colores, cara y cuerpo del texto, radios. Ningún
// gráfico escribe un hex ni un `fontSize`: tira de aquí.
//
// EL COLOR (decidido y medido en DECISIONS 2026-09-29, propuestas §6):
//   · Naranja: SOLO acción. Ningún gráfico lo usa como dato.
//   · Zonas: el azul secuencial del panel (`--v2-z*`).
//   · Familias: correr azul, ergo verde, fuerza violeta, estaciones y WOD
//     magenta (`--v2-mod-*`), validados con la skill dataviz; «el resto»
//     (calentar, core, movilidad) en el gris neutro de calentamiento, que no
//     compite con ninguna.
//   · Plan frente a hecho: el plan es CONTORNO, lo hecho RELLENO, la proyección
//     DISCONTINUA: se distinguen sin color.
//
// EL TEXTO: Figtree, suelo 12 px (CONTRATO-UI §9.1), cifras tabulares.

import type { Familia } from '@fahybrid/shared/domain/analytics/lectura';

/**
 * Las familias GRANDES — las que caben en una barra apilada (≤ 5 series): las
 * cuatro del contrato y «el resto» (calentamiento, core, movilidad), que el
 * motor cuenta como `otro` y que cuenta tiempo aunque no tenga «¿mejoro?».
 */
export type FamiliaGrande = 'correr' | 'ergo' | 'fuerza' | 'estaciones-wod' | 'otro';

export const FAMILIA_GRANDE: Record<Familia, FamiliaGrande> = {
  correr: 'correr',
  remo: 'ergo',
  ski: 'ergo',
  bici: 'ergo',
  fuerza: 'fuerza',
  estaciones: 'estaciones-wod',
  wod: 'estaciones-wod',
  otro: 'otro',
};

export const FAMILIA_GRANDE_NOMBRE: Record<FamiliaGrande, string> = {
  correr: 'Correr',
  ergo: 'Ergo',
  fuerza: 'Fuerza',
  'estaciones-wod': 'Estaciones y WOD',
  otro: 'Resto',
};

/** El orden de apilado: correr abajo (la espina del HYROX), luego ergo, fuerza, estaciones y el resto arriba. */
export const ORDEN_FAMILIAS: readonly FamiliaGrande[] = ['correr', 'ergo', 'fuerza', 'estaciones-wod', 'otro'];

export interface Piel {
  id: 'iphone' | 'panel';
  fondo: string;
  superficie: string;
  superficie2: string;
  /** El carril apagado, la pista de una barra. */
  carril: string;
  /** La rejilla y los ejes: una sola línea fina, sólida, un paso por encima de la superficie. */
  rejilla: string;
  tinta: string;
  tinta2: string;
  /** Solo acción. */
  accion: string;
  sobreAccion: string;
  ok: string;
  aviso: string;
  familia: Record<FamiliaGrande, string>;
  /** Z1…ZN del coach. */
  zonas: string[];
  /** Lo hecho (relleno) y el plan (contorno). */
  hecho: string;
  plan: string;
  proyeccion: string;
  fuente: string;
  numeral: { familia: string; peso: number; variante: string };
  /** Cuerpo del texto de eje y leyenda, y del rótulo directo. */
  cuerpoEje: number;
  cuerpoEtiqueta: number;
  cuerpoDato: number;
  radio: number;
  /** Grosor de una línea de dato. */
  trazo: number;
  /** La sombra de lo que flota sobre el gráfico (el tooltip). */
  sombra: string;
}

export const PIEL_PANEL: Piel = {
  id: 'panel',
  fondo: 'var(--v2-bg)',
  superficie: 'var(--v2-surface)',
  superficie2: 'var(--v2-surface-2)',
  carril: 'var(--v2-surface-2)',
  rejilla: 'var(--v2-border)',
  tinta: 'var(--v2-fg)',
  tinta2: 'var(--v2-muted)',
  accion: 'var(--v2-accent)',
  sobreAccion: 'var(--v2-accent-fg)',
  ok: 'var(--v2-ok)',
  aviso: 'var(--v2-warn)',
  familia: {
    correr: 'var(--v2-mod-carrera)',
    ergo: 'var(--v2-mod-ergo)',
    fuerza: 'var(--v2-mod-fuerza)',
    'estaciones-wod': 'var(--v2-mod-circuito)',
    otro: 'var(--v2-mod-calentamiento)',
  },
  zonas: ['var(--v2-z1)', 'var(--v2-z2)', 'var(--v2-z3)', 'var(--v2-z4)', 'var(--v2-z5)'],
  hecho: 'var(--v2-fg)',
  plan: 'var(--v2-muted)',
  proyeccion: 'var(--v2-muted)',
  fuente: 'var(--v2-font-sans)',
  numeral: { familia: 'var(--v2-font-sans)', peso: 600, variante: 'tabular-nums' },
  cuerpoEje: 12,
  cuerpoEtiqueta: 12,
  cuerpoDato: 28,
  radio: 10,
  trazo: 2,
  sombra: 'var(--v2-shadow-pop)',
};

/** ¿Es una familia grande (y no una fina)? */
function esGrande(f: string): f is FamiliaGrande {
  return (ORDEN_FAMILIAS as readonly string[]).includes(f);
}

/** El color de una familia fina es el de su familia grande: remo, ski y bici son «ergo». */
export function colorFamilia(piel: Piel, f: Familia | FamiliaGrande): string {
  const grande: FamiliaGrande = esGrande(f) ? f : FAMILIA_GRANDE[f as Familia] ?? 'otro';
  return piel.familia[grande];
}

/** Z1…ZN: fuera de rango cae al extremo (nunca al naranja, nunca a gris de tinta). */
export function colorZonaDe(piel: Piel, zona: number): string {
  const i = Math.min(piel.zonas.length, Math.max(1, Math.round(zona))) - 1;
  return piel.zonas[i]!;
}
