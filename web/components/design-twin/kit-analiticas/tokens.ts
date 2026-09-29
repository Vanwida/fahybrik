// LOS TOKENS DE LAS ANALÍTICAS — dos PIELES para un solo dibujo.
//
// «Un cálculo, dos pintores» (A1) vale también para los gráficos: el mismo
// componente SVG pinta la portada del atleta (iPhone, sobre el lenguaje del
// vivo firmado el 28-09) y la pestaña Rendimiento del coach (panel v2, con
// sus tokens `--v2-*`). Lo que cambia es la PIEL: colores, cara y cuerpo del
// texto, radios. Ningún gráfico escribe un hex ni un `fontSize`: tira de aquí.
//
// ── EL COLOR ─────────────────────────────────────────────────────────────────
// · Naranja: SOLO acción (el vivo, I8). Ningún gráfico lo usa como dato.
// · Zonas: el espectro del coach en el iPhone (`espectroZonas`, el del vivo);
//   el azul secuencial del panel en el coach (`--v2-z*`). Cada superficie con
//   la escala de zona que ya tiene: no se inventa una tercera.
// · Familias: UNA paleta para las dos superficies. Se eligió por MEDIDA, no a
//   ojo: los tonos de modalidad de Theme.swift (azul/lavanda/rosa) fallan el
//   validador de la skill dataviz (ΔE daltónico 2,3; visión normal 11,5), y
//   el juego del panel v2 (correr azul, ergo verde, fuerza violeta,
//   estaciones magenta) pasa las cinco comprobaciones sobre #141414 (CVD peor
//   15,6 · normal 16,3 · contraste ≥ 3:1). Legenda siempre presente y rótulo
//   directo: la identidad nunca depende solo del color.
// · Plan frente a hecho: el plan es CONTORNO (tinta2, 1,5 pt), lo hecho es
//   RELLENO; la proyección es trazo DISCONTINUO. Se distinguen sin color.
// · El veredicto no cambia de color: cambia la marca (▲▼) y la palabra.
//
// ── EL TEXTO ─────────────────────────────────────────────────────────────────
// iPhone: SF, numeral tabular (`NUMERAL` del vivo), suelo 15 pt en TODO,
// ejes incluidos (CONTRATO-UI §4.1). Panel: Figtree, suelo 12 px (§9.1 del
// contrato del panel), tabular en columnas y ejes.

import { espectroZonas } from '../kit-reloj/tokens';
import { CI, NUMERAL, TI } from '../kit-iphone-vivo/tokens';
import type { FamiliaGrande } from './contrato';
import type { Piel } from '@/components/v2/analiticas/piel';

// La piel, el panel y los colores de familia y zona son del PRODUCTO
// (`components/v2/analiticas/piel.ts`): el doble los importa de allí. Aquí se
// queda solo lo del iPhone — su piel y su escala —, que no tiene hermano web.
export { PIEL_PANEL, colorFamilia, colorZonaDe } from '@/components/v2/analiticas/piel';
export type { Piel } from '@/components/v2/analiticas/piel';

/** Validada con `validate_palette.js --mode dark --surface #141414` (y sobre #161618 en el panel). */
export const FAMILIA_HEX: Record<FamiliaGrande, string> = {
  correr: '#3f9dda',
  ergo: '#41ab77',
  fuerza: '#764ec7',
  'estaciones-wod': '#9d466a',
};

/** «El resto» (calentar, core, movilidad): el gris neutro, que no compite con ninguna familia. */
const RESTO_HEX = '#8a8a93';

/** El orden de apilado: correr abajo (la espina del HYROX), luego ergo, fuerza y estaciones. */
export const ORDEN_FAMILIAS: readonly FamiliaGrande[] = ['correr', 'ergo', 'fuerza', 'estaciones-wod'];

export const PIEL_IPHONE: Piel = {
  id: 'iphone',
  fondo: CI.fondo,
  superficie: CI.superficie,
  superficie2: CI.superficie2,
  carril: CI.carril,
  rejilla: '#26262A',
  tinta: CI.tinta,
  tinta2: CI.tinta2,
  accion: CI.accion,
  sobreAccion: CI.sobreAccion,
  ok: '#34C759',
  aviso: '#FFB340',
  familia: { ...FAMILIA_HEX, otro: RESTO_HEX },
  zonas: espectroZonas(5),
  hecho: CI.tinta,
  plan: CI.tinta2,
  proyeccion: CI.tinta2,
  fuente: NUMERAL.familia,
  numeral: { familia: NUMERAL.familia, peso: NUMERAL.peso, variante: NUMERAL.variante },
  cuerpoEje: TI.etiqueta.cuerpo,
  cuerpoEtiqueta: TI.etiqueta.cuerpo,
  cuerpoDato: TI.dato.cuerpo,
  radio: 18,
  trazo: 2,
  sombra: '0 6px 18px rgba(0,0,0,0.35)',
};

// ---------------------------------------------------------------------------
// La escala del iPhone (por papel, suelo 15 pt)
// ---------------------------------------------------------------------------

export const TA = {
  /** El título de la pestaña (y de un detalle): por encima del título de sección, por debajo del gran título de iOS para que el Estado fijo quepa. */
  pantalla: { cuerpo: 28, peso: 700 },
  /** Título de sección (§4.1: 24 pt, peso fuerte). */
  titulo: { cuerpo: 24, peso: 700 },
  /** La palabra del Estado: categórica, texto, no numeral. */
  palabra: { cuerpo: 26, peso: 700 },
  /** Un dato de la sesión (§4.1: 28 pt); el del vivo, 30. */
  dato: { cuerpo: TI.dato.cuerpo, peso: 600 },
  /** El dato de una fila de progreso o de una celda pequeña. */
  datoMenor: { cuerpo: 22, peso: 600 },
  cuerpo: { cuerpo: TI.cuerpo.cuerpo, peso: 500 },
  cuerpoFuerte: { cuerpo: TI.cuerpo.cuerpo, peso: 600 },
  etiqueta: { cuerpo: TI.etiqueta.cuerpo, peso: 600 },
  nota: { cuerpo: TI.nota.cuerpo, peso: 500 },
  chip: { alto: 34, cuerpo: 15, peso: 600 },
  boton: { alto: 52, cuerpo: 17, peso: 700 },
  suelo: TI.suelo,
} as const;

/** Márgenes del lienzo de analíticas: los del vivo (20) para que la pestaña respire igual. */
export const MARGEN_A = 20;
export const HUECO_A = 12;
/** Aire entre bloques. */
export const ENTRE_BLOQUES = 28;
export const RADIO_A = { celda: 18, chip: 17, hoja: 28 } as const;
