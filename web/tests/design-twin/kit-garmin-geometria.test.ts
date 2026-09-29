// EL CÍRCULO Y EL COLOR DEL RELOJ GARMIN (docs/garmin-reloj/modelo.md §3, G11).
//
// La geometría es pura y en fracciones de D: la cuerda del círculo, el ancho
// útil de una fila (sin aro ni aire) y la rejilla del vivo. El color: en MIP
// (260 y 218) todo pasa por `aMip`, 4 niveles por canal; un color de dato que
// en MIP se vuelve negro, o dos zonas que se vuelven la misma, es un fallo.

import { describe, expect, it } from 'vitest';
import {
  AIRE_ARO,
  ARO,
  CG,
  NIVELES_MIP,
  RADIO_UTIL,
  REJILLA,
  SUELO_D,
  TAMANOS,
  TG,
  aMip,
  anchoUtilFila,
  cajaEnFila,
  cuerdaEn,
  cuerpoPx,
  pintorDe,
  repartir,
  sobreNegro,
  tinteDeFondo,
} from '@/components/design-twin/kit-garmin';
import { espectroZonas } from '@/components/design-twin/kit-reloj/tokens';

describe('la cuerda del círculo', () => {
  it('es el diámetro en el centro y cero en los bordes', () => {
    expect(cuerdaEn(0.5)).toBeCloseTo(1);
    expect(cuerdaEn(0)).toBe(0);
    expect(cuerdaEn(1)).toBe(0);
    expect(cuerdaEn(0.25)).toBeCloseTo(cuerdaEn(0.75));
  });

  it('el ancho útil es la cuerda del círculo del texto (sin aro ni aire) en el borde más lejano de la fila', () => {
    expect(RADIO_UTIL).toBeCloseTo(ARO.radio - ARO.grosor / 2 - AIRE_ARO);
    // Una fila que cruza el centro la limita su borde más lejano, no el centro.
    expect(anchoUtilFila(0.45, 0.2)).toBeCloseTo(cuerdaEn(0.65, RADIO_UTIL));
    // Nunca más ancho que la cuerda de la pantalla a esa altura.
    for (let y = 0.05; y < 0.95; y += 0.05) expect(anchoUtilFila(y, 0.05)).toBeLessThan(cuerdaEn(y) + 1e-9);
  });

  it('las esquinas se comen la primera y la última fila: el pie es la más estrecha', () => {
    const pie = cajaEnFila('pie', 0.07).ancho;
    const contexto = cajaEnFila('contexto', 0.084).ancho;
    const heroe = cajaEnFila('heroe', 0.2).ancho;
    expect(pie).toBeLessThan(contexto);
    expect(contexto).toBeLessThan(heroe);
  });

  it('la rejilla del vivo va en orden, dentro del círculo y sin solaparse', () => {
    const franjas = [REJILLA.contexto, REJILLA.heroe, REJILLA.banda, REJILLA.secundaria, REJILLA.pie];
    franjas.forEach(([a, b], k) => {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(1);
      expect(a).toBeLessThan(b);
      if (k > 0) expect(a).toBeGreaterThanOrEqual(franjas[k - 1]![1]);
    });
  });

  it('el contexto se asienta al fondo de su franja y el pie arriba de la suya (donde la cuerda es mayor)', () => {
    expect(cajaEnFila('contexto', 0.08).y + 0.08).toBeCloseTo(REJILLA.contexto[1]);
    expect(cajaEnFila('pie', 0.07).y).toBeCloseTo(REJILLA.pie[0]);
  });

  it('repartir centra n filas en una franja con el mismo hueco', () => {
    const c = repartir(3, 0.1, [0.2, 0.8]);
    expect(c[1]!.y - c[0]!.y).toBeCloseTo(c[2]!.y - c[1]!.y);
    expect(c[0]!.y).toBeCloseTo(0.2);
    expect(c[2]!.y + 0.1).toBeCloseTo(0.8);
  });
});

describe('los cuatro relojes del selector', () => {
  it('454 y 390 AMOLED, 260 y 218 MIP sin táctil; el suelo es el de 218', () => {
    expect(TAMANOS.map((t) => [t.D, t.tec, t.tactil])).toEqual([
      [454, 'amoled', true],
      [390, 'amoled', true],
      [260, 'mip', false],
      [218, 'mip', false],
    ]);
    expect(Math.min(...TAMANOS.map((t) => t.D))).toBe(SUELO_D);
  });
});

describe('el suelo del texto', () => {
  it('ningún cuerpo baja del 6,2 % de D en ningún reloj (28 px a 454, 17 a 260, 14 a 218)', () => {
    for (const t of TAMANOS) {
      expect(cuerpoPx(TG.suelo, t.D)).toBeGreaterThanOrEqual(TG.suelo * t.D);
      expect(cuerpoPx(0.01, t.D)).toBe(Math.ceil(TG.suelo * t.D));
    }
    expect(cuerpoPx(TG.suelo, 454)).toBe(29);
    expect(cuerpoPx(TG.suelo, 218)).toBe(14);
    expect(SUELO_D).toBe(218);
  });
});

describe('aMip — lo que un MIP puede pintar', () => {
  it('cuantiza cada canal al nivel más cercano de 0/85/170/255', () => {
    expect(aMip('#F06A2A')).toBe('#FF5500');
    expect(aMip('#000000')).toBe('#000000');
    expect(aMip('#FFFFFF')).toBe('#FFFFFF');
    expect(aMip('#2A2A2A')).toBe('#000000');
    expect(aMip('#2B2B2B')).toBe('#555555');
    // El carril de la muñeca: en MIP no es gris, es un azul. Por eso el de Garmin es otro.
    expect(aMip('#2A2A2C')).toBe('#000055');
    expect(aMip('#A1A1A6')).toBe('#AAAAAA');
    expect(aMip('#fff')).toBe('#FFFFFF');
  });

  it('solo produce 64 colores', () => {
    const niveles = new Set(NIVELES_MIP.map((n) => n.toString(16).padStart(2, '0').toUpperCase()));
    for (let v = 0; v < 256; v += 7) {
      const hex = aMip(`#${v.toString(16).padStart(2, '0').repeat(3)}`);
      [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].forEach((c) => expect(niveles.has(c)).toBe(true));
    }
  });

  it('ningún color de dato se vuelve negro en MIP, y el carril no se confunde con la banda', () => {
    for (const c of [CG.tinta, CG.tinta2, CG.accion, CG.carril, CG.banda, CG.recupera]) expect(aMip(c)).not.toBe('#000000');
    expect(aMip(CG.carril)).not.toBe(aMip(CG.banda));
    expect(aMip(CG.tinta)).not.toBe(aMip(CG.tinta2));
  });

  it('las zonas del coach siguen siendo distintas en MIP con 3 a 5 zonas, ninguna es el naranja de acción y Z1 nunca es gris', () => {
    for (let n = 3; n <= 9; n++) {
      const mip = espectroZonas(n).map(aMip);
      if (n <= 5) expect(new Set(mip).size, `${n} zonas`).toBe(n);
      expect(mip).not.toContain(aMip(CG.accion));
      const [r, g, b] = [mip[0]!.slice(1, 3), mip[0]!.slice(3, 5), mip[0]!.slice(5, 7)];
      expect(r === g && g === b).toBe(false);
    }
  });

  it('DESVIACIÓN anotada: con 6 o más zonas, amarillo y ámbar son el mismo color MIP (la zona se lee por su número)', () => {
    for (let n = 6; n <= 9; n++) expect(new Set(espectroZonas(n).map(aMip)).size, `${n} zonas`).toBe(n - 1);
    expect(aMip('#FFD43B')).toBe(aMip('#FFB340'));
  });

  it('el pintor de AMOLED deja el color; el de MIP lo cuantiza', () => {
    expect(pintorDe('amoled')('#f06a2a')).toBe('#F06A2A');
    expect(pintorDe('mip')('#F06A2A')).toBe('#FF5500');
  });

  it('un color a media luz es un color (hex), no una opacidad: se puede pasar por aMip', () => {
    expect(sobreNegro('#FFFFFF', 0.5)).toBe('#808080');
    expect(aMip(sobreNegro(CG.accion, 0.34))).not.toBe('#000000');
  });

  it('el tinte de zona de fondo solo existe en AMOLED', () => {
    expect(tinteDeFondo('#34C759', 'amoled')).not.toBeNull();
    expect(tinteDeFondo('#34C759', 'mip')).toBeNull();
    expect(tinteDeFondo(null, 'amoled')).toBeNull();
  });
});
