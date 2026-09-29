'use client';

// EL FLUJO DE «ANTES» — del glance al primer paso, con las cinco teclas de §5.
//
//   glance ─START─▶ brief ─START─▶ (aviso previo) ─▶ (espera GPS) ─▶ 3-2-1 ─▶ vivo
//                     └─DOWN─▶ estructura completa ─BACK─▶ brief
//
// Cada escenario entra por una pantalla y desde ahí se sigue con las teclas (o con
// su guion). Lo asíncrono de verdad —el GPS que fija, el óptico que asienta el
// pulso, el móvil que acepta el código, el 3-2-1— va con tiempos de guion; lo demás
// es estado normal. Qué hace cada botón lo dice `alBoton`, pantalla a pantalla, y
// solo hace lo que la fila de §5 de esa pantalla dice (`ESTADO_DE_PANTALLA`).
//
// El vivo NO se repinta aquí: en cuanto acaba el GO, entra el `VivoGarminDePlan` del
// kit, con su motor, sus páginas y sus avisos, que es el de «Garmin · correr».
//
// Los avisos de antes salen del MISMO emisor que los del vivo (`useAvisos`), y solo
// los de §6: «GPS listo» (1 larga + SUCCESS), el 3-2-1 (1 corta por segundo + KEY ×3) y
// el GO (2 largas + START). Una tarjeta de sistema de antes no suena (§6 no tiene fila).
//
// Qué NO hacer: resolver una tecla fuera de `alBoton`; repintar el vivo; arrancar nada
// contra una sesión sin detalle (DECISIONS 2026-09-28).

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CarcasaGarmin,
  NOMBRE_BOTON,
  ProveeLista,
  VivoGarminDePlan,
  useAvisos,
  type BotonGarmin,
  type Mando,
  type MoverLista,
} from '../../kit-garmin';
import { useGuion, type Entorno, type InicioSecuencia, type PlanSesion } from '../../kit-reloj';
import { cuerpo } from '../reloj-correr/casos';
import { CapaSistema } from '../garmin-correr/vistaSistema';
import { conEntorno, correrLibre } from '../reloj-antes-despues/sesiones';
import { PPM_EN_REPOSO, VINCULO_DEFECTO } from './casos';
import { Contenido, completitudDelRescate, datosBrief, hayQueEsperarGps, opcionesDeAjustes, opcionesDeEntorno, type Contexto } from './contenido';
import {
  ENTORNOS,
  TIPOS_LIBRES,
  avisosPrevios,
  primeraPendiente,
  vistaDeHoy,
  type Ajustes,
  type Sistema,
} from './estado';
import { ESTADO_DE_PANTALLA, mandoDePantalla, type Escena, type Pantalla } from './pantallas';

// Tiempos de la pantalla (mecanismo del guion, no del producto).
/** Del «GPS listo» a la cuenta atrás, ms: lo justo para leerlo. */
const GPS_A_CUENTA_MS = 900;
/** Los pasos del 3-2-1: 3 al entrar, 2 a 1 s, 1 a 2 s, GO a 3 s, y el vivo a 3,7 s. */
const CUENTA_MS = { dos: 1000, uno: 2000, go: 3000, vivo: 3700 } as const;
/** Cuánto se ve «Reloj vinculado» antes de volver al glance, ms. */
const TRAS_VINCULAR_MS = 2600;
/** El ritmo del cuerpo simulado en «Correr libre», sin objetivo: un rodaje cómodo, s/km. */
const RITMO_LIBRE = 318;
/** El pulso con el que el cuerpo simulado sale en un rescate: ya en carrera. */
const PPM_EN_CARRERA = 150;
/** Lo que se retrasa el GPS del vivo tras salir «sin GPS» si el escenario no dice cuándo fija, s. */
const GPS_TARDA_SIN_DATO_S = 60;

const INICIO: InicioSecuencia = { i: 0, t: 0, metros: 0, sesionT: 0, sesionM: 0 };

export function Flujo({ escena, onLog }: { escena: Escena; onLog: (linea: string) => void }) {
  const avisos = useAvisos(onLog);
  const [pantalla, setPantalla] = useState<Pantalla>(escena.arranque);
  const [sistema, setSistema] = useState<Sistema>(escena.sistema);
  const [ajustes, setAjustes] = useState<Ajustes>(escena.ajustes);
  const [elegido, setElegido] = useState<Entorno | null>(null);
  const [vinculoN, setVinculoN] = useState(0);
  const { hoy } = escena;
  const vinculo = escena.vinculo ?? VINCULO_DEFECTO;

  // Lo más reciente para los temporizadores (que no se reinician al repintar).
  const reciente = useRef({ pantalla, sistema, elegido, ajustes });
  useEffect(() => {
    reciente.current = { pantalla, sistema, elegido, ajustes };
  });
  // La Estructura completa mueve su ventana con UP/DOWN: la lista registra aquí su `mover`; en el borde, la tecla pasa de página (vuelve al brief).
  const lista = useRef<MoverLista | null>(null);
  const registrarLista = useCallback((mover: MoverLista | null) => {
    lista.current = mover;
  }, []);
  const t0 = useRef(0);
  useEffect(() => {
    t0.current = Date.now();
  }, []);

  const ir = (p: Pantalla, log?: string) => {
    if (log) onLog(log);
    setPantalla(p);
  };

  // ── El reloj lee: el GPS fija, el óptico asienta el pulso ─────────────────────
  useEffect(() => {
    const t: ReturnType<typeof setTimeout>[] = [];
    if (escena.sistema.pulso.tipo === 'fijando' && escena.pulsoEn != null) {
      t.push(setTimeout(() => setSistema((s) => ({ ...s, pulso: { tipo: 'ok', ppm: escena.ppmAlFijar } })), escena.pulsoEn));
    }
    if (escena.sistema.gps === 'buscando' && escena.gpsEn != null) {
      t.push(
        setTimeout(() => {
          setSistema((s) => ({ ...s, gps: 'listo' }));
          // «GPS listo» (§6): solo si estás en algo que lo espera.
          if (['brief', 'previo', 'espera', 'libre'].includes(reciente.current.pantalla.p)) avisos.emitir('gps');
        }, escena.gpsEn),
      );
    }
    return () => t.forEach(clearTimeout);
    // Una sola búsqueda por escenario (cada escenario remonta).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── La espera del GPS: al fijar, la sesión arranca sola ──────────────────────
  const enEspera = pantalla.p === 'espera';
  useEffect(() => {
    if (!enEspera || sistema.gps !== 'listo') return;
    const t = setTimeout(() => {
      const p = reciente.current.pantalla;
      if (p.p === 'espera') empezarCuenta(p.plan, p.inicio, false, p.vuelve);
    }, GPS_A_CUENTA_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enEspera, sistema.gps]);

  // ── El 3-2-1 ───────────────────────────────────────────────────────────────
  const enCuenta = pantalla.p === 'cuenta';
  useEffect(() => {
    if (!enCuenta) return;
    const paso = (n: number, evento: 'cuenta' | 'go') => () => {
      const p = reciente.current.pantalla;
      if (p.p !== 'cuenta') return;
      setPantalla({ ...p, n });
      avisos.emitir(evento);
    };
    const t = [
      setTimeout(paso(2, 'cuenta'), CUENTA_MS.dos),
      setTimeout(paso(1, 'cuenta'), CUENTA_MS.uno),
      setTimeout(paso(0, 'go'), CUENTA_MS.go),
      setTimeout(() => {
        const p = reciente.current.pantalla;
        if (p.p === 'cuenta') arrancarVivo(p.plan, p.inicio, p.sinGps);
      }, CUENTA_MS.vivo),
    ];
    return () => t.forEach(clearTimeout);
    // Una cuenta por entrada en la fase.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enCuenta]);

  // ── Vincular: la cuenta atrás del código y el móvil que lo acepta ─────────────
  const enVinculo = pantalla.p === 'vincular' ? pantalla.estado.tipo : null;
  useEffect(() => {
    if (enVinculo !== 'espera') return;
    const cuenta = setInterval(() => {
      setPantalla((p) => {
        if (p.p !== 'vincular' || p.estado.tipo !== 'espera') return p;
        return p.estado.restanteS <= 1 ? { p: 'vincular', estado: { tipo: 'caducado' } } : { p: 'vincular', estado: { ...p.estado, restanteS: p.estado.restanteS - 1 } };
      });
    }, 1000);
    const acepta = escena.vinculo?.apruebaEn != null ? setTimeout(() => {
      onLog('El móvil acepta el código → reloj vinculado (el reloj nunca pide una contraseña)');
      setPantalla({ p: 'vincular', estado: { tipo: 'vinculado' } });
    }, escena.vinculo.apruebaEn) : null;
    return () => {
      clearInterval(cuenta);
      if (acepta) clearTimeout(acepta);
    };
    // El código nuevo (vinculoN) reinicia la cuenta y la espera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enVinculo, vinculoN]);
  useEffect(() => {
    if (enVinculo !== 'vinculado') return;
    const t = setTimeout(() => ir({ p: 'glance' }, 'Vinculado → trae el plan y vuelve al glance'), TRAS_VINCULAR_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enVinculo]);

  // ── Salir: cuenta atrás y vivo ────────────────────────────────────────────────
  function empezarCuenta(plan: PlanSesion, inicio: InicioSecuencia, sinGps: boolean, vuelve: Pantalla) {
    setPantalla({ p: 'cuenta', n: 3, plan, inicio, sinGps, vuelve });
    avisos.emitir('cuenta');
  }

  function arrancarVivo(plan: PlanSesion, inicio: InicioSecuencia, sinGps: boolean) {
    // Sin esperar al GPS: sigue buscando lo que le quedaba, y el ritmo es «—» hasta entonces (G7).
    const restante = sinGps ? (escena.gpsEn != null ? Math.max(1, Math.ceil((escena.gpsEn - (Date.now() - t0.current)) / 1000)) : GPS_TARDA_SIN_DATO_S) : 0;
    const libre = plan.pasos.length === 1 && plan.pasos[0]!.cierre === 'atleta';
    const sim = cuerpo({
      ppmDesde: inicio.i > 0 ? PPM_EN_CARRERA : PPM_EN_REPOSO,
      partida: inicio.i > 0 ? { i: inicio.i, t: 0 } : undefined,
      gps: restante > 0 ? (t) => (t < restante ? 'buscando' : 'listo') : undefined,
      ritmo: libre ? () => RITMO_LIBRE : undefined,
    });
    setPantalla({ p: 'vivo', plan, inicio, sim });
  }

  /** «Empezar» una sesión de hoy: primero lo que hay que decir, luego el GPS, luego la cuenta. */
  const salir = (k: number) => {
    const sd = hoy.sesiones[k]!;
    const d = datosBrief({ hoy, sistema, ajustes, elegido }, k);
    const plan = d.entorno && sd.sesion.entorno == null ? conEntorno(sd.sesion.plan, d.entorno) : sd.sesion.plan;
    const vuelve: Pantalla = { p: 'brief', k };
    if (hayQueEsperarGps({ hoy, sistema, ajustes, elegido }, k)) {
      ir({ p: 'espera', entorno: d.entorno ?? 'calle', plan, inicio: INICIO, vuelve }, 'START → el GPS aún no ha fijado: se espera aquí y sale solo al fijar (o START = sin GPS)');
    } else {
      empezarCuenta(plan, INICIO, false, vuelve);
    }
  };

  /** START en el brief: si hay algo que decir antes (batería, pulso), se dice; si no, se sale. */
  const empezarBrief = (k: number) => {
    const cola = avisosPrevios(hoy.sesiones[k]!.sesion, sistema);
    if (cola.length > 0) return ir({ p: 'previo', k, cola }, `START → antes de empezar, el reloj dice: ${cola.join(' y ')} (no suena: §6 no tiene fila para un aviso previo)`);
    salir(k);
  };

  // ── Las cinco teclas ──────────────────────────────────────────────────────────
  const abrirHoy = (): Pantalla => {
    switch (vistaDeHoy(hoy)) {
      case 'sin-plan':
        return { p: 'sin-plan' };
      case 'no-toca':
        return { p: 'no-toca' };
      case 'sin-detalle':
        return { p: 'sin-detalle' };
      case 'varias':
        return { p: 'lista', foco: primeraPendiente(hoy.sesiones) };
      case 'una':
        return { p: 'brief', k: 0 };
    }
  };
  const desdeBrief = (k: number): Pantalla => (hoy.sesiones.length > 1 ? { p: 'lista', foco: k } : { p: 'glance' });
  const ajustesDesde = (vuelve: Pantalla): Pantalla => ({ p: 'ajustes', capa: 'raiz', foco: 0, vuelve });
  const nada = (b: BotonGarmin, porque: string) => onLog(`${NOMBRE_BOTON[b]} → nada aquí: ${porque}`);
  const mover = (foco: number, n: number, b: BotonGarmin) => Math.min(n - 1, Math.max(0, foco + (b === 'down' ? 1 : -1)));

  /** `tocada` = la opción que se tocó (fuera del vivo): equivale a enfocarla y pulsar START. */
  const alBoton = (b: BotonGarmin, tocada?: number) => {
    const p = pantalla;
    if (b === 'light') return onLog('LIGHT → la luz de fondo la enciende el sistema; la app no la toca');
    switch (p.p) {
      case 'glance':
        if (b === 'start') return ir(abrirHoy(), 'START en el glance → abre la app (lo de hoy)');
        if (b === 'back') return onLog('BACK → sale de la app: en el glance no hay nada abierto');
        return onLog(`${NOMBRE_BOTON[b]} → lo lleva Garmin (bucle de glances), no la app`);

      case 'lista': {
        const foco = tocada ?? p.foco;
        if (b === 'up' || b === 'down') return ir({ ...p, foco: mover(p.foco, hoy.sesiones.length, b) });
        if (b === 'start') return ir({ p: 'brief', k: foco }, `START → abre la sesión ${foco + 1} de ${hoy.sesiones.length}`);
        if (b === 'back') return ir({ p: 'glance' });
        return ir(ajustesDesde(p), 'UP largo → Ajustes');
      }

      case 'brief': {
        const d = datosBrief({ hoy, sistema, ajustes, elegido }, p.k);
        if (b === 'start') return empezarBrief(p.k);
        if (b === 'back') return ir(desdeBrief(p.k));
        if (b === 'upLargo') return ir(ajustesDesde(p), 'UP largo → Ajustes');
        if (b === 'down') return ir({ p: 'estructura', k: p.k }, 'DOWN → la Estructura completa de la sesión (UP/DOWN la recorren; BACK vuelve al brief)');
        if (!d.elegible) return nada(b, 'la prescripción ya fija el entorno');
        const actual = ENTORNOS.indexOf(d.entorno ?? ajustes.entornoPorDefecto);
        const nuevo = ENTORNOS[(actual + 1) % ENTORNOS.length]!;
        setElegido(nuevo);
        return onLog(`${NOMBRE_BOTON[b]} → entorno: ${nuevo}${nuevo === 'cinta' ? ' (sin GPS: los metros los da la cinta)' : ' (hace falta GPS)'}`);
      }

      case 'estructura': {
        if (b === 'start') return empezarBrief(p.k);
        if (b === 'back') return ir({ p: 'brief', k: p.k }, 'BACK → vuelve al brief');
        if (b === 'upLargo') return nada(b, 'primero se vuelve al brief');
        if (lista.current?.(b === 'down' ? 1 : -1)) return onLog(`${NOMBRE_BOTON[b]} → la lista se mueve (en el borde, pasa de página)`);
        return ir({ p: 'brief', k: p.k }, `${NOMBRE_BOTON[b]} → borde de la lista: pasa de página y vuelve al brief`);
      }

      case 'previo': {
        if (b === 'back') return ir({ p: 'brief', k: p.k }, 'BACK → vuelve al brief');
        if (b !== 'start') return nada(b, 'decide con START (empezar) o BACK (volver)');
        const resto = p.cola.slice(1);
        if (resto.length > 0) return ir({ ...p, cola: resto });
        return salir(p.k);
      }

      case 'espera':
        if (b === 'start') {
          onLog('START → Empezar sin GPS: el ritmo será «—» hasta que fije, nunca un cero');
          return empezarCuenta(p.plan, p.inicio, true, p.vuelve);
        }
        if (b === 'back') return ir(p.vuelve, 'BACK → vuelve; la búsqueda del GPS sigue');
        return nada(b, 'la sesión sale sola al fijar el GPS');

      case 'cuenta':
        if (b === 'start' || b === 'back') return ir(p.vuelve, `${NOMBRE_BOTON[b]} → cancela la cuenta atrás`);
        return nada(b, 'la cuenta atrás solo se cancela');

      case 'no-toca':
      case 'sin-plan':
        if (b === 'start') return ir({ p: 'libre', foco: 0, vuelve: p }, 'START → Entreno libre: sin plan; se guarda fuera de plan');
        if (b === 'back') return ir({ p: 'glance' });
        if (b === 'upLargo') return ir(ajustesDesde(p), 'UP largo → Ajustes');
        return nada(b, 'no hay otra sesión que elegir');

      case 'sin-detalle':
        if (b === 'back') return ir({ p: 'glance' });
        if (b === 'start') return onLog('START → nada aquí: sin el detalle de la sesión no hay Empezar (DECISIONS 28-09); el reloj lo pide al móvil solo');
        return nada(b, 'no hay nada que elegir hasta que llegue la sesión');

      case 'libre': {
        const foco = tocada ?? p.foco;
        if (b === 'up' || b === 'down') return ir({ ...p, foco: mover(p.foco, TIPOS_LIBRES.length, b) });
        if (b === 'back') return ir(p.vuelve);
        if (b === 'upLargo') return ir(ajustesDesde(p), 'UP largo → Ajustes');
        const tipo = TIPOS_LIBRES[foco]!;
        if (tipo.id !== 'correr') return onLog(`START → Entreno libre · ${tipo.texto}: abre el reloj de ${tipo.texto.toLowerCase()} sin plan (otra familia de pantallas); se guarda fuera de plan`);
        const entorno = ajustes.entornoPorDefecto;
        const libre = correrLibre(entorno);
        onLog(`START → Correr libre en ${entorno} (el de Ajustes): sin objetivo, vuelta por km; se guarda fuera de plan`);
        if (entorno !== 'cinta' && sistema.gps !== 'listo') return ir({ p: 'espera', entorno, plan: libre.plan, inicio: INICIO, vuelve: p });
        return empezarCuenta(libre.plan, INICIO, false, p);
      }

      case 'ajustes': {
        const n = p.capa === 'raiz' ? opcionesDeAjustes(ajustes).length : p.capa === 'entorno' ? opcionesDeEntorno.length : 1;
        const foco = tocada ?? p.foco;
        if (b === 'up' || b === 'down') return ir({ ...p, foco: mover(p.foco, n, b) });
        if (b === 'upLargo') return nada(b, 'ya estás en Ajustes');
        if (b === 'back') return p.capa === 'raiz' ? ir(p.vuelve, 'BACK → cierra Ajustes') : ir({ ...p, capa: 'raiz', foco: p.capa === 'entorno' ? 0 : 1 });
        if (p.capa === 'raiz') {
          return foco === 0
            ? ir({ ...p, capa: 'entorno', foco: ENTORNOS.indexOf(ajustes.entornoPorDefecto) })
            : ir({ ...p, capa: 'desvincular', foco: 0 });
        }
        if (p.capa === 'entorno') {
          const e = ENTORNOS[foco]!;
          setAjustes((a) => ({ ...a, entornoPorDefecto: e }));
          return ir({ ...p, capa: 'raiz', foco: 0 }, `Entorno por defecto → ${e}: el brief lo usa cuando el plan no dice dónde`);
        }
        setVinculoN((x) => x + 1);
        return ir({ p: 'vincular', estado: { tipo: 'espera', codigo: vinculo.codigo, restanteS: vinculo.restanteS } }, 'Desvincular → el reloj olvida la cuenta y muestra un código nuevo');
      }

      case 'vincular':
        if (b === 'back') return onLog('BACK → sale de la app: el reloj sigue sin vincular');
        if (b === 'start' && p.estado.tipo !== 'vinculado') {
          setVinculoN((x) => x + 1);
          return ir({ p: 'vincular', estado: { tipo: 'espera', codigo: vinculo.siguiente, restanteS: vinculo.restanteS } }, 'START → pide otro código al servidor');
        }
        return nada(b, 'el reloj solo espera a que el móvil acepte el código');

      case 'interrumpida': {
        const foco = tocada ?? p.foco;
        if (b === 'up' || b === 'down') return ir({ ...p, foco: mover(p.foco, 2, b) });
        if (b === 'back') return onLog('BACK → sale sin decidir: el punto de control sigue en el reloj y al abrir otra vez se pregunta lo mismo');
        if (b === 'upLargo') return nada(b, 'primero hay que decidir qué hacer con la sesión');
        const r = escena.rescate!;
        if (foco === 1) return ir({ p: 'guardada' }, `START → Guardar lo hecho: ${completitudDelRescate(r).estado} (lo decide lo hecho, no la pantalla)`);
        const inicio: InicioSecuencia = { i: r.control.i, t: 0, metros: 0, sesionT: r.control.sesionT, sesionM: r.control.sesionM, vueltas: r.vueltas, ppmMedio: r.ppmMedio };
        onLog('START → Seguir: OTRA grabación de la misma sesión (Garmin no reanuda la anterior); el paso en curso vuelve a empezar');
        return empezarCuenta(r.sesion.plan, inicio, false, p);
      }

      case 'guardada':
        if (b === 'start' || b === 'back') return ir({ p: 'glance' }, 'Confirmar → guardado en el reloj; sube al tener el móvil');
        return nada(b, 'la sesión ya está guardada');

      case 'vivo':
        return;
    }
  };

  const ejecutar = (b: BotonGarmin, mando: Mando | null) => {
    if (!mando && b !== 'light') return onLog(`${NOMBRE_BOTON[b]} → nada aquí`);
    alBoton(b);
  };
  useGuion(escena.guion.map((g) => ({ en: g.en, gesto: g.boton })), (b: BotonGarmin) => alBoton(b));

  /** Un toque en una línea (fuera del vivo): su tecla equivalente. */
  const alTocar = (rol: string, k: number) => {
    onLog(`Toque en «${rol.replace(/^opcion:|^sesion:/, '')}» (fuera del vivo; su tecla es START)`);
    if (rol === 'accion' || rol === 'glance') return alBoton('start');
    alBoton('start', k);
  };

  if (pantalla.p === 'vivo') {
    const enLibre = pantalla.plan.pasos.length === 1 && pantalla.plan.pasos[0]!.cierre === 'atleta';
    return (
      <VivoGarminDePlan
        key="vivo"
        plan={pantalla.plan}
        sim={pantalla.sim}
        inicio={pantalla.inicio}
        capa={(seq, kit) => (
          <>
            <CapaSistema seq={seq} />
            {kit}
          </>
        )}
        onLog={(l) => onLog(enLibre ? `[correr libre] ${l}` : l)}
      />
    );
  }

  const ctx: Contexto = { hoy, sistema, ajustes, elegido, rescate: escena.rescate, alTocar };
  // ¿El plan deja elegir el entorno? Solo en el brief lo dice UP; en el resto de pantallas no hay qué elegir.
  const elegible = pantalla.p === 'brief' && datosBrief({ hoy, sistema, ajustes, elegido }, pantalla.k).elegible;
  return (
    <ProveeLista value={registrarLista}>
      <CarcasaGarmin
        estado={ESTADO_DE_PANTALLA[pantalla.p]}
        mandos={(b, porTabla) => mandoDePantalla(pantalla, elegible, b, porTabla)}
        onBoton={ejecutar}
        ultimo={avisos.ultimo}
        onLog={onLog}
      >
        <Contenido p={pantalla} ctx={ctx} />
      </CarcasaGarmin>
    </ProveeLista>
  );
}
