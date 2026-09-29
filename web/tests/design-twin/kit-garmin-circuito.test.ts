// EL EXAMEN DEL CIRCUITO EN GARMIN (docs/garmin-reloj/modelo.md §3, §5, §6, §11).
//
// Cada paso de cada circuito (493, 492, 506, la simulación completa de HYROX y
// la de dobles), en varios momentos y en los CUATRO relojes (454, 390, 260 y
// 218), pasa por las caras de la familia: la cara del paso, el 3-2-1 y el GO,
// «entras a…», la pausa, el deshacer y las tres páginas propias. En todas:
// ninguna línea se sale de la cuerda del círculo a su altura, ningún texto
// baja del 6,2 % de D, el héroe cae en 0,20–0,26 D, nada se pisa y lo que va
// en la cara de cifras lo sabe pintar la bitmap del reloj. El héroe es el de
// `laminaDelPaso`, salvo el de la campana (lo que el atleta dice).
//
// Y lo que solo es de esta familia: el crono total nunca se va del contexto;
// los botones son los de la tabla de §5 en los estados que usa; cada evento
// del motor tiene su aviso de §6; el aro se divide en rondas; la estructura
// cuenta por rondas (la 5 de 492 sin Farmers); nada de PM5 ni de marca.

import { describe, expect, it } from 'vitest';
import {
  AVISOS,
  BOTONES_TABLA,
  FILA_MODELO,
  MAX_PERFILES,
  TAMANOS,
  accionDe,
  componerAvisos,
  disponerDatos,
  disponerDeshacer,
  disponerEstructura,
  disponerPausa,
  esAviso,
  estadoDelPaso,
  eventosDeTransicion,
  fmtPulsos,
  fmtTono,
  type EstadoMandos,
} from '@/components/design-twin/kit-garmin';
import { NOTA_RELEVO } from '@/components/design-twin/kit-reloj/dobles';
import { laminaDelPaso } from '@/components/design-twin/kit-reloj/lamina';
import type { PasoBase } from '@/components/design-twin/kit-reloj/paso';
import { cerrar, estadoInicial, lecturasDe, pasoVivo } from '@/components/design-twin/kit-reloj/secuencia';
import { caso } from '@/components/design-twin/screens/reloj-circuito/casos';
import { dibujoDe, esEstacion, esPuntuacion, sesion492, sesion493, sesion506, type Circuito } from '@/components/design-twin/screens/reloj-circuito/planes';
import { totalDe } from '@/components/design-twin/screens/reloj-circuito/vista';
import { aroPorRondas } from '@/components/design-twin/screens/garmin-circuito/aro';
import { disponerCaraCircuito, disponerCuentaC, disponerEntrasC, lineasContextoTotal } from '@/components/design-twin/screens/garmin-circuito/caras';
import { casoDe } from '@/components/design-twin/screens/garmin-circuito/casos';
import { avisoCierreC } from '@/components/design-twin/screens/garmin-circuito/mandos';
import { disponerVueltasC, filasDatosC, filasEstructuraC, filasVueltasC } from '@/components/design-twin/screens/garmin-circuito/paginas';
import { entrasA } from '@/components/design-twin/screens/garmin-circuito/pantalla';
import { paraGarmin, rondasDe, simulacro, simulacroDobles } from '@/components/design-twin/screens/garmin-circuito/plan';
import { comprobar } from './garmin-circuito-medidas';
import { normal, tablaDe } from './garmin-modelo';

const CIRCUITOS: Record<string, Circuito> = {
  '493': paraGarmin(sesion493()),
  '492': paraGarmin(sesion492()),
  '506': paraGarmin(sesion506()),
  HYROX: simulacro(),
  'HYROX dobles': simulacroDobles(),
};

/** El ritmo del atleta simulado en sus carreras, s/km. */
const RITMO = 272;
/** Los momentos de un paso que se miran: al empezar, a la mitad y al final (y uno largo si nada lo acota). */
function momentos(p: PasoBase): Array<{ t: number; metros?: number }> {
  const pr = p.medida.prescrito ?? 60;
  if (p.medida.tipo === 'distancia' && p.medida.mide === 'gps') return [{ t: 1 }, { t: 60, metros: pr / 2 }, { t: 200, metros: Math.max(0, pr - 30) }];
  if (p.medida.tipo === 'tiempo') return [{ t: 0 }, { t: Math.floor(pr / 2) }, { t: Math.max(0, pr - 2) }];
  return [{ t: 0 }, { t: 45 }, { t: 611 }];
}

/** Los diales de la campana que se miran: sin declarar, con reps. */
const DIALES = [null, { rondas: 0, reps: 16 }];
describe('las caras del circuito caben en los cuatro relojes', () => {
  for (const [nombre, c] of Object.entries(CIRCUITOS)) {
    it(`${nombre}: cada paso, en cada momento, a 454, 390, 260 y 218 (cara, 3-2-1, GO, entras a…, pausa, deshacer y páginas)`, () => {
      c.plan.pasos.forEach((base, i) => {
        for (const m of momentos(base)) {
          const b = caso(c, i, m.t, RITMO, { metros: m.metros });
          const s = estadoInicial(c.plan, b.sim, b.inicio);
          const paso = pasoVivo(c.plan, s);
          const lecturas = lecturasDe(paso, s);
          const total = totalDe(s, c);
          for (const { D } of TAMANOS) {
            const que = `${nombre} · paso ${i} (${paso.clase}${paso.roxzone ? ' ' + paso.roxzone : ''}) t=${m.t}`;
            for (const dial of esPuntuacion(paso) ? DIALES : [null]) {
              const d = disponerCaraCircuito({ paso, lecturas, zonas: c.plan.zonas, reglas: c.plan.reglas, c, total, dial, D });
              comprobar(d, `${que} · cara`);
              // El héroe lo decide `laminaDelPaso`; solo la campana pinta lo que el atleta dice.
              const lamina = laminaDelPaso(paso, lecturas, c.plan.zonas, c.plan.reglas);
              if (!esPuntuacion(paso)) expect(d.heroe?.texto, `${que} · el héroe no es el de la lámina`).toBe(lamina.heroe.texto);
              else expect(d.heroe?.texto).toBe(dial?.reps == null ? '—' : String(dial.reps));
              // El total no se va del contexto (cuando corre).
              if (total != null) {
                const ctx = d.lineas.filter((l) => l.rol === 'contexto').flatMap((l) => l.piezas.map((p) => p.texto));
                expect(ctx.join(' '), `${que} · el total no está en el contexto`).toContain(fmtTotal(total));
              }
            }
            if (paso.siguiente && paso.siguiente.rol === 'trabajo') {
              comprobar(disponerCuentaC(3, paso.siguiente, c, D), `${que} · 3-2-1`);
              comprobar(disponerCuentaC(0, paso.siguiente, c, D), `${que} · GO`);
            }
            if (esEstacion(paso)) comprobar(disponerEntrasC(paso, c, total, D), `${que} · entras a`);
            comprobar(disponerPausa(s.sesionT, paso, D), `${que} · pausa`);
            comprobar(disponerDeshacer(avisoCierreC(paso, c), D), `${que} · deshacer`);
            comprobar(disponerDatos(filasDatosC(c, s, lecturas, total), c.plan.zonas, D), `${que} · Datos`);
            const { titulo, filas } = filasVueltasC(c, s, () => 16);
            comprobar(disponerVueltasC(titulo, filas, D), `${que} · Vueltas`);
            comprobar(disponerEstructura(filasEstructuraC(c, i), D), `${que} · Estructura`);
          }
        }
      });
    });
  }
});

/** Un total como lo pinta el reloj: «41:12», «1:21:44». */
const fmtTotal = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.round(s % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};

describe('el crono total: nunca se quita, nunca se trunca', () => {
  it('con un total corto cabe junto a la posición en una línea, a los cuatro tamaños', () => {
    for (const { D } of TAMANOS) {
      const l = lineasContextoTotal(['Run 5/8'], 2472, D);
      expect(l, `a ${D}`).toHaveLength(1);
      expect(l[0]!.cabe).toBe(true);
      expect(l[0]!.piezas.map((p) => p.texto).join(' ')).toBe('Run 5/8 · 41:12');
    }
  });

  it('cuando no cabe (una posición larga y más de una hora), pasa a dos líneas: el total arriba, la posición debajo, ninguna cortada', () => {
    for (const { D } of TAMANOS) {
      const dos = lineasContextoTotal(['Estación 8/8'], 3661, D);
      expect(dos, `a ${D}`).toHaveLength(2);
      for (const l of dos) expect(l.cabe, `a ${D}`).toBe(true);
      expect(dos[0]!.piezas[0]!.texto).toBe('1:01:01');
      expect(dos[1]!.piezas[0]!.texto).toBe('Estación 8/8');
    }
  });

  it('antes de que corra (calentamiento), no hay total: solo la posición', () => {
    const l = lineasContextoTotal(['Calentamiento'], null, 218);
    expect(l.map((x) => x.piezas.map((p) => p.texto).join(''))).toEqual(['Calentamiento']);
  });
});

describe('lo que Garmin no lee, lo dice el atleta (G7)', () => {
  it('ninguna estación ni Roxzone del circuito para Garmin depende del ergómetro o del movimiento', () => {
    for (const [nombre, c] of Object.entries(CIRCUITOS)) {
      for (const p of c.plan.pasos) {
        expect(['ergo', 'sensor'], `${nombre} · ${p.nombre ?? p.clase}`).not.toContain(p.medida.mide);
        if (p.clase === 'estacion' || p.roxzone) expect(p.cierre, `${nombre} · ${p.nombre ?? p.clase}`).toBe('atleta');
      }
    }
  });

  it('la estación tiene por héroe su crono y por objetivo una instrucción (nunca un veredicto ni una banda)', () => {
    const c = CIRCUITOS['493']!;
    const i = c.plan.pasos.findIndex((p) => p.nombre === 'SkiErg');
    const b = caso(c, i, 93, RITMO);
    const s = estadoInicial(c.plan, b.sim, b.inicio);
    const paso = pasoVivo(c.plan, s);
    const d = disponerCaraCircuito({ paso, lecturas: lecturasDe(paso, s), zonas: c.plan.zonas, reglas: c.plan.reglas, c, total: totalDe(s, c), dial: null, D: 454 });
    expect(d.heroe?.texto).toBe('1:33');
    expect(d.pista).toBeNull();
    const texto = (rol: string) => d.lineas.filter((l) => l.rol === rol).flatMap((l) => l.piezas.map((p) => p.texto)).join('');
    expect(texto('etiqueta')).toBe('lo dices tú · LAP');
    expect(texto('instruccion')).toBe('SkiErg');
    expect(texto('dosis')).toContain('RPE 8,5');
    expect(texto('dosis')).toContain('500');
  });
});

// §5 — los botones de los estados que usa el circuito

describe('§5 — los botones del circuito son los de la tabla', () => {
  const TABLA = tablaDe('## 5. Interacción');
  const porNombre = new Map(Object.entries(FILA_MODELO).map(([e, n]) => [n, e as EstadoMandos]));

  /** Lo que dice el documento para un estado y un botón. */
  const celda = (estado: EstadoMandos, k: number) => {
    const fila = TABLA.find((f) => porNombre.get(f[0]!) === estado)!;
    return normal(fila[k + 1]!);
  };

  it('cada paso del circuito cae en un estado, y ese estado dice lo mismo que §5', () => {
    const usados = new Set<EstadoMandos>();
    for (const c of Object.values(CIRCUITOS)) for (const p of c.plan.pasos) usados.add(estadoDelPaso(p));
    // Paso, recupera/descanso, la ventana de un AMRAP de un movimiento y su campana. Durante el deshacer, el del kit.
    expect([...usados].sort()).toEqual(['campana', 'paso', 'recupera', 'ventana']);
    for (const estado of [...usados, 'deshacer' as const]) {
      BOTONES_TABLA.forEach((b, k) => {
        const dice = celda(estado, k);
        const mando = accionDe(estado, b);
        if (dice === '—') expect(mando, `${estado} · ${b}`).toBeNull();
        else expect(mando?.dice, `${estado} · ${b}`).toBe(dice);
      });
    }
  });

  it('el AMRAP de un movimiento es el de garmin-wod: su ventana no se salta y cuenta reps, su campana la guarda START', () => {
    const c = CIRCUITOS['506']!;
    const ventana = c.plan.pasos.find((p) => p.wod?.formato === 'amrap')!;
    const campana = c.plan.pasos.find((p) => esPuntuacion(p))!;
    expect(estadoDelPaso(ventana)).toBe('ventana');
    expect(estadoDelPaso(campana)).toBe('campana');
    expect(accionDe('ventana', 'back')?.accion).toBe('sin-efecto');
    expect(accionDe('campana', 'start')?.accion).toBe('guardar');
    expect(accionDe('campana', 'up')?.accion).toBe('reps-mas');
    expect(accionDe('campana', 'down')?.accion).toBe('reps-menos');
    expect(accionDe('paso', 'back')?.accion).toBe('siguiente-paso');
  });

  it('durante los 5 s de deshacer manda «deshacer», sea cual sea el paso', () => {
    expect(accionDe('deshacer', 'up')?.accion).toBe('deshacer');
  });
});

// §6 — los avisos de cada transición del circuito

describe('§6 — cada evento del motor en un circuito tiene su aviso', () => {
  const TABLA = tablaDe('## 6. Vocabulario de aviso');
  const fila = (nombre: string) => TABLA.find((f) => normal(f[0]!) === normal(nombre))!;

  /** Los eventos de Garmin de cerrar el paso `i` (a mano o por medida). */
  function alCerrar(c: Circuito, i: number, quien: 'atleta' | 'medida') {
    const b = caso(c, i, 10, RITMO);
    const antes = estadoInicial(c.plan, b.sim, b.inicio);
    const r = cerrar(antes, c.plan, quien);
    return eventosDeTransicion({ plan: c.plan, antes, despues: r.estado, quien: quien === 'atleta' ? 'atleta' : 'motor', eventos: r.eventos });
  }

  it('cada transición de cada circuito avisa con una fila de §6 (o con un «ninguno» dicho), y cabe en una llamada', () => {
    for (const [nombre, c] of Object.entries(CIRCUITOS)) {
      c.plan.pasos.forEach((_, i) => {
        for (const quien of ['atleta', 'medida'] as const) {
          const eventos = alCerrar(c, i, quien);
          for (const e of eventos) expect(AVISOS[e], `${nombre} · paso ${i} · ${e}`).toBeDefined();
          const x = componerAvisos(1, eventos);
          expect(x.perfiles.length, `${nombre} · paso ${i}`).toBeLessThanOrEqual(MAX_PERFILES);
          // Lo que suena está en la tabla de §6, dicho igual (vibración y tono).
          for (const e of [x.acuse, x.suena]) {
            const a = e ? AVISOS[e] : null;
            if (!a || !esAviso(a)) continue;
            const f = fila(a.nombre);
            expect(f, `${nombre} · paso ${i} · ${a.nombre} no está en §6`).toBeDefined();
            expect(fmtPulsos(a)).toBe(normal(f[1]!));
            expect(fmtTono(a)).toBe(normal(f[2]!));
          }
        }
      });
    }
  });

  it('cerrar a mano un paso: 1 muy corta de acuse y, detrás, el aviso del paso que entra (recupera, GO, sesión)', () => {
    const c = CIRCUITOS['493']!;
    const ski = c.plan.pasos.findIndex((p) => p.nombre === 'SkiErg');
    const x = componerAvisos(1, alCerrar(c, ski, 'atleta'));
    expect(x.acuse).toBe('paso-a-mano');
    expect(x.suena).toBe('recupera'); // la estación → el descanso de 90″: 1 larga + STOP
    const h = CIRCUITOS.HYROX!;
    const run = h.plan.pasos.findIndex((p) => p.clase === 'carrera');
    expect(componerAvisos(1, alCerrar(h, run, 'medida')).suena).toBe('go'); // el Run → la Roxzone: 2 largas + START
    const ultimo = h.plan.pasos.length - 1;
    expect(componerAvisos(1, alCerrar(h, ultimo, 'atleta')).suena).toBe('sesion'); // 3 largas + SUCCESS ×2
    expect(componerAvisos(1, alCerrar(c, c.plan.pasos.length - 1, 'atleta')).suena).toBe('sesion');
  });

  it('la campana de un AMRAP es la del kit (§6), en vez del «recupera» del motor', () => {
    const c = CIRCUITOS['506']!;
    const amrap = c.plan.pasos.findIndex((p) => p.wod?.formato === 'amrap');
    expect(componerAvisos(1, alCerrar(c, amrap, 'medida')).suena).toBe('campana');
    // Si lo salta el atleta, no ha acabado el tiempo: no suena.
    expect(componerAvisos(1, alCerrar(c, amrap, 'atleta')).suena).not.toBe('campana');
  });
});

// ---------------------------------------------------------------------------
// El aro, las rondas, las vueltas
// ---------------------------------------------------------------------------

describe('el aro se divide en las rondas del simulacro', () => {
  const h = CIRCUITOS.HYROX!;
  const seqEn = (i: number, terminado = false) => {
    const b = caso(h, i, 20, RITMO);
    const estado = { ...estadoInicial(h.plan, b.sim, b.inicio), terminado };
    const paso = pasoVivo(h.plan, estado);
    return { plan: h.plan, estado, paso, lecturas: lecturasDe(paso, estado) };
  };

  it('ocho arcos, uno por ronda, todos de trabajo, con peso', () => {
    const a = aroPorRondas(seqEn(0), dibujoDe);
    expect(a.pasos).toHaveLength(8);
    expect(a.pasos.every((p) => p.rol === 'trabajo')).toBe(true);
    expect(a.pasos.every((p) => (p.medida.prescrito ?? 0) > 0)).toBe(true);
  });

  it('el arco en curso es el de la ronda de ahora; al acabar, todos hechos', () => {
    expect(aroPorRondas(seqEn(0), dibujoDe).i).toBe(0);
    expect(aroPorRondas(seqEn(4 * 4 + 2), dibujoDe).i).toBe(4);
    expect(aroPorRondas(seqEn(7 * 4 + 2), dibujoDe).i).toBe(7);
    expect(aroPorRondas(seqEn(7 * 4 + 2, true), dibujoDe).i).toBe(8);
  });

  it('lo que lleva la ronda de ahora crece con los pasos hechos y nunca pasa de su peso', () => {
    const a1 = aroPorRondas(seqEn(4 * 4), dibujoDe);
    const a2 = aroPorRondas(seqEn(4 * 4 + 2), dibujoDe);
    expect(a2.lecturas.t).toBeGreaterThan(a1.lecturas.t);
    for (const i of [0, 5, 10, 20, 30]) {
      const a = aroPorRondas(seqEn(i), dibujoDe);
      expect(a.lecturas.t).toBeLessThanOrEqual(a.paso.medida.prescrito ?? 0);
    }
  });

  it('el 493 (calentamiento y 5 rondas) también se cuenta por rondas: seis arcos, el primero en gris', () => {
    const c = CIRCUITOS['493']!;
    const b = caso(c, 4, 20, RITMO);
    const estado = estadoInicial(c.plan, b.sim, b.inicio);
    const paso = pasoVivo(c.plan, estado);
    const a = aroPorRondas({ plan: c.plan, estado, paso, lecturas: lecturasDe(paso, estado) }, dibujoDe);
    expect(a.pasos).toHaveLength(6);
    expect(a.pasos[0]!.rol).not.toBe('trabajo');
  });
});

describe('cada estación y cada tramo es su propia vuelta (P10)', () => {
  it('la página Vueltas trae lo de ahora arriba y lo último hecho debajo, con su parcial, y en el título cuántos van', () => {
    const h = CIRCUITOS.HYROX!;
    const b = caso(h, 4 * 4, 30, RITMO, { metros: 100 });
    const s = estadoInicial(h.plan, b.sim, b.inicio);
    const { titulo, filas } = filasVueltasC(h, s, () => null);
    expect(filas[0]).toMatchObject({ estado: 'ahora', nombre: 'Run 5', valor: '0:30' });
    expect(filas[1]!.estado).toBe('hecho');
    expect(filas.length).toBeLessThanOrEqual(3);
    expect(titulo[1]).toMatch(/^\d+\/\d+$/);
  });

  it('las reps dichas en la campana aparecen en la vuelta del AMRAP', () => {
    const c = CIRCUITOS['506']!;
    const i = c.plan.pasos.findIndex((p) => esPuntuacion(p)) + 1;
    const b = caso(c, i, 5, RITMO, { metros: 50 });
    const s = estadoInicial(c.plan, b.sim, b.inicio);
    const { filas } = filasVueltasC(c, s, (k) => (k === i - 1 ? 16 : null));
    expect(filas.some((f) => f.detalle === '16 reps')).toBe(true);
  });
});

describe('la estructura cuenta por rondas (M4) y los datos, solo los km corridos', () => {
  it('492: la ronda 5 lleva dos estaciones, no tres (sin Farmers)', () => {
    const c = CIRCUITOS['492']!;
    expect(rondasDe(c.plan.pasos).map((r) => r.trabajo.length)).toEqual([3, 3, 3, 3, 2]);
    const filas = filasEstructuraC(c, 0);
    expect(filas).toHaveLength(5);
    expect(filas[3]!.linea).toContain('Farmers Carry');
    expect(filas[4]!.linea).not.toContain('Farmers');
  });

  it('HYROX: ocho estaciones, y el estado avanza con la ronda (hecho, ahora, pendiente)', () => {
    const c = CIRCUITOS.HYROX!;
    const filas = filasEstructuraC(c, 4 * 4 + 1);
    expect(filas).toHaveLength(8);
    expect(filas.map((f) => f.estado)).toEqual(['hecho', 'hecho', 'hecho', 'hecho', 'ahora', 'pendiente', 'pendiente', 'pendiente']);
    expect(filas[0]!.linea).toBe('SkiErg · Estación 1');
    expect(filas[7]!.detalle?.replace(/\u00A0/g, ' ')).toContain('100 reps');
  });

  it('Datos: los km son los CORRIDOS (las estaciones no suman) y el ritmo es el de los tramos de carrera', () => {
    const c = CIRCUITOS['493']!;
    const b = caso(c, 1 + 3 * 3, 112, RITMO, { metros: 400 });
    const s = estadoInicial(c.plan, b.sim, b.inicio);
    const filas = filasDatosC(c, s, lecturasDe(pasoVivo(c.plan, s), s), totalDe(s, c));
    const por = (u: string) => filas.find((f) => f.unidad.includes(u))!;
    expect(por('km corridos').valor).toMatch(/^3,\d\d$/); // tres runs de ~1 km y 400 m del cuarto: ni un metro de estación
    expect(por('/km al correr').valor).toMatch(/^4:\d\d$/);
    expect(filas.some((f) => f.unidad.includes('cap'))).toBe(false); // el 493 no tiene cap
  });

  it('Datos en HYROX: el total, lo que falta para el cap, el ritmo al correr, la Roxzone y el pulso; nunca más de cinco filas', () => {
    const c = CIRCUITOS.HYROX!;
    const b = caso(c, 4 * 4, 112, RITMO, { metros: 400 });
    const s = estadoInicial(c.plan, b.sim, b.inicio);
    const filas = filasDatosC(c, s, lecturasDe(pasoVivo(c.plan, s), s), totalDe(s, c));
    expect(filas.map((f) => f.unidad.split(' ')[0])).toEqual(['total', 'para', '/km', 'Roxzone', 'ppm']);
    expect(filas[1]!.unidad).toContain('90′');
    expect(filas.length).toBeLessThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// Dobles — el turno como dato del paso
// ---------------------------------------------------------------------------

describe('dobles: la estación de tu pareja es una espera que cierras tú', () => {
  const c = CIRCUITOS['HYROX dobles']!;
  const i = c.plan.pasos.findIndex((p) => p.dobles?.turno === 'pareja');

  it('el plan trae los tres turnos: tuyo, de tu pareja y repartido (tu parte, no la estación entera)', () => {
    const turnos = c.plan.pasos.filter((p) => p.dobles).map((p) => p.dobles!.turno);
    expect(new Set(turnos)).toEqual(new Set(['tuyo', 'pareja', 'reparto']));
    const reparto = c.plan.pasos.find((p) => p.dobles?.turno === 'reparto' && p.nombre === 'Wall Balls')!;
    expect(reparto.medida.prescrito).toBe(60);
    expect(c.plan.pasos[i]!.rol).toBe('recuperacion');
    expect(c.plan.pasos[i]!.medida.tipo).toBe('abierta');
  });

  it('la espera tiene por héroe lo que llevas esperando, sin zona, con la nota del relevo; nunca «sales en»', () => {
    const b = caso(c, i, 41, RITMO);
    const s = estadoInicial(c.plan, b.sim, b.inicio);
    const paso = pasoVivo(c.plan, s);
    const d = disponerCaraCircuito({ paso, lecturas: lecturasDe(paso, s), zonas: c.plan.zonas, reglas: c.plan.reglas, c, total: totalDe(s, c), dial: null, D: 454 });
    expect(d.heroe?.texto).toBe('0:41');
    const todo = d.lineas.flatMap((l) => l.piezas.map((p) => p.texto)).join(' ');
    expect(todo).toContain(NOTA_RELEVO);
    expect(todo).toContain('recuperas');
    expect(todo).not.toMatch(/sales en|~/);
    expect(todo).toContain('Le toca a Marta');
    // El pulso, sin zona: no trabajas.
    const pie = d.lineas.find((l) => l.rol === 'pie')!;
    expect(pie.piezas.some((p) => typeof p.tono === 'object')).toBe(false);
    expect(avisoCierreC(paso, c)).toBe('Relevo · entras tú');
  });

  it('en la repartida, tu parte y el pacto; en la tuya, «Dobles · te toca»', () => {
    const j = c.plan.pasos.findIndex((p) => p.dobles?.turno === 'reparto' && p.nombre === 'Wall Balls');
    const b = caso(c, j, 20, RITMO);
    const s = estadoInicial(c.plan, b.sim, b.inicio);
    const paso = pasoVivo(c.plan, s);
    const d = disponerCaraCircuito({ paso, lecturas: lecturasDe(paso, s), zonas: c.plan.zonas, reglas: c.plan.reglas, c, total: totalDe(s, c), dial: null, D: 454 });
    const texto = (rol: string) => d.lineas.filter((l) => l.rol === rol).flatMap((l) => l.piezas.map((p) => p.texto)).join('');
    expect(texto('dosis')).toContain('60');
    expect(texto('nota')).toContain('Tú 60');
    const k = c.plan.pasos.findIndex((p) => p.dobles?.turno === 'tuyo');
    const b2 = caso(c, k, 20, RITMO);
    const s2 = estadoInicial(c.plan, b2.sim, b2.inicio);
    const p2 = pasoVivo(c.plan, s2);
    const d2 = disponerCaraCircuito({ paso: p2, lecturas: lecturasDe(p2, s2), zonas: c.plan.zonas, reglas: c.plan.reglas, c, total: totalDe(s2, c), dial: null, D: 454 });
    expect(d2.lineas.filter((l) => l.rol === 'nota').flatMap((l) => l.piezas.map((p) => p.texto)).join('')).toBe('Dobles · te toca');
  });
});

// ---------------------------------------------------------------------------
// Los escenarios y «entras a…»
// ---------------------------------------------------------------------------

describe('«entras a…» solo cuando nada ha anunciado la estación', () => {
  it('no sale con una Roxzone de entrada delante, ni tras el GO de un descanso, ni al principio', () => {
    const c = CIRCUITOS['493']!;
    const ski = c.plan.pasos.findIndex((p) => p.nombre === 'SkiErg');
    const b = caso(c, ski, 1, RITMO);
    const estado = estadoInicial(c.plan, b.sim, b.inicio);
    const seq = { plan: c.plan, estado, paso: pasoVivo(c.plan, estado) };
    expect(entrasA(seq)).toBe(true);
    expect(entrasA({ ...seq, estado: { ...estado, goHasta: estado.sesionT + 1 } })).toBe(false);
    expect(entrasA({ ...seq, estado: { ...estado, t: 4 } })).toBe(false);
    const h = CIRCUITOS.HYROX!;
    const est = h.plan.pasos.findIndex((p) => p.clase === 'estacion');
    const b2 = caso(h, est, 1, RITMO);
    const e2 = estadoInicial(h.plan, b2.sim, b2.inicio);
    expect(entrasA({ plan: h.plan, estado: e2, paso: pasoVivo(h.plan, e2) })).toBe(false);
  });
});

describe('los escenarios de la pantalla', () => {
  it('cada escenario arranca en un paso que existe de su circuito', () => {
    for (const id of [
      'c493-carrera',
      'c493-ski',
      'c493-bbj',
      'c493-descanso',
      'c492-ronda5',
      'c506-amrap',
      'hyrox-carrera',
      'hyrox-roxzone',
      'hyrox-sled',
      'hyrox-sin-pm5',
      'hyrox-ruta',
      'hyrox-simulacro',
      'hyrox-final',
      'hyrox-dobles',
      'hyrox-dobles-reparto',
      'tamanos-carrera',
      'tamanos-estacion',
    ]) {
      const k = casoDe(id);
      expect(k.c.plan.pasos[k.inicio.i], id).toBeDefined();
      for (const g of k.guion ?? []) expect(g.en, id).toBeGreaterThan(0);
    }
  });
});
