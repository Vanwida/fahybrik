'use client';

// EL VIVO DE UN PLAN — la composición estándar: motor + carcasa + caras.
//
// Una pantalla del rediseño que corre un plan no monta nada a mano: pasa el
// plan, el cuerpo (`Simulador`) y el punto de partida, y recibe la muñeca
// entera con las cuatro páginas de la corona (Paso → Datos → Vueltas →
// Estructura), el aro de la sesión, el 3-2-1 / GO, el aviso del km, la acción
// del momento con su deshacer y los controles.
//
// La cara del Paso es la de CORRER por defecto (P10: la carrera dentro de un
// circuito usa la misma pantalla de correr). Una familia con pasos propios
// (estación, fuerza, EMOM…) pasa `cara`: se llama con la secuencia y devuelve
// su cara, o `null` para dejar la de correr en ese paso.

import type { ReactNode } from 'react';
import { AroSesion } from './aro';
import { useEventos } from './eventos';
import { Muneca, type AccionPrimaria, type MunecaProps } from './Muneca';
import { PaginaDatos, PaginaEstructura, PaginaVueltas } from './paginas';
import { NOMBRE_CLASE_DEFECTO, type FilaEstructura, type Paso, type Sesion } from './paso';
import { AvisoVuelta, Descanso, PasoCorrer, Recupera, TresDosUno } from './pasos';
import type { ModeloReloj } from './piezas';
import { fmtObjetivo, fmtReloj, principal, tinteDelPaso } from './reglas';
import { useSecuencia, type EstadoSecuencia, type InicioSecuencia, type PlanSesion, type Secuencia, type Simulador } from './secuencia';

export interface VivoDePlanProps {
  plan: PlanSesion;
  sim: Simulador;
  inicio: InicioSecuencia;
  /** Las filas de la página Estructura según el paso en curso. */
  estructura: (i: number) => FilaEstructura[];
  /** El control contextual: «Siguiente paso» (sesión con pasos) o «Vuelta» (rodaje). */
  control: 'siguiente' | 'vuelta';
  /** La etiqueta del control «siguiente» si no es «Siguiente paso» («Siguiente serie» en fuerza). */
  etiquetaSiguiente?: string;
  /** Cara propia para los pasos que no son de correr; `null` = la de correr. */
  cara?: (seq: Secuencia) => ReactNode | null;
  /** Qué dice el aviso de deshacer al cerrar a mano un paso de trabajo. */
  avisoCierre?: (paso: Paso) => string;
  inicial?: MunecaProps['inicial'];
  guion?: MunecaProps['guion'];
  modelo?: ModeloReloj;
  onLog: (linea: string) => void;
}

/** La sesión entera, para la página Datos. Sin metros medidos, «—» (nunca 0,00 km). */
export function sesionDe(e: EstadoSecuencia): Sesion {
  return {
    t: e.sesionT,
    metros: e.sesionM > 0 ? e.sesionM : null,
    ritmoMedio: e.sesionM > 50 ? e.sesionT / (e.sesionM / 1000) : null,
    ppmMedio: e.ppmN > 0 ? e.ppmSuma / e.ppmN : null,
  };
}

/** «Serie 3 cerrada», «Recuperación cortada»… el texto del aviso de deshacer. */
export function avisoDeCierre(paso: Paso): string {
  if (paso.rol === 'recuperacion') return 'Recuperación cortada';
  if (paso.rol === 'descanso') return 'Descanso cortado';
  const tramo = paso.posicion?.tramo;
  if (tramo) return `Tramo ${tramo.n} cerrado`;
  const serie = paso.posicion?.serie;
  if (serie) return `${NOMBRE_CLASE_DEFECTO[paso.clase]} ${serie.n} ${paso.clase === 'series' ? 'cerrada' : 'cerrado'}`;
  if (paso.nombre) return `${paso.nombre} hecho`;
  return 'Paso cerrado';
}

export function VivoDePlan(p: VivoDePlanProps) {
  const ev = useEventos(p.onLog);
  const seq = useSecuencia(p.plan, p.sim, p.inicio, ev);
  const { paso, lecturas, estado } = seq;
  const zonas = p.plan.zonas;

  const propia = p.cara?.(seq) ?? null;
  const cara =
    propia ??
    (paso.rol === 'recuperacion' ? (
      <Recupera paso={paso} lecturas={lecturas} zonas={zonas} />
    ) : paso.rol === 'descanso' ? (
      <Descanso paso={paso} lecturas={lecturas} onMas30={seq.sumar30} />
    ) : (
      <PasoCorrer paso={paso} lecturas={lecturas} zonas={zonas} />
    ));

  const capa =
    seq.cuenta != null && paso.siguiente ? (
      <TresDosUno n={seq.cuenta} paso={paso.siguiente} />
    ) : seq.go ? (
      <TresDosUno n={0} paso={paso} />
    ) : estado.banner ? (
      <AvisoVuelta titulo={estado.banner.titulo} valor={estado.banner.valor} pie={estado.banner.pie} />
    ) : null;

  // La acción del momento (doble toque / Acción / botón): en recuperación y
  // descanso, empezar ya; en un paso de trabajo, cerrarlo (o la vuelta en un
  // rodaje). Todo cierre a mano deja 5 s para deshacer.
  const aviso = (p.avisoCierre ?? avisoDeCierre)(paso);
  const accion: AccionPrimaria | null = estado.terminado
    ? null
    : paso.rol !== 'trabajo'
      ? { etiqueta: 'empezar ya', hacer: seq.cerrar, deshacer: { aviso, hacer: seq.deshacer } }
      : p.control === 'vuelta'
        ? { etiqueta: 'vuelta', hacer: seq.vuelta }
        : { etiqueta: paso.cierre === 'atleta' ? aviso : 'siguiente paso', hacer: seq.cerrar, deshacer: { aviso, hacer: seq.deshacer } };

  // Vueltas: el objetivo de las series en la cabecera y la que se corre arriba.
  const deSerie = paso.rol === 'trabajo' ? paso : paso.siguiente;
  const o = deSerie ? principal(deSerie) : null;
  const objetivoSeries = o && (deSerie?.posicion?.serie || deSerie?.posicion?.tramo) ? fmtObjetivo(o) : null;
  const cuenta = paso.posicion?.serie ?? paso.posicion?.tramo;
  const enCurso =
    paso.rol === 'trabajo' && cuenta
      ? { n: paso.posicion?.tanda ? `${paso.posicion.tanda.n}·${cuenta.n}` : String(cuenta.n), valor: fmtReloj(lecturas.t) }
      : paso.vueltaAutoM
        ? { n: `km ${estado.kmN + 1}`, valor: fmtReloj(estado.sesionT - estado.kmDesdeT) }
        : null;

  return (
    <Muneca
      paginas={[
        { id: 'paso', titulo: 'Paso', contenido: cara },
        { id: 'datos', titulo: 'Datos', contenido: <PaginaDatos sesion={sesionDe(estado)} lecturas={lecturas} zonas={zonas} fuente={paso.entorno === 'cinta' ? 'cinta' : undefined} /> },
        {
          id: 'vueltas',
          titulo: 'Vueltas',
          contenido: <PaginaVueltas vueltas={estado.vueltas} objetivo={objetivoSeries} enCurso={enCurso} />,
        },
        { id: 'estructura', titulo: 'Estructura', contenido: <PaginaEstructura filas={p.estructura(estado.i)} /> },
      ]}
      aro={<AroSesion pasos={p.plan.pasos} i={estado.i} paso={paso} lecturas={lecturas} />}
      tinte={tinteDelPaso(paso, lecturas, zonas)}
      capa={capa}
      pausado={seq.pausado}
      onPausa={seq.pausar}
      siguiente={
        p.control === 'vuelta'
          ? { etiqueta: 'Vuelta', icono: 'vuelta', onPulsa: seq.vuelta }
          : {
              etiqueta: p.etiquetaSiguiente ?? 'Siguiente paso',
              icono: 'siguiente',
              onPulsa: seq.cerrar,
              deshacer: { aviso, hacer: seq.deshacer },
            }
      }
      onTerminar={seq.terminar}
      completada={estado.terminado}
      accion={accion}
      eventos={ev}
      alPaso={paso.id}
      inicial={p.inicial}
      guion={p.guion}
      modelo={p.modelo}
      onLog={p.onLog}
    />
  );
}
