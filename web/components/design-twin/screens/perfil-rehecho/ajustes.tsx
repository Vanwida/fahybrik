'use client';

// AJUSTES — las seis puertas, al fondo. Un ajuste no es un sujeto.
//
// Cada puerta lleva su subtítulo REAL de Swift y, cuando la app sabe algo del
// atleta, lo que revela de estado en su lugar («Apple Salud y COROS conectados»,
// «Movimiento del reloj: retirado», «Dobles · con Biel»): la descripción de lo que
// hay dentro solo sobrevive cuando no hay nada mejor que decir (§6.2 bis).
//
// El COLOR de estado va en la marca (un punto), nunca en el texto. Permitir o
// retirar el movimiento del reloj es una decisión suya, no un fallo: su marca es
// neutra. Lo que pide al atleta (aviso o peligro) tiñe la fila y NUNCA se pliega.
//
// A la vista, las que se usan y las que dicen algo del atleta; plegadas con
// contador, las que no tienen nada que decir (`agruparPuertas`).

import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import { IcoChevron } from '../../kit-dia/iconos';
import { Pastilla, TituloSeccion } from '../../kit-dia/piezas';
import { fuente, RADIO, TABULAR, TAM, tinte, TOQUE, velo } from '../../kit-dia/tokens';
import type { LecturaPerfil } from '../../kit-perfil/contrato';
import {
  agruparPuertas,
  listaConY,
  puertasDe,
  type ClavePuerta,
  type Puerta,
  type TonoMarca,
} from '../../kit-perfil/decision';
import {
  IcoAjustes,
  IcoAyuda,
  IcoEntreno,
  IcoEscudo,
  IcoIdentidad,
  IcoReloj,
} from '../../kit-perfil/iconos';
import { Ficha, type TonoFicha } from './ficha';

const ICONO: Record<ClavePuerta, ReactNode> = {
  identidad: <IcoIdentidad tam={24} />,
  entreno: <IcoEntreno tam={24} />,
  dispositivos: <IcoReloj tam={24} />,
  cuenta: <IcoAjustes tam={24} />,
  privacidad: <IcoEscudo tam={24} />,
  ayuda: <IcoAyuda tam={24} />,
};

/** El color de la marca. Solo se usa en el punto y en el tinte de la fila: nunca en un texto. */
const COLOR_MARCA: Record<Exclude<TonoMarca, 'neutro'>, string> = {
  ok: 'var(--twin-ok)',
  aviso: 'var(--twin-warning)',
  peligro: 'var(--twin-danger)',
  invita: 'var(--twin-accent-text)',
};

const FICHA_DE: Partial<Record<TonoMarca, TonoFicha>> = { aviso: 'aviso', peligro: 'peligro' };

function Punto({ tono }: { tono: TonoMarca }) {
  if (tono === 'neutro') return null;
  return (
    <span
      aria-hidden
      style={{ width: 10, height: 10, borderRadius: '50%', background: COLOR_MARCA[tono], flex: '0 0 auto', marginTop: 5 }}
    />
  );
}

const estiloFila: CSSProperties = {
  width: '100%',
  minHeight: 76,
  padding: '12px 16px',
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  textAlign: 'left',
};

function FilaPuerta({ p, primera, onLog }: { p: Puerta; primera: boolean; onLog: (l: string) => void }) {
  const e = p.estado;
  const tono = e?.tono ?? 'neutro';
  const realce = p.atencion && e ? tinte(COLOR_MARCA[e.tono as Exclude<TonoMarca, 'neutro'>], 9, 'var(--twin-surface)') : 'transparent';
  return (
    <button
      type="button"
      className="hd-toque"
      onClick={() => onLog(`${p.titulo} → su pantalla`)}
      aria-label={`${p.titulo}. ${e ? e.texto : p.descripcion}`}
      style={{ ...estiloFila, borderTop: primera ? 'none' : '1px solid var(--twin-hairline)', background: realce }}
    >
      <Ficha tono={FICHA_DE[tono] ?? 'normal'}>{ICONO[p.clave]}</Ficha>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
        <span style={{ ...fuente(700, TAM.cuerpo, 1.25), color: 'var(--twin-fg)' }}>{p.titulo}</span>
        {e ? (
          <span style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <Punto tono={e.tono} />
            <span style={{ ...fuente(600, TAM.suelo, 1.3), color: 'var(--twin-fg)', textWrap: 'pretty', overflowWrap: 'anywhere', ...TABULAR }}>{e.texto}</span>
          </span>
        ) : (
          <span style={{ ...fuente(500, TAM.suelo, 1.3), color: 'var(--twin-muted)', textWrap: 'pretty' }}>{p.descripcion}</span>
        )}
      </span>
      <span aria-hidden style={{ color: 'var(--twin-muted)', display: 'inline-flex' }}>
        <IcoChevron tam={18} />
      </span>
    </button>
  );
}

export function Ajustes({ l, onLog }: { l: LecturaPerfil; onLog: (linea: string) => void }) {
  const { visibles, plegadas } = agruparPuertas(puertasDe(l));
  const [abierto, setAbierto] = useState(false);
  const id = useId();
  return (
    <section aria-label="Ajustes" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <TituloSeccion>Ajustes</TituloSeccion>
      <div
        style={{
          borderRadius: RADIO.tarjeta,
          background: 'var(--twin-surface)',
          border: '1px solid var(--twin-hairline)',
          overflow: 'hidden',
        }}
      >
        {visibles.map((p, i) => (
          <FilaPuerta key={p.clave} p={p} primera={i === 0} onLog={onLog} />
        ))}
        {plegadas.length > 0 ? (
          <>
            <div id={id} hidden={!abierto}>
              {plegadas.map((p) => (
                <FilaPuerta key={p.clave} p={p} primera={false} onLog={onLog} />
              ))}
            </div>
            <button
              type="button"
              className="hd-toque"
              aria-expanded={abierto}
              aria-controls={id}
              onClick={() => setAbierto((a) => !a)}
              style={{
                ...estiloFila,
                minHeight: TOQUE + 16,
                borderTop: '1px solid var(--twin-hairline)',
                background: velo('var(--twin-fg)', 3),
              }}
            >
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
                <span style={{ ...fuente(700, TAM.cuerpo, 1.25), color: 'var(--twin-accent-text)' }}>
                  {abierto ? 'Ver menos' : 'Más ajustes'}
                </span>
                {abierto ? null : (
                  <span style={{ ...fuente(500, TAM.suelo, 1.3), color: 'var(--twin-muted)' }}>
                    {listaConY(plegadas.map((p) => p.corto))}
                  </span>
                )}
              </span>
              {abierto ? null : (
                <Pastilla fondo={velo('var(--twin-fg)', 8)} tinta="var(--twin-fg)">
                  {plegadas.length}
                </Pastilla>
              )}
              <span
                aria-hidden
                style={{ color: 'var(--twin-accent-text)', display: 'inline-flex', transform: abierto ? 'rotate(-90deg)' : 'rotate(90deg)' }}
              >
                <IcoChevron tam={18} />
              </span>
            </button>
          </>
        ) : null}
      </div>
    </section>
  );
}
