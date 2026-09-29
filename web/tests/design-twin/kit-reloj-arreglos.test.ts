// LOS ARREGLOS DEL MOTOR DE LA MUÑECA (29-09) — un bloque por fallo, cada uno
// con la prueba que fallaba antes del arreglo. El motor es el de kit-reloj y lo
// reutilizan el iPhone (`kit-iphone-vivo`) y el reloj Garmin (`kit-garmin`):
// lo que se arregla aquí se arregla en los tres pintores a la vez.
//
//   A1 · un paso CONTINUO cerrado a mano antes de tiempo es un paso cortado.

import { describe, expect, it } from 'vitest';
import { completitud, type HechoSesion } from '@/components/design-twin/kit-reloj/despues';
import { REGLAS_AVISO_DEFECTO, type PasoBase, type ZonasCoach } from '@/components/design-twin/kit-reloj/paso';
import { cerrar, estadoInicial, type PlanSesion, type Simulador } from '@/components/design-twin/kit-reloj/secuencia';
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
