'use client';

// EL VIVO CON SU FINAL — la composición estándar del kit (`VivoDePlan`),
// montada a mano («useEventos + useSecuencia + <Muneca>», como pide el kit)
// para poder hacer lo que el vivo de hoy no hace: cuando la sesión acaba SOLA
// (el motor cierra el último paso) o el atleta confirma «Terminar y guardar»,
// no se congela la lámina ni se sale un «guardando…» antes de tiempo: se pasa
// al final con lo HECHO (P0-1, P0-2).
//
// Lo único que añade al vivo del kit: cuenta el tiempo en cada zona del coach
// y el pulso máximo (el resumen los necesita y el motor no los lleva).

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AroSesion,
  AvisoVuelta,
  Descanso,
  Muneca,
  PaginaDatos,
  PaginaEstructura,
  PaginaVueltas,
  PasoCorrer,
  Recupera,
  TresDosUno,
  avisoDeCierre,
  fmtObjetivo,
  fmtReloj,
  principal,
  sesionDe,
  tinteDelPaso,
  useEventos,
  useSecuencia,
  zonaDe,
  type AccionPrimaria,
  type EstadoSecuencia,
  type GestoGuion,
  type InicioSecuencia,
  type MunecaProps,
  type PlanSesion,
  type Secuencia,
  type Simulador,
  type ZonasCoach,
} from '../../kit-reloj';
import { estructuraDe, type KmHecho, type Resultado, type SerieHecha } from './calculo';

/** Lo que el motor no lleva y el resumen necesita: segundos por zona y pulso máximo. */
class Acumulador {
  zonas: number[];
  max = 0;
  constructor(n: number) {
    this.zonas = Array.from({ length: n }, () => 0);
  }
  sumar(ppm: number | null, zonas: ZonasCoach | null) {
    if (ppm == null || !zonas) return;
    this.zonas[zonaDe(ppm, zonas) - 1]! += 1;
    this.max = Math.max(this.max, Math.round(ppm));
  }
}

export interface FinDeVivo {
  estado: EstadoSecuencia;
  final: 'natural' | 'atleta';
  zonasS: number[];
  ppmMax: number;
}

export function VivoFin({
  plan,
  sim,
  inicio,
  control,
  cara,
  inicial,
  guion,
  onFin,
  onLog,
}: {
  plan: PlanSesion;
  sim: Simulador;
  inicio: InicioSecuencia;
  control: 'siguiente' | 'vuelta';
  cara?: (seq: Secuencia) => ReactNode | null;
  inicial?: MunecaProps['inicial'];
  guion?: Array<{ en: number; gesto: GestoGuion }>;
  onFin: (fin: FinDeVivo) => void;
  onLog: (l: string) => void;
}) {
  const [acum] = useState(() => new Acumulador(plan.zonas?.techos.length ?? 5));
  const [cuerpo] = useState(() => {
    const f: Simulador = (p, i, t, s) => {
      const l = sim(p, i, t, s);
      acum.sumar(l.ppm, plan.zonas);
      return l;
    };
    return f;
  });
  const [estructura] = useState(() => estructuraDe(plan.pasos));
  const ev = useEventos(onLog);
  const seq = useSecuencia(plan, cuerpo, inicio, ev);
  const { paso, lecturas, estado } = seq;
  const zonas = plan.zonas;
  // Lo más reciente, para el temporizador del final (que no debe reiniciarse
  // cada vez que la pantalla de arriba se repinta).
  const ultimo = useRef({ estado, onFin });
  useEffect(() => {
    ultimo.current = { estado, onFin };
  });

  // Final natural: el motor cerró el último paso (ya vibró .success×2 y dijo
  // «Sesión completada.»). Un instante después, la pantalla del final.
  const terminado = estado.terminado;
  useEffect(() => {
    if (!terminado) return;
    const t = setTimeout(() => {
      const u = ultimo.current;
      u.onFin({ estado: u.estado, final: 'natural', zonasS: acum.zonas, ppmMax: acum.max });
    }, 700);
    return () => clearTimeout(t);
  }, [terminado, acum]);

  const propia = cara?.(seq) ?? null;
  const vista =
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

  const aviso = avisoDeCierre(paso);
  const accion: AccionPrimaria | null = estado.terminado
    ? null
    : paso.rol !== 'trabajo'
      ? { etiqueta: 'empezar ya', hacer: seq.cerrar, deshacer: { aviso, hacer: seq.deshacer } }
      : control === 'vuelta'
        ? { etiqueta: 'vuelta', hacer: seq.vuelta }
        : { etiqueta: paso.cierre === 'atleta' ? aviso : 'siguiente paso', hacer: seq.cerrar, deshacer: { aviso, hacer: seq.deshacer } };

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
        { id: 'paso', titulo: 'Paso', contenido: vista },
        { id: 'datos', titulo: 'Datos', contenido: <PaginaDatos sesion={sesionDe(estado)} lecturas={lecturas} zonas={zonas} fuente={paso.entorno === 'cinta' ? 'cinta' : undefined} /> },
        { id: 'vueltas', titulo: 'Vueltas', contenido: <PaginaVueltas vueltas={estado.vueltas} objetivo={objetivoSeries} enCurso={enCurso} /> },
        { id: 'estructura', titulo: 'Estructura', contenido: <PaginaEstructura filas={estructura(estado.i)} /> },
      ]}
      aro={<AroSesion pasos={plan.pasos} i={estado.i} paso={paso} lecturas={lecturas} />}
      tinte={tinteDelPaso(paso, lecturas, zonas)}
      capa={capa}
      pausado={seq.pausado}
      onPausa={seq.pausar}
      siguiente={
        control === 'vuelta'
          ? { etiqueta: 'Vuelta', icono: 'vuelta', onPulsa: seq.vuelta }
          : { etiqueta: paso.clase === 'fuerza' ? 'Siguiente serie' : 'Siguiente paso', icono: 'siguiente', onPulsa: seq.cerrar, deshacer: { aviso, hacer: seq.deshacer } }
      }
      // «Terminar y guardar» ya confirmado: el final, con lo hecho hasta aquí.
      // (un tic después: que la cronología recoja antes el .click de la confirmación).
      onTerminar={() => {
        const fin: FinDeVivo = { estado, final: 'atleta', zonasS: acum.zonas, ppmMax: acum.max };
        setTimeout(() => onFin(fin), 0);
      }}
      completada={false}
      accion={accion}
      eventos={ev}
      alPaso={paso.id}
      inicial={inicial}
      guion={guion}
      onLog={onLog}
    />
  );
}

// ---------------------------------------------------------------------------
// Del estado del motor al resultado que se sella
// ---------------------------------------------------------------------------

/** Las vueltas del motor, con el paso al que pertenecen (el motor las deja en orden, una por paso cerrado). */
export function resultadoDeVivo(plan: PlanSesion, fin: FinDeVivo, base: Resultado | null): Resultado {
  const e = fin.estado;
  const conPosicion = plan.pasos.filter((p) => p.rol === 'trabajo' && p.fase === 'principal' && (p.posicion?.serie || p.posicion?.tramo));
  const series: SerieHecha[] = e.vueltas
    .filter((v) => v.clase !== 'km')
    .map((v, k) => ({ ...v, pasoId: conPosicion[k]?.id ?? `sin-paso-${k}` }));
  // Terminada a mitad de una serie: lo corrido de esa serie también es dato (cortada, sin juicio).
  const actual = plan.pasos[e.i];
  const cuenta = actual?.posicion?.serie ?? actual?.posicion?.tramo;
  if (fin.final === 'atleta' && actual?.rol === 'trabajo' && actual.fase === 'principal' && cuenta && e.t > 0) {
    series.push({
      pasoId: actual.id,
      n: cuenta.n,
      tanda: actual.posicion?.tanda?.n,
      clase: actual.posicion?.tramo ? 'tramo' : 'serie',
      segundos: e.t,
      metros: e.midio ? Math.round(e.metros) : null,
      ritmo: e.midio && e.metros > 50 ? e.t / (e.metros / 1000) : null,
      ppm: e.pasoPpmN > 0 ? Math.round(e.pasoPpmSuma / e.pasoPpmN) : null,
      veredicto: null,
      eje: principal(actual)?.eje,
    });
  }
  const km: KmHecho[] = e.vueltas.filter((v) => v.clase === 'km').map((v) => ({ ...v, desnivel: null }));
  return {
    pasos: plan.pasos,
    zonas: plan.zonas ?? { techos: [] },
    i: e.i,
    final: fin.final,
    t: e.sesionT,
    metros: e.sesionM > 0 ? Math.round(e.sesionM) : null,
    ppmMedio: e.ppmN > 0 ? e.ppmSuma / e.ppmN : null,
    ppmMax: Math.max(base?.ppmMax ?? 0, fin.ppmMax) || null,
    desnivel: base?.desnivel ?? null,
    // Si el escenario empezó con la sesión ya avanzada, las zonas salen del resultado de base (la sesión entera).
    zonasS: base ? base.zonasS : fin.zonasS,
    series,
    km,
    fuerza: base?.fuerza ?? [],
    circuito: base?.circuito ?? [],
    roxzoneS: base?.roxzoneS ?? null,
    rpe: null,
    guardado: 'en-reloj',
    libreS: 0,
  };
}
