'use client';

// LA PUERTA DE CONEXIÓN — primero se conecta, se acepta TU máquina, y solo
// entonces empieza la pieza. Espejo de `ios/FAHYBRIK/Workout/ErgPreStartFlow.swift`
// (+ `PM5LiveStreamView` y `PM5ConnectGuide`).
//
// Por qué es una pantalla y no un botón que muta: probando el remo, Alex lo dijo
// tal cual — «primero hay una pantalla de conectarse, se acepta la conexión, y
// una vez se conecta se empieza. No podemos empezar todo a la vez».
//
// Y lo que pasa DESPUÉS de aceptar es la mitad que faltaba en esta familia: la
// app le manda la pieza al monitor. Un 5×500 con descanso se programa como
// intervalos nativos de distancia (el monitor corre trabajo y descanso él
// mismo), y el objetivo de ritmo viaja con ella como marcapasos. Si el monitor
// traía una pieza a medias, se resetea antes: por eso los metros que enseña al
// conectar no son los tuyos todavía.

import { useState } from 'react';
import { Card, CTA, Hairline, IconChevron, IconClose, Label, Mono, RAD, SP, Spinner } from '../../kit';
import { useTimeline } from '../../sim';
import { Aviso } from './atomos';
import { BannerPrograma } from './estados';
import {
  MAQUINA_NOMBRE,
  MENU_DIANA,
  MENU_MONITOR,
  MONITOR,
  PRESCRIPCION,
  dosisDePrescripcion,
  objetivoTexto,
} from './data';

type Paso = 'buscando' | 'encontrado' | 'conectando' | 'conectado' | 'programando' | 'listo';

const TIEMPOS = { escaneoMs: 2200, enlaceMs: 700, reseteoMs: 1500 } as const;

export function PuertaConexion({ onLog }: { onLog: (linea: string) => void }) {
  const [paso, setPaso] = useState<Paso>('buscando');
  const pres = PRESCRIPCION.remo;
  const maquina = MAQUINA_NOMBRE.remo;

  useTimeline([
    {
      at: TIEMPOS.escaneoMs,
      run: () => {
        setPaso('encontrado');
        onLog(`aparece un remo cerca: ID ${MONITOR.serial}`);
      },
    },
  ]);

  useTimeline(
    [
      {
        at: TIEMPOS.enlaceMs,
        run: () => {
          setPaso('conectado');
          onLog(`enlazado con el remo ${MONITOR.serial}: traía ${MONITOR.metrosSucios} m de una pieza a medias`);
        },
      },
    ],
    paso === 'conectando',
  );

  useTimeline(
    [
      {
        at: TIEMPOS.reseteoMs,
        run: () => {
          setPaso('listo');
          onLog(`pieza enviada: ${dosisDePrescripcion(pres)} con descanso, y tu ritmo objetivo de marcapasos`);
        },
      },
    ],
    paso === 'programando',
  );

  const conectado = paso === 'conectado' || paso === 'programando' || paso === 'listo';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Cabecera maquina={maquina} titulo={pres.titulo} onCancelar={() => onLog('cancelas la conexión')} />

      <div
        className="twin-scroll"
        style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: SP.m, padding: SP.l }}
      >
        {conectado ? (
          <CuerpoConectado paso={paso} pres={pres} />
        ) : (
          <CuerpoBuscando paso={paso} onTocar={() => setPaso('conectando')} />
        )}
        {/* El alto que sobra mientras se escanea NO se deja muerto: se convierte
            en el sujeto (§6.1, `previsualiza`). Lo que vas a hacer es justo lo
            que hay que confirmar antes de sentarse en la máquina. */}
        {!conectado && (
          <>
            <span style={{ flex: 1 }} />
            <LoQueVasAHacer pres={pres} />
          </>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s, padding: `0 ${SP.l}px ${SP.s}px` }}>
        {paso === 'conectado' && (
          <CTA
            title="USAR ESTE REMO"
            onClick={() => {
              setPaso('programando');
              onLog('aceptas este remo: la app resetea lo que traía y le manda tu pieza');
            }}
          />
        )}
        {paso === 'listo' && (
          <CTA title="EMPEZAR" onClick={() => onLog('empieza el tramo: el crono espera a que el remo se mueva')} />
        )}
        {/* El escape honesto de una sesión normal. Un benchmark JAMÁS lo ofrece:
            una marca que la app no midió no existe. */}
        {!conectado && (
          <button
            type="button"
            onClick={() => onLog('empiezas sin monitor: la app no medirá metros, los apuntas tú')}
            style={{
              height: 40,
              border: 0,
              background: 'transparent',
              color: 'var(--twin-muted)',
              font: '500 13px/1.2 var(--twin-font-sans)',
              cursor: 'pointer',
            }}
          >
            Empezar sin monitor · lo apuntas tú
          </button>
        )}
      </div>
    </div>
  );
}

function Cabecera({ maquina, titulo, onCancelar }: { maquina: string; titulo: string; onCancelar: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: `${SP.m}px ${SP.l}px 0`, flex: '0 0 auto' }}>
      <button
        type="button"
        onClick={onCancelar}
        aria-label="Cancelar"
        style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          background: 'var(--twin-surface)',
          border: 0,
          color: 'var(--twin-muted)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          flex: '0 0 auto',
        }}
      >
        <IconClose size={16} />
      </button>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
        <span style={{ font: 'italic 700 20px/1.2 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
          Conecta {maquina}
        </span>
        <span style={{ font: '500 12px/1.2 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>{titulo}</span>
      </div>
      <span style={{ width: 40, flex: '0 0 auto' }} />
    </div>
  );
}

function CuerpoBuscando({ paso, onTocar }: { paso: Paso; onTocar: () => void }) {
  const buscando = paso === 'buscando';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SP.m }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SP.s }}>
        <span style={{ color: 'var(--twin-accent)', display: 'inline-flex' }}>
          <Spinner size={14} />
        </span>
        <span style={{ font: '500 13px/1.3 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
          {paso === 'conectando' ? 'Conectando' : 'Buscando remos cerca'}
        </span>
      </div>

      {buscando ? (
        <>
          <span style={{ font: '500 13px/1.4 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
            Asegúrate de que el monitor está encendido y en su pantalla principal.
          </span>
          <GuiaMonitor />
        </>
      ) : (
        <>
          <FilaErg onClick={onTocar} />
          {/* La ayuda no desaparece a mitad de flujo: el que no encuentra su
              remo en la lista la necesita justo aquí. */}
          <GuiaPlegada />
        </>
      )}
    </div>
  );
}

/** La fila del remo descubierto: el ID que enseña su propia pantalla. */
function FilaErg({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Remo ID ${MONITOR.serial}, toca para conectar`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: SP.m,
        width: '100%',
        padding: SP.m,
        borderRadius: RAD.m,
        background: 'var(--twin-surface)',
        border: 0,
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <span
        style={{
          width: 38,
          height: 38,
          borderRadius: '50%',
          background: 'var(--twin-surface-sunken)',
          color: 'var(--twin-accent-text)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: '0 0 auto',
          font: '800 13px/1 var(--twin-font-mono)',
        }}
      >
        ID
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ font: '600 16px/1.2 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
          {MONITOR.serial}
        </span>
        <span style={{ font: '500 12px/1.2 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
          Toca para conectar
        </span>
      </span>
      <span style={{ flex: 1 }} />
      <span style={{ color: 'var(--twin-muted)', display: 'inline-flex' }}>
        <IconChevron />
      </span>
    </button>
  );
}

function CuerpoConectado({ paso, pres }: { paso: Paso; pres: (typeof PRESCRIPCION)['remo'] }) {
  const objetivo = objetivoTexto(pres);
  const sucio = paso === 'conectado';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SP.m }}>
      <Card padding={SP.m}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: SP.s }}>
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--twin-ok)' }} />
            <span style={{ font: '600 16px/1.2 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
              Remo {MONITOR.serial}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <Pastilla etiqueta="vatios" valor={sucio ? null : 0} />
            <Pastilla etiqueta="paladas" valor={sucio ? null : 0} />
            <Pastilla etiqueta="metros" valor={sucio ? MONITOR.metrosSucios : 0} />
          </div>
        </div>
      </Card>

      {sucio && (
        <Aviso
          tono="alerta"
          texto={`Este remo traía ${MONITOR.metrosSucios} m de una pieza a medias. Al aceptarlo se pone a cero y se le manda la tuya.`}
        />
      )}

      {paso === 'programando' && <BannerPrograma estado="enviando" />}
      {paso === 'listo' && <BannerPrograma estado="listo" />}

      {paso !== 'conectado' && (
        <Card padding={SP.m}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Label size={10}>Lo que corre el monitor</Label>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span className="t-readout-s">{dosisDePrescripcion(pres)}</span>
              {pres.descansoS != null && (
                <Mono size={12} color="var(--twin-muted)">con su descanso</Mono>
              )}
            </div>
            <Hairline />
            <span style={{ font: '500 12px/1.4 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
              {objetivo
                ? `El monitor lleva las series y el descanso él mismo, y tu objetivo de ${objetivo} viaja con la pieza como marcapasos. La cuenta de series la lleva la app.`
                : 'El monitor corre la pieza y la app lleva la cuenta de las series.'}
            </span>
          </div>
        </Card>
      )}

      <GuiaPlegada />
    </div>
  );
}

/** Lo que estás a punto de empezar, mientras la app busca la máquina. */
function LoQueVasAHacer({ pres }: { pres: (typeof PRESCRIPCION)['remo'] }) {
  const objetivo = objetivoTexto(pres);
  return (
    <Card padding={SP.m} leftAccent>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Label size={10}>Lo que vas a hacer</Label>
        <span className="t-headline-m">{pres.titulo}</span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <Mono size={15} weight={800}>{dosisDePrescripcion(pres)}</Mono>
          {objetivo && (
            <Mono size={14} weight={700} color="var(--twin-accent-text)">a {objetivo}</Mono>
          )}
          {pres.descansoS != null && (
            <Mono size={13} color="var(--twin-muted)">
              descanso {Math.floor(pres.descansoS / 60)}:{String(pres.descansoS % 60).padStart(2, '0')}
            </Mono>
          )}
        </div>
      </div>
    </Card>
  );
}

function Pastilla({ etiqueta, valor }: { etiqueta: string; valor: number | null }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
        padding: '8px 0',
        borderRadius: RAD.s,
        background: 'var(--twin-surface-sunken)',
      }}
    >
      {/* Sin lectura todavía no se pinta un cero que parezca medida (§7). */}
      {valor != null && <span className="t-readout-s">{valor}</span>}
      <Label size={9}>{etiqueta}</Label>
    </div>
  );
}

/** El menú del monitor DIBUJADO, con «Connect» señalado. */
function GuiaMonitor() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SP.m }}>
      <div
        style={{
          width: 232,
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 5,
          borderRadius: 14,
          background: 'var(--twin-surface-sunken)',
          border: '1px solid var(--twin-hairline-strong)',
        }}
      >
        <span style={{ font: '600 9px/1.2 var(--twin-font-mono)', color: 'var(--twin-muted)', textAlign: 'center' }}>
          Main Menu
        </span>
        {MENU_MONITOR.map((fila) => {
          const diana = fila === MENU_DIANA;
          return (
            <div
              key={fila}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                height: 24,
                padding: '0 10px',
                borderRadius: 7,
                background: diana ? 'color-mix(in srgb, var(--twin-accent) 14%, transparent)' : 'transparent',
                border: `${diana ? 1.5 : 1}px solid ${diana ? 'var(--twin-accent)' : 'var(--twin-hairline)'}`,
              }}
            >
              {diana && <span style={{ color: 'var(--twin-accent)', font: '800 9px/1 var(--twin-font-sans)' }}>▶</span>}
              <Mono size={11} weight={diana ? 800 : 500} color={diana ? 'var(--twin-accent-text)' : 'var(--twin-fg)'}>
                {fila}
              </Mono>
            </div>
          );
        })}
      </div>
      <span style={{ font: '500 13px/1.4 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
        En el monitor, pulsa «Connect» para que se deje ver. Luego toca tu remo en la lista: el número es el ID que
        sale en su pantalla.
      </span>
    </div>
  );
}

/** La ayuda plegada: nunca desaparece a mitad de flujo. */
function GuiaPlegada() {
  const [abierta, setAbierta] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s }}>
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'transparent',
          border: 0,
          padding: 0,
          cursor: 'pointer',
          color: 'var(--twin-muted)',
        }}
      >
        <Label size={10}>Cómo conectar</Label>
        <span style={{ display: 'inline-flex', transform: abierta ? 'rotate(90deg)' : undefined }}>
          <IconChevron size={12} />
        </span>
      </button>
      {abierta && <GuiaMonitor />}
    </div>
  );
}
