// LA LISTA CON VENTANA (§5, «Páginas de lista»): la página Estructura del vivo y la
// «Estructura completa» del brief son UNA pieza. UP/DOWN mueven la ventana de uno en
// uno y, en el borde, la tecla pasa de página. Aquí se recorre entera, en los cuatro
// relojes, con las sesiones más largas: cada bloque se ve alguna vez, entero, y el
// borde llega donde debe.

import { describe, expect, it } from 'vitest';
import { TAMANOS, arranqueEstructura, disponerEstructura, filasDeEstructura, moverEstructura } from '@/components/design-twin/kit-garmin';
import { estructuraDe } from '@/components/design-twin/kit-reloj';
import { sesion493, sesion529, sesionSeisPorMil } from '@/components/design-twin/screens/reloj-antes-despues/sesiones';

const SESIONES = { '493': sesion493(), '529': sesion529(), '6 × 1000 m': sesionSeisPorMil() };

describe('la lista con ventana se recorre entera con UP y DOWN', () => {
  for (const [nombre, s] of Object.entries(SESIONES)) {
    for (const { D } of TAMANOS) {
      it(`${nombre} a ${D}: cada parte de cada bloque se pinta entera y los bordes pasan de página`, () => {
        const filas = filasDeEstructura(estructuraDe(s.plan.pasos)(0));
        const pintado: string[] = [];
        let desde = 0;
        for (let paso = 0; paso <= filas.length; paso++) {
          const d = disponerEstructura(filas, D, desde);
          expect(d.lineas.every((l) => l.cabe), `${nombre} a ${D} desde ${desde}: todo cabe`).toBe(true);
          d.lineas.filter((l) => ['bloque', 'detalle'].includes(l.rol)).forEach((l) => pintado.push(l.piezas.map((p) => p.texto).join(' ')));
          const siguiente = moverEstructura(filas, desde, 1, D);
          if (siguiente == null) break;
          expect(siguiente, 'la ventana avanza de uno en uno').toBe(desde + 1);
          desde = siguiente;
        }
        // Nada se pierde: cada parte de cada bloque (su línea y su detalle) se pinta ENTERA en alguna ventana.
        const todo = pintado.join(' ').replace(/\s+/g, ' ');
        for (const f of filas) {
          for (const parte of [...f.linea.split(' · '), ...(f.detalle ? f.detalle.split(' · ') : [])]) expect(todo, `${nombre} a ${D}: «${parte}»`).toContain(parte.replace(/\s+/g, ' '));
        }
        // En el borde de abajo no se mueve más; en el de arriba, tampoco.
        expect(moverEstructura(filas, desde, 1, D)).toBeNull();
        expect(moverEstructura(filas, 0, -1, D)).toBeNull();
        // Y la ventana de entrada tiene «ahora» a la vista.
        const entrada = arranqueEstructura(filas, D);
        expect(entrada).toBeGreaterThanOrEqual(0);
        expect(entrada).toBeLessThanOrEqual(filas.length - 1);
      });
    }
  }
});
