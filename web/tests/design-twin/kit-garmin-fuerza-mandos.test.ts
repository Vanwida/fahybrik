// «GARMIN · FUERZA» — LOS BOTONES SON LOS DE §5 Y LOS AVISOS, LOS DE §6
// (docs/garmin-reloj/modelo.md §5, §6).
//
// La tabla `MANDOS` se cruza con la fila de §5 leída del propio documento (las
// filas «Serie de fuerza» y «Anotar la serie»), la anotación se prueba tecla a
// tecla (lo propuesto no es declarado hasta tocarlo o confirmarlo, la carga en
// cascada, BACK/LAP atrás y cerrar, reabrir al volver) y los avisos de cada
// transición de las sesiones se cruzan con `AVISOS` (§6): todo evento tiene su
// fila o un «ninguno» con motivo, y suena UN aviso por instante.

import { describe, expect, it } from 'vitest';
import {
  AVISOS,
  MANDOS,
  accionDe,
  componerAvisos,
  esAviso,
  eventosDeTransicion,
  type EventoGarmin,
} from '@/components/design-twin/kit-garmin';
import { avanzar, cargaArrastrada, cerrar, estadoInicial, lecturasDe, pasoVivo, type PlanSesion } from '@/components/design-twin/kit-reloj';
import type { Transicion } from '@/components/design-twin/kit-reloj/gancho';
import { cuerpo } from '@/components/design-twin/screens/reloj-fuerza/casos';
import { ACCIONES_ANOTAR, UI_VACIA, aplicarTecla, camposDelDescanso, reabrir, type Anotando } from '@/components/design-twin/screens/garmin-fuerza/modelo';
import { vistaAnotarDe } from '@/components/design-twin/screens/garmin-fuerza/vistas';
import { PLANES, contextoDe } from './garmin-fuerza-medidas';
import { normal, tablaDe } from './garmin-modelo';

// ---------------------------------------------------------------------------
// Los botones (§5)
// ---------------------------------------------------------------------------

describe('los botones de la familia son los de §5', () => {
  it('las dos filas de §5 de la familia, leídas del documento, dicen lo mismo que la tabla del kit', () => {
    const tabla = tablaDe('## 5. Interacción');
    const columnas = ['start', 'back', 'up', 'down', 'upLargo'] as const;
    for (const [estado, fila] of [['fuerza', 'Serie de fuerza'], ['anotar', 'Anotar la serie (en el descanso)']] as const) {
      const f = tabla.find((x) => x[0] === fila);
      expect(f, fila).toBeDefined();
      columnas.forEach((b, k) => {
        const celda = normal(f![k + 1]!);
        const mando = MANDOS[estado][b];
        if (celda === '—') expect(mando, `${fila} · ${b}`).toBeNull();
        else expect(mando?.dice, `${fila} · ${b}`).toBe(celda);
      });
    }
  });

  it('serie de fuerza: BACK/LAP es «Serie hecha»; START, pausa; UP y DOWN, páginas; UP largo, Controles', () => {
    expect(accionDe('fuerza', 'back')?.accion).toBe('serie-hecha');
    expect(accionDe('fuerza', 'start')?.accion).toBe('pausa');
    expect(accionDe('fuerza', 'up')?.accion).toBe('pagina-anterior');
    expect(accionDe('fuerza', 'down')?.accion).toBe('pagina-siguiente');
    expect(accionDe('fuerza', 'upLargo')?.accion).toBe('controles');
  });

  it('anotar: START confirma el campo, BACK/LAP vuelve al anterior, UP/DOWN cambian el valor y UP largo no hace nada', () => {
    expect(accionDe('anotar', 'start')?.accion).toBe('confirmar-campo');
    expect(accionDe('anotar', 'back')?.accion).toBe('campo-anterior');
    expect(accionDe('anotar', 'up')?.accion).toBe('valor-mas');
    expect(accionDe('anotar', 'down')?.accion).toBe('valor-menos');
    expect(accionDe('anotar', 'upLargo')).toBeNull();
    // La familia atiende exactamente esas cuatro acciones: ni una más, ni una menos.
    const deLaFila = new Set(['start', 'back', 'up', 'down', 'upLargo'].map((b) => MANDOS.anotar[b as 'start']?.accion).filter(Boolean));
    expect(new Set(ACCIONES_ANOTAR)).toEqual(deLaFila);
  });

  it('descanso y «colócate»: BACK/LAP es «Empezar ya» (nunca cierra la app); durante el deshacer, UP deshace', () => {
    expect(accionDe('recupera', 'back')?.accion).toBe('empezar-ya');
    expect(accionDe('deshacer', 'up')?.accion).toBe('deshacer');
    expect(accionDe('deshacer', 'back')?.accion).toBe('siguiente-paso');
  });
});

// ---------------------------------------------------------------------------
// La anotación, tecla a tecla
// ---------------------------------------------------------------------------

describe('anotar en el descanso: lo propuesto no es declarado hasta tocarlo o confirmarlo', () => {
  const plan = PLANES['488']!;
  // El descanso tras la serie 2 de Back Squat, con la serie 1 ya declarada (6 × 135 kg · RPE 6,5).
  const i = plan.pasos.findIndex((p) => p.id === '488-bs-s2') + 1;
  const s = estadoInicial(plan, cuerpo, { i, t: 10 });
  const c = contextoDe(plan, s);
  const inicio: Anotando = { registro: { '488-bs-s1': { reps: 6, kg: 135, esfuerzo: 6.5 } }, ui: UI_VACIA };
  const tecla = (a: Anotando, ...acciones: Array<Parameters<typeof aplicarTecla>[1]>) => acciones.reduce((x, acc) => aplicarTecla(x, acc, c).siguiente, a);

  it('recorre reps → carga → esfuerzo y solo guarda lo tocado o confirmado', () => {
    expect(camposDelDescanso(plan, i).map((x) => x.campo)).toEqual(['reps', 'kg', 'esfuerzo']);
    expect(tecla(inicio).registro['488-bs-s2']).toBeUndefined();
    // DOWN: 5 reps, declaradas. La carga sigue sin decir.
    const a1 = tecla(inicio, 'valor-menos');
    expect(a1.registro['488-bs-s2']).toEqual({ reps: 5 });
    // START confirma las reps y enfoca la carga; START confirma los 135 tal cual (arrastrados de la serie 1).
    const a2 = tecla(a1, 'confirmar-campo', 'confirmar-campo');
    expect(a2.registro['488-bs-s2']).toEqual({ reps: 5, kg: 135 });
    expect(a2.ui.k).toBe(2);
    // UP: RPE 7; START en el último campo cierra la anotación.
    const a3 = tecla(a2, 'valor-mas', 'confirmar-campo');
    expect(a3.registro['488-bs-s2']).toEqual({ reps: 5, kg: 135, esfuerzo: 7 });
    expect(a3.ui.cerrada).toBe(true);
    // Cerrada, las teclas de la anotación ya no hacen nada.
    expect(tecla(a3, 'valor-mas')).toBe(a3);
  });

  it('BACK/LAP vuelve al campo anterior y, en el primero, cierra sin declarar nada', () => {
    const a = tecla(inicio, 'confirmar-campo', 'confirmar-campo', 'campo-anterior');
    expect(a.ui.k).toBe(1);
    const cerrada = tecla(inicio, 'campo-anterior');
    expect(cerrada.ui.cerrada).toBe(true);
    expect(cerrada.registro['488-bs-s2']).toBeUndefined();
  });

  it('cerrada con algo propuesto, volver a la página del descanso la reabre en lo que faltaba', () => {
    const cerrada = tecla(inicio, 'confirmar-campo', 'campo-anterior', 'campo-anterior');
    expect(cerrada.ui.cerrada).toBe(true);
    const otra = reabrir(cerrada, c);
    expect(otra.ui.cerrada).toBe(false);
    expect(otra.ui.k).toBe(1);
    // Sin nada propuesto no hay nada que reabrir.
    const todo = tecla(inicio, 'confirmar-campo', 'confirmar-campo', 'confirmar-campo');
    expect(reabrir(todo, c)).toBe(todo);
  });

  it('la carga cambia hacia las series de detrás sin cerrar la actual (cascada)', () => {
    const plan2 = PLANES['492']!;
    const j = plan2.pasos.findIndex((p) => p.id === '492-dl-s1') + 1;
    const c2 = contextoDe(plan2, estadoInicial(plan2, cuerpo, { i: j, t: 8 }));
    let a: Anotando = { registro: {}, ui: UI_VACIA };
    for (const acc of ['confirmar-campo', 'valor-mas', 'valor-mas'] as const) a = aplicarTecla(a, acc, c2).siguiente;
    expect(a.registro['492-dl-s1']?.kg).toBe(160);
    expect(a.ui.cerrada).toBe(false);
    const s2 = plan2.pasos.findIndex((p) => p.id === '492-dl-s2');
    expect(cargaArrastrada(plan2, s2, a.registro)).toBe(160);
  });

  it('la vista distingue propuesto y declarado en cada campo, y no enfoca durante el deshacer', () => {
    const l = lecturasDe(pasoVivo(plan, s), s);
    const p = pasoVivo(plan, s);
    const a = tecla(inicio, 'valor-menos', 'confirmar-campo');
    const v = vistaAnotarDe(c, a.registro, a.ui, l, p, false);
    expect(v.campos.map((x) => x.estado)).toEqual(['declarado', 'propuesto', 'propuesto']);
    expect(v.foco).toBe(1);
    expect(v.estado).toBe('Serie 2 · 2 sin confirmar');
    expect(vistaAnotarDe(c, a.registro, a.ui, l, p, true).foco).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Los avisos (§6)
// ---------------------------------------------------------------------------

/** Cada transición del motor de la sesión, con los eventos de Garmin que produce. */
function transiciones(plan: PlanSesion): EventoGarmin[][] {
  const out: EventoGarmin[][] = [];
  let s = estadoInicial(plan, cuerpo, { i: 0 });
  for (let k = 0; k < plan.pasos.length; k++) {
    const antes = s;
    const r = k % 2 === 0 ? cerrar(s, plan, 'atleta') : cerrar(s, plan, 'medida');
    s = r.estado;
    const t: Transicion = { plan, antes, despues: s, quien: k % 2 === 0 ? 'atleta' : 'motor', eventos: r.eventos };
    out.push(eventosDeTransicion(t));
  }
  // Y los segundos de un paso: el preaviso y el 3-2-1 salen de `avanzar`.
  const i = plan.pasos.findIndex((p, j) => p.rol === 'descanso' && plan.pasos[j + 1]?.rol === 'trabajo');
  let e = estadoInicial(plan, cuerpo, { i, t: (plan.pasos[i]!.medida.prescrito ?? 60) - 12 });
  for (let k = 0; k < 14; k++) {
    const antes = e;
    const r = avanzar(e, plan, cuerpo);
    e = r.estado;
    out.push(eventosDeTransicion({ plan, antes, despues: e, quien: 'motor', eventos: r.eventos }));
  }
  return out;
}

describe('los avisos de la familia son los de §6', () => {
  for (const [nombre, plan] of Object.entries(PLANES)) {
    it(`sesión ${nombre}: todo evento tiene su fila (o un «ninguno» con motivo) y suena UN aviso por instante`, () => {
      for (const eventos of transiciones(plan)) {
        for (const e of eventos) {
          const a = AVISOS[e];
          expect(a, e).toBeDefined();
          if (!esAviso(a)) expect(a.ninguno.length, e).toBeGreaterThan(10);
        }
        const emision = componerAvisos(1, eventos);
        expect([emision.acuse, emision.suena].filter(Boolean).length).toBeLessThanOrEqual(2);
        expect(emision.perfiles.length).toBeLessThanOrEqual(15);
      }
    });
  }

  it('cerrar una serie con BACK/LAP avisa con el acuse de la tecla y la entrada del descanso; la última de un bloque, «bloque hecho»', () => {
    const plan = PLANES['529']!;
    const i = plan.pasos.findIndex((p) => p.id === '529-A1-s1');
    const antes = estadoInicial(plan, cuerpo, { i, t: 6 });
    const r = cerrar(antes, plan, 'atleta');
    const ev = eventosDeTransicion({ plan, antes, despues: r.estado, quien: 'atleta', eventos: r.eventos });
    expect(ev).toContain('paso-a-mano');
    expect(ev).toContain('go');
    // La última serie del bloque A (A2 4/4) cambia de bloque: suena «bloque hecho» y luego el descanso.
    const ult = plan.pasos.findIndex((p) => p.id === '529-A2-s4');
    const b = estadoInicial(plan, cuerpo, { i: ult, t: 5 });
    const rb = cerrar(b, plan, 'atleta');
    const eb = eventosDeTransicion({ plan, antes: b, despues: rb.estado, quien: 'atleta', eventos: rb.eventos });
    expect(eb).toContain('bloque');
    expect(eb).toContain('recupera');
    expect(componerAvisos(1, eb).suena).toBe('bloque');
  });

  it('anotar no vibra: confirmar un campo no es un evento de §6', () => {
    // Las cuatro acciones de la anotación no emiten nada al motor (`aplicarTecla` es puro): §5 y §6 no le dan fila.
    expect(ACCIONES_ANOTAR.length).toBe(4);
    expect(Object.keys(AVISOS).some((e) => e.includes('campo') || e.includes('anotar'))).toBe(false);
  });
});

// Un último apunte: la sesión completa por el motor acaba (no queda atascada en la última serie).
describe('nunca un atasco: la última serie lleva al siguiente ejercicio y la sesión acaba', () => {
  for (const [nombre, plan] of Object.entries(PLANES)) {
    it(`sesión ${nombre}: cerrando cada paso a mano se llega al final`, () => {
      let s = estadoInicial(plan, cuerpo, { i: 0 });
      for (let k = 0; k < plan.pasos.length; k++) {
        expect(s.terminado, `${nombre} · paso ${k}`).toBe(false);
        s = cerrar(s, plan, 'atleta').estado;
      }
      expect(s.terminado).toBe(true);
    });
  }
});
