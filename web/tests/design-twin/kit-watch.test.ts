// ¿CABE EN LA MUÑECA? — la pregunta que decide las nueve vistas, respondida
// por la suite y no por el ojo de quien mira el mockup.
//
// Existe porque «no cabe» es lo más fácil de esconder que hay en un reloj: el
// número encoge, sigue estando ahí, y en una captura a tamaño doble parece
// bien. A tamaño real, con el brazo en movimiento, no se lee. Así que el suelo
// de legibilidad se comprueba, y una página que no llega rompe el build en vez
// de llegar a la muñeca de un atleta.

import { describe, expect, it } from 'vitest';
import {
  ANCHO_UTIL,
  ALTO_UTIL,
  PERMITE,
  SUJETO_GLIFOS_MAX,
  SUJETO_SUELO,
  SUJETO_TECHO,
  altoPorAncho,
  apoyosDe,
  veredicto,
  type PaginaReloj,
} from '@/components/design-twin/kit-watch/modelo';
import { anchoVersales } from '@/components/design-twin/kit-watch/numeral';

import { CASOS as RODAJE } from '@/components/design-twin/screens/watch-rodaje/guion';
import { CASOS as SERIES } from '@/components/design-twin/screens/watch-series/guion';
import { CASOS as CINTA } from '@/components/design-twin/screens/watch-cinta/guion';
import { CASOS as ERGO } from '@/components/design-twin/screens/watch-ergo/guion';
import { CASOS as FUERZA } from '@/components/design-twin/screens/watch-fuerza/guion';
import { CASOS as EMOM } from '@/components/design-twin/screens/watch-emom/guion';
import { CASOS as FORTIME } from '@/components/design-twin/screens/watch-fortime/guion';
import { CASOS as AMRAP } from '@/components/design-twin/screens/watch-amrap/guion';
import { CASOS as DOBLES } from '@/components/design-twin/screens/watch-dobles/guion';
import { CASOS as CORREDOR } from '@/components/design-twin/screens/corredor/guion';

interface Caso {
  nombre: string;
  paginas: readonly PaginaReloj[];
}

/**
 * El censo. Añadir una vista es añadir una línea aquí.
 *
 * La décima no es «una más»: `corredor` es la interfaz del corredor y la
 * comparte con el iPhone (mismo `guion.ts`). Entra en este censo porque el
 * presupuesto de la muñeca no perdona a nadie — que una vista sea compartida
 * no la exime de caber en 188 pt.
 */
const VISTAS: ReadonlyArray<readonly [string, readonly Caso[]]> = [
  ['rodaje', RODAJE],
  ['series de calle', SERIES],
  ['cinta', CINTA],
  ['ergo', ERGO],
  ['fuerza', FUERZA],
  ['EMOM', EMOM],
  ['For Time', FORTIME],
  ['AMRAP', AMRAP],
  ['dobles', DOBLES],
  ['el corredor', CORREDOR],
];

describe('el lienzo del reloj', () => {
  it('mide 188 × 212 pt útiles', () => {
    expect(ANCHO_UTIL).toBe(188);
    expect(ALTO_UTIL).toBe(212);
  });

  /**
   * La tabla de la cabecera de `modelo.ts` no es prosa: es el motivo de que el
   * tope sean 5 glifos y de que un crono con horas no pueda ser un sujeto. Si
   * alguien toca el avance de la mono o el ancho del lienzo, esto salta.
   */
  it('el ANCHO es lo que limita, y un glifo de más cuesta altura de cifra', () => {
    const alturas = ['9', '43', '139', '1:30', '63:45', '102:40'].map((t) =>
      Math.round(altoPorAncho(t)),
    );
    expect(alturas).toEqual([219, 110, 73, 55, 44, 37]);
    // Un sujeto de 6 glifos cae por debajo del suelo: deja de ser un sujeto.
    expect(alturas[5]!).toBeLessThan(SUJETO_SUELO);
    // Y el de 5 es justo el suelo, que es de donde sale el tope.
    expect(alturas[4]!).toBeGreaterThanOrEqual(SUJETO_SUELO);
  });

  it('el modo decide si hay franja, y en `ojeada` no la hay', () => {
    expect(PERMITE.ojeada.franja).toBe(false);
    expect(PERMITE.ciego.franja).toBe(true);
    expect(PERMITE.ciego.atenuada).toBe(true);
    expect(PERMITE.mando.franja).toBe(true);
    expect(PERMITE.mando.atenuada).toBe(false);
  });
});

describe('las vistas de la muñeca', () => {
  it('son las nueve por formato más la del corredor', () => {
    expect(VISTAS).toHaveLength(10);
  });

  for (const [vista, casos] of VISTAS) {
    describe(vista, () => {
      it('declara al menos un caso mínimo y uno típico', () => {
        expect(casos.length).toBeGreaterThanOrEqual(2);
      });

      for (const caso of casos) {
        describe(caso.nombre, () => {
          it('tiene al menos una página', () => {
            expect(caso.paginas.length).toBeGreaterThan(0);
          });

          it('no repite el id de ninguna página', () => {
            const ids = caso.paginas.map((p) => p.id);
            expect(new Set(ids).size).toBe(ids.length);
          });

          for (const p of caso.paginas) {
            const varias = caso.paginas.length > 1;

            it(`«${p.id}» cabe en la muñeca`, () => {
              const v = veredicto(p.sujeto.texto, apoyosDe(p, varias), p.sujeto.unidad);
              // El mensaje del fallo dice QUÉ pasa, para no tener que ir a
              // buscar por qué una vista se rompió al cambiarle un texto.
              expect(
                v.cabe,
                `«${p.sujeto.texto}» se queda en ${v.alto.toFixed(0)} pt de cifra (${v.motivo}). ` +
                  `Lo que no cabe no se encoge: se parte en páginas.`,
              ).toBe(true);
              expect(v.alto).toBeLessThanOrEqual(SUJETO_TECHO);
            });

            it(`«${p.id}» no pasa de ${SUJETO_GLIFOS_MAX} glifos de sujeto`, () => {
              expect([...p.sujeto.texto].length).toBeLessThanOrEqual(SUJETO_GLIFOS_MAX);
            });

            /**
             * «Mirar sin tocar» significa cero controles ANUNCIADOS. La página
             * puede traer el gesto (la pantalla entera es el blanco), pero el
             * lienzo no le da una línea — y esa línea es del sujeto.
             */
            it(`«${p.id}» no anuncia controles si el atleta no puede tocar`, () => {
              if (p.modo === 'ojeada') expect(apoyosDe(p, varias).accion).toBe(false);
            });

            /**
             * El cromo son líneas de versales de 10 px con `nowrap` sobre 188
             * pt de ancho. Si se pasan, no se parten: DESBORDAN, y cuelgan
             * fuera del reloj sin que nada avise — que es justo lo que hacía
             * «SIN MÁQUINA · PULSO Y TIEMPO» (207 pt) hasta que se vio en una
             * captura a tamaño real.
             *
             * El listón es que quepan A TAMAÑO COMPLETO. El lienzo sabe
             * encogerlas hasta un 82 % para no desbordar nunca, pero eso es una
             * red de seguridad y no un permiso: las versales son ya el texto
             * más pequeño del reloj y achicarlas en una pantalla que se lee a
             * distancia de brazo no es una opción. Si no cabe, se escribe más
             * corto.
             */
            for (const [donde, texto] of [
              ['contexto', p.contexto],
              ['nota', p.nota],
              ['acción', apoyosDe(p, varias).accion ? p.accion?.etiqueta : undefined],
            ] as const) {
              if (texto == null) continue;
              it(`«${p.id}» tiene ${donde} de una línea que cabe`, () => {
                expect(
                  anchoVersales(texto),
                  `«${texto.toUpperCase()}» mide ${anchoVersales(texto).toFixed(0)} pt sobre ${ANCHO_UTIL}`,
                ).toBeLessThanOrEqual(ANCHO_UTIL);
              });
            }
          }
        });
      }
    });
  }
});
