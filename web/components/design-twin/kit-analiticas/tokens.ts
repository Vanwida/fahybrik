// LOS TOKENS DE LAS ANALÍTICAS — dos PIELES para un solo dibujo.
//
// «Un cálculo, dos pintores» (A1) vale también para los gráficos: el mismo
// componente SVG pinta la pestaña del atleta (iPhone, con el diseño de «Hoy ·
// El día») y la pestaña Rendimiento del coach (panel v2, con sus `--v2-*`). Lo
// que cambia es la PIEL: colores, cara y cuerpo del texto, radios. Ningún
// gráfico escribe un hex ni un `fontSize`: tira de aquí.
//
// ── LA PIEL DEL IPHONE SALE DE LOS TOKENS DEL TEMA ────────────────────────────
// Fondo, superficies, tinta, tinta2, acción, ok y aviso son `var(--twin-*)`: el
// atleta elige el tema (CONTRATO-UI §6.4) y la pestaña sigue a las otras cuatro
// en claro y en oscuro sin una línea por apariencia. Lo único que el tema no
// trae son los colores de DATO (las cuatro familias y las cinco zonas): esos
// viven aquí, una vez por apariencia, y `cssPaleta()` los baja a variables
// `--an-*` que cuelgan de `.an-raiz` (la raíz de cada pantalla de analíticas).
//
// ── EL COLOR ─────────────────────────────────────────────────────────────────
// · Naranja: acento del club. Acción y marca, jamás un dato ni una familia
//   (el club puede tener otro acento: el gráfico no se rompe).
// · Familias: UNA paleta por apariencia, elegida por MEDIDA con el validador de
//   la skill dataviz (sus resultados, en `kit-analiticas.test.ts`):
//     oscuro  #3f9dda #41ab77 #764ec7 #9d466a  sobre #141416 · CVD peor 14,8 ·
//             visión normal peor 16,3 · contraste ≥ 3:1 (todos los pares)
//     claro   #237dee #1d661b #7625a0 #d1598c  sobre #f6f7f9 · CVD peor 15,4 ·
//             visión normal peor 22,6 · contraste ≥ 3,5:1 (todos los pares): la
//             holgura sobre 3:1 es a propósito, para que una línea al 90 % de
//             opacidad (la chispa de una fila) siga por encima de 3:1
//   Los tonos de modalidad de Theme.swift fallan el validador (ΔE daltónico
//   2,3): por eso no se usan. Leyenda siempre presente y rótulo directo: la
//   identidad nunca depende solo del color.
// · Zonas: el espectro del coach (pizarra → azul → verde → ámbar → rojo). En
//   oscuro es el del vivo (`espectroZonas`); en claro, su equivalente con
//   contraste ≥ 3:1 sobre la superficie. Son un ESPECTRO ordenado: se
//   distinguen por orden y por rótulo (Z1…Z5), no solo por tono.
// · Plan frente a hecho: el plan es CONTORNO (tinta2), lo hecho es RELLENO; la
//   proyección es trazo DISCONTINUO. Se distinguen sin color.
// · El veredicto no cambia el color de la cifra: cambia la marca (▲▼≈) y la
//   palabra. El color de estado va en la marca y en el arco, nunca en el número.
//
// ── EL TEXTO ─────────────────────────────────────────────────────────────────
// iPhone: SF, cifras tabulares, cursiva pesada solo en las cifras de héroe (≥ 28)
// y en los títulos; suelo 15 pt en TODO, ejes incluidos (CONTRATO-UI §4.1).
// Panel: Figtree, suelo 12 px, tabular en columnas y ejes.

import { RADIO, TAM } from '../kit-dia/tokens';
import { espectroZonas } from '../kit-reloj/tokens';
import type { FamiliaGrande } from './contrato';
import type { Piel } from '@/components/v2/analiticas/piel';

// La piel, el panel y los colores de familia y zona son del PRODUCTO
// (`components/v2/analiticas/piel.ts`): el doble los importa de allí. Aquí se
// queda solo lo del iPhone: su piel, su paleta y su escala, que no tiene hermano web.
export { PIEL_PANEL, colorFamilia, colorZonaDe } from '@/components/v2/analiticas/piel';
export type { Piel } from '@/components/v2/analiticas/piel';

// ---------------------------------------------------------------------------
// La paleta de dato: una por apariencia
// ---------------------------------------------------------------------------

export type Apariencia = 'oscuro' | 'claro';

export const FAMILIA_HEX: Record<Apariencia, Record<FamiliaGrande, string>> = {
  oscuro: { correr: '#3f9dda', ergo: '#41ab77', fuerza: '#764ec7', 'estaciones-wod': '#9d466a' },
  claro: { correr: '#237dee', ergo: '#1d661b', fuerza: '#7625a0', 'estaciones-wod': '#d1598c' },
};

/** Las cinco zonas del coach. Oscuro = el espectro del vivo; claro = el mismo orden con ≥ 3:1 sobre la superficie clara. */
export const ZONAS_HEX: Record<Apariencia, readonly string[]> = {
  oscuro: espectroZonas(5),
  claro: ['#5f86b3', '#1a62b5', '#0f6e3c', '#b36b00', '#bc2a2a'],
};

/** El orden de apilado: correr abajo (la espina del HYROX), luego ergo, fuerza y estaciones. */
export const ORDEN_FAMILIAS: readonly FamiliaGrande[] = ['correr', 'ergo', 'fuerza', 'estaciones-wod'];

/**
 * Una superficie un paso por encima de la tarjeta que se ve en claro Y en oscuro: la banda de la basal de una
 * gráfica y el fondo de su tooltip. `--twin-surface-elevated` no vale: en claro es blanco sobre una tarjeta casi
 * blanca y la banda «gris» desaparece. Un velo de la tinta del tema sobre la superficie es gris en las dos.
 */
export const SUPERFICIE2 = 'color-mix(in srgb, var(--twin-fg) 8%, var(--twin-surface))';

/**
 * El gris de apoyo un paso más fuerte, para la gráfica de frescura: sus barras pasadas se dibujan al 55 % de
 * opacidad (el día de hoy, entero) y con el gris del tema quedaban en 2,65:1 y 2,69:1. Mezclado un 55 % con la
 * tinta, las barras pasan de 3:1 en claro y en oscuro y el texto de sus ejes sigue por encima de 4,5:1.
 */
export const TINTA2_FUERTE = 'color-mix(in srgb, var(--twin-fg) 55%, var(--twin-muted))';

/** El color de la chispa de una fila: la familia un 12 % hacia la tinta, para que el trazo al 90 % de opacidad no baje de 3:1 (en oscuro el violeta y el rosa quedaban en 2,8 y 2,7). */
export const chispaDe = (color: string) => `color-mix(in srgb, ${color} 88%, var(--twin-fg))`;

const VAR_FAMILIA = (f: FamiliaGrande) => `--an-fam-${f}`;
const VAR_ZONA = (i: number) => `--an-z${i + 1}`;

/** Las dos reglas que bajan la paleta a variables, bajo la raíz de la pantalla y por apariencia del doble. */
export function cssPaleta(): string {
  const regla = (a: Apariencia) => {
    const dec = [
      ...ORDEN_FAMILIAS.map((f) => `${VAR_FAMILIA(f)}: ${FAMILIA_HEX[a][f]};`),
      ...ZONAS_HEX[a].map((hex, i) => `${VAR_ZONA(i)}: ${hex};`),
    ];
    return `.twin-root[data-appearance='${a === 'oscuro' ? 'dark' : 'light'}'] .an-raiz { ${dec.join(' ')} }`;
  };
  return `${regla('oscuro')}\n${regla('claro')}\n.an-raiz { --an-superficie2: ${SUPERFICIE2}; --an-tinta2-fuerte: ${TINTA2_FUERTE}; }`;
}

// ---------------------------------------------------------------------------
// La piel del iPhone
// ---------------------------------------------------------------------------

export const PIEL_IPHONE: Piel = {
  id: 'iphone',
  fondo: 'var(--twin-bg)',
  superficie: 'var(--twin-surface)',
  superficie2: 'var(--an-superficie2)',
  carril: 'var(--twin-hairline-strong)',
  rejilla: 'var(--twin-hairline-strong)',
  tinta: 'var(--twin-fg)',
  tinta2: 'var(--twin-muted)',
  accion: 'var(--twin-accent)',
  sobreAccion: 'var(--twin-accent-on)',
  ok: 'var(--twin-ok)',
  aviso: 'var(--twin-warning)',
  familia: {
    correr: `var(${VAR_FAMILIA('correr')})`,
    ergo: `var(${VAR_FAMILIA('ergo')})`,
    fuerza: `var(${VAR_FAMILIA('fuerza')})`,
    'estaciones-wod': `var(${VAR_FAMILIA('estaciones-wod')})`,
    // «El resto» (calentar, core, movilidad): el gris neutro del tema, que no compite con ninguna familia.
    otro: 'var(--twin-neutral)',
  },
  zonas: ZONAS_HEX.oscuro.map((_, i) => `var(${VAR_ZONA(i)})`),
  hecho: 'var(--twin-fg)',
  plan: 'var(--twin-muted)',
  proyeccion: 'var(--twin-muted)',
  fuente: 'var(--twin-font-sans)',
  numeral: { familia: 'var(--twin-font-sans)', peso: 800, variante: 'tabular-nums' },
  cuerpoEje: TAM.suelo,
  cuerpoEtiqueta: TAM.suelo,
  cuerpoDato: TAM.dato,
  radio: RADIO.fila,
  trazo: 2,
  sombra: 'var(--twin-shadow-card)',
};

/** La piel de la gráfica de frescura (`Divergente`): la del iPhone con el gris de apoyo más fuerte (ver `TINTA2_FUERTE`). */
export const PIEL_IPHONE_DIVERGENTE: Piel = { ...PIEL_IPHONE, tinta2: 'var(--an-tinta2-fuerte)' };

// ---------------------------------------------------------------------------
// Medidas propias de la pestaña (el resto sale de `kit-dia/tokens`)
// ---------------------------------------------------------------------------

/** Aire entre secciones: las de analíticas son más densas que las de Hoy y piden un punto más. */
export const ENTRE_SECCIONES = 30;
/** Hueco entre teselas de una rejilla. */
export const HUECO_TESELAS = 12;
/** Una cifra de fila (una familia, un récord, una sesión): por debajo del dato de tesela (32) y por encima del cuerpo (17). */
export const DATO_FILA = 22;
/** Desde este cuerpo una cifra es «de héroe» y va en cursiva pesada; por debajo va recta (se compara en columna). */
export const CUERPO_HEROE = 28;
