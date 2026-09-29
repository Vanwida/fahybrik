// LAS DECISIONES PURAS DE «PLAN · REHECHO»: el estado de un día y de una sesión, el
// sujeto de un día con varias, la acción anclada, cómo se nombra un día, la duración,
// la cabecera, el menú de una sesión y las mutaciones. Las fija, junto con
// `plan-rehecho.test.ts` (los casos y la escalera de `vista()`), lo que el modelo
// corrige del Swift (ver la cabecera de `kit-plan/modelo.ts`).

import { describe, expect, it } from 'vitest';
import { casoPlan } from '@/components/design-twin/kit-plan/casos';
import {
  accionAnclada,
  accionesDeSesion,
  borrarSesion,
  cuandoDeSiguiente,
  deshacerHecho,
  diaMostrado,
  diasDestino,
  estadoDeDia,
  estadoEfectivo,
  etiquetaDeDiaDestino,
  etiquetaDeFecha,
  formatoMinutos,
  llevaNumero,
  marcarHecha,
  modalidadesDelDia,
  moverSesion,
  rangoDeSemana,
  rotuloDeDia,
  sesionAnterior,
  sesionPrincipal,
  sesionSiguiente,
  sesionesSecundarias,
  tamanoDeTitulo,
  textoAccion,
  textoDuracion,
  textoPosicion,
  tituloDeSemana,
  tonoDelSujeto,
  vista,
} from '@/components/design-twin/kit-plan/modelo';
import { d, semana, ses } from '@/components/design-twin/kit-plan/sesiones';
import { HOY, abre, lectura, nav } from './plan-rehecho-utiles';

// ---------------------------------------------------------------------------
// El estado de un día y de una sesión
// ---------------------------------------------------------------------------

describe('estadoDeDia', () => {
  const s = (estado: 'pendiente' | 'hecha' | 'parcial' | 'saltada') => ses('rodaje-8k', '2026-09-29', estado);

  it('sin sesiones es descanso, y no fabrica nada', () => {
    expect(estadoDeDia([], '2026-09-29', HOY)).toBe('descanso');
  });

  it('una hecha entre dos hace el día trabajado; a medias gana a sin hacer', () => {
    expect(estadoDeDia([s('hecha'), s('pendiente')], '2026-10-03', HOY)).toBe('hecha');
    expect(estadoDeDia([s('parcial'), s('saltada')], '2026-10-03', HOY)).toBe('parcial');
    expect(estadoDeDia([s('saltada'), s('pendiente')], '2026-10-03', HOY)).toBe('saltada');
  });

  it('una pendiente de un día que ya pasó es sin hacer: es un hecho, no un juicio', () => {
    expect(estadoDeDia([s('pendiente')], '2026-09-29', HOY)).toBe('saltada');
    expect(estadoDeDia([s('pendiente')], HOY, HOY)).toBe('pendiente');
    expect(estadoDeDia([s('pendiente')], '2026-10-02', HOY)).toBe('pendiente');
  });

  it('la card dice lo mismo que el carril (Swift: «por hacer» en la card y «sin hacer» en el carril)', () => {
    expect(estadoEfectivo(s('pendiente'), '2026-09-29', HOY)).toBe('saltada');
    expect(estadoEfectivo(s('pendiente'), HOY, HOY)).toBe('pendiente');
    expect(estadoEfectivo(s('hecha'), '2026-09-29', HOY)).toBe('hecha');
  });

  it('el día mostrado con la sesión pasada sin registrar lleva el gris, no el naranja', () => {
    const l = lectura('lleno');
    const v = vista(l, nav({ seleccion: '2026-09-30' }));
    if (v.tipo !== 'semana' || v.cuerpo.tipo !== 'sesion') throw new Error('debería haber sesión');
    expect(v.cuerpo.estado).toBe('saltada');
    expect(tonoDelSujeto(v)).toBe('neutro');
  });
});

describe('las modalidades que mandan en el día', () => {
  it('son como mucho dos y distintas', () => {
    const dia = semana('2026-09-28', HOY, [[d('remo-5x1000'), d('fuerza-inferior'), d('fuerza-superior'), d('series-800')], [], [], [], [], [], []]).dias[0]!;
    expect(modalidadesDelDia(dia)).toEqual(['ergo', 'strength']);
  });
});

// ---------------------------------------------------------------------------
// El sujeto de un día con varias sesiones
// ---------------------------------------------------------------------------

describe('sesionPrincipal (Swift: la primera del array, con «Empezar» apuntando a lo hecho)', () => {
  it('con AM hecha y PM por hacer, el sujeto es la PM: la misma que Hoy nombra', () => {
    const l = lectura('doble');
    const dia = diaMostrado(l.actual!, null)!;
    const p = sesionPrincipal(dia)!;
    expect(p.franja).toBe('PM');
    expect(p.titulo).toBe('Fuerza tren superior');
    expect(sesionesSecundarias(dia, p).map((x) => x.titulo)).toEqual(['Remo 5×1000']);
    const v = vista(l, nav());
    expect(accionAnclada(v, l)).toMatchObject({ tipo: 'empezar', sesion: { titulo: 'Fuerza tren superior' } });
  });

  it('con las dos hechas, el sujeto es la primera y la otra baja compacta', () => {
    const dia = semana('2026-09-28', HOY, [[], [], [], [d('remo-5x1000', 'hecha', { franja: 'AM' }), d('fuerza-superior', 'hecha', { franja: 'PM' })], [], [], []]).dias[3]!;
    expect(sesionPrincipal(dia)!.franja).toBe('AM');
  });

  it('con tres sesiones en un día ninguna queda huérfana', () => {
    const l = lectura('denso');
    const dia = diaMostrado(l.actual!, null)!;
    expect(dia.sesiones).toHaveLength(3);
    const p = sesionPrincipal(dia)!;
    expect(1 + sesionesSecundarias(dia, p).length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// La acción anclada
// ---------------------------------------------------------------------------

describe('accionAnclada', () => {
  it('sigue al día mostrado: hojeando un día pasado hecho, «Ver lo que hiciste»; en uno futuro, «Empezar»', () => {
    const l = lectura('lleno');
    expect(accionAnclada(vista(l, nav({ seleccion: '2026-09-28' })), l)?.tipo).toBe('ver-hecho');
    expect(accionAnclada(vista(l, nav({ seleccion: '2026-10-03' })), l)?.tipo).toBe('empezar');
  });

  it('a medias también se ve lo hecho: una sesión terminada no se ofrece como por hacer', () => {
    const l = lectura('a-medias');
    expect(accionAnclada(vista(l, nav()), l)?.tipo).toBe('ver-hecho');
  });

  it('«Ver lo de mañana» solo en el descanso de HOY, y con o sin tocar el chip de hoy (Swift lo perdía al tocarlo)', () => {
    const l = lectura('descanso');
    const sinTocar = accionAnclada(vista(l, nav()), l);
    const tocado = accionAnclada(vista(l, nav({ seleccion: HOY })), l);
    expect(sinTocar).toMatchObject({ tipo: 'ver-siguiente', cuando: 'mañana' });
    expect(tocado).toEqual(sinTocar);
    // Un descanso hojeado (no es hoy) no ofrece otro salto.
    const sab = vista(l, nav({ seleccion: '2026-10-04' }));
    expect(accionAnclada(sab, l)).toBeNull();
  });

  it('el texto de cada acción', () => {
    const l = lectura('descanso');
    expect(textoAccion(accionAnclada(vista(l, nav()), l)!, 'Mar')).toBe('Ver lo de mañana');
    const e = lectura('lleno');
    expect(textoAccion(accionAnclada(vista(e, nav()), e)!, 'Mar')).toBe('Empezar');
    expect(textoAccion(accionAnclada(vista(e, nav({ seleccion: '2026-09-28' })), e)!, 'Mar')).toBe('Ver lo que hiciste');
  });

  it('«mañana» solo si lo es; si no, el día que es', () => {
    expect(cuandoDeSiguiente('2026-10-02', HOY)).toBe('mañana');
    expect(cuandoDeSiguiente('2026-10-03', HOY)).toBe('del sábado');
  });
});

describe('ayer y mañana no son «la última» y «la siguiente» con nombre falso', () => {
  it('se rotula por la distancia real', () => {
    expect(rotuloDeDia('2026-09-30', HOY)).toBe('Ayer');
    expect(rotuloDeDia('2026-10-02', HOY)).toBe('Mañana');
    expect(rotuloDeDia('2026-09-29', HOY)).toBe('Martes 29');
    expect(rotuloDeDia('2026-10-03', HOY)).toBe('Sábado 3');
    expect(rotuloDeDia(HOY, HOY)).toBe('Hoy');
  });

  it('la última sesión antes de hoy puede ser de hace tres días', () => {
    const s = semana('2026-09-28', HOY, [[d('remo-5x1000', 'hecha')], [], [], [], [d('series-400')], [], []]);
    const ant = sesionAnterior(s)!;
    expect(ant.dia.iso).toBe('2026-09-28');
    expect(rotuloDeDia(ant.dia.iso, HOY)).toBe('Lunes 28');
    expect(sesionSiguiente(s)!.dia.iso).toBe('2026-10-02');
  });
});

describe('la card de un día hojeado no dice «Hoy»', () => {
  it('el prefijo es un hecho', () => {
    expect(etiquetaDeFecha(HOY, HOY)).toBe('Hoy · Jueves 1');
    expect(etiquetaDeFecha('2026-09-30', HOY)).toBe('Ayer · Miércoles 30');
    expect(etiquetaDeFecha('2026-10-02', HOY)).toBe('Mañana · Viernes 2');
    expect(etiquetaDeFecha('2026-10-03', HOY)).toBe('Sábado 3');
    expect(etiquetaDeFecha('2026-09-28', HOY)).toBe('Lunes 28');
  });

  it('el escenario «otro día» se abre en el sábado y no dice hoy', () => {
    const c = casoPlan('otro-dia');
    const v = vista(c.lectura, abre('otro-dia'));
    if (v.tipo !== 'semana' || v.cuerpo.tipo !== 'sesion') throw new Error('debería haber sesión');
    expect(v.cuerpo.dia.iso).toBe('2026-10-03');
    expect(v.cuerpo.dia.esHoy).toBe(false);
    expect(etiquetaDeFecha(v.cuerpo.dia.iso, c.lectura.hoyIso)).not.toMatch(/Hoy/);
  });
});

// ---------------------------------------------------------------------------
// La duración: el reloj escrito, o por qué no
// ---------------------------------------------------------------------------

describe('la duración', () => {
  it('con minutos es un SUELO («desde»), y solo entonces lleva número', () => {
    expect(textoDuracion({ minutos: 45 })).toBe('desde 45 min');
    expect(textoDuracion({ minutos: 70 })).toBe('desde 1 h 10');
    expect(textoDuracion({ minutos: 120 })).toBe('desde 2 h');
    expect(llevaNumero({ minutos: 45 })).toBe(true);
  });

  it('cada una de las cuatro razones tiene su frase y ninguna lleva cifra', () => {
    expect(textoDuracion({ razon: 'scored_by_time' })).toBe('Dura lo que tardes');
    expect(textoDuracion({ razon: 'until_failure' })).toBe('Hasta donde aguantes');
    expect(textoDuracion({ razon: 'work_not_timed' })).toBe('Según tu ritmo y tus descansos');
    expect(textoDuracion({ razon: 'undosed' })).toBe('Sin detallar');
    expect(llevaNumero({ razon: 'undosed' })).toBe(false);
  });

  it('un cero escrito no es un reloj, y sin dato no se pinta nada', () => {
    expect(formatoMinutos(0)).toBeNull();
    expect(textoDuracion({ minutos: 0 })).toBeNull();
    expect(textoDuracion(null)).toBeNull();
  });

  it('la semana del escenario «sin reloj» recorre las cuatro razones', () => {
    const s = lectura('sin-reloj').actual!;
    const razones = new Set(s.dias.flatMap((x) => x.sesiones).flatMap((x) => (x.duracion && 'razon' in x.duracion ? [x.duracion.razon] : [])));
    expect(razones).toEqual(new Set(['scored_by_time', 'work_not_timed', 'until_failure', 'undosed']));
  });
});

// ---------------------------------------------------------------------------
// Cabecera
// ---------------------------------------------------------------------------

describe('la cabecera', () => {
  it('dice la posición del servidor, o nombra la semana por su distancia sin inventar un total', () => {
    expect(textoPosicion({ semana: 3, total: 6 })).toBe('Semana 3 de 6');
    expect(textoPosicion({ semana: 5, total: null })).toBe('Semana 5');
    expect(tituloDeSemana(null, 0)).toBe('Esta semana');
    expect(tituloDeSemana(null, 1)).toBe('Semana que viene');
    expect(tituloDeSemana(null, 3)).toBe('En 3 semanas');
    expect(tituloDeSemana({ semana: 4, total: 6 }, 1)).toBe('Semana 4 de 6');
  });

  it('el rango de la semana es un hecho del cable', () => {
    expect(rangoDeSemana('2026-09-28', '2026-10-04')).toBe('Del 28 sep al 4 oct');
  });

  it('el plan directo no lleva nombre de bloque ni línea del coach, y no se inventan', () => {
    const s = lectura('plan-directo').actual!;
    expect(s.nombreBloque).toBeNull();
    expect(s.intencion).toBeNull();
    expect(s.posicion).toEqual({ semana: 5, total: null });
  });

  it('el título del sujeto baja de escalón sin dejar de ser el sujeto', () => {
    expect(tamanoDeTitulo('Series 6×800')).toBe(44);
    expect(tamanoDeTitulo('Chipper de piernas de los buenos')).toBe(36);
    expect(tamanoDeTitulo(casoPlan('denso').lectura.actual!.dias[3]!.sesiones[1]!.titulo)).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// El menú de una sesión y sus mutaciones
// ---------------------------------------------------------------------------

describe('accionesDeSesion', () => {
  const claves = (estado: 'pendiente' | 'hecha' | 'parcial' | 'saltada', extra: { libre?: boolean } = {}, conCoach = true) =>
    accionesDeSesion({ ...ses('rodaje-8k', HOY, estado), libre: extra.libre ?? false }, { conCoach }).map((a) => a.clave);

  it('pendiente y sin hacer: mover, marcar como hecha y completar', () => {
    expect(claves('pendiente')).toEqual(['tecnica', 'preguntar', 'mover', 'marcar-hecha', 'completar']);
    expect(claves('saltada')).toEqual(claves('pendiente'));
  });

  it('a medias: completar o deshacer; hecha: solo deshacer, y NO se mueve (el servidor la congela)', () => {
    expect(claves('parcial')).toEqual(['tecnica', 'preguntar', 'mover', 'completar', 'deshacer']);
    expect(claves('hecha')).toEqual(['tecnica', 'preguntar', 'deshacer']);
  });

  it('un libre se edita mientras no esté hecho y se borra siempre; uno del coach no se borra', () => {
    expect(claves('pendiente', { libre: true })).toContain('editar-libre');
    expect(claves('hecha', { libre: true })).not.toContain('editar-libre');
    expect(claves('hecha', { libre: true })).toContain('borrar-libre');
    expect(claves('pendiente')).not.toContain('borrar-libre');
  });

  it('sin coach no hay a quién preguntar', () => {
    expect(claves('pendiente', {}, false)).not.toContain('preguntar');
  });

  it('las destructivas son deshacer y borrar', () => {
    const a = accionesDeSesion({ ...ses('rodaje-8k', HOY, 'hecha'), libre: true }, { conCoach: true });
    expect(a.filter((x) => x.destructiva).map((x) => x.clave)).toEqual(['deshacer', 'borrar-libre']);
  });

  it('los destinos de «Mover» son los otros seis días, con su carga', () => {
    const s = lectura('lleno').actual!;
    const hoy = s.dias[3]!.sesiones[0]!;
    const dest = diasDestino(s, hoy);
    expect(dest).toHaveLength(6);
    expect(etiquetaDeDiaDestino(s.dias[0]!)).toBe('Lunes 28 · 1 sesión');
    expect(etiquetaDeDiaDestino(s.dias[6]!)).toBe('Domingo 4 · libre');
    const doble = lectura('doble').actual!.dias[3]!;
    expect(etiquetaDeDiaDestino(doble)).toBe('Hoy · 2 sesiones');
  });
});

describe('las mutaciones recalculan el día y el sello', () => {
  const s0 = lectura('lleno').actual!;
  const hoy = s0.dias[3]!.sesiones[0]!;

  it('marcar como hecha convierte el día en trabajado, sin inventar minutos', () => {
    const s = marcarHecha(s0, hoy.id, HOY);
    expect(s.dias[3]!.estado).toBe('hecha');
    expect(s.dias[3]!.sesiones[0]!.estado).toBe('hecha');
    // Hoy sigue siendo hoy.
    expect(s.dias[3]!.esHoy).toBe(true);
  });

  it('deshacer devuelve a pendiente, y el día pasado vuelve a ser «sin hacer»', () => {
    const lunes = s0.dias[0]!.sesiones[0]!;
    const s = deshacerHecho(s0, lunes.id, HOY);
    expect(s.dias[0]!.estado).toBe('saltada');
    const hoyDeshecho = deshacerHecho(marcarHecha(s0, hoy.id, HOY), hoy.id, HOY);
    expect(hoyDeshecho.dias[3]!.estado).toBe('pendiente');
  });

  it('mover cambia la sesión de día y deja el origen en descanso', () => {
    const s = moverSesion(s0, hoy.id, '2026-10-04', HOY);
    expect(s.dias[3]!.estado).toBe('descanso');
    expect(s.dias[6]!.sesiones.map((x) => x.id)).toContain(hoy.id);
    expect(s.dias[6]!.estado).toBe('pendiente');
  });

  it('una hecha no se mueve (el servidor devolvería 409) y mover al mismo día no hace nada', () => {
    const lunes = s0.dias[0]!.sesiones[0]!;
    expect(moverSesion(s0, lunes.id, '2026-10-04', HOY)).toBe(s0);
    expect(moverSesion(s0, hoy.id, HOY, HOY)).toBe(s0);
  });

  it('mover a un día con otra sesión no repite franja', () => {
    const l = lectura('doble').actual!;
    const tirada = l.dias[5]!.sesiones[0]!;
    const s = moverSesion(l, tirada.id, '2026-10-02', HOY);
    const franjas = s.dias[4]!.sesiones.map((x) => x.franja);
    expect(franjas).toHaveLength(2);
    expect(new Set(franjas).size).toBe(2);
  });

  it('borrar un libre lo quita y, si era el único, el día es descanso', () => {
    const l = lectura('denso').actual!;
    const libre = l.dias[1]!.sesiones[0]!;
    expect(libre.libre).toBe(true);
    expect(borrarSesion(l, libre.id, HOY).dias[1]!.estado).toBe('descanso');
  });

  it('marcar hoy como hecho cambia el tono del sujeto de naranja a verde', () => {
    const l = lectura('lleno');
    const antes = tonoDelSujeto(vista(l, nav()));
    const despues = tonoDelSujeto(vista({ ...l, actual: marcarHecha(l.actual!, l.actual!.dias[3]!.sesiones[0]!.id, HOY) }, nav()));
    expect([antes, despues]).toEqual(['accion', 'ok']);
  });
});

