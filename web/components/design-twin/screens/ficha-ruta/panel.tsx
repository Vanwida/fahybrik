'use client';

// LA RUTA — el contenido de UN bloque, con la forma que le toca a su formato.
//
// Aquí cabe más aire que en la hoja porque en pantalla solo hay un bloque. La regla de densidad: un movimiento que es TODO el bloque se
// enseña en grande (tarjeta: su dosis, sus series una a una); VARIOS van en filas, para verlos todos de una vez sin scrollear una pantalla
// entera. Un EMOM se dibuja como lo que es (una pista de minutos que alternan); una simulación, como un recorrido (estaciones en un raíl
// con la carrera entre una y otra); unas series de pista, como su forma; varias piezas una detrás de otra, numeradas.

import { fuente, TAM } from '../../kit-dia/tokens';
import type { Bloque, Movimiento } from '../../kit-ficha/contrato';
import { explicacionDeFormato, materialDeBloques, sinDosis } from '../../kit-ficha/modelo';
import { Material } from '../../kit-ficha/piezas';
import { Lista } from './filas';
import { Pareja, PistaEmom, Recorrido, Reloj } from './formas';
import { Continua, Forma, TarjetaEjercicio } from './tarjetas';

export function Panel({ b, unaPieza = false, onAbrir }: { b: Bloque; unaPieza?: boolean; onAbrir: (m: Movimiento) => void }) {
  const explica = explicacionDeFormato(b);
  const material = b.rol === 'principal' ? materialDeBloques([b]) : [];
  const huecos = sinDosis(b);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {explica ? <p style={{ margin: 0, ...fuente(400, TAM.suelo, 1.4), color: 'var(--twin-muted)' }}>{explica}</p> : null}
      {b.nota ? (
        <p
          style={{
            margin: 0,
            padding: '2px 0 2px 12px',
            borderLeft: '3px solid var(--twin-accent)',
            ...fuente(400, TAM.cuerpo, 1.4),
            color: 'var(--twin-fg)',
          }}
        >
          {b.nota}
        </p>
      ) : null}
      <Contenido b={b} onAbrir={onAbrir} />
      {huecos > 0 ? (
        <p style={{ margin: 0, ...fuente(400, TAM.suelo, 1.4), color: 'var(--twin-muted)' }}>
          {huecos === 1 ? 'A 1 movimiento' : `A ${huecos} movimientos`} tu coach aún no les ha puesto cuánto. Pregúntaselo antes de empezar.
        </p>
      ) : null}
      {material.length > 0 ? <Material cosas={material} titulo={unaPieza ? 'Prepara' : 'Para este bloque'} /> : null}
    </div>
  );
}

function Contenido({ b, onAbrir }: { b: Bloque; onAbrir: (m: Movimiento) => void }) {
  const f = b.formato;
  switch (f.tipo) {
    case 'estaciones':
      return <Recorrido b={b} carrera={f.carrera} onAbrir={onAbrir} />;
    case 'emom':
      return <PistaEmom b={b} minutos={f.minutos} alterna={f.alterna} onAbrir={onAbrir} />;
    case 'amrap':
      return (
        <>
          <Reloj grande={`${f.minutos}:00`} etiqueta="AMRAP" />
          <Lista b={b} onAbrir={onAbrir} />
        </>
      );
    case 'fortime':
      return (
        <>
          <Reloj grande={f.rondas ? `${f.rondas} rondas` : 'For Time'} etiqueta={f.topeMin ? `Tope ${f.topeMin} min` : 'Sin tope'} />
          <Lista b={b} onAbrir={onAbrir} />
        </>
      );
    case 'superserie':
      return <Pareja b={b} rondas={f.rondas} descanso={f.descanso} onAbrir={onAbrir} />;
    case 'intervalos':
      return <Intervalos b={b} onAbrir={onAbrir} />;
    case 'continuo':
      return <>{b.movimientos.map((m) => <Continua key={m.id} m={m} />)}</>;
    case 'secuencia':
      return <Lista b={b} estilo="numerada" onAbrir={onAbrir} />;
    case 'marco':
      return <Lista b={b} estilo="compacta" />;
    case 'series':
      return b.movimientos.length === 1 ? <TarjetaEjercicio m={b.movimientos[0]} onAbrir={onAbrir} /> : <Lista b={b} onAbrir={onAbrir} />;
  }
}

/** La forma de cada movimiento con perfil; los que van seguidos y no lo tienen, juntos y en filas (o en grande si son lo único del bloque). */
function Intervalos({ b, onAbrir }: { b: Bloque; onAbrir: (m: Movimiento) => void }) {
  const tandas: Movimiento[][] = [];
  for (const m of b.movimientos) {
    const ultima = tandas[tandas.length - 1];
    if (!m.perfil && ultima && !ultima[0].perfil) ultima.push(m);
    else tandas.push([m]);
  }
  return (
    <>
      {tandas.map((tanda) =>
        tanda[0].perfil ? (
          <Forma key={tanda[0].id} m={tanda[0]} />
        ) : b.movimientos.length === 1 ? (
          <TarjetaEjercicio key={tanda[0].id} m={tanda[0]} onAbrir={onAbrir} />
        ) : (
          <Lista key={tanda[0].id} b={{ ...b, movimientos: tanda }} onAbrir={onAbrir} />
        ),
      )}
    </>
  );
}
