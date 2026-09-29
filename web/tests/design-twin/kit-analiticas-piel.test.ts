// KIT-ANALITICAS · LA PIEL — lo que se afirma sin mirar una captura sobre el
// diseño de «Hoy · El día» aplicado a las analíticas del iPhone:
//   · la piel sale de los tokens del tema (ningún hex suelto) y funciona en claro y oscuro;
//   · el contraste está MEDIDO en las dos apariencias (texto 4,5:1; marcas que portan significado 3:1),
//     leyendo `twin.css` de verdad (no un espejo de sus hex);
//   · la paleta de familias pasa las comprobaciones del validador de la skill dataviz en las dos
//     apariencias (ΔE en OKLab ×100: visión normal ≥ 15 y daltónica ≥ 8, todos los pares);
//   · el sujeto de la portada dice lo mismo que el contrato en los cuatro estados.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrastRatio, hexToRgb } from '@fahybrid/shared/domain/coach/club-accent';
import { TONOS } from '@/components/design-twin/kit-dia/hero';
import { ESCENARIOS_PORTADA, panelDe } from '@/components/design-twin/kit-analiticas/casos/atletas';
import { estadosDe } from '@/components/design-twin/kit-analiticas/derivados';
import { BANDAS_DISPOSICION_DEFECTO, METODO_DEFECTO, nivelDisposicion, palabraDisposicion } from '@/components/design-twin/kit-analiticas/metodo';
import { unirUnidades } from '@/components/design-twin/kit-analiticas/fmt';
import { TINTE_DE_ESTADO, frase, sujetoEstado } from '@/components/design-twin/kit-analiticas/sujeto';
import { FAMILIA_HEX, PIEL_IPHONE, PIEL_IPHONE_DIVERGENTE, SUPERFICIE2, TINTA2_FUERTE, ZONAS_HEX, chispaDe, cssPaleta, type Apariencia } from '@/components/design-twin/kit-analiticas/tokens';
import { VENTANA_FRASE, VENTANAS, type EstadoFrescuraClave } from '@/components/design-twin/kit-analiticas/contrato';

// ---------------------------------------------------------------------------
// Los tokens del tema, leídos de la hoja del doble
// ---------------------------------------------------------------------------

const CSS = readFileSync(resolve(__dirname, '../../app/[locale]/(design)/design/twin.css'), 'utf8');

function bloque(selector: string): Record<string, string> {
  const i = CSS.indexOf(selector);
  if (i < 0) throw new Error(`twin.css no tiene ${selector}`);
  const cuerpo = CSS.slice(CSS.indexOf('{', i) + 1, CSS.indexOf('}', i));
  const out: Record<string, string> = {};
  for (const m of cuerpo.matchAll(/(--twin-[\w-]+):\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim();
  return out;
}

const TEMA: Record<Apariencia, Record<string, string>> = {
  oscuro: { ...bloque('.twin-root {'), ...bloque(".twin-root[data-appearance='dark'] {") },
  claro: { ...bloque('.twin-root {'), ...bloque(".twin-root[data-appearance='light'] {") },
};

type Rgb = [number, number, number];

/** Un valor del tema (`var(--twin-x)` o `color-mix(in srgb, A n%, B)`) resuelto a rgb. */
function rgbDe(expr: string, a: Apariencia): Rgb {
  const v = expr.match(/^var\((--[\w-]+)\)$/);
  if (v) return rgbDe(TEMA[a][v[1]!] ?? (() => { throw new Error(`token sin resolver: ${v[1]}`); })(), a);
  const m = expr.match(/^color-mix\(in srgb, (.+?) (\d+)%, (.+)\)$/);
  if (m) {
    const t = Number(m[2]) / 100;
    const x = rgbDe(m[1]!, a);
    const y = rgbDe(m[3]!, a);
    return [0, 1, 2].map((k) => Math.round(x[k]! * t + y[k]! * (1 - t))) as Rgb;
  }
  const rgb = hexToRgb(expr);
  if (!rgb) throw new Error(`no es un color opaco: ${expr}`);
  return [rgb.r, rgb.g, rgb.b];
}

const ratio = (a: string, b: string, t: Apariencia) => {
  const x = rgbDe(a, t);
  const y = rgbDe(b, t);
  return contrastRatio({ r: x[0], g: x[1], b: x[2] }, { r: y[0], g: y[1], b: y[2] });
};

const TEMAS: Apariencia[] = ['oscuro', 'claro'];
// Donde se pone texto: el fondo, la tarjeta, la elevada y la banda/tooltip de una gráfica (`superficie2`).
const FONDOS = ['var(--twin-bg)', 'var(--twin-surface)', 'var(--twin-surface-elevated)', SUPERFICIE2];

// ---------------------------------------------------------------------------
// El validador de la skill dataviz (OKLab ×100, Machado 2009 a severidad 1)
// ---------------------------------------------------------------------------

const MACHADO = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
} as const;

const lineal = (h: string): Rgb => (hexToRgb(h) ? ([hexToRgb(h)!.r, hexToRgb(h)!.g, hexToRgb(h)!.b].map((c) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }) as Rgb) : (() => { throw new Error(h); })());

function oklab([r, g, b]: Rgb): Rgb {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

function simular(c: Rgb, tipo: keyof typeof MACHADO): Rgb {
  const M = MACHADO[tipo];
  return M.map((f) => Math.max(0, Math.min(1, f[0]! * c[0] + f[1]! * c[1] + f[2]! * c[2]))) as Rgb;
}

function deltaE(a: string, b: string, tipo?: keyof typeof MACHADO): number {
  const x = oklab(tipo ? simular(lineal(a), tipo) : lineal(a));
  const y = oklab(tipo ? simular(lineal(b), tipo) : lineal(b));
  return 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

function parejas<T>(xs: readonly T[]): Array<[T, T]> {
  return xs.flatMap((x, i) => xs.slice(i + 1).map((y) => [x, y] as [T, T]));
}

// ---------------------------------------------------------------------------

describe('la piel sale de los tokens del tema (claro y oscuro)', () => {
  it('ninguna propiedad de color de la piel es un hex: todas son variables del tema o de la paleta', () => {
    const colores = [PIEL_IPHONE.fondo, PIEL_IPHONE.superficie, PIEL_IPHONE.superficie2, PIEL_IPHONE.carril, PIEL_IPHONE.rejilla, PIEL_IPHONE.tinta, PIEL_IPHONE.tinta2, PIEL_IPHONE.accion, PIEL_IPHONE.sobreAccion, PIEL_IPHONE.ok, PIEL_IPHONE.aviso, PIEL_IPHONE.hecho, PIEL_IPHONE.plan, PIEL_IPHONE.proyeccion, ...Object.values(PIEL_IPHONE.familia), ...PIEL_IPHONE.zonas];
    for (const c of colores) expect(c, c).toMatch(/^var\(--(twin|an)-[\w-]+\)$/);
  });

  it('la paleta baja a variables para las dos apariencias, bajo la raíz de las analíticas', () => {
    const css = cssPaleta();
    expect(css).toContain(".twin-root[data-appearance='dark'] .an-raiz");
    expect(css).toContain(".twin-root[data-appearance='light'] .an-raiz");
    for (const t of TEMAS) {
      for (const hex of [...Object.values(FAMILIA_HEX[t]), ...ZONAS_HEX[t]]) expect(css, hex).toContain(hex);
    }
    // Cada variable que usa la piel está definida.
    const usadas = [...Object.values(PIEL_IPHONE.familia), ...PIEL_IPHONE.zonas, PIEL_IPHONE.superficie2].filter((v) => v.startsWith('var(--an-')).map((v) => v.slice(4, -1));
    for (const v of usadas) expect(css, v).toContain(`${v}:`);
    expect(css).toContain(SUPERFICIE2);
  });

  it('nada por debajo de 15 pt: los ejes, las leyendas y los datos', () => {
    expect(PIEL_IPHONE.cuerpoEje).toBeGreaterThanOrEqual(15);
    expect(PIEL_IPHONE.cuerpoEtiqueta).toBeGreaterThanOrEqual(15);
    expect(PIEL_IPHONE.cuerpoDato).toBeGreaterThanOrEqual(28);
  });
});

describe.each(TEMAS)('contraste medido, tema %s (CONTRATO-UI §4.2)', (t) => {
  it('texto: la tinta y el gris de apoyo a 4,5:1 sobre el fondo, la superficie y la elevada; el acento como texto también', () => {
    for (const f of FONDOS) {
      expect(ratio(PIEL_IPHONE.tinta, f, t), `tinta sobre ${f}`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(PIEL_IPHONE.tinta2, f, t), `tinta2 sobre ${f}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(ratio(PIEL_IPHONE.sobreAccion, PIEL_IPHONE.accion, t)).toBeGreaterThanOrEqual(4.5);
    for (const f of ['var(--twin-bg)', 'var(--twin-surface)']) expect(ratio('var(--twin-accent-text)', f, t), `acento sobre ${f}`).toBeGreaterThanOrEqual(4.5);
  });

  it('marcas que portan significado (familias y zonas) a 3:1 sobre el fondo y la superficie donde se dibujan', () => {
    for (const f of ['var(--twin-bg)', 'var(--twin-surface)']) {
      for (const hex of Object.values(FAMILIA_HEX[t])) expect(ratio(hex, f, t), `${hex} sobre ${f}`).toBeGreaterThanOrEqual(3);
      for (const hex of ZONAS_HEX[t]) expect(ratio(hex, f, t), `${hex} sobre ${f}`).toBeGreaterThanOrEqual(3);
    }
  });

  it.runIf(t === 'claro')('claro: las familias aguantan la chispa (trazo al 90 % de opacidad) por encima de 3:1 sobre la tarjeta', () => {
    const [sr, sg, sb] = rgbDe('var(--twin-surface)', t);
    for (const hex of Object.values(FAMILIA_HEX[t])) {
      const [r, g, b] = rgbDe(hex, t);
      const mezcla = { r: Math.round(r * 0.9 + sr * 0.1), g: Math.round(g * 0.9 + sg * 0.1), b: Math.round(b * 0.9 + sb * 0.1) };
      expect(contrastRatio(mezcla, { r: sr, g: sg, b: sb }), hex).toBeGreaterThanOrEqual(3);
    }
  });

  it('la chispa de una fila (familia un 12 % hacia la tinta, trazo al 90 %) pasa de 3:1 sobre la tarjeta en las dos apariencias', () => {
    const [sr, sg, sb] = rgbDe('var(--twin-surface)', t);
    for (const hex of Object.values(FAMILIA_HEX[t])) {
      const [r, g, b] = rgbDe(chispaDe(hex), t);
      const mezcla = { r: Math.round(r * 0.9 + sr * 0.1), g: Math.round(g * 0.9 + sg * 0.1), b: Math.round(b * 0.9 + sb * 0.1) };
      expect(contrastRatio(mezcla, { r: sr, g: sg, b: sb }), hex).toBeGreaterThanOrEqual(3);
    }
  });

  it('la gráfica de frescura: el gris fuerte da barras pasadas (al 55 %) a 3:1 y ejes a 4,5:1 sobre la tarjeta', () => {
    expect(PIEL_IPHONE_DIVERGENTE.tinta2).toBe('var(--an-tinta2-fuerte)');
    expect(cssPaleta()).toContain(`--an-tinta2-fuerte: ${TINTA2_FUERTE}`);
    const [sr, sg, sb] = rgbDe('var(--twin-surface)', t);
    const [r, g, b] = rgbDe(TINTA2_FUERTE, t);
    const barra = { r: Math.round(r * 0.55 + sr * 0.45), g: Math.round(g * 0.55 + sg * 0.45), b: Math.round(b * 0.55 + sb * 0.45) };
    expect(contrastRatio(barra, { r: sr, g: sg, b: sb })).toBeGreaterThanOrEqual(3);
    expect(ratio(TINTA2_FUERTE, 'var(--twin-surface)', t)).toBeGreaterThanOrEqual(4.5);
  });

  it('el naranja del club no es un color de dato: ni de familia ni de zona', () => {
    const acento = rgbDe('var(--twin-accent)', t).join(',');
    for (const hex of [...Object.values(FAMILIA_HEX[t]), ...ZONAS_HEX[t]]) expect(rgbDe(hex, t).join(','), hex).not.toBe(acento);
  });

  it('el sujeto: la tinta a 4,5:1 sobre cada tinte y la marca de estado a 3:1', () => {
    const marcas: Record<string, string> = { ok: 'var(--twin-ok)', aviso: 'var(--twin-warning)', peligro: 'var(--twin-danger)', info: 'var(--twin-info)', neutra: 'var(--twin-muted)' };
    for (const [clave, { tono, marca }] of Object.entries(TINTE_DE_ESTADO)) {
      const fondo = TONOS[tono].fondo;
      expect(ratio('var(--twin-fg)', fondo, t), `tinta sobre el tinte de ${clave}`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(marcas[marca]!, fondo, t), `marca de ${clave}`).toBeGreaterThanOrEqual(3);
    }
    // El sujeto vacío y el de una familia (neutro) también.
    expect(ratio('var(--twin-fg)', TONOS.neutro.fondo, t)).toBeGreaterThanOrEqual(4.5);
  });

  it('el arco de la disposición (bajo, medio, alto) y las marcas ▲ ▼ a 3:1 sobre la superficie y el tinte neutro', () => {
    for (const c of ['var(--twin-danger)', 'var(--twin-warning)', 'var(--twin-ok)']) {
      for (const f of ['var(--twin-surface)', TONOS.neutro.fondo, TONOS.ok.fondo, TONOS.info.fondo]) expect(ratio(c, f, t), `${c} sobre ${f}`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe.each(TEMAS)('la paleta de familias pasa el validador de dataviz, tema %s', (t) => {
  const paleta = Object.values(FAMILIA_HEX[t]);
  const pares = parejas(paleta);

  it('separación para daltónicos (protanopia y deuteranopia) ≥ 8 en todos los pares', () => {
    for (const [a, b] of pares) for (const tipo of ['protan', 'deutan'] as const) expect(deltaE(a, b, tipo), `${a} ↔ ${b} (${tipo})`).toBeGreaterThanOrEqual(8);
  });

  it('separación con visión normal ≥ 15 en todos los pares', () => {
    for (const [a, b] of pares) expect(deltaE(a, b), `${a} ↔ ${b}`).toBeGreaterThanOrEqual(15);
  });

  it('cuatro tonos distintos, sin repetir el de la otra apariencia (cada una se eligió para su superficie)', () => {
    expect(new Set(paleta).size).toBe(4);
    const otra = Object.values(FAMILIA_HEX[t === 'oscuro' ? 'claro' : 'oscuro']);
    expect(paleta.some((h) => otra.includes(h))).toBe(false);
  });
});

describe('las cinco zonas: un espectro ordenado, no una categoría', () => {
  it.each(TEMAS)('%s: cinco tonos distintos que se separan de su vecino a la vista', (t) => {
    expect(new Set(ZONAS_HEX[t]).size).toBe(5);
    for (let i = 1; i < 5; i++) expect(deltaE(ZONAS_HEX[t][i - 1]!, ZONAS_HEX[t][i]!), `Z${i} ↔ Z${i + 1}`).toBeGreaterThanOrEqual(12);
  });
});

describe('el disposición y su arco (bandas del coach como dato)', () => {
  it('el nivel lo da la POSICIÓN de la banda: la más baja, bajo; la más alta, alto; las del medio, medio', () => {
    expect(nivelDisposicion(30, BANDAS_DISPOSICION_DEFECTO)).toBe('bajo');
    expect(nivelDisposicion(44, BANDAS_DISPOSICION_DEFECTO)).toBe('bajo');
    expect(nivelDisposicion(45, BANDAS_DISPOSICION_DEFECTO)).toBe('medio');
    expect(nivelDisposicion(64, BANDAS_DISPOSICION_DEFECTO)).toBe('medio');
    expect(nivelDisposicion(65, BANDAS_DISPOSICION_DEFECTO)).toBe('alto');
    expect(nivelDisposicion(100, BANDAS_DISPOSICION_DEFECTO)).toBe('alto');
  });

  it('un coach con otras bandas (cuatro, con otros nombres y cortes) sigue teniendo su arco en su sitio', () => {
    const cuatro = [
      { hasta: 30, nombre_es: 'Agotado' },
      { hasta: 55, nombre_es: 'Justo' },
      { hasta: 80, nombre_es: 'Bien' },
      { hasta: null, nombre_es: 'A tope' },
    ];
    expect(nivelDisposicion(20, cuatro)).toBe('bajo');
    expect(nivelDisposicion(40, cuatro)).toBe('medio');
    expect(nivelDisposicion(70, cuatro)).toBe('medio');
    expect(nivelDisposicion(95, cuatro)).toBe('alto');
    expect(palabraDisposicion(95, cuatro)).toBe('A tope');
  });

  it('con una sola banda no hay tercio que decir: medio (ni aplauso ni alarma)', () => {
    expect(nivelDisposicion(10, [{ hasta: null, nombre_es: 'Lo que sea' }])).toBe('medio');
  });
});

describe('el sujeto de la portada dice lo del contrato en los cuatro estados', () => {
  const de = (esc: (typeof ESCENARIOS_PORTADA)[number]) => {
    const p = panelDe(esc, '12s', METODO_DEFECTO);
    const estados = estadosDe(p, METODO_DEFECTO);
    return { p, estados, s: sujetoEstado(p, METODO_DEFECTO, estados.estado) };
  };

  it('lleno: la palabra del coach de título, su veredicto de apoyo, las tres cifras y la disposición', () => {
    const { p, s } = de('lleno');
    expect(s.bloque).toBe('lleno');
    expect(s.titulo).toBe(p.estado.palabra_es);
    expect(s.apoyo).toBe(frase(p.forma.veredicto!));
    expect(s.celdas.map((c) => c.clave)).toEqual(['forma', 'fatiga', 'frescura']);
    expect(s.disposicion).not.toBeNull();
    expect(s.salida).toBeNull();
    expect(s.plazo).toBeNull();
    expect(s.tono).toBe(TINTE_DE_ESTADO[p.estado.clave!].tono);
  });

  it('el tinte NUNCA es el naranja sólido (aquí nada es «haz esto ahora») ni cambia el color de la cifra', () => {
    for (const { tono } of Object.values(TINTE_DE_ESTADO)) expect(tono).not.toBe('accion');
    for (const esc of ESCENARIOS_PORTADA) expect(de(esc).s.tono).not.toBe('accion');
  });

  it('vacío: sin cifras ni palabra; el hueco es el título y la salida es una acción', () => {
    const { s } = de('vacio');
    expect(s.bloque).toBe('vacio');
    expect(s.celdas).toEqual([]);
    expect(s.disposicion).toBeNull();
    expect(s.tono).toBe('neutro');
    expect(s.titulo).toBe('Sin carga todavía');
    expect(s.salida?.tipo).toBe('accion');
  });

  it('poco dato: sin palabra ni forma ni frescura (solo la fatiga), con el plazo dibujado y sin acción', () => {
    const { s } = de('poco');
    expect(s.bloque).toBe('poco');
    expect(s.celdas.map((c) => c.clave)).toEqual(['fatiga']);
    expect(s.plazo).toEqual({ llevas: 3, hacen: METODO_DEFECTO.semanas_minimas_forma });
    expect(s.salida?.tipo).toBe('espera');
  });

  it('dato viejo: la palabra sigue y el hueco dice desde cuándo y qué lo reanuda', () => {
    const { p, s } = de('viejo');
    expect(s.bloque).toBe('viejo');
    expect(s.titulo).toBe(p.estado.palabra_es);
    expect(s.apoyo).toMatch(/Sin entrenar desde hace \d+ días/);
    expect(s.salida).toMatchObject({ tipo: 'accion', texto: 'Empezar un entreno' });
  });

  it('lo que no se sabe no se pinta: ninguna cifra ni texto sale como «undefined», «NaN» o un guion largo', () => {
    for (const esc of ESCENARIOS_PORTADA) {
      const { s } = de(esc);
      const todo = [s.titulo, s.apoyo ?? '', ...s.celdas.map((c) => c.texto), s.disposicion?.palabra ?? '', s.salida?.texto ?? ''].join(' | ');
      expect(todo, esc).not.toMatch(/undefined|NaN|null|—|–/);
    }
  });

  it('las cifras usan el signo tipográfico (−) y la frescura lleva su signo', () => {
    const { s } = de('lleno');
    const frescura = s.celdas.find((c) => c.clave === 'frescura')!.texto;
    expect(frescura).toMatch(/^[+−]?\d+$|^0$/);
    expect(frescura).not.toContain('-');
  });
});

describe('frase del veredicto', () => {
  it('con razón de retirada, cierra la frase y la añade; sin ella, la deja como está', () => {
    expect(frase({ clase: 'a-mas', frase_es: 'Vas a más: la forma sube.', cobertura_pct: 95, estimada_pct: 0, retirado_es: null })).toBe('Vas a más: la forma sube.');
    expect(frase({ clase: 'sin-veredicto', frase_es: 'Sin veredicto', cobertura_pct: 60, estimada_pct: 0, retirado_es: 'Solo el 60 % de tu carga se ha podido calcular.' })).toBe('Sin veredicto. Solo el 60 % de tu carga se ha podido calcular.');
  });
});

describe('la ventana dicha en una frase (A4: siempre se ve cuál rige)', () => {
  it('cada ventana tiene su frase, sin guiones largos', () => {
    for (const v of VENTANAS) expect(VENTANA_FRASE[v], v).toMatch(/^[A-ZÁÉÍÓÚ][^—–]+$/);
    expect(new Set(VENTANAS.map((v) => VENTANA_FRASE[v])).size).toBe(VENTANAS.length);
  });
});

describe('el tinte por estado de frescura cubre las cinco claves cerradas', () => {
  it('ninguna clave sin tinte', () => {
    const claves: EstadoFrescuraClave[] = ['sobrecarga', 'optimo', 'mantener', 'fresco', 'recargando'];
    for (const c of claves) expect(TINTE_DE_ESTADO[c]).toBeDefined();
    expect(Object.keys(TINTE_DE_ESTADO).sort()).toEqual([...claves].sort());
  });
});

describe('unirUnidades', () => {
  it('pega la unidad a su cifra con un espacio duro, y solo a la unidad entera', () => {
    expect(unirUnidades('Series 4 × 1000 m en cinta')).toBe('Series 4 × 1000\u00a0m en cinta');
    expect(unirUnidades('10 min · 132 kg · 150 ppm')).toBe('10\u00a0min · 132\u00a0kg · 150\u00a0ppm');
    // «5 mañanas» no es «5 m».
    expect(unirUnidades('5 mañanas y 3 series')).toBe('5 mañanas y 3 series');
  });
});
