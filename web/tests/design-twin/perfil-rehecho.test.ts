// LAS DECISIONES DE «PERFIL», CLAVADAS SOBRE LOS DIECIOCHO CASOS.
//
// Que el sujeto sea el correcto, que un contador se pinte en cero o que una
// fuente caída no se quede en esqueleto no se ve mirando un mockup: se ve igual de
// bien un perfil que miente que uno que no. Así que cada regla se fija aquí, caso
// a caso, y cada decisión tiene al menos un caso que la ejercita.

import { describe, expect, it } from 'vitest';
import { CASOS_PERFIL, casoPerfil } from '@/components/design-twin/kit-perfil/casos';
import type { Fila, LecturaPerfil } from '@/components/design-twin/kit-perfil/contrato';
import {
  accionIdentidad,
  agruparPuertas,
  apoyoDeIdentidad,
  iniciales,
  modoIdentidad,
  pendientesDe,
  puertasDe,
  subtituloIdentidad,
  tamNombre,
  tituloIdentidad,
  type ModoIdentidad,
  type Puerta,
} from '@/components/design-twin/kit-perfil/decision';
import {
  filasRendimiento,
  lineaRendimiento,
  rendimientoSinRespuesta,
} from '@/components/design-twin/kit-perfil/rendimiento';

const lectura = (id: string): LecturaPerfil => casoPerfil(id).lectura;
/** El separador lleva un espacio de no separación (kit-perfil/texto): para comparar, se lee como un espacio. */
const plano = <T,>(x: T): T => JSON.parse(JSON.stringify(x).replace(/\u00a0/g, ' ')) as T;
const fila = (l: LecturaPerfil, clave: Fila['clave']): Fila => {
  const f = filasRendimiento(l).find((x) => x.clave === clave);
  if (!f) throw new Error(`sin fila ${clave}`);
  return plano(f);
};

/** El momento del sujeto en cada uno de los veinte escenarios. */
const MODO: Record<string, ModoIdentidad> = {
  veterano: 'completo',
  alta: 'por-completar',
  libre: 'completo',
  pareja: 'completo',
  'sin-ancla': 'completo',
  'tests-a-medias': 'completo',
  'reloj-retirado': 'completo',
  coros: 'completo',
  'sin-nombre': 'por-completar',
  cargando: 'cargando',
  error: 'error',
  denso: 'completo',
  termina: 'completo',
  'fuente-caida': 'completo',
  largos: 'completo',
  'sin-pareja': 'completo',
  invitacion: 'completo',
  'libre-alta': 'por-completar',
  'coros-importados': 'completo',
  'coros-fallo': 'completo',
};

describe('el sujeto sobre los veinte casos', () => {
  it('cubre exactamente los veinte escenarios del doble', () => {
    expect(Object.keys(MODO).sort()).toEqual(CASOS_PERFIL.map((c) => c.id).sort());
  });

  for (const c of CASOS_PERFIL) {
    it(`${c.id} → ${MODO[c.id]}`, () => {
      expect(modoIdentidad(c.lectura)).toBe(MODO[c.id]);
    });
  }

  it('el subtítulo se hace SOLO con los campos que hay, sin «nivel» inventado', () => {
    expect(plano(subtituloIdentidad(lectura('veterano').identidad))).toBe('división Open · 34 años · 6 años entrenando · 172 cm · 64,5 kg');
    expect(plano(subtituloIdentidad(lectura('sin-ancla').identidad))).toBe('181 cm · 79 kg');
    expect(plano(subtituloIdentidad(lectura('sin-nombre').identidad))).toBe('175 cm · 70 kg');
    expect(subtituloIdentidad(lectura('alta').identidad)).toBeNull();
    for (const c of CASOS_PERFIL) {
      expect(subtituloIdentidad(c.lectura.identidad) ?? '').not.toMatch(/nivel|avanzado|intermedio|principiante/i);
    }
  });

  it('un año no es «1 años», y un peso decimal lleva coma', () => {
    const id = { ...lectura('veterano').identidad, anosEntrenando: 1, division: null, edad: null };
    expect(plano(subtituloIdentidad(id))).toBe('1 año entrenando · 172 cm · 64,5 kg');
  });

  it('sin nombre, la silueta y una pregunta; no iniciales vacías ni un hueco', () => {
    const l = lectura('sin-nombre');
    expect(iniciales(l.identidad.nombre)).toBe('');
    expect(tituloIdentidad(l.identidad)).toBe('¿Cómo te llamas?');
    expect(accionIdentidad(l)).toBe('Poner mi nombre');
  });

  it('las iniciales son las de las dos primeras palabras', () => {
    expect(iniciales('Marc Puig')).toBe('MP');
    expect(iniciales('Alejandro Sánchez-Villanueva Ortega')).toBe('AS');
    expect(iniciales('Ana')).toBe('A');
    expect(iniciales('  ')).toBe('');
  });

  it('la acción es UNA y es la que falta', () => {
    expect(accionIdentidad(lectura('veterano'))).toBe('Editar perfil');
    expect(accionIdentidad(lectura('alta'))).toBe('Completar mi perfil');
    expect(accionIdentidad(lectura('error'))).toBe('Reintentar');
  });

  it('la invitación solo promete lo que la app hace: zonas por edad solo con coach', () => {
    expect(apoyoDeIdentidad(lectura('alta'))).toMatch(/fecha de nacimiento.*zonas de pulso/);
    // Sin coach no hay zonas que enseñar: no se promete ninguna.
    expect(apoyoDeIdentidad(lectura('libre-alta'))).toBe('Cuéntanos tu edad, tu altura y tu peso.');
    // Con métricas, el subtítulo manda y no hay apoyo.
    expect(apoyoDeIdentidad(lectura('veterano'))).toBeNull();
  });

  it('una foto que falta NO activa la invitación (nunca se obliga a poner la cara)', () => {
    expect(lectura('denso').identidad.foto).toBe(false);
    expect(modoIdentidad(lectura('denso'))).toBe('completo');
  });

  it('un nombre largo baja de tamaño, no gana una tercera línea', () => {
    expect(tamNombre('Nora Ramos')).toBe(44);
    expect(tamNombre('Alejandro Sánchez-Villanueva Ortega')).toBe(30);
    expect(tamNombre('a'.repeat(26))).toBe(36);
    expect(tamNombre('a'.repeat(22))).toBe(44);
  });

  it('en frío y en error el sujeto manda sobre lo que diga la identidad', () => {
    expect(modoIdentidad({ ...lectura('veterano'), cargando: true, errorCarga: true })).toBe('cargando');
    expect(modoIdentidad({ ...lectura('veterano'), errorCarga: true })).toBe('error');
  });
});

describe('Rendimiento: las cinco filas', () => {
  it('con coach son cinco, sin coach tres (ni tests ni zonas)', () => {
    expect(filasRendimiento(lectura('veterano')).map((f) => f.clave)).toEqual(['tests', 'marcas', 'vo2', 'zonas', 'fuerza']);
    for (const id of ['libre', 'libre-alta']) {
      expect(filasRendimiento(lectura(id)).map((f) => f.clave)).toEqual(['marcas', 'vo2', 'fuerza']);
    }
  });

  it('un CONTADOR se pinta en cero y un cero no es un logro', () => {
    const l = lectura('alta');
    expect(fila(l, 'tests').estado).toMatchObject({ tipo: 'valor', cifra: '0', sufijo: 'de 4', pie: 'calibrados' });
    expect(fila(l, 'marcas').estado).toMatchObject({ tipo: 'valor', cifra: '0', sufijo: 'de 12', pie: 'con récord' });
    expect(fila(l, 'tests').logrado).toBe(false);
    expect(fila(l, 'marcas').logrado).toBe(false);
    expect(lineaRendimiento(filasRendimiento(l))).toBe('0 de 5 con dato');
  });

  it('un VALOR MEDIDO no existe hasta que se mide: invitación con su verbo, jamás un guion', () => {
    const l = lectura('alta');
    for (const clave of ['vo2', 'zonas', 'fuerza'] as const) {
      const e = fila(l, clave).estado;
      expect(e.tipo).toBe('vacio');
      if (e.tipo === 'vacio') {
        expect(e.salida).toBeTruthy();
        expect(e.invitacion).not.toMatch(/^[—–-]+$/);
      }
    }
  });

  it('sin ancla NO hay zonas y no se inventa ninguna', () => {
    const e = fila(lectura('sin-ancla'), 'zonas').estado;
    expect(e).toMatchObject({ tipo: 'vacio', salida: 'Cómo tenerlas' });
    expect(JSON.stringify(e)).not.toMatch(/\d{3}/);
  });

  it('un umbral estimado escribe de dónde sale', () => {
    const e = fila(lectura('tests-a-medias'), 'zonas').estado;
    expect(e).toMatchObject({ tipo: 'valor', cifra: '171', sufijo: 'ppm', pie: 'Estimado por tu edad' });
    for (const c of CASOS_PERFIL) {
      const z = filasRendimiento(c.lectura).find((f) => f.clave === 'zonas');
      if (z?.estado.tipo === 'valor') expect(z.estado.pie).toBeTruthy();
    }
  });

  it('la batería a medias pide un acto; la cerrada, no', () => {
    const medias = fila(lectura('tests-a-medias'), 'tests');
    expect(medias.pideActo).toBe(true);
    expect(medias.logrado).toBe(true);
    expect(medias.estado).toMatchObject({ tipo: 'valor', cifra: '2', sufijo: 'de 4', pie: 'calibrados · 1 sin resultado' });
    expect(fila(lectura('veterano'), 'tests').pideActo).toBe(false);
    expect(fila(lectura('alta'), 'tests').pideActo).toBe(true);
  });

  it('un test empezado cuenta como algo del atleta aunque aún no tenga número', () => {
    const l: LecturaPerfil = {
      ...lectura('alta'),
      rendimiento: { ...lectura('alta').rendimiento, bateria: { tipo: 'contesto', valor: { total: 4, completados: 0, aMedias: 1 } } },
    };
    expect(fila(l, 'tests').logrado).toBe(true);
  });

  it('sin batería programada jamás se pinta «0 de 0»: se dice quién la programa', () => {
    const l: LecturaPerfil = {
      ...lectura('alta'),
      rendimiento: { ...lectura('alta').rendimiento, bateria: { tipo: 'contesto', valor: { total: 0, completados: 0, aMedias: 0 } } },
    };
    expect(fila(l, 'tests').estado).toEqual({ tipo: 'vacio', invitacion: 'Tu coach los programa y aparecen aquí', salida: null });
  });

  it('un hueco que el atleta no puede llenar lo dice y no ofrece salida (los tests y el catálogo son del coach)', () => {
    expect(fila(lectura('sin-pareja'), 'tests').estado).toEqual({ tipo: 'vacio', invitacion: 'Tu coach los programa y aparecen aquí', salida: null });
    expect(fila(lectura('invitacion'), 'marcas').estado).toEqual({ tipo: 'vacio', invitacion: 'Aún no hay marcas que probar', salida: null });
  });

  it('el 1RM más pesado abre la fila y el pie dice CUÁL es', () => {
    expect(fila(lectura('veterano'), 'fuerza').estado).toMatchObject({ cifra: '165', sufijo: 'kg', pie: 'peso muerto · 3 levantamientos' });
    expect(fila(lectura('libre'), 'fuerza').estado).toMatchObject({ cifra: '90', pie: 'sentadilla · 1 levantamiento' });
    const decimal = { ...lectura('veterano'), rendimiento: { ...lectura('veterano').rendimiento, fuerza: { tipo: 'contesto' as const, valor: [{ etiqueta: 'Sentadilla', kg: 186.7 }] } } };
    expect(fila(decimal, 'fuerza').estado).toMatchObject({ cifra: '186,7' });
  });

  it('el VO₂ dice de dónde sale', () => {
    expect(fila(lectura('veterano'), 'vo2').estado).toMatchObject({ cifra: '52,8', pie: 'ml/kg/min · tu reloj' });
    expect(fila(lectura('tests-a-medias'), 'vo2').estado).toMatchObject({ cifra: '46,5', pie: 'ml/kg/min · tu Cooper' });
  });

  it('el recuento de «N de M con dato» cuenta las filas VISIBLES', () => {
    expect(lineaRendimiento(filasRendimiento(lectura('veterano')))).toBe('5 de 5 con dato');
    expect(lineaRendimiento(filasRendimiento(lectura('libre')))).toBe('3 de 3 con dato');
    expect(lineaRendimiento(filasRendimiento(lectura('libre-alta')))).toBe('0 de 3 con dato');
    expect(lineaRendimiento(filasRendimiento(lectura('sin-ancla')))).toBe('3 de 5 con dato');
  });

  it('en frío todo es esqueleto (los valores de relleno no se leen) y no hay recuento', () => {
    const filas = filasRendimiento(lectura('cargando'));
    expect(filas.every((f) => f.estado.tipo === 'cargando')).toBe(true);
    expect(lineaRendimiento(filas)).toBeNull();
    // Aunque el relleno dijera otra cosa, en frío manda «cargando».
    const conRelleno = { ...lectura('veterano'), cargando: true };
    expect(filasRendimiento(conRelleno).every((f) => f.estado.tipo === 'cargando')).toBe(true);
  });

  it('una fuente que falló dice que falló, y el recuento se calla', () => {
    const l = lectura('fuente-caida');
    expect(fila(l, 'vo2').estado.tipo).toBe('sin-respuesta');
    expect(fila(l, 'fuerza').estado.tipo).toBe('valor');
    expect(lineaRendimiento(filasRendimiento(l))).toBeNull();
    expect(rendimientoSinRespuesta(filasRendimiento(l))).toBe(false);
  });

  it('sin red, la sección es UNA frase y no cinco teselas de error', () => {
    expect(rendimientoSinRespuesta(filasRendimiento(lectura('error')))).toBe(true);
    expect(rendimientoSinRespuesta(filasRendimiento(lectura('veterano')))).toBe(false);
  });

  it('las zonas viajan con la identidad: si ella cayó, no pueden contestar', () => {
    const l = { ...lectura('veterano'), errorCarga: true };
    expect(fila(l, 'zonas').estado.tipo).toBe('sin-respuesta');
    expect(fila(l, 'vo2').estado.tipo).toBe('valor');
  });

  it('un hueco sin salida solo lo es cuando el atleta NO puede llenarlo', () => {
    for (const c of CASOS_PERFIL) {
      for (const f of filasRendimiento(c.lectura)) {
        if (f.estado.tipo === 'vacio' && f.estado.salida === null) expect(['tests', 'marcas']).toContain(f.clave);
        if (f.estado.tipo === 'vacio' && ['vo2', 'zonas', 'fuerza'].includes(f.clave)) expect(f.estado.salida).toBeTruthy();
      }
    }
  });
});

describe('«Pendiente»: solo actos, en el orden en que caducan', () => {
  it('la pregunta de COROS es la primera', () => {
    expect(pendientesDe(lectura('coros'))).toEqual([{ clave: 'coros', inicio: '7:12' }]);
  });

  it('el denso las trae las tres, y en su orden', () => {
    expect(pendientesDe(lectura('denso')).map((p) => p.clave)).toEqual(['coros', 'suscripcion', 'pareja']);
    expect(pendientesDe(lectura('denso'))[2]).toMatchObject({ estado: 'caducada', email: 'aleix@ejemplo.es' });
  });

  it('esperar no es un acto: una invitación enviada y una suscripción que termina no reclaman', () => {
    expect(pendientesDe(lectura('invitacion'))).toEqual([]);
    expect(pendientesDe(lectura('termina'))).toEqual([]);
  });

  it('Dobles sin compañero/a es un acto: invitar', () => {
    expect(pendientesDe(lectura('sin-pareja'))).toEqual([{ clave: 'pareja', estado: 'sin-pareja', email: null }]);
  });

  it('con la pareja ya emparejada no hay nada que hacer', () => {
    expect(pendientesDe(lectura('pareja'))).toEqual([]);
  });

  it('no se pinta nada mientras no se sabe: en frío ni con la identidad caída', () => {
    expect(pendientesDe({ ...lectura('denso'), cargando: true })).toEqual([]);
    expect(pendientesDe({ ...lectura('denso'), errorCarga: true })).toEqual([]);
  });

  it('sin coach no llega ninguna pieza de coach', () => {
    const l = { ...lectura('denso'), conCoach: false, coach: null };
    expect(pendientesDe(l).map((p) => p.clave)).not.toContain('suscripcion');
  });

  it('un perfil al día no reclama nada', () => {
    for (const id of ['veterano', 'alta', 'libre', 'reloj-retirado', 'sin-ancla']) expect(pendientesDe(lectura(id))).toEqual([]);
  });
});

const puerta = (l: LecturaPerfil, clave: Puerta['clave']) => {
  const p = puertasDe(l).find((x) => x.clave === clave);
  if (!p) throw new Error(`sin puerta ${clave}`);
  return plano(p);
};

describe('las puertas y lo que revelan', () => {
  it('son las seis de Swift, en su orden', () => {
    expect(puertasDe(lectura('veterano')).map((p) => p.clave)).toEqual(['identidad', 'entreno', 'dispositivos', 'cuenta', 'privacidad', 'ayuda']);
  });

  it('cada una lleva su subtítulo REAL', () => {
    const l = lectura('veterano');
    expect(puerta(l, 'identidad').descripcion).toBe('Modalidad, objetivo · Mejorar mi marca de HYROX');
    expect(puerta(l, 'entreno').descripcion).toBe('Días, molestias, avisos de voz y pruebas del reloj');
    expect(puerta(l, 'dispositivos').descripcion).toBe('Apple Health, reloj, Garmin, Polar, COROS y más');
    expect(puerta(l, 'cuenta').descripcion).toBe('Apariencia, metodología y eliminar tu cuenta');
    expect(puerta(l, 'privacidad').descripcion).toBe('Movimiento del reloj, tus datos y la política de privacidad');
    expect(puerta(l, 'ayuda').descripcion).toBe('Sugerencias y términos');
  });

  it('Dispositivos dice qué hay conectado, o que no hay nada', () => {
    expect(puerta(lectura('veterano'), 'dispositivos').estado).toEqual({ texto: 'Apple Salud, Apple Watch y COROS conectados', tono: 'ok' });
    expect(puerta(lectura('libre'), 'dispositivos').estado).toEqual({ texto: 'Apple Salud conectado', tono: 'ok' });
    expect(puerta(lectura('alta'), 'dispositivos').estado).toEqual({ texto: 'Ningún dispositivo conectado', tono: 'invita' });
  });

  it('el movimiento del reloj es una decisión suya: ni verde ni rojo, y calla si nunca se preguntó', () => {
    expect(puerta(lectura('reloj-retirado'), 'privacidad').estado).toEqual({ texto: 'Movimiento del reloj: retirado', tono: 'neutro' });
    expect(puerta(lectura('veterano'), 'privacidad').estado).toEqual({ texto: 'Movimiento del reloj: permitido', tono: 'neutro' });
    expect(puerta(lectura('alta'), 'privacidad').estado).toBeNull();
    expect(puerta(lectura('reloj-retirado'), 'privacidad').atencion).toBe(false);
  });

  it('Identidad junta la pareja de Dobles y la suscripción', () => {
    // Una suscripción al día no es noticia: con pareja solo se cuenta la pareja.
    expect(puerta(lectura('pareja'), 'identidad').estado).toEqual({ texto: 'Dobles · con Biel', tono: 'neutro' });
    expect(puerta(lectura('veterano'), 'identidad').estado).toEqual({ texto: 'Suscripción activa', tono: 'ok' });
    expect(puerta(lectura('termina'), 'identidad')).toMatchObject({ estado: { texto: 'Suscripción: termina el 12 oct', tono: 'aviso' }, atencion: true });
    expect(puerta(lectura('denso'), 'identidad')).toMatchObject({ estado: { tono: 'peligro' }, atencion: true });
    expect(puerta(lectura('sin-pareja'), 'identidad').estado?.texto).toBe('Dobles · sin compañero/a');
    expect(puerta(lectura('invitacion'), 'identidad').estado?.texto).toMatch(/invitación enviada, caduca en 12 días/);
  });

  it('sin coach: sin suscripción en Identidad ni metodología en Cuenta', () => {
    const l = lectura('libre');
    expect(puerta(l, 'identidad').estado).toBeNull();
    expect(puerta(l, 'cuenta').descripcion).toBe('Apariencia y eliminar tu cuenta');
    expect(puerta(lectura('libre-alta'), 'identidad').descripcion).toBe('Modalidad, objetivo e idioma');
  });

  it('Entreno no tiene estado que contar: conserva su subtítulo, que es el índice de lo que hay dentro', () => {
    for (const c of CASOS_PERFIL) expect(puerta(c.lectura, 'entreno').estado).toBeNull();
    expect(puerta(lectura('veterano'), 'entreno').descripcion).toMatch(/molestias/);
  });

  it('en frío y en error no se sabe el estado de nada: cada puerta dice lo que hay dentro', () => {
    for (const id of ['cargando', 'error']) {
      for (const p of puertasDe(lectura(id))) {
        expect(p.estado).toBeNull();
        expect(p.atencion).toBe(false);
      }
    }
  });

  it('a la vista, las que se usan y las que dicen algo del atleta; plegadas, las que no dicen nada', () => {
    // El veterano decidió sobre el movimiento del reloj: Privacidad ya dice algo y se queda a la vista.
    const g = agruparPuertas(puertasDe(lectura('veterano')));
    expect(g.visibles.map((p) => p.clave)).toEqual(['identidad', 'entreno', 'dispositivos', 'privacidad']);
    expect(g.plegadas.map((p) => p.clave)).toEqual(['cuenta', 'ayuda']);
    // A quien nunca se le preguntó, Privacidad no tiene nada que decir y se pliega con Cuenta y Ayuda.
    const alta = agruparPuertas(puertasDe(lectura('alta')));
    expect(alta.visibles.map((p) => p.clave)).toEqual(['identidad', 'entreno', 'dispositivos']);
    expect(alta.plegadas.map((p) => p.clave)).toEqual(['cuenta', 'privacidad', 'ayuda']);
  });

  it('el movimiento retirado se ve a la primera, sin abrir nada', () => {
    const g = agruparPuertas(puertasDe(lectura('reloj-retirado')));
    expect(g.visibles.map((p) => p.clave)).toContain('privacidad');
  });

  it('una puerta que pide al atleta NUNCA se pliega', () => {
    const base = puertasDe(lectura('alta'));
    const cuentaConAviso = base.map((p) =>
      p.clave === 'cuenta' ? { ...p, estado: { texto: 'algo', tono: 'aviso' as const }, atencion: true } : p,
    );
    const g = agruparPuertas(cuentaConAviso);
    expect(g.visibles.map((p) => p.clave)).toEqual(['identidad', 'entreno', 'dispositivos', 'cuenta']);
    expect(g.plegadas.map((p) => p.clave)).toEqual(['privacidad', 'ayuda']);
    expect(g.visibles.length + g.plegadas.length).toBe(6);
  });
});

describe('invariantes sobre los veinte casos', () => {
  const todoElTexto = (l: LecturaPerfil) =>
    JSON.stringify([filasRendimiento(l), pendientesDe(l), puertasDe(l), tituloIdentidad(l.identidad), subtituloIdentidad(l.identidad), apoyoDeIdentidad(l)]);

  it('ninguna pieza de coach llega sin coach, ni siquiera vacía', () => {
    const libres = CASOS_PERFIL.filter((c) => !c.lectura.conCoach);
    expect(libres.length).toBeGreaterThanOrEqual(2);
    for (const c of libres) {
      expect(todoElTexto(c.lectura)).not.toMatch(/coach|tests|suscripci[oó]n|metodolog[ií]a|zonas de pulso/i);
    }
  });

  it('el separador nunca deja un punto medio colgando al principio de una línea', () => {
    for (const c of CASOS_PERFIL) expect(todoElTexto(c.lectura)).not.toMatch(/ ·/);
  });

  it('cero guiones largos en cualquier texto que llegue a pantalla', () => {
    for (const c of CASOS_PERFIL) expect(todoElTexto(c.lectura)).not.toMatch(/—|–/);
  });

  it('ningún texto lleva un nombre propio del equipo ni la marca heredada', () => {
    for (const c of CASOS_PERFIL) expect(todoElTexto(c.lectura)).not.toMatch(/pablo|fabrik|fahybrik/i);
  });

  it('la pregunta de COROS y su aviso de sincronización son excluyentes (Swift hace una u otra)', () => {
    for (const c of CASOS_PERFIL) expect(c.lectura.corosPendiente !== null && c.lectura.corosAviso !== null).toBe(false);
    expect(lectura('coros-importados').corosAviso).toEqual({ tono: 'ok', texto: 'Importados 2 entrenos de COROS.' });
    expect(lectura('coros-fallo').corosAviso?.tono).toBe('fallo');
    // Un aviso no es un acto: no entra en «Pendiente».
    expect(pendientesDe(lectura('coros-importados'))).toEqual([]);
    expect(pendientesDe(lectura('coros-fallo'))).toEqual([]);
  });

  it('cada caso trae su título numerado y lo que hay que mirar', () => {
    for (const c of CASOS_PERFIL) {
      expect(c.titulo).toMatch(/^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳] /);
      expect(c.mira.length).toBeGreaterThan(60);
    }
  });

  it('el pie de un contador siempre tiene su unidad de medida: nunca «— de 4»', () => {
    for (const c of CASOS_PERFIL) {
      for (const f of filasRendimiento(c.lectura)) {
        if (f.estado.tipo === 'valor') expect(f.estado.cifra).toMatch(/^\d+(,\d+)?$/);
      }
    }
  });
});
