// EL KIT DEL IPHONE — lo PURO que no es dominio (el dominio se prueba en
// kit-reloj-familia): los enlaces derivados de las lecturas, el vocabulario
// cerrado de la acción primaria, la hoja de terminar, la cabecera que quita
// por el final en vez de truncar, y los tokens medidos (contraste AA, suelo).

import { describe, expect, it } from 'vitest';
import { contrastRatio, hexToRgb } from '@fahybrid/shared/domain/coach/club-accent';
import { REGLAS_AVISO_DEFECTO, type Lecturas, type PasoBase, type ZonasCoach } from '@/components/design-twin/kit-reloj/paso';
import { estadoInicial, type PlanSesion } from '@/components/design-twin/kit-reloj/secuencia';
import { pasoVivo } from '@/components/design-twin/kit-reloj/secuencia';
import { VOCABULARIO_PRIMARIA, claveDesdeEtiqueta, primariaDe, resumenParaTerminar } from '@/components/design-twin/kit-iphone-vivo/accion';
import { partesQueCaben } from '@/components/design-twin/kit-iphone-vivo/cabecera';
import { enlacesDe, notaEnlace, usaGps, type Dispositivos } from '@/components/design-twin/kit-iphone-vivo/enlace';
import { ALTO, CELDA, CI, HUECO, LIENZO, NUMERAL, TI, anchoTexto, anchoUtil, tallaHeroe } from '@/components/design-twin/kit-iphone-vivo/tokens';

const ZONAS: ZonasCoach = { techos: [138, 150, 160, 173, 192] };
let n = 0;
function paso(p: Partial<PasoBase> & Pick<PasoBase, 'clase' | 'rol' | 'medida'>): PasoBase {
  return { id: `p${++n}`, fase: 'principal', objetivos: [], cierre: 'medida', ...p };
}
const lect = (x: Partial<Lecturas>): Lecturas => ({ t: 60, hecho: null, ritmo: null, ppm: 160, gps: 'no-aplica', ...x });
const MOVIL: Dispositivos = { reloj: 'sin', maquina: null, pulsometro: 'banda' };

describe('los enlaces se derivan de las lecturas (I10)', () => {
  const ski = paso({ clase: 'ergo', rol: 'trabajo', nombre: 'SkiErg', maquina: { tipo: 'ski' }, medida: { tipo: 'distancia', prescrito: 250, mide: 'ergo' } });
  const serie = paso({ clase: 'series', rol: 'trabajo', medida: { tipo: 'distancia', prescrito: 1000, mide: 'gps' } });

  it('la máquina emparejada, perdida (dato viejo) o sin conectar, en copy de box', () => {
    expect(enlacesDe({ ...MOVIL, maquina: 'ski' }, ski, lect({ split500: 125 })).find((c) => c.clave === 'maquina')).toMatchObject({ texto: 'Ski', estado: 'ok', nota: null });
    const perdida = enlacesDe({ ...MOVIL, maquina: 'ski' }, ski, lect({ viejos: ['split500', 'hecho'] })).find((c) => c.clave === 'maquina')!;
    expect(perdida).toMatchObject({ texto: 'Ski · sin señal', estado: 'perdido' });
    expect(perdida.nota).toBe('sin señal del ski · toca para reconectar');
    expect(enlacesDe(MOVIL, ski, lect({})).find((c) => c.clave === 'maquina')).toMatchObject({ texto: 'Conectar el ski', estado: 'apagado', nota: 'sin el ski · lo dices tú' });
  });

  it('el GPS solo cuando se corre en calle: ni en cinta, ni en un tabata de burpees, ni en un test de remo', () => {
    expect(usaGps(serie)).toBe(true);
    expect(usaGps({ ...serie, entorno: 'cinta' })).toBe(false);
    const info = { formato: 'pared' as const, trabajoS: 20, descansoS: 10, rondas: 8 };
    expect(usaGps(paso({ clase: 'series', rol: 'trabajo', nombre: 'Burpee', medida: { tipo: 'tiempo', prescrito: 20, mide: 'reloj' }, wod: info }))).toBe(false);
    expect(usaGps(paso({ clase: 'test', rol: 'trabajo', maquina: { tipo: 'remo' }, medida: { tipo: 'distancia', prescrito: 2000, mide: 'ergo' } }))).toBe(false);
    const buscando = enlacesDe(MOVIL, serie, lect({ gps: 'buscando' }));
    expect(buscando.find((c) => c.clave === 'gps')).toMatchObject({ estado: 'buscando', nota: 'GPS · buscando señal' });
    expect(enlacesDe(MOVIL, serie, lect({ gps: 'listo' })).find((c) => c.clave === 'gps')).toMatchObject({ estado: 'ok', nota: null });
  });

  it('el reloj como motor lo dice; el pulso sin lectura busca; una sola nota, la más grave', () => {
    const chips = enlacesDe({ reloj: 'motor', maquina: 'ski', pulsometro: 'reloj' }, ski, lect({ ppm: null, viejos: ['split500'] }));
    expect(chips.map((c) => c.clave)).toEqual(['reloj', 'maquina', 'pulso']);
    expect(chips[0]!.nota).toContain('el reloj lleva el entreno');
    expect(chips[2]).toMatchObject({ texto: 'Pulso', estado: 'buscando' });
    // Lo perdido antes que lo que busca, antes que lo informativo.
    expect(notaEnlace(chips)).toBe('sin señal del ski · toca para reconectar');
    expect(notaEnlace(enlacesDe({ reloj: 'motor', maquina: null, pulsometro: 'reloj' }, serie, lect({ gps: 'listo' })))).toContain('el reloj lleva el entreno');
  });
});

describe('el vocabulario cerrado de la acción primaria', () => {
  it('cada clave lleva su texto y su peso; el naranja solo para lo primario', () => {
    expect(primariaDe('serie hecha')).toEqual({ texto: 'Serie hecha', peso: 'primaria' });
    expect(primariaDe('ronda hecha')).toEqual({ texto: '+1 ronda', peso: 'primaria' });
    expect(primariaDe('siguiente paso').peso).toBe('secundaria');
    expect(primariaDe('vuelta').peso).toBe('secundaria');
    const textos = Object.values(VOCABULARIO_PRIMARIA).map((v) => v.texto);
    expect(new Set(textos).size).toBe(textos.length);
    // Castellano de box: nada en inglés, nada en mayúsculas gritadas.
    textos.forEach((t) => expect(t).not.toMatch(/^[A-Z ]+$/));
  });

  it('las etiquetas de la muñeca caen en el vocabulario, y lo que no está cae a «siguiente paso»', () => {
    expect(claveDesdeEtiqueta('empezar ya')).toBe('empezar ya');
    expect(claveDesdeEtiqueta('Sled Push hecho')).toBe('hecho');
    expect(claveDesdeEtiqueta('A1 · serie 3 hecha')).toBe('hecho');
    expect(claveDesdeEtiqueta('lo que sea')).toBe('siguiente paso');
  });
});

describe('la hoja de terminar dice lo hecho', () => {
  it('posición, km corridos y de máquina, y el tiempo de sesión', () => {
    const serie = paso({ clase: 'series', rol: 'trabajo', medida: { tipo: 'distancia', prescrito: 1000, mide: 'gps' }, posicion: { serie: { n: 3, de: 6 } } });
    const plan: PlanSesion = { pasos: [serie], zonas: ZONAS, reglas: REGLAS_AVISO_DEFECTO };
    const e = estadoInicial(plan, () => ({ ritmo: 230, ppm: 170, gps: 'listo' }), { i: 0, t: 88, metros: 380, sesionT: 1627, sesionM: 5581 });
    const r = resumenParaTerminar(pasoVivo(plan, e), { ...e, sesionErgoM: 1250 });
    expect(r.titulo).toBe('Serie 3/6 · 1000 m');
    expect(r.lineas).toEqual(['5,58 km corridos', '1,25 km de máquina', '27:07 de sesión']);
  });
});

describe('la cabecera quita por el final, nunca trunca', () => {
  it('a 390 pt «Ronda 3/3 · Estación 1/3» cabe entera junto al crono; un contexto más largo pierde lo prescrito antes que la posición', () => {
    const util = 390 - 2 * 20 - 66 - 16;
    expect(partesQueCaben(['Ronda 3/3', 'Estación 1/3'], util)).toEqual(['Ronda 3/3', 'Estación 1/3']);
    // Quita por el final (lo prescrito antes que la posición) y lo que queda cabe.
    const largo = ['Tanda 2/3', 'Serie 4/6', 'Ronda 2/5', '1000 m'];
    const caben = partesQueCaben(largo, util);
    expect(caben.length).toBeLessThan(largo.length);
    expect(caben).toEqual(largo.slice(0, caben.length));
    expect(anchoTexto(caben.join(' · '), TI.posicion.cuerpo, TI.posicion.peso)).toBeLessThanOrEqual(util);
    expect(partesQueCaben(['Una posición larguísima que no cabe de ninguna manera'], 100)).toHaveLength(1);
  });
});

describe('los tokens, medidos', () => {
  const ratio = (a: string, b: string) => {
    const c = hexToRgb(a);
    const f = hexToRgb(b);
    if (!c || !f) throw new Error(`hex inválido: ${a} / ${b}`);
    return contrastRatio(c, f);
  };

  it('contraste AA sobre el fondo REAL (CONTRATO-UI §4.2): tinta2 sobre negro y sobre la celda; negro sobre naranja', () => {
    expect(ratio(CI.tinta2, CI.fondo)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(CI.tinta2, CI.celda)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(CI.tinta2, CI.superficie2)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(CI.sobreAccion, CI.accion)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(CI.tinta, CI.fondo)).toBeGreaterThanOrEqual(7);
  });

  it('nada por debajo de 15 pt; un numeral, un token', () => {
    expect(TI.suelo).toBe(15);
    expect(TI.etiqueta.cuerpo).toBeGreaterThanOrEqual(TI.suelo);
    expect(TI.nota.cuerpo).toBeGreaterThanOrEqual(TI.suelo);
    expect(TI.chip.cuerpo).toBeGreaterThanOrEqual(TI.suelo);
    expect(TI.boton.alto).toBeGreaterThanOrEqual(64);
    expect(NUMERAL.variante).toBe('tabular-nums');
  });

  it('el presupuesto vertical a 844 pt: banda + trabajo + 2 × 2 celdas caben sin desbordar', () => {
    const safe = { arriba: 59, abajo: 34 };
    const fijo = ALTO.cabecera + ALTO.puntos + ALTO.sujeto + ALTO.banda + ALTO.trabajo + ALTO.luego + ALTO.tira + ALTO.accion + ALTO.pieAccion;
    const huecos = HUECO * 8;
    const rejilla = 844 - safe.arriba - safe.abajo - fijo - huecos;
    expect(rejilla).toBeGreaterThanOrEqual(2 * CELDA.minAlto + HUECO);
  });

  it('el héroe cabe a 390 pt con las cifras que rompen, y crece más que en la muñeca', () => {
    const util = anchoUtil(LIENZO.minAncho);
    for (const [texto, unidad] of [['3:52', '/km'], ['10:59:59', undefined], ['8 × 127,5', 'kg'], ['1000', 'm'], ['2:04', '/1000']] as const) {
      const t = tallaHeroe(texto, unidad, util, ALTO.sujeto - TI.etiquetaSujeto.alto - 16, TI.sujeto);
      expect(t.ancho).toBeLessThanOrEqual(util);
      expect(t.cuerpo).toBeGreaterThanOrEqual(56);
    }
    expect(tallaHeroe('3:52', '/km', util, 180, TI.sujeto).cuerpo).toBeGreaterThan(96);
  });
});
