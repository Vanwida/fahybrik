// EL EXAMEN DE «GARMIN · CORRER» (docs/garmin-reloj/modelo.md §3, §5, §6, §11).
//
// Cada paso de cada caso de la familia (los 13 de la muñeca, la pista, el GPS y
// el pulso que se caen) pasa por las caras del kit en los CUATRO relojes (454,
// 390, 260 y 218): cabe en la cuerda del círculo, nada baja del 6,2 % de D, el
// héroe queda en 0,20–0,26 D y es el de `laminaDelPaso`, nada se pisa y las
// cifras las sabe pintar la bitmap. Se mira cada paso de cada sesión (sin
// repetirlas) y cada caso corrido segundo a segundo por el motor.
// Y dos más: los BOTONES (la carcasa de cada escenario, renderizada de verdad,
// ofrece lo que dice §5) y los AVISOS (el motor emite lo que promete cada
// descripción y suena como dice §6).
// `comprobar` es la de `kit-garmin-caras.test.ts`, copiada (allí es local): con
// tres familias copiándola toca subirla a un helper de tests.

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  AVISOS,
  FILA_MODELO,
  MANDOS,
  SUBCONJUNTO_CIFRAS,
  TAMANOS,
  TG,
  BOTONES_TABLA,
  VUELTAS_VISIBLES,
  componerAvisos,
  disponerCuenta,
  disponerDatos,
  disponerDescanso,
  disponerDeshacer,
  disponerEstructura,
  disponerKm,
  disponerPasoDe,
  disponerPausa,
  disponerRecupera,
  disponerVueltas,
  esAviso,
  eventosDeTransicion,
  fmtPulsos,
  fmtTono,
  type Disposicion,
  type EstadoMandos,
  type EventoGarmin,
} from '@/components/design-twin/kit-garmin';
import { estructuraDe } from '@/components/design-twin/kit-reloj/estructura';
import type { Transicion } from '@/components/design-twin/kit-reloj/gancho';
import { heroeDelPaso, laminaDelPaso } from '@/components/design-twin/kit-reloj/lamina';
import { filasDeDatos, filasDeVueltas, textoFila } from '@/components/design-twin/kit-reloj/listas';
import type { PasoBase } from '@/components/design-twin/kit-reloj/paso';
import { veredictoDe } from '@/components/design-twin/kit-reloj/reglas';
import { avanzar, cuentaDe, estadoInicial, lecturasDe, pasoVivo, type EstadoSecuencia } from '@/components/design-twin/kit-reloj/secuencia';
import { avisoDeCierre, sesionDe, vueltasDe } from '@/components/design-twin/kit-reloj/vivo';
import { casoGarminCorrer, type CasoGarminCorrer } from '@/components/design-twin/screens/garmin-correr/casos';
import { Screen, escenarios } from '@/components/design-twin/screens/garmin-correr';
import { bannerDeVuelta, esVueltaDePista, rotuloDeVuelta, tituloDeVueltas, vueltasDePista } from '@/components/design-twin/screens/garmin-correr/pista';
import { SISTEMA_MS, TEXTO_SISTEMA, avisoDeSistema, disponerSistema, type AvisoDeSistema } from '@/components/design-twin/screens/garmin-correr/sistema';
import { cuerpo } from '@/components/design-twin/screens/reloj-correr/casos';
import { normal, tablaDe } from './garmin-modelo';

/** Tolerancia de medida: medio píxel. */
const PX = 0.5;
/** Cada cuántos segundos se mira un caso corrido, y hasta cuándo. */
const MIRA_CADA_S = 4;
const CORRE_HASTA_S = 130;

function comprobar(d: Disposicion, que: string) {
  const suelo = Math.ceil(TG.suelo * d.D);
  const cajas: Array<[number, number, string]> = [];
  for (const l of d.lineas) {
    const donde = `${que} · ${l.rol} «${l.piezas.map((p) => p.texto).join('')}» a ${d.D}`;
    expect(l.cabe, `${donde}: no cabe (${Math.round(l.ancho)} > ${l.anchoUtil})`).toBe(true);
    expect(l.ancho, donde).toBeLessThanOrEqual(l.anchoUtil + PX);
    expect(l.y, donde).toBeGreaterThanOrEqual(0);
    expect(l.y + l.alto, donde).toBeLessThanOrEqual(d.D);
    for (const p of l.piezas) {
      expect(p.cuerpo, `${donde}: bajo el suelo`).toBeGreaterThanOrEqual(suelo);
      if (p.cara === 'cifras') for (const ch of p.texto) expect(SUBCONJUNTO_CIFRAS, `${donde}: «${ch}» no está en la bitmap`).toContain(ch);
    }
    cajas.push([l.y, l.y + l.alto, donde]);
  }
  if (d.heroe) {
    const h = d.heroe;
    const donde = `${que} · héroe «${h.texto}» a ${d.D}`;
    expect(h.talla.cabe, donde).toBe(true);
    expect(h.talla.cuerpo, donde).toBeGreaterThanOrEqual(Math.round(TG.heroe.min * d.D));
    expect(h.talla.cuerpo, donde).toBeLessThanOrEqual(Math.round(TG.heroe.max * d.D));
    expect(h.talla.ancho, donde).toBeLessThanOrEqual(h.anchoUtil + PX);
    if (h.unidad) expect(h.talla.cuerpoUnidad, donde).toBeGreaterThanOrEqual(suelo);
    if (h.cara === 'cifras') for (const ch of h.texto) expect(SUBCONJUNTO_CIFRAS, donde).toContain(ch);
    cajas.push([h.y, h.y + h.alto, donde]);
  }
  if (d.pista) cajas.push([d.pista.y, d.pista.y + d.pista.alto, `${que} · pista a ${d.D}`]);
  cajas.sort((a, b) => a[0] - b[0]);
  for (let k = 1; k < cajas.length; k++) {
    expect(cajas[k]![0], `${cajas[k]![2]} pisa a ${cajas[k - 1]![2]}`).toBeGreaterThanOrEqual(cajas[k - 1]![1] - PX);
  }
}

// ---------------------------------------------------------------------------
// Los casos
// ---------------------------------------------------------------------------

const IDS = escenarios.map((e) => e.id);
const CASOS: Array<[string, CasoGarminCorrer]> = IDS.map((id) => [id, casoGarminCorrer(id)]);

/** Una sesión, una vez: las que salen en varios escenarios (509, 538…) no se examinan repetidas. */
const firma = (pasos: PasoBase[]) => pasos.map((p) => `${p.clase}:${p.medida.tipo}:${p.medida.prescrito}:${p.entorno ?? ''}:${p.posicion ? JSON.stringify(p.posicion) : ''}`).join('|');
const SESIONES = new Map<string, CasoGarminCorrer>();
for (const [, c] of CASOS) SESIONES.set(firma(c.caso.datos.plan.pasos), c);

/** Lo que pinta el reloj en un estado del motor: la cara del paso, sus tarjetas y sus páginas, a un tamaño. */
function carasDe(c: CasoGarminCorrer, s: EstadoSecuencia, D: number, que: string) {
  const { plan, estructura } = c.caso.datos;
  const p = pasoVivo(plan, s);
  const l = lecturasDe(p, s);
  if (p.rol === 'recuperacion') {
    comprobar(disponerRecupera(p, l, plan.zonas, D), `${que} · recupera`);
    expect(disponerRecupera(p, l, plan.zonas, D).heroe?.texto, `${que} · héroe de la recuperación`).toBe(heroeDelPaso(p, l, plan.zonas).texto);
  } else if (p.rol === 'descanso') {
    comprobar(disponerDescanso(p, l, D), `${que} · descanso`);
    expect(disponerDescanso(p, l, D).heroe?.texto, `${que} · héroe del descanso`).toBe(heroeDelPaso(p, l, null).texto);
  } else {
    const { lamina, disposicion } = disponerPasoDe(p, l, plan.zonas, D, plan.reglas);
    comprobar(disposicion, `${que} · paso`);
    // El héroe es el de la lámina (G2): la vista no decide.
    expect(disposicion.heroe?.texto, `${que} · héroe`).toBe(lamina.heroe.texto);
    expect(disposicion.heroe?.unidad, `${que} · unidad del héroe`).toBe(lamina.heroe.unidad);
    expect(lamina).toEqual(laminaDelPaso(p, l, plan.zonas, plan.reglas));
  }
  const n = cuentaDe(plan, s);
  if (n != null && p.siguiente) comprobar(disponerCuenta(n, p.siguiente, D), `${que} · 3-2-1`);
  if (s.goHasta > s.sesionT) comprobar(disponerCuenta(0, p, D), `${que} · GO`);
  comprobar(disponerPausa(s.sesionT, p, D), `${que} · pausa`);
  comprobar(disponerDeshacer(avisoDeCierre(p), D), `${que} · deshacer`);

  // La vuelta automática: la del km del kit, o la de la pista con su tarjeta.
  if (s.banner) {
    const pista = esVueltaDePista(p) ? bannerDeVuelta(s, p, plan) : null;
    comprobar(disponerKm(pista ?? s.banner, D), `${que} · vuelta`);
  }

  // Las páginas: Datos, Vueltas (con el nombre de una pista) y Estructura del caso.
  comprobar(disponerDatos(filasDeDatos(sesionDe(s), l, p.entorno === 'cinta' ? 'cinta' : undefined), plan.zonas, D), `${que} · Datos`);
  const { objetivo, enCurso } = vueltasDe({ paso: p, lecturas: l, estado: s });
  const deLaPista = esVueltaDePista(p);
  const vueltas = deLaPista ? vueltasDePista(s.vueltas, p, plan) : s.vueltas;
  const { titulo, filas } = filasDeVueltas(vueltas, objetivo, enCurso ? VUELTAS_VISIBLES - 1 : VUELTAS_VISIBLES);
  comprobar(
    disponerVueltas(deLaPista ? tituloDeVueltas(titulo) : titulo, deLaPista ? filas.map(rotuloDeVuelta) : filas, enCurso && deLaPista ? rotuloDeVuelta(enCurso) : enCurso, D),
    `${que} · Vueltas`,
  );
  const filasE = (estructura ?? estructuraDe(plan.pasos))(s.i).map((f) => ({ ...textoFila(f), estado: f.estado }));
  comprobar(disponerEstructura(filasE, D), `${que} · Estructura`);
}

/** Los momentos de un paso que se miran: al empezar, a la mitad y al final. */
function momentos(p: PasoBase): Array<{ t: number; metros?: number }> {
  const pr = p.medida.prescrito ?? 60;
  if (p.medida.tipo === 'distancia') return [{ t: 1 }, { t: 60, metros: pr / 2 }, { t: 200, metros: Math.max(0, pr - 30) }];
  if (p.medida.tipo === 'tiempo') return [{ t: 0 }, { t: Math.floor(pr / 2) }, { t: Math.max(0, pr - 2) }];
  return [{ t: 0 }, { t: 30 }];
}

describe('cada paso de cada sesión de correr cabe en los cuatro relojes', () => {
  for (const [, c] of SESIONES) {
    const { plan } = c.caso.datos;
    it(`${plan.pasos.length} pasos · ${plan.pasos[0]!.clase} … ${plan.pasos[plan.pasos.length - 1]!.clase}`, () => {
      plan.pasos.forEach((base, i) => {
        for (const m of momentos(base)) {
          const sim = cuerpo({ partida: { i, t: m.t } });
          const s = estadoInicial(plan, sim, { i, t: m.t, metros: m.metros, sesionT: 900 + m.t });
          for (const { D } of TAMANOS) carasDe(c, s, D, `${firma([base]).slice(0, 40)} paso ${i} t=${m.t} a ${D}`);
        }
      });
    });
  }
});

// ---------------------------------------------------------------------------
// Cada caso, corrido por el motor
// ---------------------------------------------------------------------------

interface Tic {
  t: number;
  estado: EstadoSecuencia;
  eventos: EventoGarmin[];
}

/** El caso corrido `hasta` segundos: el estado de cada tic y los eventos de Garmin que emite (los mismos que oye el atleta). */
function correr(c: CasoGarminCorrer, hasta = CORRE_HASTA_S): Tic[] {
  const { plan } = c.caso.datos;
  let estado = estadoInicial(plan, c.caso.sim, c.caso.inicio);
  const tics: Tic[] = [{ t: 0, estado, eventos: [] }];
  for (let t = 1; t <= hasta && !estado.terminado; t++) {
    const antes = estado;
    const r = avanzar(estado, plan, c.caso.sim);
    estado = r.estado;
    const transicion: Transicion = { plan, antes, despues: estado, quien: 'motor', eventos: r.eventos };
    tics.push({ t, estado, eventos: eventosDeTransicion(transicion) });
  }
  return tics;
}

describe('cada caso, segundo a segundo, cabe en los cuatro relojes', () => {
  for (const [id, c] of CASOS) {
    it(`${id}`, () => {
      const tics = correr(c);
      tics.forEach((x) => {
        // Cada MIRA_CADA_S s y en cada tic donde ocurre algo (un aviso, una tarjeta).
        if (x.t % MIRA_CADA_S !== 0 && x.eventos.length === 0 && !x.estado.banner) return;
        for (const { D } of TAMANOS) carasDe(c, x.estado, D, `${id} t=${x.t} a ${D}`);
      });
    });
  }
});

// ---------------------------------------------------------------------------
// Los avisos: lo que promete cada descripción, y cómo suena (§6)
// ---------------------------------------------------------------------------

const TABLA_AVISOS = tablaDe('## 6. Vocabulario de aviso');

/** Lo que dice §6 de un evento: su vibración y su tono, tal cual, leídos del documento. */
function dichoPor6(inicio: string): { vibra: string; tono: string } {
  const f = TABLA_AVISOS.find((x) => normal(x[0]!).startsWith(inicio));
  if (!f) throw new Error(`§6 no tiene «${inicio}»`);
  return { vibra: normal(f[1]!), tono: normal(f[2]!) };
}

function suena(e: EventoGarmin) {
  const a = AVISOS[e];
  if (!esAviso(a)) throw new Error(`${e} no suena`);
  return { vibra: fmtPulsos(a), tono: fmtTono(a) };
}

/** Los tics (s desde el arranque del caso) en que sale cada evento. */
function cuando(c: CasoGarminCorrer, hasta = CORRE_HASTA_S): Map<EventoGarmin, number[]> {
  const m = new Map<EventoGarmin, number[]>();
  for (const x of correr(c, hasta)) for (const e of x.eventos) m.set(e, [...(m.get(e) ?? []), x.t]);
  return m;
}

describe('los avisos de cada caso salen, y suenan como dice §6', () => {
  it('serie-rapida: UN «afloja» (2 cortas, notas que bajan) y luego UN «aprieta» (3 cortas, notas que suben)', () => {
    const ev = cuando(casoGarminCorrer('serie-rapida'));
    const afloja = ev.get('afloja') ?? [];
    const aprieta = ev.get('aprieta') ?? [];
    expect(afloja, 'afloja una vez').toHaveLength(1);
    expect(aprieta, 'aprieta una vez').toHaveLength(1);
    expect(afloja[0]!, 'afloja tras la histéresis, con el tramo rápido ya en marcha').toBeGreaterThan(8);
    expect(afloja[0]!).toBeLessThan(16);
    expect(aprieta[0]!, 'aprieta después del afloja y de vuelta a la banda').toBeGreaterThan(afloja[0]! + 30);
    expect(suena('afloja')).toEqual(dichoPor6('Afloja'));
    expect(suena('aprieta')).toEqual(dichoPor6('Aprieta'));
    // Se distinguen con el sonido apagado (solo el número de pulsos) y con la vibración sin intensidades.
    const pulsos = (e: EventoGarmin) => (esAviso(AVISOS[e]) ? (AVISOS[e] as { pulsos: string[] }).pulsos.length : 0);
    expect(pulsos('afloja')).not.toBe(pulsos('aprieta'));
    expect(componerAvisos(1, ['afloja']).perfiles.length).not.toBe(componerAvisos(1, ['aprieta']).perfiles.length);
  });

  it('recupera-go: un preaviso, tres KEY del 3-2-1 y el GO, en ese orden', () => {
    const ev = cuando(casoGarminCorrer('recupera-go'), 20);
    expect(ev.get('preaviso')).toHaveLength(1);
    expect(ev.get('cuenta')).toHaveLength(3);
    expect(ev.get('go')).toHaveLength(1);
    expect(ev.get('preaviso')![0]!).toBeLessThan(ev.get('cuenta')![0]!);
    expect(ev.get('cuenta')![2]!).toBeLessThanOrEqual(ev.get('go')![0]!);
    expect(suena('preaviso')).toEqual(dichoPor6('Preaviso'));
    expect(suena('go')).toEqual(dichoPor6('Empieza trabajo'));
    // Una corta por segundo, tres veces, con su KEY cada una: como dice §6.
    expect(suena('cuenta')).toEqual(dichoPor6('3-2-1'));
    const a = AVISOS.cuenta;
    expect(esAviso(a) && a.repite).toBe(3);
  });

  it('tirada-z2 y pista: la vuelta automática (2 cortas + LAP) al cruzar el punto de vuelta', () => {
    expect(cuando(casoGarminCorrer('tirada-z2'), 20).get('vuelta')).toHaveLength(1);
    const pista = cuando(casoGarminCorrer('pista'), 110).get('vuelta') ?? [];
    expect(pista, 'la vuelta 7 al primer segundo y la 8, 100 s después').toEqual([1, 101]);
    expect(suena('vuelta')).toEqual(dichoPor6('Vuelta automática'));
  });

  it('strides: sin preaviso en un paso de 20″ (menos de 30 s)', () => {
    const ev = cuando(casoGarminCorrer('strides'), 14);
    expect(ev.get('preaviso')).toBeUndefined();
  });

  it('progresivo: de un tramo al siguiente suena el GO, pero no hay 3-2-1 a pantalla entera', () => {
    const c = casoGarminCorrer('progresivo');
    const tics = correr(c, 45);
    expect(tics.some((x) => x.eventos.includes('go'))).toBe(true);
    expect(tics.some((x) => x.eventos.includes('cuenta'))).toBe(false);
    expect(tics.every((x) => cuentaDe(c.caso.datos.plan, x.estado) == null)).toBe(true);
    expect(tics.every((x) => x.estado.goHasta === 0)).toBe(true);
  });

  it('gps-perdido: «perdido» (3 largas + FAILURE) al caerse y «recuperado» (1 corta + KEY) al volver, una vez cada uno', () => {
    const ev = cuando(casoGarminCorrer('gps-perdido'), 40);
    expect(ev.get('enlace')).toEqual([3]);
    expect(ev.get('recuperado')).toEqual([31]);
    expect(suena('enlace')).toEqual(dichoPor6('Sensor o GPS perdido'));
    expect(suena('recuperado')).toEqual(dichoPor6('Sensor o GPS recuperado'));
  });

  it('pulso-perdido: el pulso que se cae avisa como un sensor perdido, y al volver, recuperado', () => {
    const ev = cuando(casoGarminCorrer('pulso-perdido'), 40);
    expect(ev.get('enlace')).toHaveLength(1);
    expect(ev.get('recuperado')).toHaveLength(1);
    expect(ev.get('afloja'), 'sin pulso no se juzga: no hay «afloja» ni «aprieta» inventados').toBeUndefined();
    expect(ev.get('aprieta')).toBeUndefined();
  });

  it('gps-buscando: al fijar suena «recuperado» y sale la tarjeta «GPS listo», no «recuperado»', () => {
    const c = casoGarminCorrer('gps-buscando');
    expect(cuando(c, 12).get('recuperado')).toEqual([7]);
    expect(avisoDeSistema({ gps: 'buscando', pulso: true }, { gps: 'listo', pulso: true }, false)).toBe('gps-listo');
  });

  it('rodaje-z2: el techo de la zona solo avisa por encima (por debajo no vibra nada)', () => {
    const c = casoGarminCorrer('rodaje-z2');
    const o = c.caso.datos.plan.pasos[0]!.objetivos[0]!;
    expect(o.avisa).toBe('solo-arriba');
    const z = c.caso.datos.plan.zonas;
    expect(veredictoDe(o, 100, 0, z)).toBe('dentro');
    expect(veredictoDe(o, 165, 0, z)).toBe('por-encima');
  });
});

// ---------------------------------------------------------------------------
// Lo propio: pista, GPS/pulso perdidos, posición anidada
// ---------------------------------------------------------------------------

describe('la vuelta de pista', () => {
  const c = casoGarminCorrer('pista');
  const { plan } = c.caso.datos;
  const paso = plan.pasos[0]!;

  it('la vuelta de 400 m es un dato del paso, y solo un paso con otra longitud que el km es «de pista»', () => {
    expect(paso.vueltaAutoM).toBe(400);
    expect(esVueltaDePista(paso)).toBe(true);
    expect(esVueltaDePista({ vueltaAutoM: 1000 })).toBe(false);
    expect(esVueltaDePista({})).toBe(false);
  });

  it('la tarjeta dice «Vuelta 7», su tiempo y su ritmo por km con el veredicto (nunca «Kilómetro»)', () => {
    const s = correr(c, 1)[1]!.estado;
    expect(s.banner?.titulo, 'lo que deja el motor').toBe('Kilómetro 7');
    expect(bannerDeVuelta(s, paso, plan)).toEqual({ titulo: 'Vuelta 7', valor: '1:40', pie: '4:10 /km · dentro' });
  });

  it('la lista rotula «v N» y juzga cada vuelta contra el ritmo del paso (la 5.ª, rápida)', () => {
    const s = correr(c, 1)[1]!.estado;
    const juzgadas = vueltasDePista(s.vueltas, paso, plan);
    expect(juzgadas.map((v) => v.veredicto)).toEqual(['dentro', 'dentro', 'dentro', 'dentro', 'por-encima', 'dentro', 'dentro']);
    expect(rotuloDeVuelta({ n: 'km 7' }).n).toBe('v 7');
    expect(tituloDeVueltas(['Kilómetros'])).toEqual(['Vueltas']);
  });
});

describe('el GPS o el pulso que se pierden: la tarjeta de sistema', () => {
  const AVISOS_SISTEMA = Object.keys(TEXTO_SISTEMA) as AvisoDeSistema[];

  it('cada aviso cabe en los cuatro relojes, con el crono de un minuto, de una hora y de casi dos', () => {
    for (const a of AVISOS_SISTEMA) for (const t of [0, 59, 3599, 7199]) for (const { D } of TAMANOS) comprobar(disponerSistema(a, t, D), `sistema ${a} ${t}s a ${D}`);
  });

  it('el crono sigue: el héroe de la tarjeta es el tiempo de la sesión, nunca un ritmo ni un cero', () => {
    for (const { D } of TAMANOS) {
      const d = disponerSistema('gps-perdido', 754, D);
      expect(d.heroe?.texto).toBe('12:34');
      expect(d.heroe?.unidad).toBeUndefined();
    }
    expect(SISTEMA_MS).toBeGreaterThanOrEqual(3000);
    expect(SISTEMA_MS).toBeLessThanOrEqual(6000);
  });

  it('lo perdido dice qué queda sin dato; lo recuperado, no', () => {
    expect(TEXTO_SISTEMA['gps-perdido'].sinDato).toContain('—');
    expect(TEXTO_SISTEMA['pulso-perdido'].sinDato).toContain('—');
    expect(TEXTO_SISTEMA['gps-recuperado'].sinDato).toBeNull();
    expect(TEXTO_SISTEMA['pulso-recuperado'].sinDato).toBeNull();
  });

  it('qué cambio de lectura avisa cada cosa (GPS antes que pulso; sin GPS que perder en cinta)', () => {
    const ok = { gps: 'listo', pulso: true } as const;
    expect(avisoDeSistema(ok, { ...ok, gps: 'buscando' }, true)).toBe('gps-perdido');
    expect(avisoDeSistema({ ...ok, gps: 'buscando' }, ok, true)).toBe('gps-recuperado');
    expect(avisoDeSistema({ ...ok, gps: 'buscando' }, ok, false)).toBe('gps-listo');
    expect(avisoDeSistema(ok, { ...ok, pulso: false }, true)).toBe('pulso-perdido');
    expect(avisoDeSistema({ ...ok, pulso: false }, ok, true)).toBe('pulso-recuperado');
    expect(avisoDeSistema(ok, { gps: 'buscando', pulso: false }, true)).toBe('gps-perdido');
    expect(avisoDeSistema({ gps: 'no-aplica', pulso: true }, { gps: 'no-aplica', pulso: true }, false)).toBeNull();
    expect(avisoDeSistema(ok, ok, true)).toBeNull();
  });
});

describe('la posición anidada no se pierde en ningún reloj', () => {
  it('«Tanda 2/3 · Serie 4/6» (509) va entera, en dos líneas, y el progresivo (538) conserva su tramo', () => {
    const casos: Array<[string, string[]]> = [
      ['tanda-serie', ['Tanda 2/3', 'Serie 4/6']],
      ['progresivo', ['tramo 3/8']],
      ['cinta', ['Tanda 1/2', 'Serie 2/4']],
    ];
    for (const [id, posiciones] of casos) {
      const c = casoGarminCorrer(id);
      const { plan } = c.caso.datos;
      const s = estadoInicial(plan, c.caso.sim, c.caso.inicio);
      const p = pasoVivo(plan, s);
      for (const { D } of TAMANOS) {
        const d = disponerPasoDe(p, lecturasDe(p, s), plan.zonas, D, plan.reglas).disposicion;
        const contexto = d.lineas.filter((l) => l.rol === 'contexto').map((l) => l.piezas.map((q) => q.texto).join('')).join(' ');
        for (const pos of posiciones) expect(contexto, `${id} a ${D}`).toContain(pos);
      }
    }
  });
});

describe('lo esencial del contexto tampoco se pierde en la recuperación ni en el 3-2-1', () => {
  const textoContexto = (d: Disposicion) => d.lineas.filter((l) => l.rol === 'contexto').map((l) => l.piezas.map((q) => q.texto).join('')).join(' ');
  const c = casoGarminCorrer('tanda-serie');
  const { plan } = c.caso.datos;

  it('«Recupera · caminando» conserva el modo en los cuatro relojes (es lo que hay que hacer)', () => {
    const i = c.caso.inicio.i + 1;
    expect(plan.pasos[i]!.rol).toBe('recuperacion');
    const s = estadoInicial(plan, c.caso.sim, { ...c.caso.inicio, i, t: 20 });
    const p = pasoVivo(plan, s);
    for (const { D } of TAMANOS) expect(textoContexto(disponerRecupera(p, lecturasDe(p, s), plan.zonas, D)), `a ${D}`).toContain('caminando');
  });

  it('el 3-2-1 de una serie anidada dice en qué serie entras («Serie 5/6»)', () => {
    const entra = plan.pasos[c.caso.inicio.i + 2]!;
    expect(entra.posicion?.serie?.n).toBe(5);
    for (const { D } of TAMANOS) {
      expect(textoContexto(disponerCuenta(3, entra, D)), `a ${D}`).toContain('Serie 5/6');
      comprobar(disponerCuenta(3, entra, D), `3-2-1 anidado a ${D}`);
      comprobar(disponerCuenta(0, entra, D), `GO anidado a ${D}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Los botones: la carcasa de cada escenario ofrece lo que dice §5
// ---------------------------------------------------------------------------

const TABLA_MANDOS = tablaDe('## 5. Interacción');

/** Lo que el botón anuncia en la carcasa: su `aria-label` («BACK/LAP · Paso»). */
function botonesDe(html: string): Record<string, string> {
  const r: Record<string, string> = {};
  for (const [, nombre, rotulo] of html.matchAll(/aria-label="(START\/STOP|BACK\/LAP|UP|DOWN|LIGHT)(?: · ([^"]*))?"/g)) r[nombre!] = rotulo ?? '';
  return r;
}

describe('los botones de la familia son los de §5', () => {
  it('el estado de cada escenario en el vivo es «Paso en curso» o «Recuperación / descanso», y así lo dice la carcasa', () => {
    for (const [id, c] of CASOS) {
      if (c.comparar) continue;
      const plan = c.caso.datos.plan;
      const paso = plan.pasos[c.caso.inicio.i]!;
      const esperado: EstadoMandos = paso.rol === 'trabajo' ? 'paso' : 'recupera';
      const html = renderToStaticMarkup(createElement(Screen, { orientation: 'portrait', appearance: 'dark', escenario: id, vista: 'propuesta', onLog: () => {} }));
      const b = botonesDe(html);
      expect(b['START/STOP'], `${id} · START`).toBe(MANDOS[esperado].start!.rotulo);
      expect(b['BACK/LAP'], `${id} · BACK/LAP`).toBe(MANDOS[esperado].back!.rotulo);
      expect(b['UP'], `${id} · UP`).toBe(MANDOS[esperado].up!.rotulo);
      expect(b['DOWN'], `${id} · DOWN`).toBe(MANDOS[esperado].down!.rotulo);
      expect(b['LIGHT'], `${id} · LIGHT`).toBe('Luz');
    }
  });

  it('esos estados dicen en §5 lo que la familia hace: BACK/LAP cierra el paso (o empieza ya), UP/DOWN pasan páginas, START pausa, UP largo abre Controles', () => {
    const porNombre = new Map(Object.entries(FILA_MODELO).map(([e, n]) => [n, e as EstadoMandos]));
    for (const estado of ['paso', 'recupera', 'deshacer', 'pausa', 'controles', 'resumen'] as const) {
      const fila = TABLA_MANDOS.find((f) => porNombre.get(f[0]!) === estado)!;
      BOTONES_TABLA.forEach((b, k) => {
        const celda = normal(fila[k + 1]!);
        const mando = MANDOS[estado][b];
        if (celda === '—') expect(mando, `${estado} · ${b}`).toBeNull();
        else expect(mando?.dice, `${estado} · ${b}`).toBe(celda);
      });
    }
    expect(MANDOS.paso.back?.accion).toBe('siguiente-paso');
    expect(MANDOS.recupera.back?.accion).toBe('empezar-ya');
    expect(MANDOS.paso.start?.accion).toBe('pausa');
    expect(MANDOS.paso.upLargo?.accion).toBe('controles');
    expect(MANDOS.deshacer.up?.accion).toBe('deshacer');
  });
});

describe('el inventario de escenarios', () => {
  it('cada escenario tiene caso, y los casos con motor quieto son solo las comparaciones', () => {
    for (const [id, c] of CASOS) {
      expect(c.caso.datos.plan.pasos.length, id).toBeGreaterThan(0);
      expect(Boolean(c.comparar), id).toBe(id.startsWith('tamanos-'));
    }
  });
});
