'use client';

// El descanso es una PANTALLA, no un hueco entre series.
//
// Cuando se cruza el hito cambia el sujeto: deja de mandar lo que te queda de
// distancia y manda la cuenta atrás. Y con ella entra lo único que se mira de
// verdad descansando: cuánto te baja el pulso, y qué viene después. Las piezas
// viven aquí porque las usan igual las series de calle y las de cinta: es el
// mismo estado con otra máquina delante.

import { Card, Label, Mono, SP } from '../../kit';
import { BandaZona, Cifra, Drenaje } from './atoms';
import { fmtClock } from '../../sim';
import { type Foto, type Zona } from './guion';
import { quedanSegundos } from './formato';

/** El sujeto: lo que queda de descanso, drenando igual que drenan los metros. */
export function SujetoDescanso({ horizontal, foto }: { horizontal: boolean; foto: Foto }) {
  const quedan = quedanSegundos(foto.tramo, foto.tTramo);
  const total = foto.tramo.segundos ?? 1;
  return (
    <div style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SP.m }}>
      <Label size={10}>Descanso</Label>
      <Cifra horizontal={horizontal} tono="var(--twin-fg)">
        {fmtClock(quedan)}
      </Cifra>
      <Drenaje fraccion={foto.tTramo / total} tono="var(--twin-info)" />
    </div>
  );
}

/**
 * El pulso bajando, con su zona. Es el dato del descanso: mientras el número
 * cae y la banda retrocede de Z4 a Z2, sabes si vas a llegar a la siguiente.
 * Sin reloj conectado no hay pulso y no se pinta nada de esto (§7).
 */
export function PulsoQueBaja({ horizontal, ppm, zona }: { horizontal: boolean; ppm: number | null; zona: Zona | null }) {
  if (ppm === null || zona === null) return null;
  return (
    <Card padding={SP.m}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: SP.s }}>
          <Label size={10}>Tu pulso</Label>
          <span style={{ flex: 1 }} />
          <Cifra horizontal={horizontal} escala="media" tono={`var(--twin-z${zona})`} unidad="ppm">
            {ppm}
          </Cifra>
        </div>
        <BandaZona zona={zona} alto={8} />
      </div>
    </Card>
  );
}

/** Qué viene después, con su objetivo. Se lee de un vistazo y ya sabes a qué sales. */
export function Siguiente({ titulo, objetivo }: { titulo: string; objetivo: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: SP.s,
        padding: `${SP.s}px ${SP.m}px`,
        borderRadius: 10,
        border: '1px solid color-mix(in srgb, var(--twin-accent-text) 35%, transparent)',
        background: 'color-mix(in srgb, var(--twin-accent) 10%, transparent)',
      }}
    >
      <Label size={10} color="var(--twin-accent-text)">
        Sigue
      </Label>
      <span style={{ font: '600 14px/1.2 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{titulo}</span>
      <span style={{ flex: 1 }} />
      <Mono size={13} color="var(--twin-fg)">
        {objetivo}
      </Mono>
    </div>
  );
}
