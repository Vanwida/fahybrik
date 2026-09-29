// TODAS LAS CARAS QUE PUEDE ENSEÑAR UN ESCENARIO — para el examen. PURO.
//
// Un escenario de «Garmin · antes» recorre varias pantallas y, en cada una, el reloj
// lee cosas distintas (el GPS que busca o fija, el pulso que asienta o falta, el móvil
// que está o no, el entorno que cambia con UP/DOWN). Para juzgar que TODO cabe en los
// cuatro relojes no basta la cara de arranque: hay que mirar cada combinación que el
// escenario puede llegar a enseñar. Esta función las enumera desde los mismos datos y
// las mismas funciones puras que usa la pantalla (nada se reescribe para el examen).
//
// Qué NO hacer: añadir aquí una cara que la pantalla no pueda mostrar; decidir aquí
// nada de dominio (todo sale de `estado.ts`, `brief.ts` y compañía).

import { BLOQUES_VISIBLES, disponerCuenta, disponerEstructura, disponerMenu, filasDeEstructura, type Disposicion } from '../../kit-garmin';
import { contextoDe, estructuraDe, hoyDe } from '../../kit-reloj';
import { disponerBrief, disponerEspera, type DatosBrief } from './brief';
import { OPCIONES_LIBRES, TEXTO_FRANJA, disponerGlance, disponerLista, disponerNoToca, disponerSinDetalle, disponerSinPlan, filasDeLista, glanceDe } from './faces';
import { ENTORNOS, entornoEfectivo, entornoElegible, necesitaGps, tituloDe, type Pulso, type Sistema } from './estado';
import type { Bloque, EstructuraPuesta } from './estructura';
import { bloquesDelBrief } from './estructura';
import type { Escena } from './pantallas';
import { AVISOS_DE_ANTES, disponerPrevio } from './previo';
import { disponerInterrumpida, disponerVincular } from './vinculo';
import { TITULO_AJUSTES, TITULO_DESVINCULAR, TITULO_ENTORNO, TITULO_LIBRE, dondeIba, opcionesDeAjustes, opcionesDeDesvincular, opcionesDeEntorno } from './contenido';

export interface CaraDeEscena {
  que: string;
  d: Disposicion;
  /** Del brief: cómo se apretó la estructura y qué bloques había. */
  estructura?: EstructuraPuesta;
  bloques?: Bloque[];
}

/** Lo que puede leer el pulso antes de salir. */
const PULSOS: Pulso[] = [{ tipo: 'fijando' }, { tipo: 'ok', ppm: 72 }, { tipo: 'ausente' }];
/** Los dos estados del GPS. */
const GPS: Array<Sistema['gps']> = ['buscando', 'listo'];
/** Una batería justa y otra que avisa en serio. */
const BATERIAS = [14, 9];
/** El pulso que se pinta más ancho: tres cifras. */
const PULSO_ANCHO: Pulso = { tipo: 'ok', ppm: 188 };

export function carasDeEscena(e: Escena, D: number): CaraDeEscena[] {
  const out: CaraDeEscena[] = [];
  const { hoy, ajustes } = e;
  out.push({ que: 'glance', d: disponerGlance(glanceDe(hoy), D) });
  (e.estadosDeGlance ?? []).forEach((h, k) => out.push({ que: `glance estado ${k}`, d: disponerGlance(glanceDe(h), D) }));
  if (hoy.sesiones.length > 1) {
    const filas = filasDeLista(hoy);
    filas.forEach((_, foco) => out.push({ que: `lista foco ${foco}`, d: disponerLista(filas, foco, D) }));
  }
  if (hoy.sesiones.length === 0) out.push({ que: hoy.plan.tipo === 'sin-plan' ? 'sin plan' : 'hoy no toca', d: hoy.plan.tipo === 'sin-plan' ? disponerSinPlan(D) : disponerNoToca(hoy.manana, D) });
  if (hoy.plan.tipo === 'sin-plan') out.push({ que: 'sin plan', d: disponerSinPlan(D) });

  hoy.sesiones.forEach((sd, k) => {
    const s = sd.sesion;
    if (!sd.detalle) return void out.push({ que: 'sin detalle', d: disponerSinDetalle(tituloDe(s), hoyDe(s.plan.pasos).dur, D) });
    const entornos = entornoElegible(s) ? ENTORNOS : [entornoEfectivo(s, null, ajustes.entornoPorDefecto)];
    const dia = sd.franja && hoy.sesiones.length > 1 ? TEXTO_FRANJA[sd.franja] : 'Hoy';
    for (const entorno of entornos) {
      for (const gps of GPS) {
        for (const pulso of [...PULSOS, PULSO_ANCHO]) {
          for (const movil of [true, false]) {
            const datos: DatosBrief = {
              sesion: s,
              dia,
              entorno,
              elegible: entornoElegible(s),
              sistema: { gps, pulso, bateriaPct: 86, movil },
              frescura: hoy.plan,
            };
            const b = disponerBrief(datos, D);
            out.push({ que: `brief ${k} ${entorno ?? 'sin entorno'} gps ${gps} pulso ${pulso.tipo} ${movil ? '' : 'sin móvil'}`, d: b.disposicion, estructura: b.estructura, bloques: bloquesDelBrief(s.plan.pasos) });
          }
        }
        if (entorno != null && necesitaGps(s, entorno)) {
          for (const pulso of PULSOS) out.push({ que: `espera ${k} ${entorno} gps ${gps} pulso ${pulso.tipo}`, d: disponerEspera({ entorno, gps, pulso }, D) });
        }
      }
    }
    // Los frescos del plan que la escena no trae, para ver el brief con cada aviso de plan.
    for (const frescura of [{ tipo: 'viejo', dias: 3 }, { tipo: 'viejo', dias: 12 }] as const) {
      const entorno = entornoEfectivo(s, null, ajustes.entornoPorDefecto);
      const b = disponerBrief({ sesion: s, dia, entorno, elegible: entornoElegible(s), sistema: { gps: 'listo', pulso: PULSOS[1]!, bateriaPct: 86, movil: false }, frescura }, D);
      out.push({ que: `brief ${k} plan viejo ${frescura.dias} días`, d: b.disposicion, estructura: b.estructura, bloques: bloquesDelBrief(s.plan.pasos) });
    }
    // Los avisos de antes, con esta sesión.
    for (const a of AVISOS_DE_ANTES) for (const bateriaPct of BATERIAS) out.push({ que: `previo ${a} ${bateriaPct} % con ${hoyDe(s.plan.pasos).dur}`, d: disponerPrevio(a, { bateriaPct, duracion: hoyDe(s.plan.pasos).dur }, D) });
    // La Estructura completa (DOWN en el brief), con la ventana en cada posición.
    const filasEstructura = filasDeEstructura(estructuraDe(s.plan.pasos)(0));
    for (let desde = 0; desde <= Math.max(0, filasEstructura.length - BLOQUES_VISIBLES); desde++) out.push({ que: `estructura completa ${k} desde ${desde}`, d: disponerEstructura(filasEstructura, D, desde) });
    // La cuenta atrás al empezar, hasta el GO.
    for (const n of [3, 2, 1, 0]) out.push({ que: `cuenta ${n}`, d: disponerCuenta(n, s.plan.pasos[0]!, D) });
  });

  if (e.vinculo) {
    out.push({ que: 'vincular espera', d: disponerVincular({ tipo: 'espera', codigo: e.vinculo.codigo, restanteS: e.vinculo.restanteS }, D) });
    for (const restanteS of [599, 59, 9, 1]) out.push({ que: `vincular espera ${restanteS} s`, d: disponerVincular({ tipo: 'espera', codigo: e.vinculo.siguiente, restanteS }, D) });
    out.push({ que: 'vincular caducado', d: disponerVincular({ tipo: 'caducado' }, D) });
    out.push({ que: 'vincular vinculado', d: disponerVincular({ tipo: 'vinculado' }, D) });
  }
  if (e.rescate) {
    const donde = dondeIba(e.rescate);
    for (const foco of [0, 1]) for (const sesionT of [e.rescate.control.sesionT, 0, 3599, 7199]) out.push({ que: `interrumpida foco ${foco} ${sesionT} s`, d: disponerInterrumpida({ sesionT, donde, foco }, D) });
    out.push({ que: 'interrumpida sin posición', d: disponerInterrumpida({ sesionT: e.rescate.control.sesionT, donde: null, foco: 0 }, D) });
    out.push({ que: `cuenta del rescate`, d: disponerCuenta(3, e.rescate.sesion.plan.pasos[e.rescate.control.i]!, D) });
    void contextoDe;
  }
  // Los menús: entreno libre y Ajustes, con cada foco.
  OPCIONES_LIBRES.forEach((_, foco) => out.push({ que: `libre foco ${foco}`, d: disponerMenu([TITULO_LIBRE], OPCIONES_LIBRES, foco, D) }));
  const raiz = opcionesDeAjustes(ajustes);
  raiz.forEach((_, foco) => out.push({ que: `ajustes foco ${foco}`, d: disponerMenu([TITULO_AJUSTES], raiz, foco, D) }));
  opcionesDeEntorno.forEach((_, foco) => out.push({ que: `ajustes entorno foco ${foco}`, d: disponerMenu([TITULO_ENTORNO], opcionesDeEntorno, foco, D) }));
  out.push({ que: 'ajustes desvincular', d: disponerMenu([TITULO_DESVINCULAR], opcionesDeDesvincular, 0, D) });
  return out;
}
