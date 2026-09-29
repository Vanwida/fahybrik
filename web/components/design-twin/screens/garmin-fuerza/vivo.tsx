'use client';

// EL VIVO GARMIN DE FUERZA — `useVivoGarmin` + `VistaGarmin` del kit, con lo
// que añade fuerza y nada más:
//
//   · la anotación del descanso (`modelo.ts`): lo declarado vive en el
//     `Registro`; START confirma el campo, BACK/LAP vuelve al anterior, UP/DOWN
//     cambian el valor (fila «Anotar la serie» de §5);
//   · sus caras (serie, colócate, descanso que anota) y su 3-2-1 con la carga;
//   · sus páginas: Paso → Datos → Vueltas (series) → Estructura (ejercicios);
//   · la lista de Ejercicios, que UP/DOWN recorren y en cuyo borde pasan de página.
//
// Qué botón hace qué NO se decide aquí: lo dice `MANDOS` (§5) según el estado, y
// este vivo solo elige el ESTADO (`estadoMandos`): «anotar» en un descanso con
// series por anotar, y el del kit en todo lo demás. La serie se cierra con
// BACK/LAP («Serie hecha», con sus 5 s de deshacer): eso es del kit.
//
// Qué NO hacer: resolver una tecla con un `if` propio fuera de `alAccion`; guardar
// como declarado lo que solo se propuso; encoger el héroe (G2).

import { useRef, useState, type ReactNode } from 'react';
import { VistaGarmin, useVivoGarmin, type EstadoMandos, type IdAccion, type PaginaGarmin } from '../../kit-garmin';
import { cargaArrastrada, esFuerza, type Secuencia } from '../../kit-reloj';
import { vistaColocate, vistaCuenta } from './caras';
import type { CasoGarminFuerza } from './casos';
import { filasDatos, filasEjercicios, filasSeries } from './filas';
import {
  ACCIONES_ANOTAR,
  UI_VACIA,
  aplicarTecla,
  camposDelDescanso,
  reabrir,
  type AccionAnotar,
  type Anotando,
  type ContextoAnotar,
} from './modelo';
import { AlEntrar, CapaCuenta, CaraAnotar, CaraDescansoFuerza, CaraTrabajo, PaginaDatosFuerza, PaginaEjercicios, PaginaSeries, type MoverLista } from './pintores';
import { vieneDe, vistaTrabajo } from './textos';
import { resumenDeDescanso, vistaAnotarDe } from './vistas';

export function VivoGarminFuerza({ caso, onLog }: { caso: CasoGarminFuerza; onLog: (linea: string) => void }) {
  const { plan, sim } = caso;
  const [a, setA] = useState<Anotando>({ registro: caso.registro, ui: UI_VACIA });
  // El estado MÁS RECIENTE para las teclas: dos pulsaciones pueden llegar antes de repintar.
  const reciente = useRef(a);
  const { seq, avisos } = useVivoGarmin(plan, sim, caso.inicio, { onLog });

  // Lo que la vista del kit sabe de este instante: si viven los 5 s de deshacer (UP deshace, no anota).
  const deshacerActivo = useRef(false);
  // Por dónde se llegó a la página del descanso: solo volver con UP (el viaje de ida y vuelta a Datos) reabre la anotación. Al llegar con DOWN, dando la vuelta a las páginas, no: el siguiente DOWN cambiaría un dato sin querer.
  const ultimaPagina = useRef<'pagina-anterior' | 'pagina-siguiente' | null>(null);
  const lista = useRef<MoverLista | null>(null);
  const registrarLista = (mover: MoverLista | null) => {
    lista.current = mover;
  };

  const contexto = (s: Secuencia): ContextoAnotar => ({ plan, estado: s.estado, sim, i: s.estado.i, pasoId: s.paso.id });
  const uiDe = (s: Secuencia, de: Anotando) => (de.ui.paso === s.paso.id ? de.ui : UI_VACIA);
  const anotando = (s: Secuencia, deshacer: boolean, de: Anotando) =>
    s.paso.rol === 'descanso' && !deshacer && camposDelDescanso(plan, s.estado.i).length > 0 && !uiDe(s, de).cerrada;

  const poner = (siguiente: Anotando) => {
    reciente.current = siguiente;
    setA(siguiente);
  };

  // ── El estado de mandos: el de §5 que toca ─────────────────────────────
  const estadoMandos = (s: Secuencia, base: EstadoMandos): EstadoMandos => {
    deshacerActivo.current = base === 'deshacer';
    return anotando(s, base === 'deshacer', a) ? 'anotar' : base;
  };

  // ── Las acciones que no son del kit ─────────────────────────────────────
  const alAccion = (accion: IdAccion, s: Secuencia): boolean => {
    if ((ACCIONES_ANOTAR as readonly string[]).includes(accion)) {
      if (!anotando(s, deshacerActivo.current, reciente.current)) return false;
      const r = aplicarTecla(reciente.current, accion as AccionAnotar, contexto(s));
      poner(r.siguiente);
      if (r.linea) onLog(r.linea);
      return true;
    }
    if (accion === 'pagina-anterior' || accion === 'pagina-siguiente') {
      ultimaPagina.current = accion;
      const movida = lista.current?.(accion === 'pagina-siguiente' ? 1 : -1) ?? false;
      if (movida) onLog(`${accion === 'pagina-siguiente' ? 'DOWN' : 'UP'} → la lista de ejercicios se mueve (en el borde, pasa de página)`);
      return movida;
    }
    return false;
  };

  // ── Las caras ──────────────────────────────────────────────────────────
  const cara = (s: Secuencia): ReactNode | null => {
    const { paso, lecturas, estado } = s;
    const i = estado.i;
    const sig = plan.pasos[i + 1];
    if (paso.rol === 'trabajo') {
      return <CaraTrabajo v={vistaTrabajo(paso, lecturas, { plan, i, zonas: plan.zonas, reglas: plan.reglas, arrastrada: cargaArrastrada(plan, i, a.registro) })} />;
    }
    if (paso.rol === 'transicion' && esFuerza(sig)) return <CaraTrabajo v={vistaColocate(paso, sig, lecturas, cargaArrastrada(plan, i + 1, a.registro))} />;
    if (paso.rol === 'descanso') {
      if (anotando(s, deshacerActivo.current, a)) return <CaraAnotar v={vistaAnotarDe(contexto(s), a.registro, a.ui, lecturas, paso, deshacerActivo.current)} />;
      return <CaraDescansoFuerza paso={paso} lecturas={lecturas} viene={vieneDe(plan, i, a.registro)} resumen={resumenDeDescanso(contexto(s), a.registro)} />;
    }
    return null;
  };

  // El 3-2-1 y el GO de un paso de trabajo, con su nombre y la carga que está en la barra.
  const capa = (s: Secuencia, kit: ReactNode | null): ReactNode | null => {
    const i = s.estado.i;
    if (s.cuenta != null && s.paso.siguiente) return <CapaCuenta v={vistaCuenta(s.cuenta, s.paso.siguiente, plan, cargaArrastrada(plan, i + 1, a.registro))} />;
    if (s.go) return <CapaCuenta v={vistaCuenta(0, s.paso, plan, cargaArrastrada(plan, i, a.registro))} />;
    return kit;
  };

  // ── Las páginas: Paso → Datos → Vueltas → Estructura ────────────────────
  const paginas = (s: Secuencia, contenido: ReactNode): PaginaGarmin[] => {
    const ej = filasEjercicios(plan, s.estado.i, a.registro);
    const series = filasSeries(plan, s.estado, a.registro, sim, s.paso, s.lecturas);
    const reabrirAlVolver = () => {
      if (ultimaPagina.current !== 'pagina-anterior') return;
      const r = reabrir(reciente.current, contexto(s));
      if (r !== reciente.current) {
        poner(r);
        onLog('Vuelve con UP a la página del descanso: la anotación se reabre en lo que faltaba');
      }
    };
    return [
      { id: 'paso', titulo: 'Paso', contenido: s.paso.rol === 'descanso' ? <AlEntrar alEntrar={reabrirAlVolver}>{contenido}</AlEntrar> : contenido },
      { id: 'datos', titulo: 'Datos', contenido: <PaginaDatosFuerza filas={filasDatos(plan, s.estado, a.registro, sim, s.lecturas.ppm)} zonas={plan.zonas} /> },
      { id: 'vueltas', titulo: 'Vueltas', contenido: <PaginaSeries nombre={series.nombre} filas={series.filas} /> },
      { id: 'estructura', titulo: 'Estructura', contenido: <PaginaEjercicios filas={ej.filas} ahora={ej.ahora} registrar={registrarLista} /> },
    ];
  };

  return (
    <VistaGarmin
      seq={seq}
      avisos={avisos}
      cara={cara}
      capa={capa}
      paginas={paginas}
      estadoMandos={estadoMandos}
      alAccion={alAccion}
      guion={caso.guion}
      inicial={caso.inicial}
      onLog={onLog}
    />
  );
}
