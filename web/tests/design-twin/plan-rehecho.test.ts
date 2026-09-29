// «PLAN · REHECHO», CLAVADO SOBRE SUS CASOS.
//
// La pestaña Plan cambia de sujeto según el día que la card muestra: no se ve
// mirando un mockup si el sujeto correcto tapa al incorrecto. Aquí se fija, caso
// a caso, la escalera de `vista()`, la honestidad del dato y el tier libre. Las
// decisiones puras de cada pieza están en `plan-rehecho-modelo.test.ts`.

import { describe, expect, it } from 'vitest';
import { CASOS_PLAN } from '@/components/design-twin/kit-plan/casos';
import type { SemanaDelPlan } from '@/components/design-twin/kit-plan/contrato';
import { CASOS_LIBRE, casoLibre } from '@/components/design-twin/kit-plan/casos-libre';
import { tieneEvidencia } from '@/components/design-twin/kit-plan/contrato-libre';
import { TODOS_LOS_CASOS } from '@/components/design-twin/kit-plan/indice';
import {
  cuentaAtras,
  lineaDeProgreso,
  marcasQueFaltan,
  textoSinComparacion,
  veredictoDelObjetivo,
} from '@/components/design-twin/kit-plan/libre';
import {
  accionAnclada,
  diasEntre,
  fechaConDia,
  sesionAnterior,
  textoAccion,
  tonoDelSujeto,
  vista,
} from '@/components/design-twin/kit-plan/modelo';
import { semana } from '@/components/design-twin/kit-plan/sesiones';
import { TEXTOS } from '@/components/design-twin/kit-plan/textos';
import { HOY, abre, lectura, nav, textos } from './plan-rehecho-utiles';

// ---------------------------------------------------------------------------
// Los casos
// ---------------------------------------------------------------------------

describe('los casos', () => {
  it('son 22, con id único y el título numerado', () => {
    expect(TODOS_LOS_CASOS).toHaveLength(22);
    expect(new Set(TODOS_LOS_CASOS.map((c) => c.id)).size).toBe(22);
    expect(CASOS_PLAN).toHaveLength(18);
    expect(CASOS_LIBRE).toHaveLength(4);
  });

  it('ningún texto lleva guion largo, ni un nombre propio, ni jerga de dispositivo', () => {
    for (const c of TODOS_LOS_CASOS) {
      for (const t of textos(c)) {
        expect(t, `${c.id}: «${t.slice(0, 60)}»`).not.toMatch(/[—–]/);
        expect(t, `${c.id}: «${t.slice(0, 60)}»`).not.toMatch(/pablo|fabrik|fahybrik|\bHR\b|\bbpm\b|PM5|FTMS/i);
      }
    }
  });

  it('ninguna duración escrita es un cero, y todo desglose pertenece a una sesión real', () => {
    for (const c of CASOS_PLAN) {
      const l = c.lectura;
      const ids = new Set<string>();
      for (const s of [l.actual, typeof l.siguiente === 'object' ? l.siguiente : null]) {
        for (const dia of s?.dias ?? []) {
          for (const se of dia.sesiones) {
            ids.add(se.id);
            if (se.duracion && 'minutos' in se.duracion) expect(se.duracion.minutos).toBeGreaterThan(0);
          }
        }
      }
      for (const id of Object.keys(l.desgloses)) expect(ids.has(id), `${c.id}: ${id}`).toBe(true);
    }
  });

  it('la semana siempre son siete días de lunes a domingo, y hoy cae donde dice indiceHoy', () => {
    for (const c of CASOS_PLAN) {
      for (const s of [c.lectura.actual, typeof c.lectura.siguiente === 'object' ? c.lectura.siguiente : null]) {
        if (!s) continue;
        expect(s.dias).toHaveLength(7);
        expect(s.dias.map((x) => x.diaSemana)).toEqual([1, 2, 3, 4, 5, 6, 7]);
        expect(diasEntre(s.desde, s.hasta)).toBe(6);
        expect(s.indiceHoy).toBe(s.dias.findIndex((x) => x.iso === c.lectura.hoyIso) >= 0 ? s.dias.findIndex((x) => x.iso === c.lectura.hoyIso) : null);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// La escalera de `vista()`
// ---------------------------------------------------------------------------

type Esperado = { tipo: string; cuerpo?: string; tono: string; accion: string | null };

/** Qué pinta cada uno de los dieciocho escenarios con coach al abrirse. */
const ESPERADO: Record<string, Esperado> = {
  lleno: { tipo: 'semana', cuerpo: 'sesion', tono: 'accion', accion: 'empezar' },
  doble: { tipo: 'semana', cuerpo: 'sesion', tono: 'accion', accion: 'empezar' },
  'hecho-manana': { tipo: 'semana', cuerpo: 'sesion', tono: 'ok', accion: 'ver-hecho' },
  'a-medias': { tipo: 'semana', cuerpo: 'sesion', tono: 'aviso', accion: 'ver-hecho' },
  'sin-hacer': { tipo: 'semana', cuerpo: 'sesion', tono: 'neutro', accion: 'empezar' },
  'otro-dia': { tipo: 'semana', cuerpo: 'sesion', tono: 'acento', accion: 'empezar' },
  descanso: { tipo: 'semana', cuerpo: 'descanso', tono: 'soporte', accion: 'ver-siguiente' },
  'sin-reloj': { tipo: 'semana', cuerpo: 'sesion', tono: 'accion', accion: 'empezar' },
  'empieza-despues': { tipo: 'sin-plan', tono: 'acento', accion: 'ver-semana-que-viene' },
  alta: { tipo: 'sin-plan', tono: 'neutro', accion: 'escribir-al-coach' },
  pausa: { tipo: 'pausa', tono: 'neutro', accion: 'escribir-al-coach' },
  hyrox: { tipo: 'semana', cuerpo: 'sesion', tono: 'accion', accion: 'empezar' },
  horizonte: { tipo: 'semana', cuerpo: 'sesion', tono: 'accion', accion: 'empezar' },
  'sin-red': { tipo: 'semana', cuerpo: 'sesion', tono: 'accion', accion: 'empezar' },
  'plan-directo': { tipo: 'semana', cuerpo: 'sesion', tono: 'accion', accion: 'empezar' },
  denso: { tipo: 'semana', cuerpo: 'sesion', tono: 'accion', accion: 'empezar' },
  cargando: { tipo: 'cargando', tono: 'neutro', accion: null },
  error: { tipo: 'error', tono: 'peligro', accion: 'reintentar' },
};

describe('vista() sobre los dieciocho escenarios con coach', () => {
  it('cubre exactamente los escenarios del doble', () => {
    expect(Object.keys(ESPERADO).sort()).toEqual(CASOS_PLAN.map((c) => c.id).sort());
  });

  for (const c of CASOS_PLAN) {
    it(`${c.id} → ${ESPERADO[c.id]!.tipo}${ESPERADO[c.id]!.cuerpo ? '/' + ESPERADO[c.id]!.cuerpo : ''}, tono ${ESPERADO[c.id]!.tono}`, () => {
      const v = vista(c.lectura, abre(c.id));
      const e = ESPERADO[c.id]!;
      expect(v.tipo).toBe(e.tipo);
      if (v.tipo === 'semana') expect(v.cuerpo.tipo).toBe(e.cuerpo);
      expect(tonoDelSujeto(v)).toBe(e.tono);
      expect(accionAnclada(v, c.lectura)?.tipo ?? null).toBe(e.accion);
    });
  }

  it('la escalera respeta el orden: cargando, pausa, error, semana, sin plan', () => {
    const base = lectura('lleno');
    expect(vista({ ...base, cargando: true, actual: null }, nav()).tipo).toBe('cargando');
    // Con la semana en memoria (caché) no se vuelve a esqueleto por estar revalidando.
    expect(vista({ ...base, cargando: true }, nav()).tipo).toBe('semana');
    expect(vista({ ...base, pausa: { desde: null }, errorCarga: true, actual: null }, nav()).tipo).toBe('pausa');
    expect(vista({ ...base, errorCarga: true, actual: null }, nav()).tipo).toBe('error');
    // Un fallo con la semana en caché no tapa la semana.
    expect(vista({ ...base, errorCarga: true }, nav()).tipo).toBe('semana');
  });

  it('un plan pausado no enseña sesiones aunque la semana llegue', () => {
    const v = vista(lectura('pausa'), nav());
    expect(v.tipo).toBe('pausa');
  });
});

describe('el vacío con inicio futuro deja de ser un callejón sin salida (Swift: contenido decide por la semana 0)', () => {
  const l = lectura('empieza-despues');

  it('en esta semana se ve el vacío con la fecha exacta', () => {
    const v = vista(l, nav());
    expect(v).toMatchObject({ tipo: 'sin-plan', motivo: 'empieza-despues', inicio: '2026-10-05' });
    expect(fechaConDia('2026-10-05')).toBe('lunes 5 de octubre');
  });

  it('«Ver la semana que viene» LLEGA a la semana que viene: carril y card, no otra vez el vacío', () => {
    const v = vista(l, nav({ offset: 1 }));
    expect(v.tipo).toBe('semana');
    if (v.tipo !== 'semana') return;
    expect(v.cuerpo.tipo).toBe('sesion');
    expect(v.semana?.posicion).toEqual({ semana: 1, total: 4 });
    expect(accionAnclada(v, l)?.tipo).toBe('empezar');
  });

  it('sin más adelante no hay acción, solo la frase de que aparecerá', () => {
    const sinMas = { ...l, actual: { ...l.actual!, hayMasAdelante: false } };
    expect(accionAnclada(vista(sinMas, nav()), sinMas)).toBeNull();
  });

  it('un alta sin fecha de inicio se dice «preparando» y sale escribiendo al coach', () => {
    const v = vista(lectura('alta'), nav());
    expect(v).toMatchObject({ tipo: 'sin-plan', motivo: 'preparando' });
    expect(textoAccion(accionAnclada(v, lectura('alta'))!, 'Mar')).toBe('Escribir a Mar');
    expect(textoAccion({ tipo: 'escribir-al-coach' }, null)).toBe('Escribir a tu coach');
  });
});

describe('hojear la semana que viene (Swift: cargar y fallar se leían como «tu coach no la ha llenado»)', () => {
  it('cargando y fallo son estados propios', () => {
    const l = lectura('sin-red');
    expect(vista(l, nav({ offset: 1, cargandoSiguiente: true }))).toMatchObject({ cuerpo: { tipo: 'semana-cargando' } });
    const f = vista(l, nav({ offset: 1 }));
    expect(f).toMatchObject({ tipo: 'semana', cuerpo: { tipo: 'semana-falla' } });
    expect(tonoDelSujeto(f)).toBe('peligro');
    expect(accionAnclada(f, l)?.tipo).toBe('reintentar');
  });

  it('una semana que llega vacía es un hecho, con salida a volver', () => {
    const l = { ...lectura('lleno'), siguiente: semana('2026-10-05', HOY, [[], [], [], [], [], [], []]) };
    const v = vista(l, nav({ offset: 1 }));
    expect(v).toMatchObject({ cuerpo: { tipo: 'semana-vacia' } });
    expect(accionAnclada(v, l)?.tipo).toBe('volver-a-esta-semana');
  });

  it('la semana que viene no tiene «hoy» y muestra el primer día con algo', () => {
    const v = vista(lectura('lleno'), nav({ offset: 1 }));
    if (v.tipo !== 'semana' || v.cuerpo.tipo !== 'sesion') throw new Error('debería haber sesión');
    expect(v.semana?.indiceHoy).toBeNull();
    expect(v.cuerpo.dia.iso).toBe('2026-10-05');
    expect(v.cuerpo.dia.esHoy).toBe(false);
    expect(tonoDelSujeto(v)).toBe('acento');
  });
});

// ---------------------------------------------------------------------------
// Honestidad del dato
// ---------------------------------------------------------------------------

describe('honestidad del dato', () => {
  it('el contrato no lleva claves de dosis: el servidor no sirve ninguna cifra a nivel de sesión', () => {
    for (const c of CASOS_PLAN) {
      for (const desg of Object.values(c.lectura.desgloses)) {
        expect(desg).not.toHaveProperty('claves');
      }
    }
  });

  it('solo una sesión terminada trae minutos medidos', () => {
    for (const c of CASOS_PLAN) {
      const l = c.lectura;
      for (const s of [l.actual, typeof l.siguiente === 'object' ? l.siguiente : null]) {
        for (const dia of s?.dias ?? []) {
          for (const se of dia.sesiones) {
            const dg = l.desgloses[se.id];
            if (dg?.estado !== 'listo') continue;
            if (se.estado === 'pendiente' || se.estado === 'saltada') expect(dg.medidoMin, `${c.id} ${se.id}`).toBeNull();
            else expect(dg.medidoMin, `${c.id} ${se.id}`).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('el descanso de hoy tiene ayer y mañana medidos o dichos por lo que son', () => {
    const l = lectura('descanso');
    const s = l.actual!;
    const ant = sesionAnterior(s)!;
    expect(ant.dia.iso).toBe('2026-09-30');
    const dg = l.desgloses[ant.sesion.id];
    expect(dg?.estado === 'listo' && dg.medidoMin).toBe(36);
  });

  it('el aviso de pausa no supone el motivo (el código de `paused_reason` no sale al atleta)', () => {
    for (const t of textos([TEXTOS.pausa.titulo, TEXTOS.pausa.apoyo('Mar'), TEXTOS.pausa.apoyo(null), TEXTOS.pausa.nota('2026-09-14'), TEXTOS.pausa.nota(null)])) {
      expect(t).not.toMatch(/recuper|lesi[oó]n|vacaciones|par[oó]n/i);
    }
  });
});

// ---------------------------------------------------------------------------
// Sin coach
// ---------------------------------------------------------------------------

describe('el tier libre', () => {
  it('sin nada medido ni carreras es el caso sin evidencia; con ellas, con evidencia', () => {
    expect(tieneEvidencia(casoLibre('libre-sin-nada').lectura)).toBe(false);
    expect(tieneEvidencia(casoLibre('libre-con-carreras').lectura)).toBe(true);
  });

  it('ninguna pieza de coach: ni chat, ni «tu entrenador», ni tests, ni revisión, ni comunicados', () => {
    for (const c of CASOS_LIBRE) {
      for (const t of textos(c.lectura)) {
        expect(t, `${c.id}: «${t.slice(0, 60)}»`).not.toMatch(/tu entrenador|tu coach|comunicad|revisi[oó]n|chat/i);
      }
    }
  });

  it('cuenta atrás: hoy, mañana, días y semanas', () => {
    expect(cuentaAtras(0)).toBe('es hoy');
    expect(cuentaAtras(-3)).toBe('es hoy');
    expect(cuentaAtras(1)).toBe('mañana');
    expect(cuentaAtras(5)).toBe('en 5 días');
    expect(cuentaAtras(13)).toBe('en 13 días');
    expect(cuentaAtras(14)).toBe('en 2 semanas');
    expect(cuentaAtras(68)).toBe('en 10 semanas');
    expect(cuentaAtras(null)).toBeNull();
  });

  it('el veredicto del objetivo dice la verdad en los tres sentidos', () => {
    const mejor = { tiempoS: 3862, lugar: 'Berlín', cuando: 'may 2025', categoria: 'dobles pro', equipo: true };
    expect(veredictoDelObjetivo({ tipo: 'mejor', mejor, deltaS: 218 })).toBe(
      'Ya fuiste 3:38 más rápido que eso en Berlín · may 2025. Tu objetivo se te ha quedado corto.',
    );
    expect(veredictoDelObjetivo({ tipo: 'mejor', mejor, deltaS: -95 })).toBe('Te faltan 1:35 desde tu mejor marca en Berlín · may 2025.');
    expect(veredictoDelObjetivo({ tipo: 'mejor', mejor, deltaS: 0 })).toMatch(/exactamente a tu objetivo/);
  });

  it('sin comparación lo dice en vez de callarse', () => {
    expect(textoSinComparacion({ tipo: 'sin', motivo: 'sin_carreras', categoria: null })).toMatch(/Cuando corras una/);
    expect(textoSinComparacion({ tipo: 'sin', motivo: 'formato_distinto', categoria: 'dobles pro' })).toMatch(/ninguna fue en dobles pro/);
  });

  it('las marcas pendientes se nombran hasta tres y luego «y N más»', () => {
    expect(marcasQueFaltan([])).toBeNull();
    expect(marcasQueFaltan(['1 km', 'Remo 500 m', 'Ski 1.000 m'])).toBe(
      'Para decirte cuánto tardarías aún nos faltan tus marcas: 1 km, Remo 500 m y Ski 1.000 m.',
    );
    expect(marcasQueFaltan(['a', 'b', 'c', 'd', 'e'])).toMatch(/a, b, c y 2 más\.$/);
  });

  it('en dobles el ritmo es un suelo y no se resta el último al mejor', () => {
    const e = casoLibre('libre-con-carreras').lectura.evidencia!;
    expect(e.tendencia).toBeNull();
    expect(lineaDeProgreso(e)).toMatch(/restarle tu mejor no te diría cómo estás/);
  });

  it('la semana bloqueada es real: las visibles y las difuminadas son sesiones completas', () => {
    const w = casoLibre('libre-con-carreras').lectura.semanaBloqueada!;
    expect(w.sesiones.length).toBeGreaterThan(w.visibles);
    for (const s of w.sesiones) expect(s.detalle.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Tipos de sanidad
// ---------------------------------------------------------------------------

describe('la semana del contrato', () => {
  it('SemanaDelPlan de un caso con plan cerrado sigue siendo consistente', () => {
    const s: SemanaDelPlan = lectura('lleno').actual!;
    expect(s.dias.map((x) => x.estado)).toEqual(['hecha', 'hecha', 'saltada', 'pendiente', 'pendiente', 'pendiente', 'descanso']);
  });
});
