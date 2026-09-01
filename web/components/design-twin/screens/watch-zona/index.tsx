'use client';

// La zona como sujeto, en la muñeca. Ver `guion.ts` para el porqué de que sea
// otra página y no otra manera de pintar el pulso.

import { useState } from 'react';
import { resolveHrZones, hrZonePosition } from '@fahybrid/shared/domain/methodology';
import { useTicker } from '../../sim';
import { Reloj, paginaPulso } from '../../kit-watch';
import { W } from '../watch-live/theme';
import { ANCLA_MEDIDA, SIN_ANCLA, rampa } from '../../datos-reloj';
import type { Ancla, PaginaReloj, Zona } from '../../kit-watch/modelo';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { capasDelLienzo, paginaZona, type Posicion } from './guion';

export const meta: TwinMeta = {
  id: 'watch-zona',
  titulo: 'Muñeca · la zona como sujeto',
  zona: 'Entreno en vivo',
  estado: 'propuesta',
  actualizado: '2026-08-09',
  descripcion:
    'La zona en grande y el lienzo llenándose de su color conforme te acercas a la siguiente. «Z3» a 145 y a 158 dice lo mismo, y uno de los dos está a un latido de Z4.',
  fuentes: [],
  enApp:
    'Hoy la zona sólo existe pequeña, dentro de la página de pulso, y el color del lienzo es un tinte al 38 % que no dice DÓNDE de la banda estás. El mecanismo (posición dentro de la banda) ya está en shared y en HRZoneProfile; falta la página.',
  dispositivo: 'watch',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'subiendo',
    titulo: 'Subiendo de Z2 a Z4',
    descripcion:
      'Una serie que arranca suave y aprieta. El relleno sube dentro de cada banda y su borde deriva hacia el hue de la siguiente; al cruzar, el lienzo cambia de color y el relleno vuelve abajo. El salto ES el aviso.',
  },
  {
    id: 'con-objetivo',
    titulo: 'Con objetivo prescrito',
    descripcion:
      'El coach pidió Z2 para el rodaje. La misma subida, pero ahora la pantalla la juzga: en cuanto te vas por encima lo dice, en dos palabras y sin sermón (el háptico ya avisa).',
  },
  {
    id: 'sin-umbral',
    titulo: 'Sin umbral',
    descripcion:
      'El 100 % de la base hoy. Sin ancla de FC no hay zona, y sin zona esta página NO EXISTE: el reloj se queda con el pulso en ppm crudos. No se insinúa un color sobre una banda que nadie ha medido.',
  },
];

/** El pulso del escenario: 128 → 172 ppm en tres minutos, y luego se sostiene. */
const DURACION_S = 180;
const FC_DESDE = 128;
const FC_HASTA = 172;

/** La zona que pide el coach en el escenario con objetivo. */
const OBJETIVO: Zona = 2;

function anclaDe(escenario: string): Ancla {
  return escenario === 'sin-umbral' ? SIN_ANCLA : ANCLA_MEDIDA;
}

/**
 * La posición dentro de la banda sale del MECANISMO COMPARTIDO, no de una copia
 * local: las bandas las pone el coach y esto sólo dice en qué punto de la suya
 * estás. Sin ancla, `resolveHrZones` devuelve null y aquí no hay nada que pintar.
 */
function posicionDe(bpm: number, ancla: Ancla): Posicion | null {
  if (ancla == null) return null;
  const zonas = resolveHrZones({ lthr_declared_bpm: ancla.ppm });
  if (!zonas) return null;
  const p = hrZonePosition(bpm, zonas);
  return p == null ? null : { zona: p.zone as Zona, fraccion: p.fraction, siguiente: (p.next ?? null) as Zona | null };
}

/** El lienzo: el relleno sube con tu posición y su borde deriva a la siguiente. */
function Lienzo({ posicion }: { posicion: Posicion | null }) {
  if (posicion == null) return <div style={{ position: 'absolute', inset: 0, background: W.bg }} />;
  const capas = capasDelLienzo(posicion);
  return (
    <div style={{ position: 'absolute', inset: 0, background: capas.fondo, overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          // El relleno nunca desaparece del todo: al entrar en una zona por
          // abajo tiene que verse QUÉ zona es, no un lienzo negro.
          height: `${Math.max(12, capas.alto * 100)}%`,
          background: `linear-gradient(to top, ${capas.desde}, ${capas.hasta})`,
          // Al 55 % el hue se lee a sangre y el numeral blanco sigue por encima
          // de 4.5:1 sobre él; a sangre pura, el texto se pierde en el ámbar.
          opacity: 0.55,
          transition: 'height 700ms ease, background 700ms ease',
        }}
      />
    </div>
  );
}

export function Screen({ escenario, onLog }: TwinScreenProps) {
  const [t, setT] = useState(0);
  const ancla = anclaDe(escenario);
  const bpm = rampa(FC_DESDE, FC_HASTA, t, DURACION_S);
  const posicion = posicionDe(bpm, ancla);
  const objetivo = escenario === 'con-objetivo' ? OBJETIVO : null;

  useTicker(true, () => setT((v) => (v + 3 > DURACION_S ? 0 : v + 3)));

  const paginas = [
    paginaZona({ posicion, bpm, objetivo }),
    paginaPulso({ bpm, ancla }),
  ].filter((p): p is PaginaReloj => p != null);

  return (
    <Reloj
      paginas={paginas}
      tinte={null}
      fondo={<Lienzo posicion={posicion} />}
      destello={{ n: posicion?.zona ?? 0, color: W.orangeSoft }}
      onLog={onLog}
    />
  );
}
