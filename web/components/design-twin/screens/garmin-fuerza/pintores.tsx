'use client';

// LAS CARAS DE FUERZA, PINTADAS — cada una es su disposición (`caras.ts`,
// `paginas.ts`) sobre el reloj del contexto: un componente de una línea con
// `<PintaDisposicion />`, como manda `kit.md`. Lo único con estado es la lista
// de Ejercicios, que sabe qué ventana enseña.
//
//   CaraTrabajo        la serie (o estación, o ergo) de una sesión de fuerza, el
//                      «colócate» y el 3-2-1 con el nombre y la carga
//   CaraDescansoFuerza el descanso con lo que viene y lo anotado
//   CaraAnotar         el descanso que anota: sus celdas y el marco de la enfocada
//   CapaCuenta         la cuenta atrás a pantalla entera (encima de todo)
//   PaginaDatosFuerza · PaginaSeries · PaginaEjercicios
//   AlEntrar           avisa al montarse una página (volver a la del descanso
//                      reabre la anotación)
//
// Qué NO hacer: calcular aquí qué va en cada fila (eso es `caras.ts`); mover la
// ventana de Ejercicios sin pasar por `moverEjercicios`.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PintaDisposicion, Tapa, disponerDatos, useGarmin } from '../../kit-garmin';
import type { FilaDatoVista, Lecturas, Paso, ZonasCoach } from '../../kit-reloj';
import { disponerAnotar, disponerDescansoFuerza, disponerTrabajo, type VistaAnotar } from './caras';
import type { FilaEjercicio, FilaSerie } from './filas';
import { arranqueEjercicios, disponerEjercicios, disponerSeries, moverEjercicios } from './paginas';
import type { VistaTrabajo } from './textos';

export function CaraTrabajo({ v }: { v: VistaTrabajo }) {
  const { D } = useGarmin();
  return <PintaDisposicion d={disponerTrabajo(v, D)} />;
}

/** El 3-2-1 (n > 0) o el GO (n = 0), a pantalla entera. */
export function CapaCuenta({ v }: { v: VistaTrabajo }) {
  const { D } = useGarmin();
  return (
    <>
      <Tapa />
      <PintaDisposicion d={disponerTrabajo(v, D)} />
    </>
  );
}

export function CaraDescansoFuerza({
  paso,
  lecturas,
  viene,
  resumen,
}: {
  paso: Paso;
  lecturas: Lecturas;
  viene: { que: string; dosis: string | null } | null;
  resumen: string | null;
}) {
  const { D } = useGarmin();
  return <PintaDisposicion d={disponerDescansoFuerza(paso, lecturas, D, viene, resumen)} />;
}

/** Cada celda es su propia disposición, centrada en su sitio: el contenedor se corre a `cx` (el marco y las líneas se centran en él). */
export function CaraAnotar({ v }: { v: VistaAnotar }) {
  const { D } = useGarmin();
  const { base, celdas } = disponerAnotar(v, D);
  return (
    <>
      <PintaDisposicion d={base} />
      {celdas.map((c, k) => (
        <div key={k} data-rol="celda" style={{ position: 'absolute', top: 0, left: c.cx - D / 2, width: D, height: D }}>
          <PintaDisposicion d={c.d} />
        </div>
      ))}
    </>
  );
}

export function PaginaDatosFuerza({ filas, zonas }: { filas: FilaDatoVista[]; zonas: ZonasCoach | null }) {
  const { D } = useGarmin();
  return <PintaDisposicion d={disponerDatos(filas, zonas, D)} />;
}

export function PaginaSeries({ titulo, filas }: { titulo: string[]; filas: FilaSerie[] }) {
  const { D } = useGarmin();
  return <PintaDisposicion d={disponerSeries(titulo, filas, D)} />;
}

/** Quién mueve la lista de Ejercicios: devuelve `false` si está en el borde (y entonces la tecla pasa de página). */
export type MoverLista = (dir: 1 | -1) => boolean;

/**
 * LOS EJERCICIOS — la lista con su ventana. Entra con «ahora» a la vista; UP y
 * DOWN mueven la ventana de uno en uno (`control` es lo que llama `alAccion` del
 * vivo) y, en el borde, la lista no se mueve y la tecla pasa de página. Al
 * irse y volver, la ventana vuelve a «ahora»: no se pierde dónde estás.
 * `registrar` da al vivo la función que mueve la lista mientras la página está
 * montada (es la página activa) y `null` al irse.
 */
export function PaginaEjercicios({ filas, ahora, registrar }: { filas: FilaEjercicio[]; ahora: number; registrar: (mover: MoverLista | null) => void }) {
  const { D } = useGarmin();
  const [desde, setDesde] = useState(() => arranqueEjercicios(filas, ahora, D));
  const ultimo = useRef({ filas, desde, D });
  useEffect(() => {
    ultimo.current = { filas, desde, D };
  });
  useEffect(() => {
    registrar((dir) => {
      const { filas: f, desde: d, D: dd } = ultimo.current;
      const nuevo = moverEjercicios(f, d, dir, dd);
      if (nuevo == null) return false;
      ultimo.current = { ...ultimo.current, desde: nuevo };
      setDesde(nuevo);
      return true;
    });
    return () => registrar(null);
  }, [registrar]);
  return <PintaDisposicion d={disponerEjercicios(filas, desde, ahora, D)} />;
}

/** Avisa una vez al montarse: la página del descanso al volver a ella. */
export function AlEntrar({ alEntrar, children }: { alEntrar: () => void; children: ReactNode }) {
  const f = useRef(alEntrar);
  useEffect(() => {
    f.current = alEntrar;
  });
  useEffect(() => {
    f.current();
  }, []);
  return <>{children}</>;
}
