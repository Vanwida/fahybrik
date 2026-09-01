import { describe, expect, it } from 'vitest';
import { contrastRatio, hexToRgb } from '@fahybrid/shared/domain/coach/club-accent';

// CONTRATO-UI §4.2: «se mide, no se estima». Card 124: Alex, viendo la app
// real, dijo que los contrastes eran «muy suaves» — este test es la medida.
//
// Los hex de abajo son un ESPEJO de los tokens reales de
// `app/[locale]/(design)/design/twin.css` (igual que `club-accent.ts` ya
// espeja `v2-theme.css`/`Theme.swift` en `CANVAS_LIGHT`/`CANVAS_DARK`): si esa
// hoja cambia un color, este test se queda desincronizado y hay que traer los
// valores de nuevo — no hay una tercera fuente que los derive.
//
// La pantalla se construyó para que TODO texto nuevo caiga sobre uno de DOS
// fondos SÓLIDOS conocidos — `--twin-surface` (la tarjeta de cada sección) o
// `--twin-surface-elevated` (una fila del desglose dentro de ella) — así el
// contraste real no depende del tinte de `Ambiente`, que cambia con la zona.

const SUPERFICIE = {
  dark: { surface: '#141416', surfaceElevated: '#1c1c1f' },
  light: { surface: '#f6f7f9', surfaceElevated: '#ffffff' },
} as const;

const TEXTO = {
  dark: {
    fg: '#f5f3f0',
    muted: '#9a938b',
    ok: '#3fc773',
    warning: '#f2a52e',
    z1: '#c7c7c7',
    z2: '#4d9eeb',
    z3: '#4dc773',
    z4: '#f2b833',
    z5: '#eb4d4d',
    modalityStrength: '#b49bee',
    modalityFunctional: '#4fd08a',
    modalityHyrox: '#ee7acf',
    modalitySupport: '#3bd0be',
  },
  light: {
    fg: '#0f1217',
    muted: '#474d55',
    ok: '#157a45',
    warning: '#8a5a00',
    z1: '#565c63',
    z2: '#1a62b5',
    z3: '#0f6e3c',
    z4: '#8a5a00',
    z5: '#bc2a2a',
    modalityStrength: '#6a46b0',
    modalityFunctional: '#17834a',
    modalityHyrox: '#bd2493',
    modalitySupport: '#0e7c72',
  },
} as const;

type Tema = keyof typeof SUPERFICIE;
const TEMAS: Tema[] = ['dark', 'light'];

function ratio(colorHex: string, fondoHex: string): number {
  const c = hexToRgb(colorHex);
  const f = hexToRgb(fondoHex);
  if (!c || !f) throw new Error(`hex inválido: ${colorHex} / ${fondoHex}`);
  return contrastRatio(c, f);
}

const AA_NORMAL = 4.5;
const AA_GRANDE = 3;

describe('lectura-sesion · contraste WCAG AA (§4.2 del CONTRATO-UI)', () => {
  // ---------------------------------------------------------------------
  // Texto normal (15/17 px, o 15 px en negrita — no llega a los 19 pt en
  // negrita que exige el umbral «grande»): Cabecera, etiquetas de la
  // rejilla, filas del desglose, leyenda de zonas, pie de la gráfica.
  // ---------------------------------------------------------------------
  for (const tema of TEMAS) {
    const sup = SUPERFICIE[tema];
    const txt = TEXTO[tema];

    it(`[${tema}] fg y muted sobre la tarjeta (surface) y sobre una fila (surfaceElevated) cumplen 4,5:1`, () => {
      for (const fondo of [sup.surface, sup.surfaceElevated]) {
        expect(ratio(txt.fg, fondo)).toBeGreaterThanOrEqual(AA_NORMAL);
        expect(ratio(txt.muted, fondo)).toBeGreaterThanOrEqual(AA_NORMAL);
      }
    });

    it(`[${tema}] la leyenda de zonas (15 px, color de zona) cumple 4,5:1 sobre la tarjeta`, () => {
      for (const z of [txt.z1, txt.z2, txt.z3, txt.z4, txt.z5]) {
        expect(ratio(z, sup.surface)).toBeGreaterThanOrEqual(AA_NORMAL);
      }
    });

    it(`[${tema}] las referencias de la gráfica (media en muted, máxima en warning) cumplen 4,5:1`, () => {
      expect(ratio(txt.muted, sup.surface)).toBeGreaterThanOrEqual(AA_NORMAL);
      expect(ratio(txt.warning, sup.surface)).toBeGreaterThanOrEqual(AA_NORMAL);
    });
  }

  // ---------------------------------------------------------------------
  // Texto GRANDE (34 px los valores de la rejilla, 22-24 px italic-bold la
  // cabecera y los títulos de sección): el umbral baja a 3:1. Aquí es donde
  // viven los colores de familia (FC por zona, distancia/ritmo por
  // modalidad) — el «cada familia de dato con su color» de la referencia.
  // ---------------------------------------------------------------------
  for (const tema of TEMAS) {
    const sup = SUPERFICIE[tema];
    const txt = TEXTO[tema];

    it(`[${tema}] fg y ok (título, «Rondas completadas» al completar) cumplen 3:1 a tamaño grande`, () => {
      expect(ratio(txt.fg, sup.surface)).toBeGreaterThanOrEqual(AA_GRANDE);
      expect(ratio(txt.ok, sup.surface)).toBeGreaterThanOrEqual(AA_GRANDE);
    });

    it(`[${tema}] las cinco zonas, como color del valor de FC media/máxima (34 px), cumplen 3:1`, () => {
      for (const z of [txt.z1, txt.z2, txt.z3, txt.z4, txt.z5]) {
        expect(ratio(z, sup.surface)).toBeGreaterThanOrEqual(AA_GRANDE);
      }
    });

    it(`[${tema}] los cuatro colores de modalidad, como color del valor de distancia/ritmo (34 px), cumplen 3:1`, () => {
      for (const m of [txt.modalityStrength, txt.modalityFunctional, txt.modalityHyrox, txt.modalitySupport]) {
        expect(ratio(m, sup.surface)).toBeGreaterThanOrEqual(AA_GRANDE);
      }
    });
  }

  // ---------------------------------------------------------------------
  // No textual que porta significado (§4.2): el trazo de la gráfica de
  // pulso y el glifo del icono de tipo de entreno sobre su círculo teñido.
  // ---------------------------------------------------------------------
  it('el trazo de la gráfica (fg) y sus dos referencias (muted, warning) cumplen 3:1 sobre la tarjeta, en los dos temas', () => {
    for (const tema of TEMAS) {
      const sup = SUPERFICIE[tema];
      const txt = TEXTO[tema];
      expect(ratio(txt.fg, sup.surface)).toBeGreaterThanOrEqual(AA_GRANDE);
      expect(ratio(txt.muted, sup.surface)).toBeGreaterThanOrEqual(AA_GRANDE);
      expect(ratio(txt.warning, sup.surface)).toBeGreaterThanOrEqual(AA_GRANDE);
    }
  });

  it('la tinta del icono de tipo de entreno (negro en oscuro, blanco en claro) cumple 3:1 sobre los cuatro tintes de modalidad', () => {
    const TINTA_OSCURO = '#0b0b0c';
    const TINTA_CLARO = '#ffffff';
    for (const m of [TEXTO.dark.modalityStrength, TEXTO.dark.modalityFunctional, TEXTO.dark.modalityHyrox, TEXTO.dark.modalitySupport]) {
      expect(ratio(TINTA_OSCURO, m)).toBeGreaterThanOrEqual(AA_GRANDE);
    }
    for (const m of [TEXTO.light.modalityStrength, TEXTO.light.modalityFunctional, TEXTO.light.modalityHyrox, TEXTO.light.modalitySupport]) {
      expect(ratio(TINTA_CLARO, m)).toBeGreaterThanOrEqual(AA_GRANDE);
    }
  });
});
