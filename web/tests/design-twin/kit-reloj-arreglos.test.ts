// LOS ARREGLOS DEL MOTOR DE LA MUÑECA (29-09) — un bloque por fallo, cada uno
// con la prueba que fallaba antes del arreglo. El motor es el de kit-reloj y lo
// reutilizan el iPhone (`kit-iphone-vivo`) y el reloj Garmin (`kit-garmin`):
// lo que se arregla aquí se arregla en los tres pintores a la vez.
//
//   A1 · un paso CONTINUO cerrado a mano antes de tiempo es un paso cortado.
//   A2 · la vuelta automática no asume el km (`vueltaAutoM`: 400 en pista, 1609 en millas).
//   A6 · «Viene:» dice lo que falta; la propuesta de kg no se sale de la dosis.
//   A7 · estructuraDe sin dos filas «ahora» en un circuito.
//   A3 · GPS perdido a mitad de un paso por distancia: lo hecho NO se mide (—), nada congelado.
//   A4 · deshacer un cierre recalcula la lectura de ahora.
//   A5 · hoyDe / grupoPrincipal seguros sin paso de trabajo.

import { describe, expect, it } from 'vitest';
import { completitud, type HechoSesion } from '@/components/design-twin/kit-reloj/despues';
import { REGLAS_AVISO_DEFECTO, type PasoBase, type ZonasCoach } from '@/components/design-twin/kit-reloj/paso';
import { avanzar, cerrar, deshacerCierre, estadoInicial, type EstadoSecuencia, type PlanSesion, type Simulador } from '@/components/design-twin/kit-reloj/secuencia';
import { filasDeVueltas } from '@/components/design-twin/kit-reloj/listas';
import { vueltasDe } from '@/components/design-twin/kit-reloj/vivo';
import { pasoVivo, lecturasDe } from '@/components/design-twin/kit-reloj/secuencia';
import { vozVuelta } from '@/components/design-twin/kit-reloj/voz';
import { NOTA_DATO_VIEJO_APPLE, laminaDelPaso } from '@/components/design-twin/kit-reloj/lamina';
import { filasDeDatos } from '@/components/design-twin/kit-reloj/listas';
import { sesion493 as sesion493C } from '@/components/design-twin/screens/reloj-circuito/planes';
import { TITULO_SESION_SIN_TRABAJO, estructuraDe, filasDePasos, grupoPrincipal, hoyDe } from '@/components/design-twin/kit-reloj/estructura';
import { sesion492 } from '@/components/design-twin/screens/reloj-fuerza/planes';
import { textoViene } from '@/components/design-twin/screens/reloj-fuerza/textos';
import { cargaDelPlan } from '@/components/design-twin/kit-reloj/anotar';
import { textoKgPlan } from '@/components/design-twin/kit-reloj/fuerza';
import { sesionDe } from '@/components/design-twin/kit-reloj/vivo';
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

// ---------------------------------------------------------------------------
// A3 · GPS perdido a mitad de un paso por distancia
// ---------------------------------------------------------------------------

describe('A3 · sin GPS, lo hecho no se mide: «—» en el héroe y en Datos, nunca un valor viejo', () => {
  const serie = paso({ clase: 'series', rol: 'trabajo', medida: { tipo: 'distancia', prescrito: 1000, mide: 'gps' }, objetivos: [{ eje: 'ritmo', min: 245, max: 255, papel: 'principal' }] });
  const q = plan([serie]);
  const con: Simulador = () => ({ ritmo: 250, ppm: 165, gps: 'listo' });
  const sin: Simulador = () => ({ ritmo: null, ppm: 165, gps: 'buscando' });

  function conGpsPerdido() {
    let s = estadoInicial(q, con, { i: 0 });
    for (let k = 0; k < 100; k++) s = avanzar(s, q, con).estado; // ~400 m corridos
    for (let k = 0; k < 20; k++) s = avanzar(s, q, sin).estado;
    return s;
  }

  it('lo hecho no se mide mientras no hay GPS (no hay «quedan» congelado), y vuelven al recuperarlo', () => {
    const s = conGpsPerdido();
    const p = pasoVivo(q, s);
    const l = lecturasDe(p, s);
    expect(l.hecho).toBeNull();
    const lam = laminaDelPaso(p, l, ZONAS);
    // Nadie sabe lo que falta: el héroe cae a lo que se lleva (el reloj), jamás a un «quedan» congelado.
    expect(lam.heroe).toMatchObject({ clase: 'crono', etiqueta: 'llevas' });
    expect(lam.segundo).toBeNull();
    const conVuelta = avanzar(s, q, con).estado;
    expect(lecturasDe(pasoVivo(q, conVuelta), conVuelta).hecho).toBeGreaterThan(400);
  });

  it('la página Datos no enseña la distancia ni el ritmo medio viejos', () => {
    const s = conGpsPerdido();
    const filas = filasDeDatos(sesionDe(s), lecturasDe(pasoVivo(q, s), s));
    expect(filas[1]!.valor).toBe('—');
    expect(filas[2]!.valor).toBe('—');
  });

  it('la nota de dato viejo es de cada pintor: la de Apple por defecto, otra si el pintor la pasa', () => {
    const l = { ...lecturasDe(serie, estadoInicial(q, con, { i: 0 })), viejos: ['ritmo' as const] };
    expect(laminaDelPaso(serie, l, ZONAS).nota).toBe(NOTA_DATO_VIEJO_APPLE);
    expect(laminaDelPaso(serie, l, ZONAS, REGLAS_AVISO_DEFECTO, 'sin dato').nota).toBe('sin dato');
  });
});

// ---------------------------------------------------------------------------
// A4 · deshacer un cierre recalcula la lectura de ahora
// ---------------------------------------------------------------------------

describe('A4 · deshacer no pinta la lectura del paso siguiente sobre el reabierto', () => {
  it('cerrada la serie con la recuperación a 6:11, al deshacer la lectura es la de la serie (3:50), no la lenta', () => {
    const serie = paso({ clase: 'series', rol: 'trabajo', medida: { tipo: 'distancia', prescrito: 1000, mide: 'gps' }, objetivos: [{ eje: 'ritmo', min: 225, max: 235, papel: 'principal' }] });
    const rec = paso({ clase: 'recuperacion', rol: 'recuperacion', medida: { tipo: 'tiempo', prescrito: 90, mide: 'reloj' } });
    const q = plan([serie, rec]);
    const sim: Simulador = (p) => ({ ritmo: p.rol === 'trabajo' ? 230 : 371, ppm: 150, gps: 'listo' });
    const a = estadoInicial(q, sim, { i: 0, t: 100, metros: 400, sesionT: 100, sesionM: 400 });
    const cerrado = avanzar(cerrar(a, q, 'atleta').estado, q, sim).estado; // un segundo ya en la recuperación
    expect(cerrado.lect.ritmo).toBe(371);
    const d = deshacerCierre(a, cerrado, q, sim);
    expect(d.i).toBe(0);
    expect(d.lect.ritmo).toBe(230);
    expect(d.t).toBe(101);
  });
});

// ---------------------------------------------------------------------------
// A5 · un plan sin paso de trabajo no rompe lo de hoy
// ---------------------------------------------------------------------------

describe('A5 · hoyDe y grupoPrincipal son seguros sin ningún paso de trabajo', () => {
  it('un plan de solo descanso: grupoPrincipal es null y hoyDe da un título, no explota', () => {
    const solo = [paso({ clase: 'descanso', rol: 'descanso', medida: { tipo: 'tiempo', prescrito: 60, mide: 'reloj' } })];
    expect(grupoPrincipal(filasDePasos(solo))).toBeNull();
    expect(hoyDe(solo)).toMatchObject({ titulo: TITULO_SESION_SIN_TRABAJO, sub: null });
    expect(hoyDe([])).toMatchObject({ titulo: TITULO_SESION_SIN_TRABAJO });
  });

  it('con trabajo, todo igual que antes', () => {
    const t = [paso({ clase: 'tempo', rol: 'trabajo', medida: { tipo: 'tiempo', prescrito: 1200, mide: 'reloj' } })];
    expect(grupoPrincipal(filasDePasos(t))?.paso).toBe(t[0]);
  });
});

// ---------------------------------------------------------------------------
// A6 · «Viene:» dice lo que falta; lo que se lee es lo que se carga
// ---------------------------------------------------------------------------

describe('A6 · «Viene:» no repite el total en cada descanso y la propuesta cabe en la dosis', () => {
  it('en el descanso antes de la serie 3 de Sled Push 5 × 25 m, «Viene:» dice «3 × 25 m», no «5 × 25 m»', () => {
    const q = sesion492();
    const idx = q.pasos.flatMap((p, i) => (p.nombre === 'Sled Push' && p.rol === 'trabajo' ? [i] : []));
    expect(idx).toHaveLength(5);
    expect(llano(textoViene(q, idx[0]! - 1, {})!.dosis)).toBe('5 × 25 m');
    expect(llano(textoViene(q, idx[2]! - 1, {})!.dosis)).toBe('3 × 25 m');
    expect(llano(textoViene(q, idx[4]! - 1, {})!.dosis)).toBe('25 m');
  });

  it('72 % de 186,5 kg = 134,3: la dosis y la propuesta dicen 135 (cargable con discos de 2,5), no 134 vs 135', () => {
    const f = { ejercicio: 'x', carga: { tipo: 'rm', pctMin: 72, pctMax: 72, rmKg: 186.5 }, esfuerzo: null, aproximacion: false, pasoKg: 2.5 } as const;
    expect(cargaDelPlan(f)).toBe(135);
    expect(textoKgPlan(f.carga, f.pasoKg)).toBe('135 kg');
  });

  it('una banda que admite múltiplos de la barra sigue siendo la del coach (65–70 % → 121–131) y la propuesta cae dentro', () => {
    const f = { ejercicio: 'x', carga: { tipo: 'rm', pctMin: 65, pctMax: 70, rmKg: 186.5 }, esfuerzo: null, aproximacion: false, pasoKg: 2.5 } as const;
    expect(textoKgPlan(f.carga, f.pasoKg)).toBe('121–131 kg');
    const p = cargaDelPlan(f)!;
    expect(p).toBeGreaterThanOrEqual(121);
    expect(p).toBeLessThanOrEqual(131);
    expect(p % 2.5).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// A7 · la estructura de un circuito no marca «ahora» dos filas a la vez
// ---------------------------------------------------------------------------

describe('A7 · estructuraDe con grupos intercalados (circuito 5 rondas de Run + estación)', () => {
  const c = sesion493C();
  const filas = estructuraDe(c.plan.pasos);
  const ahora = (i: number) => filas(i).filter((f) => f.estado === 'ahora').map((f) => f.trabajo.nombre ?? f.trabajo.clase);

  it('en cada paso hay UNA fila «ahora», la de ese paso: Run en el run, la estación en su estación', () => {
    c.plan.pasos.forEach((p, i) => {
      if (p.rol !== 'trabajo' || i === 0) return;
      expect(ahora(i), `paso ${i}`).toEqual([p.nombre ?? p.clase]);
    });
  });

  it('mientras haces la estación de la ronda 3, «5 × Run» no está hecho ni ahora: le quedan repeticiones', () => {
    const j = c.plan.pasos.findIndex((p) => p.nombre === 'Rowing');
    const run = filas(j).find((f) => f.trabajo.clase === 'carrera' && f.veces === 5)!;
    expect(run.estado).toBe('pendiente');
    const fin = filas(c.plan.pasos.length - 1).find((f) => f.trabajo.clase === 'carrera' && f.veces === 5)!;
    expect(fin.estado).toBe('hecho');
  });
});
