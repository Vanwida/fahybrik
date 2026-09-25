'use client';

// EL RESUMEN — las páginas de la corona tras guardar, por familia, y siempre
// las mismas dos al final: el pulso con las zonas del coach y dónde está la
// sesión (con «Listo»). La primera página lleva el estado de guardado en
// corto, abajo: lo primero que se ve dice la verdad.
//
// El estado de guardado evoluciona con los acuses del móvil (DECISIONS
// 25-09): el sobre sale del reloj, el móvil lo tiene (held) o el servidor lo
// confirma (saved) o lo rechaza (rejected). La muñeca pinta lo último que sabe.

import { useEffect, useState } from 'react';
import type { Emision, GestoGuion, PaginaVivo } from '../../kit-reloj';
import { METODO_RESUMEN_DEFECTO, completitud, type EstadoGuardado, type MetodoResumen, type Resultado } from './calculo';
import { Pila } from './pila';
import { paginasCircuito } from './resumen-circuito';
import { paginasCorrer } from './resumen-correr';
import { paginasFuerza } from './resumen-fuerza';
import { GUARDADO, PaginaGuardado, PaginaPulso } from './resumen-piezas';
import type { Familia } from './sesiones';

/** Lo que dice la cronología al llegar cada acuse (el nombre técnico entre paréntesis, para el estudio). */
const ACUSE: Record<EstadoGuardado, string> = {
  'en-reloj': 'el sobre sigue en el reloj (sin acuse)',
  'en-cola': 'el móvil lo tiene en su cola, sin cobertura (held)',
  guardado: 'el servidor lo confirmó (saved)',
  'en-movil': 'el servidor lo rechazó (rejected, 4xx) — el móvil lo guarda',
};

export interface Acuse {
  en: number;
  estado: EstadoGuardado;
}

export function Resumen({
  r,
  familia,
  acuses,
  metodo = METODO_RESUMEN_DEFECTO,
  onListo,
  ultimo,
  guion,
  inicial,
  onLog,
}: {
  r: Resultado;
  familia: Familia;
  acuses?: Acuse[];
  metodo?: MetodoResumen;
  onListo: () => void;
  ultimo: Emision | null;
  guion?: Array<{ en: number; gesto: GestoGuion }>;
  inicial?: { pagina?: number };
  onLog: (l: string) => void;
}) {
  const [guardado, setGuardado] = useState<EstadoGuardado>(r.guardado);
  useEffect(() => {
    const t = (acuses ?? []).map((a) =>
      setTimeout(() => {
        setGuardado(a.estado);
        onLog(`Acuse del móvil: ${ACUSE[a.estado]} → «${GUARDADO[a.estado].corto}»`);
      }, a.en),
    );
    return () => t.forEach(clearTimeout);
    // Los acuses son fijos por montaje.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const c = completitud(r, metodo);
  const propias =
    familia === 'fuerza' ? paginasFuerza(r, c, guardado) : familia === 'circuito' ? paginasCircuito(r, c, guardado, metodo) : paginasCorrer(r, c, guardado, metodo);
  const paginas: PaginaVivo[] = [
    ...propias,
    { id: 'pulso', titulo: 'Pulso', contenido: <PaginaPulso r={r} /> },
    { id: 'guardado', titulo: GUARDADO[guardado].titulo, contenido: <PaginaGuardado estado={guardado} rpe={r.rpe} onListo={onListo} /> },
  ];
  return (
    <Pila
      paginas={paginas}
      accion={{ etiqueta: 'listo', hacer: onListo }}
      ultimo={ultimo}
      guion={guion}
      inicial={inicial}
      sinLados="La sesión ya terminó: no hay Controles ni Ahora suena; la corona recorre el resumen"
      onLog={onLog}
    />
  );
}
