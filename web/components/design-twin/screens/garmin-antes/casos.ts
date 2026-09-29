// LOS CASOS DE «GARMIN · ANTES Y DESPUÉS» — cada escenario, como datos.
//
// Las sesiones son las REALES de «Muñeca · antes y después»
// (`reloj-antes-despues/sesiones.ts`, que a su vez usa las de «Muñeca · correr»):
// una sesión se lee igual en las dos muñecas, cambia el pintor. Aquí solo se
// dice qué hay hoy, qué lee el reloj antes de salir y qué teclas se pulsan en
// cada escenario (el guion, que pasa por el mismo camino que la tecla).
//
// Los números de tiempo (cuándo fija el GPS, cuándo se pulsa) son del GUION del
// escenario: sirven para verlo pasar solo, no son del producto.
//
// Qué NO hacer: escribir aquí un nombre de atleta o de coach; poner un número que
// sea método (zonas, umbrales): salen del plan; usar un código de vínculo «real»
// (el de los escenarios es de mentira y lo da el servidor en el producto).

import { serie } from '../reloj-correr/casos';
import {
  sesion479Brief,
  sesion491Brief,
  sesion493,
  sesion494Brief,
  sesion529,
  sesion535Brief,
  sesionSeisPorMil,
  type Sesion,
} from '../reloj-antes-despues/sesiones';
import { AJUSTES_DEFECTO, type FrescuraPlan, type Hoy, type Sistema, type SesionDelDia } from './estado';
import type { Escena, EscenaRescate, Pantalla, Toque } from './pantallas';

// ---------------------------------------------------------------------------
// Constructores
// ---------------------------------------------------------------------------

/** El pulso en reposo con el que el cuerpo simulado sale (el de «Muñeca · antes y después»). */
export const PPM_EN_REPOSO = 72;

const del = (sesion: Sesion, extra: Partial<Omit<SesionDelDia, 'sesion'>> = {}): SesionDelDia => ({ sesion, franja: null, hecha: false, detalle: true, ...extra });

const AL_DIA: FrescuraPlan = { tipo: 'al-dia' };

const hoy = (sesiones: SesionDelDia[], plan: FrescuraPlan = AL_DIA, manana: Hoy['manana'] = null): Hoy => ({ sesiones, manana, plan });

/** El reloj listo para salir: GPS fijado, pulso leyendo, batería de sobra y el móvil a tiro. */
export const SISTEMA_LISTO: Sistema = { gps: 'listo', pulso: { tipo: 'ok', ppm: PPM_EN_REPOSO }, bateriaPct: 86, movil: true };
/** El reloj recién abierto en la calle: el GPS y el pulso aún buscando. */
export const SISTEMA_BUSCANDO: Sistema = { gps: 'buscando', pulso: { tipo: 'fijando' }, bateriaPct: 86, movil: true };

const escena = (e: Partial<Escena> & Pick<Escena, 'hoy' | 'arranque'>): Escena => ({
  sistema: SISTEMA_LISTO,
  ajustes: AJUSTES_DEFECTO,
  gpsEn: null,
  pulsoEn: null,
  ppmAlFijar: PPM_EN_REPOSO,
  guion: [],
  ...e,
});

const toques = (...t: Array<[number, Toque['boton']]>): Toque[] => t.map(([en, boton]) => ({ en, boton }));

const brief = (k = 0): Pantalla => ({ p: 'brief', k });

/** Cuándo fija el GPS en los escenarios del brief que lo enseñan, ms. */
const GPS_FIJA_EN = 3000;
const PULSO_FIJA_EN = 1600;

// ---------------------------------------------------------------------------
// El rescate de la sesión interrumpida (G07)
// ---------------------------------------------------------------------------

/** 6 × 1000 m: la app murió a 1 minuto de la serie 4. Las tres primeras, hechas y «dentro». */
function rescateSeisPorMil(): EscenaRescate {
  const s = sesionSeisPorMil();
  return {
    sesion: s,
    // El paso 7 es la serie 4; el último punto de control es de hace 30 s (cada 30 s y en cada cambio de paso).
    control: { i: 7, sesionT: 1918, sesionM: 6690 },
    vueltas: [serie(1, 231, 1000, 169), serie(2, 228, 1000, 171), serie(3, 229, 1000, 172)],
    ppmMedio: 152,
  };
}

// ---------------------------------------------------------------------------
// Los escenarios
// ---------------------------------------------------------------------------

/** La mañana de un día con dos sesiones: correr y, por la tarde, fuerza. */
const DOS_SESIONES = (mananaHecha: boolean) =>
  hoy([del(sesionSeisPorMil(), { franja: 'manana', hecha: mananaHecha }), del(sesion529(), { franja: 'tarde' })]);

/** El código que da el servidor cuando se desvincula desde Ajustes y no hay escenario de vínculo. De mentira. */
export const VINCULO_DEFECTO: NonNullable<Escena['vinculo']> = { codigo: 'K7M4QX', restanteS: 582, apruebaEn: null, siguiente: 'R3T8HN' };

export function escenaDe(id: string): Escena {
  const seisPorMil = () => hoy([del(sesionSeisPorMil())]);
  switch (id) {
    // ── G01 · el glance ────────────────────────────────────────────────────────
    case 'glance':
      return escena({ hoy: seisPorMil(), arranque: { p: 'glance' }, guion: toques([2400, 'start']) });
    case 'glance-estados':
      return escena({
        hoy: seisPorMil(),
        arranque: { p: 'glance' },
        estadosDeGlance: [
          seisPorMil(),
          DOS_SESIONES(true),
          hoy([], AL_DIA, sesionSeisPorMil().plan.pasos),
          hoy([del(sesion494Brief())], { tipo: 'viejo', dias: 3 }),
          hoy([del(sesion494Brief(), { detalle: false })]),
          hoy([], { tipo: 'sin-plan' }),
        ],
      });

    // ── G02 · el brief ─────────────────────────────────────────────────────────
    case 'brief-6x1000':
      return escena({ hoy: seisPorMil(), arranque: brief(), sistema: SISTEMA_BUSCANDO, gpsEn: GPS_FIJA_EN + 1200, pulsoEn: PULSO_FIJA_EN });
    case 'brief-479':
      return escena({ hoy: hoy([del(sesion479Brief())]), arranque: brief(), sistema: SISTEMA_BUSCANDO, gpsEn: GPS_FIJA_EN, pulsoEn: PULSO_FIJA_EN });
    case 'brief-491':
      return escena({ hoy: hoy([del(sesion491Brief())]), arranque: brief(), sistema: SISTEMA_BUSCANDO, gpsEn: GPS_FIJA_EN, pulsoEn: PULSO_FIJA_EN });
    case 'brief-494':
      return escena({ hoy: hoy([del(sesion494Brief())]), arranque: brief(), sistema: SISTEMA_BUSCANDO, gpsEn: GPS_FIJA_EN, pulsoEn: PULSO_FIJA_EN });
    case 'brief-529':
      return escena({ hoy: hoy([del(sesion529())]), arranque: brief(), sistema: { ...SISTEMA_LISTO, pulso: { tipo: 'fijando' } }, pulsoEn: PULSO_FIJA_EN });
    case 'brief-cinta':
      return escena({ hoy: hoy([del(sesion535Brief())]), arranque: brief(), sistema: { ...SISTEMA_LISTO, pulso: { tipo: 'fijando' } }, pulsoEn: PULSO_FIJA_EN });
    case 'brief-493':
      return escena({ hoy: hoy([del(sesion493())]), arranque: brief(), sistema: SISTEMA_BUSCANDO, gpsEn: GPS_FIJA_EN, pulsoEn: PULSO_FIJA_EN });

    // ── Empezar: el GPS, la espera y el 3-2-1 ──────────────────────────────────
    case 'empezar':
      return escena({ hoy: seisPorMil(), arranque: brief(), sistema: { ...SISTEMA_BUSCANDO, pulso: { tipo: 'ok', ppm: PPM_EN_REPOSO } }, gpsEn: 5200, guion: toques([1500, 'start']) });
    case 'sin-gps':
      return escena({
        hoy: seisPorMil(),
        arranque: brief(),
        sistema: { ...SISTEMA_BUSCANDO, pulso: { tipo: 'ok', ppm: PPM_EN_REPOSO } },
        gpsEn: 9000,
        guion: toques([1500, 'start'], [3200, 'start']),
      });
    case 'entorno':
      // 479 no dice dónde: UP/DOWN recorren calle, cinta y pista (y en cinta desaparece el GPS).
      return escena({
        hoy: hoy([del(sesion479Brief())]),
        arranque: brief(),
        sistema: SISTEMA_BUSCANDO,
        gpsEn: 7000,
        pulsoEn: PULSO_FIJA_EN,
        guion: toques([1500, 'down'], [2700, 'down'], [3900, 'up']),
      });

    // ── G03 · varias sesiones ──────────────────────────────────────────────────
    case 'varias':
      return escena({ hoy: DOS_SESIONES(false), arranque: { p: 'lista', foco: 0 }, guion: toques([1600, 'down'], [3000, 'start']) });
    case 'varias-tarde':
      return escena({ hoy: DOS_SESIONES(true), arranque: { p: 'lista', foco: 1 }, guion: toques([1800, 'start']) });

    // ── G04 · hoy no toca · G05 · sin plan, plan viejo, sin detalle ────────────
    case 'no-toca':
      return escena({ hoy: hoy([], AL_DIA, sesionSeisPorMil().plan.pasos), arranque: { p: 'no-toca' }, guion: toques([2200, 'start']) });
    case 'plan-viejo':
      return escena({
        hoy: hoy([del(sesion494Brief())], { tipo: 'viejo', dias: 3 }),
        arranque: brief(),
        sistema: { ...SISTEMA_LISTO, movil: false },
      });
    case 'sin-detalle':
      return escena({ hoy: hoy([del(sesion494Brief(), { detalle: false })]), arranque: { p: 'sin-detalle' }, sistema: { ...SISTEMA_LISTO, movil: false }, guion: toques([2400, 'start']) });
    case 'sin-plan':
      return escena({ hoy: hoy([], { tipo: 'sin-plan' }), arranque: { p: 'sin-plan' }, sistema: { ...SISTEMA_LISTO, movil: false } });

    // ── G06 · vincular ─────────────────────────────────────────────────────────
    case 'vincular':
      return escena({
        hoy: seisPorMil(),
        arranque: { p: 'vincular', estado: { tipo: 'espera', codigo: 'K7M4QX', restanteS: 582 } },
        vinculo: { codigo: 'K7M4QX', restanteS: 582, apruebaEn: 6000, siguiente: 'R3T8HN' },
      });
    case 'vincular-caducado':
      return escena({
        hoy: seisPorMil(),
        arranque: { p: 'vincular', estado: { tipo: 'espera', codigo: 'K7M4QX', restanteS: 4 } },
        vinculo: { codigo: 'K7M4QX', restanteS: 4, apruebaEn: null, siguiente: 'R3T8HN' },
        guion: toques([7500, 'start']),
      });

    // ── G07 · sesión interrumpida ──────────────────────────────────────────────
    case 'interrumpida':
      return escena({ hoy: seisPorMil(), arranque: { p: 'interrumpida', foco: 0 }, rescate: rescateSeisPorMil() });
    case 'interrumpida-guardar':
      return escena({ hoy: seisPorMil(), arranque: { p: 'interrumpida', foco: 0 }, rescate: rescateSeisPorMil(), guion: toques([1800, 'down'], [3200, 'start']) });

    // ── Entreno libre · Ajustes ────────────────────────────────────────────────
    case 'libre':
      return escena({ hoy: hoy([], AL_DIA, null), arranque: { p: 'libre', foco: 0, vuelve: { p: 'no-toca' } }, sistema: SISTEMA_BUSCANDO, gpsEn: 6000, guion: toques([1800, 'start']) });
    case 'ajustes':
      return escena({
        hoy: hoy([del(sesion479Brief())]),
        arranque: brief(),
        guion: toques([1200, 'upLargo'], [2400, 'start'], [3600, 'down'], [4800, 'start'], [6200, 'back']),
      });

    // ── G26 · avisos de sistema antes de empezar ───────────────────────────────
    case 'aviso-sin-pulso':
      return escena({ hoy: hoy([del(sesion479Brief())]), arranque: brief(), sistema: { ...SISTEMA_LISTO, pulso: { tipo: 'ausente' } }, guion: toques([1800, 'start']) });
    case 'aviso-bateria':
      return escena({ hoy: hoy([del(sesion494Brief())]), arranque: brief(), sistema: { ...SISTEMA_LISTO, bateriaPct: 14 }, guion: toques([1800, 'start']) });
    case 'aviso-sin-movil':
      return escena({ hoy: seisPorMil(), arranque: brief(), sistema: { ...SISTEMA_LISTO, movil: false } });

    // ── Los cuatro tamaños ─────────────────────────────────────────────────────
    case 'tamanos-brief':
      return escena({ hoy: hoy([del(sesion479Brief())]), arranque: brief(), comparar: true });
    case 'tamanos-largo':
      return escena({ hoy: hoy([del(sesion529())]), arranque: brief(), comparar: true });
    case 'tamanos-circuito':
      return escena({ hoy: hoy([del(sesion493())]), arranque: brief(), comparar: true });
    case 'tamanos-vincular':
      return escena({ hoy: seisPorMil(), arranque: { p: 'vincular', estado: { tipo: 'espera', codigo: 'K7M4QX', restanteS: 582 } }, comparar: true });
    case 'tamanos-aviso':
      return escena({ hoy: hoy([del(sesion494Brief())]), arranque: { p: 'previo', k: 0, cola: ['bateria-baja'] }, sistema: { ...SISTEMA_LISTO, bateriaPct: 14 }, comparar: true });
    default:
      return escena({ hoy: seisPorMil(), arranque: { p: 'glance' } });
  }
}
