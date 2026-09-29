// LOS ARREGLOS DEL MOTOR DE LA MUÑECA (29-09) — un bloque por fallo, cada uno
// con la prueba que fallaba antes del arreglo. El motor es el de kit-reloj y lo
// reutilizan el iPhone (`kit-iphone-vivo`) y el reloj Garmin (`kit-garmin`):
// lo que se arregla aquí se arregla en los tres pintores a la vez.
//
//   A1 · un paso CONTINUO cerrado a mano antes de tiempo es un paso cortado.
//   A2 · la vuelta automática no asume el km (`vueltaAutoM`: 400 en pista, 1609 en millas).

import { describe, expect, it } from 'vitest';
import { completitud, type HechoSesion } from '@/components/design-twin/kit-reloj/despues';
import { REGLAS_AVISO_DEFECTO, type PasoBase, type ZonasCoach } from '@/components/design-twin/kit-reloj/paso';
import { avanzar, cerrar, estadoInicial, type EstadoSecuencia, type PlanSesion, type Simulador } from '@/components/design-twin/kit-reloj/secuencia';
import { filasDeVueltas } from '@/components/design-twin/kit-reloj/listas';
import { vueltasDe } from '@/components/design-twin/kit-reloj/vivo';
import { pasoVivo, lecturasDe } from '@/components/design-twin/kit-reloj/secuencia';
import { vozVuelta } from '@/components/design-twin/kit-reloj/voz';
import { hechoDe } from '@/components/design-twin/kit-garmin/vivo';

const ZONAS: ZonasCoach = { techos: [138, 150, 160, 173, 192] };
const plan = (pasos: PasoBase[]): PlanSesion => ({ pasos, zonas: ZONAS, reglas: REGLAS_AVISO_DEFECTO });

let n = 0;
function paso(p: Partial<PasoBase> & Pick<PasoBase, 'clase' | 'rol' | 'medida'>): PasoBase {
  return { id: `p${++n}`, fase: 'principal', objetivos: [], cierre: 'medida', ...p };
}

/** Las cifras llevan un espacio duro antes de la unidad (`fmtPrescrito`): se compara en texto llano. */
const llano = (s: string | null) => s?.replace(/\u00A0/g, ' ') ?? null;

const corre: Simulador = () => ({ ritmo: 300, ppm: 141, gps: 'listo' });

// ---------------------------------------------------------------------------
// A1 · la completitud de un paso continuo
// ---------------------------------------------------------------------------

describe('A1 · un paso continuo cerrado a mano antes del umbral del coach sale «parcial»', () => {
  const tirada = paso({ clase: 'tirada', rol: 'trabajo', medida: { tipo: 'tiempo', prescrito: 4800, mide: 'reloj' }, objetivos: [{ eje: 'zona', min: 2, max: 2, papel: 'principal' }] });
  const p = plan([tirada]);

  it('la tirada de 80′ cerrada con BACK/LAP a los 24′ es el final natural… y está cortada', () => {
    const antes = estadoInicial(p, corre, { i: 0, t: 1440, metros: 4800, sesionT: 1440, sesionM: 4800 });
    const cerrado = cerrar(antes, p, 'atleta').estado;
    expect(cerrado.terminado).toBe(true);
    const c = completitud(hechoDe(p, cerrado, 'natural'));
    expect(c.estado).toBe('parcial');
    expect(c.cuenta).toBe('24′ de 80′');
    expect(c.motivo).toBe('La tirada se cortó a los 24′');
  });

  it('cerrada pasado el umbral (0,9 por defecto: 72′ de 80′), cuenta como hecha', () => {
    const antes = estadoInicial(p, corre, { i: 0, t: 4380, sesionT: 4380 });
    const c = completitud(hechoDe(p, cerrar(antes, p, 'atleta').estado, 'natural'));
    expect(c.estado).toBe('completa');
  });

  it('el umbral es del coach: con 0,25 los 24′ ya cuentan', () => {
    const antes = estadoInicial(p, corre, { i: 0, t: 1440, sesionT: 1440 });
    const r = hechoDe(p, cerrar(antes, p, 'atleta').estado, 'natural');
    expect(completitud(r, { paresMinimos: 4, umbralHecho: 0.25, guardarQuietoS: 600 }).estado).toBe('completa');
  });

  it('por metros: el tempo de 3950 m cerrado en 1200 m, con la distancia en su cuenta', () => {
    const tempo = paso({ clase: 'tempo', rol: 'trabajo', medida: { tipo: 'distancia', prescrito: 3950, mide: 'gps' } });
    const q = plan([tempo]);
    const antes = estadoInicial(q, corre, { i: 0, t: 360, metros: 1200, sesionT: 360, sesionM: 1200 });
    const c = completitud(hechoDe(q, cerrar(antes, q, 'atleta').estado, 'natural'));
    expect(c.estado).toBe('parcial');
    expect(llano(c.cuenta)).toBe('1200 m de 3950 m');
    expect(llano(c.motivo)).toBe('El tempo se cortó en 1200 m');
  });

  it('sin GPS no se sabe cuánto se corrió: no se da por cortado (no se inventa)', () => {
    const tempo = paso({ clase: 'tempo', rol: 'trabajo', medida: { tipo: 'distancia', prescrito: 3950, mide: 'gps' } });
    const r: HechoSesion = { pasos: [tempo], i: 0, final: 'natural', series: [], parciales: [{ i: 0, segundos: 360, metros: null, ppm: 150, hecho: null }] };
    expect(completitud(r).estado).toBe('completa');
  });

  it('un Resultado sin parciales (los de antes) sigue decidiendo por sus series', () => {
    const r: HechoSesion = { pasos: [tirada], i: 0, final: 'natural', series: [] };
    expect(completitud(r).estado).toBe('completa');
  });
});

// ---------------------------------------------------------------------------
// A2 · la vuelta automática, de la longitud que diga el coach
// ---------------------------------------------------------------------------

/** Corre `seg` segundos y devuelve el estado y los segundos en que sonó una vuelta. */
function correrVueltas(q: PlanSesion, sim: Simulador, s0: EstadoSecuencia, seg: number) {
  let s = s0;
  const vueltas: number[] = [];
  for (let t = 1; t <= seg; t++) {
    const r = avanzar(s, q, sim);
    s = r.estado;
    if (r.eventos.some((e) => e.evento === 'vuelta')) vueltas.push(t);
  }
  return { s, vueltas };
}

describe('A2 · la vuelta automática se llama por lo que es y cuenta con su longitud', () => {
  const a250: Simulador = () => ({ ritmo: 250, ppm: 165, gps: 'listo' });
  const tempo = paso({ clase: 'tempo', rol: 'trabajo', medida: { tipo: 'distancia', prescrito: 8000, mide: 'gps' }, objetivos: [{ eje: 'ritmo', min: 245, max: 255, papel: 'principal' }], entorno: 'pista', vueltaAutoM: 400 });
  const q = plan([tempo]);

  it('arrancada a mitad (2700 m, a 100 m de cruzar) NO suena una vuelta falsa al primer segundo', () => {
    const s0 = estadoInicial(q, a250, { i: 0, t: 675, metros: 2700, sesionT: 675, sesionM: 2700 });
    expect(s0.vueltaN).toBe(6);
    const { vueltas } = correrVueltas(q, a250, s0, 30);
    expect(vueltas, 'la 7.ª al cruzar los 2800 m (25 s a 4:10/km), ninguna antes').toEqual([25]);
  });

  it('la tarjeta y la vuelta: «Vuelta 7», su tiempo, su ritmo POR KM y el veredicto contra el ritmo del paso', () => {
    const s0 = estadoInicial(q, a250, { i: 0, t: 675, metros: 2700, sesionT: 675, sesionM: 2700, vueltaDesdeT: 600 });
    const { s } = correrVueltas(q, a250, s0, 25);
    expect(s.banner).toMatchObject({ titulo: 'Vuelta 7', valor: '1:40', pie: '4:10 /km · dentro' });
    expect(s.vueltas[0]).toMatchObject({ n: 7, clase: 'auto', vueltaM: 400, metros: 400, segundos: 100, ritmo: 250, veredicto: 'dentro', eje: 'ritmo' });
    expect(vozVuelta(7, 100, 400)).toBe('Vuelta 7: 1:40.');
  });

  it('la lista rotula «v 7» bajo «Vueltas», y la vuelta en curso es «v 8»', () => {
    const s0 = estadoInicial(q, a250, { i: 0, t: 675, metros: 2700, sesionT: 675, sesionM: 2700 });
    const { s } = correrVueltas(q, a250, s0, 30);
    const { titulo, filas } = filasDeVueltas(s.vueltas, null, 5);
    expect(titulo).toEqual(['Vueltas']);
    expect(filas[0]!.n).toBe('v 7');
    const p = pasoVivo(q, s);
    expect(vueltasDe({ paso: p, lecturas: lecturasDe(p, s), estado: s }).enCurso?.n).toBe('v 8');
  });

  it('con 1000 m sigue siendo el km: «Kilómetro 5», «ritmo del km», «km 5» y «Kilómetros»', () => {
    const rodaje = paso({ clase: 'rodaje', rol: 'trabajo', medida: { tipo: 'tiempo', prescrito: 3000, mide: 'reloj' }, vueltaAutoM: 1000 });
    const r = plan([rodaje]);
    const s0 = estadoInicial(r, a250, { i: 0, t: 1200, sesionT: 1200, sesionM: 4990 });
    const { s, vueltas } = correrVueltas(r, a250, s0, 5);
    expect(vueltas).toEqual([3]);
    expect(s.banner).toMatchObject({ titulo: 'Kilómetro 5', pie: 'ritmo del km' });
    const { titulo, filas } = filasDeVueltas(s.vueltas, null, 5);
    expect(titulo).toEqual(['Kilómetros']);
    expect(filas[0]!.n).toBe('km 5');
    expect(vozVuelta(5, 292, 1000)).toBe('Kilómetro 5: 4:52.');
  });

  it('al entrar en un paso con vuelta automática tras un calentamiento sin ella, no suena la del camino', () => {
    const cal = paso({ clase: 'calentamiento', rol: 'trabajo', fase: 'calentamiento', medida: { tipo: 'distancia', prescrito: 2300, mide: 'gps' } });
    const millas = paso({ clase: 'rodaje', rol: 'trabajo', medida: { tipo: 'tiempo', prescrito: 1800, mide: 'reloj' }, vueltaAutoM: 1609 });
    const r = plan([cal, millas]);
    const s0 = estadoInicial(r, a250, { i: 0, t: 570, metros: 2290, sesionT: 570, sesionM: 2290 });
    const { vueltas, s } = correrVueltas(r, a250, s0, 30);
    expect(s.i).toBe(1);
    expect(vueltas, 'la milla 2 cae en los 3218 m, lejos de estos 30 s').toEqual([]);
  });
});
