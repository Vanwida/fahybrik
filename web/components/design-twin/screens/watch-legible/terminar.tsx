'use client';

// (4) Terminar, al alcance — sólo cuando se pierde el teléfono, con
// confirmación de intención.
//
// En modo espejo (el motor va en el iPhone, la mayoría de las sesiones) el
// reloj NO ofrece «terminar»: cortar antes de tiempo obliga a sacar el móvil.
// En cuanto se pierde la conexión, sí — y entonces, y sólo entonces, aparece
// un control pequeño y alcanzable con el pulgar, nunca un botón grande que
// compita con el entreno que sigue en marcha.
//
// Guardar y descartar NUNCA van pegados (Strava documentó el fallo
// contrario). Descartar, además, pide una segunda confirmación — perder un
// entreno entero por un toque de más no se deshace.

import { useState } from 'react';
import { useTicker } from '../../sim';
import { countdown } from '../watch-live/format';
import { W } from '../watch-live/theme';
import { AccionBanda, BotonAncho, Contexto, Cuerpo, Lienzo, Numeral, SegundoNivel } from './atomos';

type Paso = 'entrena' | 'elegir' | 'confirmar' | 'guardado';

export function Terminar({ onLog }: { onLog: (linea: string) => void }) {
  const [paso, setPaso] = useState<Paso>('entrena');
  const [restanteS, setRestanteS] = useState(90);
  useTicker(paso === 'entrena', (s) => setRestanteS(Math.max(0, 90 - s)));

  if (paso === 'elegir') return <PaginaElegir onGuardar={() => ir(setPaso, onLog, 'guardado', 'Entreno guardado')} onDescartar={() => ir(setPaso, onLog, 'confirmar', 'Pide confirmación de descarte')} />;
  if (paso === 'confirmar')
    return (
      <PaginaConfirmar
        onDescartar={() => ir(setPaso, onLog, 'entrena', 'Descartado — vuelve al entreno de ejemplo')}
        onVolver={() => ir(setPaso, onLog, 'elegir', 'No, sigue en pie')}
      />
    );
  if (paso === 'guardado') return <PaginaGuardado />;

  return (
    <Lienzo>
      <Contexto escala="nuevo">Descanso</Contexto>
      <span style={{ flex: 1 }} />
      <Numeral escala="nuevo" texto={countdown(restanteS)} urgente={restanteS <= 3} />
      <span style={{ flex: 1 }} />
      <SegundoNivel escala="nuevo" etiqueta="Luego" valor="4ª serie" />
      {/* 44×44, arriba a la derecha: alcanzable con el pulgar, y sólo existe
          porque el teléfono no responde — no es la oferta normal. */}
      <button
        type="button"
        onClick={() => ir(setPaso, onLog, 'elegir', 'Sin conexión con el teléfono → Terminar disponible')}
        aria-label="Terminar entreno"
        style={{
          position: 'absolute',
          top: 8,
          right: 6,
          width: 44,
          height: 44,
          borderRadius: 22,
          border: '1.5px solid rgba(255,255,255,0.22)',
          background: 'rgba(20,20,20,0.7)',
          color: W.dim,
          fontSize: 16,
          fontWeight: 800,
          letterSpacing: 0.3,
          textTransform: 'uppercase',
          cursor: 'pointer',
        }}
      >
        Fin
      </button>
      <AccionBanda escala="nuevo">Sin teléfono</AccionBanda>
    </Lienzo>
  );
}

function ir(setPaso: (p: Paso) => void, onLog: (l: string) => void, destino: Paso, log: string) {
  setPaso(destino);
  onLog(log);
}

function PaginaElegir({ onGuardar, onDescartar }: { onGuardar: () => void; onDescartar: () => void }) {
  return (
    <Lienzo>
      <Contexto escala="nuevo">Terminar</Contexto>
      <span style={{ flex: 1 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
        <BotonAncho escala="nuevo" tono="naranja" onClick={onGuardar}>
          Guardar
        </BotonAncho>
      </div>
      {/* El hueco es la confirmación de intención: descartar no está a un
          dedo de guardar, hay que buscarlo. */}
      <span style={{ flex: 1, minHeight: 22 }} />
      <div style={{ width: '100%' }}>
        <BotonAncho escala="nuevo" tono="peligro" onClick={onDescartar}>
          Descartar
        </BotonAncho>
      </div>
      <span style={{ flex: 1 }} />
    </Lienzo>
  );
}

function PaginaConfirmar({ onDescartar, onVolver }: { onDescartar: () => void; onVolver: () => void }) {
  return (
    <Lienzo>
      <Contexto escala="nuevo">¿Descartar?</Contexto>
      <span style={{ flex: 1 }} />
      <Cuerpo escala="nuevo">Se borra todo lo corrido. No se puede deshacer.</Cuerpo>
      <span style={{ flex: 1 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
        <BotonAncho escala="nuevo" tono="peligro" onClick={onDescartar}>
          Sí, descartar
        </BotonAncho>
        <BotonAncho escala="nuevo" tono="neutro" onClick={onVolver}>
          No, seguir
        </BotonAncho>
      </div>
    </Lienzo>
  );
}

function PaginaGuardado() {
  return (
    <Lienzo>
      <span style={{ flex: 1 }} />
      <Contexto escala="nuevo">Guardado</Contexto>
      <Cuerpo escala="nuevo">Fuerza · 90 min · 4 series</Cuerpo>
      <span style={{ flex: 1 }} />
    </Lienzo>
  );
}
