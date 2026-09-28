// IPHONE · EL ERGO — lo que la familia pidió al kit compartido y lo que cada
// escenario pinta, calculado con las MISMAS funciones puras que la pantalla
// (un estado, dos pintores). Nada de esto vive en la pantalla: si un caso
// pinta mal, falla aquí antes que en la captura.

import { describe, expect, it } from 'vitest';
import { enlacesDe } from '@/components/design-twin/kit-iphone-vivo/enlace';
import { esTest, familiaDe, formatoDe } from '@/components/design-twin/kit-reloj/familia';
import { heroeDeFamilia, metricasDelPaso, trabajoDe } from '@/components/design-twin/kit-reloj/metricas';
import { laminaDelPaso } from '@/components/design-twin/kit-reloj/lamina';
import type { Lecturas, PasoBase } from '@/components/design-twin/kit-reloj/paso';
import { luegoDe, posicionDe, textoViene } from '@/components/design-twin/kit-reloj/posicion';
import { textoPasoCorto } from '@/components/design-twin/kit-reloj/reglas';
import { estadoInicial, lecturasDe, pasoVivo, avanzar } from '@/components/design-twin/kit-reloj/secuencia';
import { casoDe, type CasoIphone } from '@/components/design-twin/screens/iphone-vivo-ergo/casos';
import { escenarios, meta } from '@/components/design-twin/screens/iphone-vivo-ergo';
import { ZONAS, planRemoSeries, planSkiCalorias } from '@/components/design-twin/screens/iphone-vivo-ergo/planes';
import { caloriasEn, vatiosDeBici, vatiosDeSplit } from '@/components/design-twin/screens/iphone-vivo-ergo/sim';

let n = 0;
function paso(p: Partial<PasoBase> & Pick<PasoBase, 'clase' | 'rol' | 'medida'>): PasoBase {
  return { id: `p${++n}`, fase: 'principal', objetivos: [], cierre: 'medida', ...p };
}
const lect = (x: Partial<Lecturas>): Lecturas => ({ t: 60, hecho: null, ritmo: null, ppm: 160, gps: 'no-aplica', ...x });

/** Lo que la pantalla pinta de un caso tras `segundos` de motor: el mismo camino que `useVivo`. */
function pintado(c: CasoIphone, segundos = 0) {
  let estado = estadoInicial(c.plan, c.sim, c.inicio);
  for (let k = 0; k < segundos; k++) estado = avanzar(estado, c.plan, c.sim).estado;
  const p = pasoVivo(c.plan, estado);
  const l = lecturasDe(p, estado);
  const extra = { metrosPaso: estado.midio ? estado.metros : null };
  const heroe = heroeDeFamilia(p, l, c.plan.zonas, extra);
  return {
    estado,
    p,
    l,
    heroe,
    lamina: laminaDelPaso(p, l, c.plan.zonas, c.plan.reglas),
    posicion: posicionDe(p, extra),
    formato: formatoDe(p),
    metricas: metricasDelPaso(p, l, heroe.clase, c.plan.zonas, extra, c.plan.reglas),
    trabajo: trabajoDe(p, l, heroe.clase),
    chips: enlacesDe(c.dispositivos, p, l),
    luego: luegoDe(c.plan.pasos, estado.i),
  };
}

describe('lo que el ergo pidió al kit compartido', () => {
  it('un paso POR calorías no repite las calorías en la rejilla: el héroe ya dice las que faltan, y la potencia sube', () => {
    const ski = paso({ clase: 'ergo', rol: 'trabajo', nombre: 'SkiErg', maquina: { tipo: 'ski' }, medida: { tipo: 'cal', prescrito: 25, mide: 'ergo' } });
    const l = lect({ split500: 118, hecho: 14, cadencia: 40, vatios: 213, cal: 14 });
    expect(heroeDeFamilia(ski, l, ZONAS)).toMatchObject({ clase: 'falta', texto: '11', unidad: 'cal' });
    expect(metricasDelPaso(ski, l, 'falta', ZONAS).map((m) => m.clave)).toEqual(['split', 'cadencia', 'pulso', 'vatios']);
    // Por metros, las calorías siguen viéndose siempre (§4).
    const porMetros = paso({ clase: 'ergo', rol: 'trabajo', maquina: { tipo: 'remo' }, medida: { tipo: 'distancia', prescrito: 500, mide: 'ergo' } });
    expect(metricasDelPaso(porMetros, l, 'split', ZONAS).map((m) => m.clave)).toContain('cal');
  });

  it('sin nombre de catálogo, la máquina dice quién viene: «Remo · 500 m a 1:52–1:56 /500»', () => {
    const remo = planRemoSeries().pasos[0]!;
    expect(textoPasoCorto(remo)).toBe('Remo · 500 m a 1:52–1:56 /500');
    expect(textoViene(remo)).toBe('Remo · 500 m a 1:52–1:56 /500');
    // Con nombre, el nombre manda (nada cambia para lo que ya había).
    expect(textoPasoCorto({ ...remo, nombre: 'Row' })).toBe('Row · 500 m a 1:52–1:56 /500');
  });
});

describe('un ergómetro cuenta series, nunca «Ergo N/M»', () => {
  it('«Luego» sin objetivo dice «Serie 3/5 · SkiErg · 25 cal»', () => {
    const ski = planSkiCalorias().pasos;
    expect(luegoDe(ski, 1)).toEqual({ que: 'Serie 2/5 · SkiErg · 25\u00A0cal', despues: null });
    expect(luegoDe(ski, 2)).toEqual({ que: 'Recupera 1′ parado', despues: 'Serie 3/5 · SkiErg · 25\u00A0cal' });
  });

  it('la cuenta atrás a la serie 4 lleva la posición de la cabecera: «Remo · Serie 4/5 · 500 m»', () => {
    const remo = planRemoSeries().pasos;
    expect(posicionDe(remo[6]!)).toEqual(['Remo', 'Serie 4/5', '500\u00A0m']);
    expect(posicionDe(remo[6]!).join(' · ')).not.toContain('Ergo');
  });
});

describe('el cuerpo en la máquina', () => {
  it('los vatios salen del /500 como en el monitor; la bici, de su curva; las calorías, del tiempo a esos vatios', () => {
    expect(vatiosDeSplit(120)).toBe(203); // 2:00 /500 ≈ 203 W (la tabla del monitor)
    expect(vatiosDeSplit(100)).toBe(350);
    expect(vatiosDeBici(60)).toBe(300); // 2:00 /1000
    expect(caloriasEn(213, 44)).toBe(14);
  });

  it('un paso por calorías cuenta las suyas como lo hecho y el motor lo cierra al llegar', () => {
    const c = casoDe('ski-calorias');
    const antes = pintado(c);
    expect(antes.l.hecho).toBe(14);
    expect(antes.heroe).toMatchObject({ clase: 'falta', texto: '11', unidad: 'cal' });
    // 25 cal a ~213 W llegan a los ~78 s del paso; el escenario arranca a 44.
    const despues = pintado(c, 40);
    expect(despues.estado.i).toBe(3);
    expect(despues.p.rol).toBe('recuperacion');
  });
});

describe('cada escenario pinta lo que dice su ficha', () => {
  it('remo por series: el /500 actual contra la banda, la rejilla del remo, «Luego» con el después', () => {
    const v = pintado(casoDe('remo-series'), 2);
    expect(v.posicion).toEqual(['Remo', 'Serie 3/5', '500 m']);
    expect(v.formato).toBe('Series');
    expect(v.heroe).toMatchObject({ clase: 'split', unidad: '/500' });
    expect(v.heroe.texto).toMatch(/^1:5[345]$/);
    expect(v.lamina.banda?.rotulo).toBe('1:52–1:56 /500');
    expect(v.lamina.banda?.palabra).toEqual({ marca: null, texto: 'dentro' });
    expect(v.trabajo).toMatchObject({ etiqueta: 'quedan', unidad: 'm' });
    expect(v.metricas.map((m) => m.clave)).toEqual(['cadencia', 'pulso', 'cal', 'vatios']);
    expect(v.metricas[0]).toMatchObject({ unidad: 's/min' });
    expect(v.chips.map((c) => c.texto)).toEqual(['Remo', 'Banda']);
    expect(v.luego).toEqual({ que: 'Recupera 2′ parado', despues: 'Remo · 500 m a 1:52–1:56 /500' });
    // A los 15 s se cae a 2:00: «▼ lento», y la banda lo dice con la palabra, no solo con color.
    const lento = pintado(casoDe('remo-series'), 16);
    expect(lento.lamina.banda?.palabra).toEqual({ marca: '▼', texto: 'lento' });
  });

  it('la recuperación parada: cuenta atrás como héroe, «Viene» con la serie que viene, sin banda, el pulso bajando', () => {
    const v = pintado(casoDe('remo-recupera'), 1);
    expect(v.p.rol).toBe('recuperacion');
    expect(v.posicion).toEqual(['Recupera', 'parado', '2′']);
    expect(v.heroe).toMatchObject({ clase: 'falta', etiqueta: 'quedan' });
    expect(v.lamina.banda).toBeNull();
    expect(v.luego?.que).toBe('Remo · 500 m a 1:52–1:56 /500');
    expect(v.metricas.map((m) => m.clave)).toEqual(['pulso']);
    expect(v.metricas[0]!.tendencia).toBe('baja');
    // A los 25 s ya entró en la serie 4 con GO.
    const go = pintado(casoDe('remo-recupera'), 26);
    expect(go.estado.i).toBe(6);
    expect(go.p.posicion?.serie).toEqual({ n: 4, de: 5 });
  });

  it('la bici: por 1000 m, rpm, «Continuo», nunca «Ergo»', () => {
    const v = pintado(casoDe('bici-continuo'), 2);
    expect(v.posicion).toEqual(['BikeErg', '20′']);
    expect(v.formato).toBe('Continuo');
    expect(v.heroe).toMatchObject({ clase: 'split', unidad: '/1000' });
    expect(v.heroe.texto).toMatch(/^2:0[6-9]$/);
    expect(v.lamina.banda?.rotulo).toBe('2:05–2:10 /1000');
    expect(v.metricas.map((m) => m.clave)).toEqual(['cadencia', 'pulso', 'cal', 'vatios']);
    expect(v.metricas[0]).toMatchObject({ unidad: 'rpm' });
    expect(pintado(casoDe('bici-continuo'), 14).lamina.banda?.palabra).toEqual({ marca: '▼', texto: 'lento' });
  });

  it('el remo continuo a zona: el pulso manda y tiñe; la rejilla no lo repite', () => {
    const v = pintado(casoDe('remo-zona'), 2);
    expect(v.posicion).toEqual(['Remo', 'Z2', '30′']);
    expect(v.heroe).toMatchObject({ clase: 'pulso', unidad: 'ppm' });
    expect(v.heroe.zona?.n).toBe(2);
    expect(v.lamina.tinte).not.toBeNull();
    expect(v.lamina.banda?.zonas?.objetivo).toEqual([2, 2]);
    expect(v.metricas.map((m) => m.clave)).toEqual(['split', 'cadencia', 'cal', 'vatios']);
    expect(pintado(casoDe('remo-zona'), 16).lamina.banda?.palabra).toEqual({ marca: '▲', texto: 'alto' });
  });

  it('el test: la marca, lo que falta como héroe, la rejilla del remo', () => {
    const v = pintado(casoDe('test'), 1);
    expect(esTest(v.p)).toBe(true);
    expect(v.formato).toBe('Test');
    expect(v.posicion).toEqual(['Remo', '2000 m']);
    expect(v.heroe).toMatchObject({ clase: 'falta', unidad: 'm' });
    expect(v.metricas.map((m) => m.clave)).toEqual(['split', 'cadencia', 'pulso', 'cal']);
  });

  it('la máquina perdida: el héroe cae al tiempo, la banda sin marca, «—» en lo del monitor, el chip lo dice', () => {
    const v = pintado(casoDe('maquina-perdida'), 4);
    expect(v.l.viejos).toContain('split500');
    expect(v.heroe).toMatchObject({ clase: 'crono', etiqueta: 'llevas' });
    expect(v.lamina.banda?.marca).toBeNull();
    expect(v.metricas.find((m) => m.clave === 'split')?.valor).toBe('—');
    expect(v.metricas.find((m) => m.clave === 'pulso')?.valor).not.toBe('—');
    expect(v.chips.find((c) => c.clave === 'maquina')).toMatchObject({ texto: 'Remo · sin señal', estado: 'perdido', nota: 'sin señal del remo · toca para reconectar' });
  });

  it('sin máquina: el crono «lo dices tú», el objetivo como banda sin marca, el pulso, y la serie la cierras tú', () => {
    const v = pintado(casoDe('sin-maquina'), 1);
    expect(v.p.cierre).toBe('atleta');
    expect(v.heroe).toMatchObject({ clase: 'crono', etiqueta: 'lo dices tú' });
    expect(v.lamina.banda?.marca).toBeNull();
    expect(v.metricas.map((m) => m.clave)).toEqual(['pulso']);
    expect(v.chips.find((c) => c.clave === 'maquina')).toMatchObject({ texto: 'Conectar el remo', estado: 'apagado' });
  });

  it('el libre es el MISMO objeto que el del coach', () => {
    const sinId = (p: PasoBase) => ({ ...p, id: '' });
    expect(casoDe('libre').plan.pasos.map(sinId)).toEqual(casoDe('remo-series').plan.pasos.map(sinId));
    expect(pintado(casoDe('libre'), 1).posicion).toEqual(['Remo', 'Serie 2/5', '500 m']);
  });

  it('todas las máquinas son su familia y admiten horizontal; ninguna dice PM5', () => {
    for (const c of [casoDe('remo-series'), casoDe('ski-calorias'), casoDe('bici-continuo')]) {
      expect(['remo', 'ski', 'bici']).toContain(familiaDe(c.plan.pasos[0]!));
    }
    expect(familiaDe(planSkiCalorias().pasos[0]!)).toBe('ski');
    const texto = JSON.stringify([meta, escenarios]);
    expect(texto).not.toMatch(/PM5|FTMS|BLE\b/);
    expect(meta.soportaHorizontal).toBe(true);
    expect(meta.enApp).toContain('sustituye');
  });
});
