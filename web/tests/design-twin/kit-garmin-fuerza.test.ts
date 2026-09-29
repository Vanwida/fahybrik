// «GARMIN · FUERZA» — TODO CABE A 218 Y EL HÉROE ES EL DE LA LÁMINA
// (docs/garmin-reloj/modelo.md §3, §11).
//
// Cada paso de las sesiones de fuerza (529, 488, 492, 538 y el ejemplo de P11
// con las reps que dice el atleta) en varios momentos y en los CUATRO relojes
// pasa por las caras de la familia: la serie, el «colócate», el 3-2-1 y el GO,
// el descanso que anota (con cada campo enfocado), el descanso común y las
// páginas Datos, Series y Ejercicios. En todas: ninguna línea se sale de la
// cuerda del círculo a su altura, nada baja del 6,2 % de D, el héroe cae en
// 0,20–0,26 D, nada se pisa y las cifras están en la bitmap del reloj. El héroe
// es el de `laminaDelPaso` (o `heroeDelPaso` en el descanso). Y la lista de
// Ejercicios de la sesión de 54 pasos se recorre entera sin perder «ahora».
// Los botones y los avisos, en `kit-garmin-fuerza-mandos.test.ts`.

import { describe, expect, it } from 'vitest';
import { TAMANOS, disponerDatos } from '@/components/design-twin/kit-garmin';
import {
  cargaArrastrada,
  esFuerza,
  heroeDelPaso,
  laminaDelPaso,
  lecturasDe,
  pasoVivo,
  type Registro,
} from '@/components/design-twin/kit-reloj';
import { cuerpo } from '@/components/design-twin/screens/reloj-fuerza/casos';
import { disponerAnotar, disponerDescansoFuerza, disponerTrabajo, vistaColocate, vistaCuenta } from '@/components/design-twin/screens/garmin-fuerza/caras';
import { PASOS_488 } from '@/components/design-twin/screens/garmin-fuerza/casos';
import { filasDatos, filasEjercicios, filasSeries } from '@/components/design-twin/screens/garmin-fuerza/filas';
import { camposDelDescanso } from '@/components/design-twin/screens/garmin-fuerza/modelo';
import {
  arranqueEjercicios,
  colocarEjercicios,
  disponerEjercicios,
  disponerSeries,
  moverEjercicios,
  ultimoVisible,
} from '@/components/design-twin/screens/garmin-fuerza/paginas';
import { vieneDe, vistaTrabajo } from '@/components/design-twin/screens/garmin-fuerza/textos';
import { resumenDeDescanso, vistaAnotarDe } from '@/components/design-twin/screens/garmin-fuerza/vistas';
import { MOMENTOS, PLANES, comprobar, comprobarAnotar, contextoDe, declaradoHasta, recorrer } from './garmin-fuerza-medidas';

describe('las caras de fuerza caben en los cuatro relojes (sesiones reales)', () => {
  for (const [nombre, plan] of Object.entries(PLANES)) {
    it(`sesión ${nombre}: cada paso, en cada momento, a 454, 390, 260 y 218`, () => {
      recorrer(plan).forEach((base, i) => {
        const registros = [{}, declaradoHasta(plan, i)] as Registro[];
        for (const t of MOMENTOS) {
          const s = t === 0 ? base : { ...base, t, sesionT: base.sesionT + t, lect: cuerpo(plan.pasos[i]!, i, t, base.sesionT + t) };
          const p = pasoVivo(plan, s);
          const l = lecturasDe(p, s);
          for (const reg of registros) {
            const arrastrada = cargaArrastrada(plan, i, reg);
            for (const { D } of TAMANOS) {
              const que = `${nombre} · paso ${i} (${p.clase}) t=${t}`;
              if (p.rol === 'trabajo') {
                const v = vistaTrabajo(p, l, { plan, i, zonas: plan.zonas, reglas: plan.reglas, arrastrada });
                const d = disponerTrabajo(v, D);
                comprobar(d, que);
                // El héroe es el de la lámina: el mismo texto y la misma unidad.
                const lamina = laminaDelPaso(p, l, plan.zonas, plan.reglas);
                expect(d.heroe?.texto, `${que} · héroe`).toBe(lamina.heroe.texto);
                expect(d.heroe?.unidad, `${que} · unidad del héroe`).toBe(lamina.heroe.unidad);
              } else if (p.rol === 'transicion' && esFuerza(plan.pasos[i + 1])) {
                const d = disponerTrabajo(vistaColocate(p, plan.pasos[i + 1] as never, l, null), D);
                comprobar(d, `${que} · colócate`);
                expect(d.heroe?.texto).toBe(heroeDelPaso(p, l, null).texto);
              } else if (p.rol === 'descanso') {
                const c = contextoDe(plan, s);
                const viene = vieneDe(plan, i, reg);
                const resumenes = [
                  null,
                  { textos: ['sin confirmar'], atencion: true },
                  resumenDeDescanso(c, declaradoHasta(plan, i + 1)),
                  { textos: ['✓ ronda 1 anotada', '✓ anotada'], atencion: false },
                  { textos: ['✓ 8 × 127,5 kg · RPE 6,5', '✓ 8 × 127,5 kg', '✓ anotada'], atencion: false },
                ];
                for (const resumen of resumenes) {
                  const d = disponerDescansoFuerza(p, l, D, viene, resumen);
                  comprobar(d, `${que} · descanso «${resumen?.textos[0] ?? ''}»`);
                  expect(d.heroe?.texto).toBe(heroeDelPaso(p, l, null).texto);
                }
                // Y el que anota, con cada campo enfocado y durante los 5 s de deshacer (sin foco).
                const campos = camposDelDescanso(plan, i);
                campos.forEach((_, k) => {
                  for (const deshacer of [false, true]) {
                    const v = vistaAnotarDe(c, reg, { paso: c.pasoId, k, cerrada: false }, l, p, deshacer);
                    const a = disponerAnotar(v, D);
                    comprobarAnotar(a, `${que} · anotar campo ${k}${deshacer ? ' (deshacer)' : ''}`);
                    // Con un campo enfocado las teclas se dicen ENTERAS (es un modo: si no se ven, nadie sabe qué hace cada botón).
                    const ayuda = a.base.lineas.find((x) => x.rol === 'ayuda');
                    if (deshacer) expect(ayuda, `${que} · sin foco, sin ayuda`).toBeUndefined();
                    else expect(ayuda?.piezas.map((x) => x.texto).join(''), `${que} · campo ${k} a ${D}: ayuda de teclas`).toBe('▲▼ cambia · START ok');
                  }
                });
              }
              // El 3-2-1 y el GO del paso que viene.
              const sig = plan.pasos[i + 1];
              if (sig && sig.rol === 'trabajo' && p.rol !== 'trabajo') {
                for (const n of [3, 2, 1, 0]) comprobar(disponerTrabajo(vistaCuenta(n, sig, plan, cargaArrastrada(plan, i + 1, reg)), D), `${que} · ${n > 0 ? n : 'GO'}`);
              }
            }
          }
        }
      });
    });
  }
});

describe('las páginas caben en los cuatro relojes', () => {
  for (const [nombre, plan] of Object.entries(PLANES)) {
    it(`sesión ${nombre}: Datos y Series en cada paso, con lo propuesto y con lo declarado`, () => {
      recorrer(plan).forEach((s, i) => {
        const p = pasoVivo(plan, s);
        const l = lecturasDe(p, s);
        for (const reg of [{}, declaradoHasta(plan, i)] as Registro[]) {
          for (const { D } of TAMANOS) {
            const que = `${nombre} · paso ${i}`;
            comprobar(disponerDatos(filasDatos(plan, s, reg, cuerpo, l.ppm), plan.zonas, D), `${que} · Datos`);
            const { nombre: titulo, filas } = filasSeries(plan, s, reg, cuerpo, p, l);
            comprobar(disponerSeries(titulo, filas, D), `${que} · Series`);
          }
        }
      });
    });

    it(`sesión ${nombre}: la lista de Ejercicios, en cada ventana posible, cabe y no pierde «ahora»`, () => {
      recorrer(plan).forEach((s, i) => {
        const { filas, ahora } = filasEjercicios(plan, i, declaradoHasta(plan, i));
        expect(ahora, `${nombre} · paso ${i}: hay un «ahora»`).toBeGreaterThanOrEqual(0);
        expect(filas[ahora]!.estado, `${nombre} · paso ${i}`).not.toBe('hecho');
        for (const { D } of TAMANOS) {
          // Al entrar, «ahora» está a la vista.
          const desde = arranqueEjercicios(filas, ahora, D);
          expect(ultimoVisible(filas, desde, D), `${nombre} · paso ${i} a ${D}: «ahora» a la vista al entrar`).toBeGreaterThanOrEqual(ahora);
          expect(desde, `${nombre} · paso ${i} a ${D}: la ventana no empieza después de «ahora»`).toBeLessThanOrEqual(ahora);
          // Cada ventana a la que se llega con UP/DOWN cabe, y el pie dice dónde está «ahora».
          for (let d = 0; d < filas.length; d++) {
            const dis = disponerEjercicios(filas, d, ahora, D);
            comprobar(dis, `${nombre} · paso ${i} · ventana ${d}`);
            const bloques = colocarEjercicios(filas, d, D);
            const pie = dis.lineas.find((x) => x.rol === 'posicion')!;
            const texto = pie.piezas.map((x) => x.texto).join('');
            const primero = bloques[0]!.k;
            const ultimo = bloques[bloques.length - 1]!.k;
            expect(texto.includes(`${ahora + 1}/${filas.length}`), `${nombre} · paso ${i} · ventana ${d}: el pie dice «${texto}»`).toBe(true);
            expect(texto.startsWith('▲'), `${nombre} · ventana ${d}: ▲ solo si «ahora» queda arriba`).toBe(ahora < primero);
            expect(texto.startsWith('▼'), `${nombre} · ventana ${d}: ▼ solo si «ahora» queda abajo`).toBe(ahora > ultimo);
          }
          // Recorrida entera con DOWN y luego con UP: nunca salta, siempre acaba en el borde y ahí devuelve `null` (= pasa de página).
          let d = 0;
          let vistos = new Set<number>();
          for (let pasos = 0; pasos <= filas.length; pasos++) {
            colocarEjercicios(filas, d, D).forEach((b) => vistos.add(b.k));
            const n = moverEjercicios(filas, d, 1, D);
            if (n == null) break;
            expect(n, 'DOWN mueve de uno en uno').toBe(d + 1);
            d = n;
          }
          expect(vistos.size, `${nombre} · paso ${i} a ${D}: con DOWN se ven TODOS los ejercicios`).toBe(filas.length);
          expect(moverEjercicios(filas, d, 1, D), 'en el borde de abajo, DOWN pasa de página').toBeNull();
          for (let pasos = 0; pasos <= filas.length && d > 0; pasos++) d = moverEjercicios(filas, d, -1, D) ?? d;
          expect(d, 'UP llega arriba').toBe(0);
          expect(moverEjercicios(filas, 0, -1, D), 'en el borde de arriba, UP pasa de página').toBeNull();
          vistos = new Set();
        }
      });
    });
  }
});

describe('la sesión más larga (488): 54 pasos', () => {
  const plan = PLANES['488']!;

  it('«Viene:» dice en qué serie estás si el ejercicio ya está en curso y su dosis entera si lo abre', () => {
    // Descanso tras la 7.ª serie de SkiErg: viene la 8.ª, no «8 × 250 m» otra vez.
    const j = plan.pasos.findIndex((p) => p.id === '488-ski-7') + 1;
    expect(vieneDe(plan, j, {})).toEqual({ que: 'Serie 8/8', dosis: '250\u00A0m' });
    // Descanso tras el último Ab Wheel: viene SkiErg, con sus 8 series.
    const k = plan.pasos.findIndex((p) => p.id === '488-ab-s3') + 1;
    expect(vieneDe(plan, k, {})).toEqual({ que: 'SkiErg', dosis: '8 × 250\u00A0m' });
    // La carga del implemento va detrás: «Sled Push · 5 × 25 m · 180 kg» (492).
    const p492 = PLANES['492']!;
    const r = p492.pasos.findIndex((p) => p.id === '492-row-s4') + 1;
    expect(vieneDe(p492, r, {})).toEqual({ que: 'Sled Push', dosis: '5 × 25\u00A0m · 180\u00A0kg' });
  });

  it('son 54 pasos y 7 ejercicios', () => {
    expect(plan.pasos.length).toBe(PASOS_488);
    expect(filasEjercicios(plan, 0, {}).filas.length).toBe(7);
  });

  it('«ahora» avanza con la sesión: nunca salta hacia atrás y cada ejercicio hecho queda «hecho»', () => {
    let previo = -1;
    recorrer(plan).forEach((_, i) => {
      const { filas, ahora } = filasEjercicios(plan, i, {});
      expect(ahora, `paso ${i}`).toBeGreaterThanOrEqual(previo);
      previo = ahora;
      filas.forEach((f, k) => {
        if (k < ahora && f.estado !== 'ahora') expect(f.estado, `paso ${i} · ${f.nombre}`).toBe('hecho');
        if (k > ahora && f.estado !== 'ahora') expect(f.estado, `paso ${i} · ${f.nombre}`).toBe('pendiente');
      });
    });
    expect(previo).toBe(6);
  });

  it('en un descanso, «ahora» es el ejercicio que viene (el que acabas de terminar ya está hecho)', () => {
    // El descanso tras la 4.ª serie de Back Squat: viene Front Squat.
    const i = plan.pasos.findIndex((p) => p.id === '488-bs-s4') + 1;
    expect(plan.pasos[i]!.rol).toBe('descanso');
    const { filas, ahora } = filasEjercicios(plan, i, {});
    expect(filas[ahora]!.nombre).toBe('Front Squat');
    expect(filas[0]!.estado).toBe('hecho');
  });
});
