// LA LÍNEA DE DOSIS DE UNA CARRERA ESTRUCTURADA, CLAVADA AL SWIFT.
//
// El doble afirma escribir lo que escribe la app. Esa afirmación no se puede
// comprobar mirando un mockup: se lee igual de bien un «16 × 500 m» correcto que
// un «500 m» que perdió las dieciséis series por el camino. Así que las cadenas
// se fijan aquí, LITERALES, contra las del test de iOS que las define
// (`ios/FAHYBRIKTests/Workout/CarreraEstructuradaFartlekTests.swift`): si un día
// el Swift cambia una palabra y el doble no, esto rompe.
//
// El caso es el fartlek de la asignación 411 (10-ago-2026), que llegó con las dos
// mentiras a la vez: perdía el ×16 y llamaba «descanso» a un minuto que se corre
// al trote en Z2.

import { describe, expect, it } from 'vitest';
import {
  FARTLEK_16X500,
  distanciaCubierta,
  distanciaDosis,
  dosisConSeries,
  dosisDeCarrera,
  fraseDeRecuperacion,
  reloj,
  type TramoCarrera,
} from '@/components/design-twin/datos-reales';
import {
  BLOQUE,
  objetivoConMarca,
  objetivoLabel,
  velocidadDeCinta,
} from '@/components/design-twin/screens/run-live/data';

const FARTLEK = FARTLEK_16X500.bloques[0].items[0];

describe('design-twin · la dosis de una carrera estructurada', () => {
  it('el fartlek dice las 16 series y que el OFF se corre', () => {
    const dosis = dosisDeCarrera(FARTLEK);
    // La misma cadena que asserta `testLaDosisDiceLas16SeriesYElOffSeCorre`.
    expect(dosis?.linea).toBe('16 × 500 m · Z4 · recuperación 1:00 suave en Z2');
    expect(dosis?.titular).toBe('16 × 500 m');
    expect(dosis?.objetivo).toBe('Z4');
    expect(dosis?.detalle).toBe('recuperación 1:00 suave en Z2');
  });

  it('el titular manda sobre el aplanado que trae al lado', () => {
    // El ítem lleva los escalares de `prescriptionToParams` (un set de 500 m,
    // `rest_s` 60): con ellos, la dosis era «500 m».
    expect(FARTLEK.dosis).toBe('500 m');
    expect(FARTLEK.series).toBe(1);
    expect(dosisConSeries(FARTLEK)).toBe('16 × 500 m');
  });

  it('los 32 tramos son 16 de trabajo y 16 de recuperación', () => {
    const tramos = FARTLEK.estructura ?? [];
    expect(tramos).toHaveLength(32);
    expect(tramos.filter((t) => t.tipo === 'trabajo')).toHaveLength(16);
    expect(tramos.filter((t) => t.tipo === 'recuperacion')).toHaveLength(16);
  });

  it('una pirámide dice la secuencia en METROS y respeta el descanso del plano', () => {
    const piramide: TramoCarrera[] = [1200, 1000, 800].map((metros) => ({
      tipo: 'trabajo',
      metros,
      zona: 4,
    }));
    const dosis = dosisDeCarrera({ estructura: piramide, descansoS: 120 });
    // «1,2 km/1 km/800 m» no se lee ni se compara: una serie de pista se escribe
    // en metros y con la unidad UNA vez.
    expect(dosis?.titular).toBe('1200/1000/800 m');
    expect(dosis?.detalle).toBe('descanso 2:00');
    expect(dosis?.linea).toBe('1200/1000/800 m · Z4 · descanso 2:00');
  });

  it('no cuenta el calentamiento: un 10 min + 5×800 no son seis series', () => {
    const conCalentamiento: TramoCarrera[] = [
      { tipo: 'trabajo', segundos: 600, fase: 'calentamiento' },
      ...Array.from({ length: 5 }, (): TramoCarrera => ({ tipo: 'trabajo', metros: 800, zona: 3 })),
    ];
    expect(dosisDeCarrera({ estructura: conCalentamiento })?.titular).toBe('5 × 800 m');
  });

  it('si los tramos no llevan el MISMO objetivo, no se resume ninguno', () => {
    const progresivo: TramoCarrera[] = [3, 4, 5].map((zona) => ({ tipo: 'trabajo', metros: 1000, zona }));
    expect(dosisDeCarrera({ estructura: progresivo })?.objetivo).toBeUndefined();
  });

  it('recuperaciones distintas entre sí no se resumen a la primera', () => {
    const desiguales: TramoCarrera[] = [
      { tipo: 'trabajo', metros: 400, zona: 5 },
      { tipo: 'recuperacion', segundos: 60, modo: 'trote' },
      { tipo: 'trabajo', metros: 400, zona: 5 },
      { tipo: 'recuperacion', segundos: 120, modo: 'caminar' },
    ];
    expect(dosisDeCarrera({ estructura: desiguales })?.detalle).toBeUndefined();
  });

  it('sin estructura no hay nada que contar: manda el aplanado', () => {
    expect(dosisDeCarrera({ estructura: undefined })).toBeNull();
    expect(dosisDeCarrera({ estructura: [] })).toBeNull();
  });
});

describe('design-twin · un descanso de verdad sigue diciéndose descanso', () => {
  // `parado` y el modo que NO SE SABE (lo que trae una prescripción plana, donde
  // el número nació de un `rest_s`) conservan la palabra del coach.
  it('parado, y el modo que no se sabe, dicen «descanso 1:30»', () => {
    for (const modo of ['parado', undefined] as const) {
      expect(fraseDeRecuperacion({ tipo: 'recuperacion', segundos: 90, modo }), `modo ${modo}`).toBe(
        'descanso 1:30'
      );
    }
  });

  it('caminando en Z1 se dice como se hace', () => {
    expect(fraseDeRecuperacion({ tipo: 'recuperacion', segundos: 90, zona: 1, modo: 'caminar' })).toBe(
      'recuperación 1:30 caminando en Z1'
    );
  });

  it('sin zona declarada no se inventa el «en Zx»', () => {
    expect(fraseDeRecuperacion({ tipo: 'recuperacion', segundos: 120, modo: 'trote' })).toBe(
      'recuperación 2:00 suave'
    );
  });
});

describe('design-twin · el bloque de «Correr en vivo» dice lo que pinta la app', () => {
  it('la fila de la puerta sale de la estructura, no de un literal', () => {
    expect(BLOQUE.filas[0].trabajo).toBe('4 × 1 km · @ 4:35/km · recuperación 2:00 suave');
  });

  it('la cabecera de formato la escribe `wodHeader`: «Series», no «Intervalos»', () => {
    expect(BLOQUE.formato).toBe('Series · 4 series');
  });

  it('el objetivo lleva su unidad PEGADA, y la cinta dice qué marcar', () => {
    expect(objetivoLabel()).toBe('4:35/km');
    // 4:35/km = 13,09 km/h, redondeado al escalón de 0,1 que publica la consola.
    expect(velocidadDeCinta()).toBe('13,1');
    expect(objetivoConMarca()).toBe('Objetivo 4:35/km · pon 13,1');
    // Si la app pudiera fijar la velocidad, darle un número que teclear es ruido.
    expect(objetivoConMarca(true)).toBe('Objetivo 4:35/km');
  });

  it('una consola de escalón 0,5 dice un número que SÍ se puede marcar', () => {
    expect(velocidadDeCinta(0.5)).toBe('13,0');
  });
});

describe('design-twin · las dos distancias y el reloj sub-minuto', () => {
  it('la DOSIS se escribe corta, y con coma española', () => {
    expect(distanciaDosis(500)).toBe('500 m');
    expect(distanciaDosis(1000)).toBe('1 km');
    expect(distanciaDosis(1400)).toBe('1,4 km');
    expect(distanciaDosis(0)).toBeNull();
  });

  it('la MEDIDA lleva sus dos decimales: los ceros son el dato', () => {
    expect(distanciaCubierta(437)).toBe('437 m');
    expect(distanciaCubierta(1000)).toBe('1,00 km');
    expect(distanciaCubierta(1404)).toBe('1,40 km');
  });

  it('«45s» por debajo del minuto, reloj a partir de ahí', () => {
    expect(reloj(45, 'segundos')).toBe('45s');
    expect(reloj(45)).toBe('0:45');
    expect(reloj(60, 'segundos')).toBe('1:00');
    expect(reloj(3600, 'segundos')).toBe('1:00:00');
  });
});
