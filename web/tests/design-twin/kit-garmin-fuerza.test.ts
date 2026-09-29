// «GARMIN · FUERZA» — TODO CABE A 218, EL HÉROE ES EL DE LA LÁMINA Y LOS BOTONES
// SON LOS DE §5 (docs/garmin-reloj/modelo.md §5, §6, §11).
//
// Cada paso de las sesiones de fuerza (529, 488, 492, 538 y el ejemplo de P11
// con las reps que dice el atleta) en varios momentos y en los CUATRO relojes
// pasa por las caras de la familia: la serie, el «colócate», el 3-2-1 y el GO,
// el descanso que anota (con cada campo enfocado), el descanso común y las
// páginas Datos, Series y Ejercicios. En todas: ninguna línea se sale de la
// cuerda del círculo a su altura, nada baja del 6,2 % de D, el héroe cae en
// 0,20–0,26 D, nada se pisa y las cifras están en la bitmap del reloj. El héroe
// es el de `laminaDelPaso` (o `heroeDelPaso` en el descanso). Y los botones de la
// familia salen de `MANDOS` (§5), los avisos de `AVISOS` (§6), y la lista de
// Ejercicios de la sesión de 54 pasos se recorre entera sin perder «ahora».

import { describe, expect, it } from 'vitest';
import {
  AVISOS,
  MANDOS,
  SUBCONJUNTO_CIFRAS,
  TAMANOS,
  TG,
  accionDe,
  anchoUtilFila,
  componerAvisos,
  esAviso,
  eventosDeTransicion,
  type Disposicion,
  type EventoGarmin,
} from '@/components/design-twin/kit-garmin';
import {
  avanzar,
  cargaArrastrada,
  cerrar,
  confirmar,
  anotacionDe,
  esFuerza,
  estadoInicial,
  heroeDelPaso,
  laminaDelPaso,
  lecturasDe,
  pasoVivo,
  type EstadoSecuencia,
  type PlanSesion,
  type Registro,
} from '@/components/design-twin/kit-reloj';
import type { Transicion } from '@/components/design-twin/kit-reloj/gancho';
import { cuerpo } from '@/components/design-twin/screens/reloj-fuerza/casos';
import { sesion488, sesion492, sesion529, sesion538 } from '@/components/design-twin/screens/reloj-fuerza/planes';
import { disponerAnotar, disponerDescansoFuerza, disponerTrabajo, vistaColocate, vistaCuenta, type DisposicionAnotar } from '@/components/design-twin/screens/garmin-fuerza/caras';
import { ejemploDeclarado, PASOS_488 } from '@/components/design-twin/screens/garmin-fuerza/casos';
import { filasDatos, filasEjercicios, filasSeries } from '@/components/design-twin/screens/garmin-fuerza/filas';
import {
  ACCIONES_ANOTAR,
  UI_VACIA,
  aplicarTecla,
  camposDelDescanso,
  reabrir,
  type Anotando,
  type ContextoAnotar,
} from '@/components/design-twin/screens/garmin-fuerza/modelo';
import {
  arranqueEjercicios,
  colocarEjercicios,
  disponerEjercicios,
  disponerSeries,
  moverEjercicios,
  ultimoVisible,
} from '@/components/design-twin/screens/garmin-fuerza/paginas';
import { vieneDe, vistaTrabajo } from '@/components/design-twin/screens/garmin-fuerza/textos';
import { resumenDeDescanso, vistaAnotarDe } from '@/components/design-twin/screens/garmin-fuerza/vistas';
import { disponerDatos } from '@/components/design-twin/kit-garmin';

const PLANES: Record<string, PlanSesion> = {
  '529': sesion529(),
  '488': sesion488(),
  '492': sesion492(),
  '538': sesion538(),
  'P11 (reps del atleta)': ejemploDeclarado(),
};

/** Tolerancia de medida: medio píxel. */
const PX = 0.5;

// ---------------------------------------------------------------------------
// El examen de una disposición (el mismo de las caras base del kit)
// ---------------------------------------------------------------------------

interface Caja1 {
  y0: number;
  y1: number;
  donde: string;
}

function cajasDe(d: Disposicion, que: string): Caja1[] {
  const cajas: Caja1[] = [];
  const suelo = Math.ceil(TG.suelo * d.D);
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
    cajas.push({ y0: l.y, y1: l.y + l.alto, donde });
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
    cajas.push({ y0: h.y, y1: h.y + h.alto, donde });
  }
  if (d.pista) cajas.push({ y0: d.pista.y, y1: d.pista.y + d.pista.alto, donde: `${que} · pista a ${d.D}` });
  return cajas;
}

function sinPisarse(cajas: Caja1[]) {
  const orden = [...cajas].sort((a, b) => a.y0 - b.y0);
  for (let k = 1; k < orden.length; k++) expect(orden[k]!.y0, `${orden[k]!.donde} pisa a ${orden[k - 1]!.donde}`).toBeGreaterThanOrEqual(orden[k - 1]!.y1 - PX);
}

function comprobar(d: Disposicion, que: string) {
  sinPisarse(cajasDe(d, que));
}

/** El descanso que anota: la base, cada celda dentro de la cuerda a su altura y ninguna encima de otra ni de una línea. */
function comprobarAnotar(a: DisposicionAnotar, que: string) {
  const D = a.base.D;
  const cajas = cajasDe(a.base, que);
  const suelo = Math.ceil(TG.suelo * D);
  a.celdas.forEach((c, k) => {
    const donde = `${que} · celda ${k} a ${D}`;
    for (const l of c.d.lineas) {
      expect(l.cabe, `${donde} · ${l.rol}: no cabe (${Math.round(l.ancho)} > ${l.anchoUtil})`).toBe(true);
      for (const p of l.piezas) {
        expect(p.cuerpo, `${donde}: bajo el suelo`).toBeGreaterThanOrEqual(suelo);
        if (p.cara === 'cifras') for (const ch of p.texto) expect(SUBCONJUNTO_CIFRAS, `${donde}: «${ch}» no está en la bitmap`).toContain(ch);
      }
    }
    // La celda entera dentro del círculo: su ancho y su distancia al centro caben en la cuerda de su fila.
    const cuerda = anchoUtilFila(c.y / D, c.alto / D) * D;
    expect(2 * Math.abs(c.cx - D / 2) + c.ancho, `${donde}: se sale de la cuerda`).toBeLessThanOrEqual(cuerda + PX);
    if (k > 0) expect(c.cx - a.celdas[k - 1]!.cx, `${donde}: pisa a la anterior`).toBeGreaterThanOrEqual(c.ancho - PX);
  });
  // Las celdas comparten fila: para lo demás son UNA caja (de la más alta a la más baja).
  if (a.celdas.length > 0) cajas.push({ y0: Math.min(...a.celdas.map((c) => c.y)), y1: Math.max(...a.celdas.map((c) => c.y + c.alto)), donde: `${que} · fila de celdas a ${D}` });
  sinPisarse(cajas);
}

// ---------------------------------------------------------------------------
// Recorrer una sesión con el motor
// ---------------------------------------------------------------------------

/** Cada paso de la sesión, con el estado del motor al empezarlo (cerrando cada paso a mano, como BACK/LAP). */
function recorrer(plan: PlanSesion): EstadoSecuencia[] {
  const out: EstadoSecuencia[] = [];
  let s = estadoInicial(plan, cuerpo, { i: 0 });
  for (let k = 0; k < plan.pasos.length; k++) {
    out.push(s);
    if (k < plan.pasos.length - 1) s = cerrar(s, plan, 'atleta').estado;
  }
  return out;
}

/** Todo lo hecho hasta `i`, confirmado tal cual se proponía (lo propuesto pasa a declarado). */
function declaradoHasta(plan: PlanSesion, i: number): Registro {
  let r: Registro = {};
  plan.pasos.forEach((p, j) => {
    if (j >= i || !esFuerza(p) || p.fuerza.aproximacion || p.medida.tipo !== 'reps') return;
    const a = anotacionDe(plan, j, r, null);
    if (a) r = confirmar(r, p.id, a);
  });
  return r;
}

const contextoDe = (plan: PlanSesion, s: EstadoSecuencia): ContextoAnotar => ({ plan, estado: s, sim: cuerpo, i: s.i, pasoId: plan.pasos[s.i]!.id });

/** Momentos de un paso que se miran: al empezar y a la mitad de lo que dura. */
const MOMENTOS = [0, 9];

describe('las caras de fuerza caben en los cuatro relojes (sesiones reales)', () => {
  for (const [nombre, plan] of Object.entries(PLANES)) {
    it(`sesión ${nombre}: cada paso, en cada momento, a 454, 390, 260 y 218`, () => {
      recorrer(plan).forEach((base, i) => {
        const registros = [{}, declaradoHasta(plan, i)] as Registro[];
        for (const t of MOMENTOS) {
          const s = t === 0 ? base : { ...base, t, sesionT: base.sesionT + t, lect: cuerpo(plan.pasos[i]!, i, t, base.sesionT + t) };
          const p = pasoVivo(plan, s);
          const l = lecturasDe(p, s);
          for (const reg of registros) {
            const arrastrada = cargaArrastrada(plan, i, reg);
            for (const { D } of TAMANOS) {
              const que = `${nombre} · paso ${i} (${p.clase}) t=${t}`;
              if (p.rol === 'trabajo') {
                const v = vistaTrabajo(p, l, { plan, i, zonas: plan.zonas, reglas: plan.reglas, arrastrada });
                const d = disponerTrabajo(v, D);
                comprobar(d, que);
                // El héroe es el de la lámina: el mismo texto y la misma unidad.
                const lamina = laminaDelPaso(p, l, plan.zonas, plan.reglas);
                expect(d.heroe?.texto, `${que} · héroe`).toBe(lamina.heroe.texto);
                expect(d.heroe?.unidad, `${que} · unidad del héroe`).toBe(lamina.heroe.unidad);
              } else if (p.rol === 'transicion' && esFuerza(plan.pasos[i + 1])) {
                const d = disponerTrabajo(vistaColocate(p, plan.pasos[i + 1] as never, l, null), D);
                comprobar(d, `${que} · colócate`);
                expect(d.heroe?.texto).toBe(heroeDelPaso(p, l, null).texto);
              } else if (p.rol === 'descanso') {
                const c = contextoDe(plan, s);
                const viene = vieneDe(plan, i, reg);
                const resumenes = [
                  null,
                  { textos: ['sin confirmar'], atencion: true },
                  resumenDeDescanso(c, declaradoHasta(plan, i + 1)),
                  { textos: ['✓ ronda 1 anotada', '✓ anotada'], atencion: false },
                  { textos: ['✓ 8 × 127,5 kg · RPE 6,5', '✓ 8 × 127,5 kg', '✓ anotada'], atencion: false },
                ];
                for (const resumen of resumenes) {
                  const d = disponerDescansoFuerza(p, l, D, viene, resumen);
                  comprobar(d, `${que} · descanso «${resumen?.textos[0] ?? ''}»`);
                  expect(d.heroe?.texto).toBe(heroeDelPaso(p, l, null).texto);
                }
                // Y el que anota, con cada campo enfocado y durante los 5 s de deshacer (sin foco).
                const campos = camposDelDescanso(plan, i);
                campos.forEach((_, k) => {
                  for (const deshacer of [false, true]) {
                    const v = vistaAnotarDe(c, reg, { paso: c.pasoId, k, cerrada: false }, l, p, deshacer);
                    comprobarAnotar(disponerAnotar(v, D), `${que} · anotar campo ${k}${deshacer ? ' (deshacer)' : ''}`);
                  }
                });
              }
              // El 3-2-1 y el GO del paso que viene.
              const sig = plan.pasos[i + 1];
              if (sig && sig.rol === 'trabajo' && p.rol !== 'trabajo') {
                for (const n of [3, 2, 1, 0]) comprobar(disponerTrabajo(vistaCuenta(n, sig, plan, cargaArrastrada(plan, i + 1, reg)), D), `${que} · ${n > 0 ? n : 'GO'}`);
              }
            }
          }
        }
      });
    });
  }
});

describe('las páginas caben en los cuatro relojes', () => {
  for (const [nombre, plan] of Object.entries(PLANES)) {
    it(`sesión ${nombre}: Datos y Series en cada paso, con lo propuesto y con lo declarado`, () => {
      recorrer(plan).forEach((s, i) => {
        const p = pasoVivo(plan, s);
        const l = lecturasDe(p, s);
        for (const reg of [{}, declaradoHasta(plan, i)] as Registro[]) {
          for (const { D } of TAMANOS) {
            const que = `${nombre} · paso ${i}`;
            comprobar(disponerDatos(filasDatos(plan, s, reg, cuerpo, l.ppm), plan.zonas, D), `${que} · Datos`);
            const { nombre: titulo, filas } = filasSeries(plan, s, reg, cuerpo, p, l);
            comprobar(disponerSeries(titulo, filas, D), `${que} · Series`);
          }
        }
      });
    });

    it(`sesión ${nombre}: la lista de Ejercicios, en cada ventana posible, cabe y no pierde «ahora»`, () => {
      recorrer(plan).forEach((s, i) => {
        const { filas, ahora } = filasEjercicios(plan, i, declaradoHasta(plan, i));
        expect(ahora, `${nombre} · paso ${i}: hay un «ahora»`).toBeGreaterThanOrEqual(0);
        expect(filas[ahora]!.estado, `${nombre} · paso ${i}`).not.toBe('hecho');
        for (const { D } of TAMANOS) {
          // Al entrar, «ahora» está a la vista.
          const desde = arranqueEjercicios(filas, ahora, D);
          expect(ultimoVisible(filas, desde, D), `${nombre} · paso ${i} a ${D}: «ahora» a la vista al entrar`).toBeGreaterThanOrEqual(ahora);
          expect(desde, `${nombre} · paso ${i} a ${D}: la ventana no empieza después de «ahora»`).toBeLessThanOrEqual(ahora);
          // Cada ventana a la que se llega con UP/DOWN cabe, y el pie dice dónde está «ahora».
          for (let d = 0; d < filas.length; d++) {
            const dis = disponerEjercicios(filas, d, ahora, D);
            comprobar(dis, `${nombre} · paso ${i} · ventana ${d}`);
            const bloques = colocarEjercicios(filas, d, D);
            const pie = dis.lineas.find((x) => x.rol === 'posicion')!;
            const texto = pie.piezas.map((x) => x.texto).join('');
            const primero = bloques[0]!.k;
            const ultimo = bloques[bloques.length - 1]!.k;
            expect(texto.includes(`${ahora + 1}/${filas.length}`), `${nombre} · paso ${i} · ventana ${d}: el pie dice «${texto}»`).toBe(true);
            expect(texto.startsWith('▲'), `${nombre} · ventana ${d}: ▲ solo si «ahora» queda arriba`).toBe(ahora < primero);
            expect(texto.startsWith('▼'), `${nombre} · ventana ${d}: ▼ solo si «ahora» queda abajo`).toBe(ahora > ultimo);
          }
          // Recorrida entera con DOWN y luego con UP: nunca salta, siempre acaba en el borde y ahí devuelve `null` (= pasa de página).
          let d = 0;
          let vistos = new Set<number>();
          for (let pasos = 0; pasos <= filas.length; pasos++) {
            colocarEjercicios(filas, d, D).forEach((b) => vistos.add(b.k));
            const n = moverEjercicios(filas, d, 1, D);
            if (n == null) break;
            expect(n, 'DOWN mueve de uno en uno').toBe(d + 1);
            d = n;
          }
          expect(vistos.size, `${nombre} · paso ${i} a ${D}: con DOWN se ven TODOS los ejercicios`).toBe(filas.length);
          expect(moverEjercicios(filas, d, 1, D), 'en el borde de abajo, DOWN pasa de página').toBeNull();
          for (let pasos = 0; pasos <= filas.length && d > 0; pasos++) d = moverEjercicios(filas, d, -1, D) ?? d;
          expect(d, 'UP llega arriba').toBe(0);
          expect(moverEjercicios(filas, 0, -1, D), 'en el borde de arriba, UP pasa de página').toBeNull();
          vistos = new Set();
        }
      });
    });
  }
});

describe('la sesión más larga (488): 54 pasos', () => {
  const plan = PLANES['488']!;

  it('«Viene:» dice en qué serie estás si el ejercicio ya está en curso y su dosis entera si lo abre', () => {
    // Descanso tras la 7.ª serie de SkiErg: viene la 8.ª, no «8 × 250 m» otra vez.
    const j = plan.pasos.findIndex((p) => p.id === '488-ski-7') + 1;
    expect(vieneDe(plan, j, {})).toEqual({ que: 'Serie 8/8', dosis: '250\u00A0m' });
    // Descanso tras el último Ab Wheel: viene SkiErg, con sus 8 series.
    const k = plan.pasos.findIndex((p) => p.id === '488-ab-s3') + 1;
    expect(vieneDe(plan, k, {})).toEqual({ que: 'SkiErg', dosis: '8 × 250\u00A0m' });
    // La carga del implemento va detrás: «Sled Push · 5 × 25 m · 180 kg» (492).
    const p492 = PLANES['492']!;
    const r = p492.pasos.findIndex((p) => p.id === '492-row-s4') + 1;
    expect(vieneDe(p492, r, {})).toEqual({ que: 'Sled Push', dosis: '5 × 25\u00A0m · 180\u00A0kg' });
  });

  it('son 54 pasos y 7 ejercicios', () => {
    expect(plan.pasos.length).toBe(PASOS_488);
    expect(filasEjercicios(plan, 0, {}).filas.length).toBe(7);
  });

  it('«ahora» avanza con la sesión: nunca salta hacia atrás y cada ejercicio hecho queda «hecho»', () => {
    let previo = -1;
    recorrer(plan).forEach((_, i) => {
      const { filas, ahora } = filasEjercicios(plan, i, {});
      expect(ahora, `paso ${i}`).toBeGreaterThanOrEqual(previo);
      previo = ahora;
      filas.forEach((f, k) => {
        if (k < ahora && f.estado !== 'ahora') expect(f.estado, `paso ${i} · ${f.nombre}`).toBe('hecho');
        if (k > ahora && f.estado !== 'ahora') expect(f.estado, `paso ${i} · ${f.nombre}`).toBe('pendiente');
      });
    });
    expect(previo).toBe(6);
  });

  it('en un descanso, «ahora» es el ejercicio que viene (el que acabas de terminar ya está hecho)', () => {
    // El descanso tras la 4.ª serie de Back Squat: viene Front Squat.
    const i = plan.pasos.findIndex((p) => p.id === '488-bs-s4') + 1;
    expect(plan.pasos[i]!.rol).toBe('descanso');
    const { filas, ahora } = filasEjercicios(plan, i, {});
    expect(filas[ahora]!.nombre).toBe('Front Squat');
    expect(filas[0]!.estado).toBe('hecho');
  });
});

// ---------------------------------------------------------------------------
// Los botones (§5)
// ---------------------------------------------------------------------------

describe('los botones de la familia son los de §5', () => {
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
