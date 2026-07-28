'use client';

// Garmin: la pantalla que desatasca el muro real (GarminSetupView).
//
// El atleta instala nuestra app en el reloj y esta le pide identificarse, pero
// en un reloj NO HAY TECLADO: eso se escribe en Garmin Connect, tres niveles
// hacia dentro. Como aquí YA está identificado, le damos el código en pantalla y
// quedan dos pasos. Todo se copia de un toque porque el email puede ser el de
// «ocultar mi correo» de Apple y una errata no da un error claro: da un código
// que no valida.

import { useState } from 'react';
import { useTimeline } from '../../sim';
import { Glyph } from './glyphs';
import { Card, LabelText, NavBar, Spinner } from './atoms';
import { GARMIN_PAIR, R, SP } from './tokens';

const PASOS_INSTALAR = ['Abre Garmin Connect', 'Abajo a la derecha, Más', 'Tienda Connect IQ', 'Busca FAHYBRID e instálala'];
const PASOS_AJUSTES = [
  'Abajo a la derecha, Más',
  'Dispositivos Garmin',
  'Toca tu reloj',
  'Actividades y aplicaciones',
  'FAHYBRID',
  'Ajustes',
];

export function GarminSetup({ onBack, onLog }: { onBack: () => void; onLog: (linea: string) => void }) {
  const [pidiendo, setPidiendo] = useState(false);
  const [emitido, setEmitido] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);

  // El código se PIDE, no se muestra solo: pedirlo invalida el anterior, así que
  // emitirlo al abrir dejaría muerto el que el atleta ya tuviera escrito a medias.
  useTimeline(
    [
      {
        at: 700,
        run: () => {
          setPidiendo(false);
          setEmitido(true);
          onLog('Código emitido · caduca en 10 min');
        },
      },
    ],
    pidiendo,
  );

  const copiar = (valor: string, que: string) => {
    setCopiado(valor);
    onLog(`Copiado: ${que}`);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <NavBar title="Garmin" onBack={onBack} />
      <div className="twin-scroll" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: SP.l, padding: SP.l }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: SP.xs }}>
          <div className="t-headline-m">Tu entreno, en el reloj</div>
          <div className="t-small" style={{ color: 'var(--twin-muted)' }}>
            El plan te sale en el reloj y lo guía Garmin, con sus ritmos y sus avisos. Se configura una vez.
          </div>
        </div>

        <Paso numero={1} titulo="Instala FAHYBRID en tu reloj">
          <div style={{ display: 'flex', flexDirection: 'column', gap: SP.xs }}>
            <span className="t-small" style={{ color: 'var(--twin-muted)' }}>
              Se hace desde la app de Garmin en tu móvil, no desde el reloj.
            </span>
            <RutaDeToques pasos={PASOS_INSTALAR} />
          </div>
        </Paso>

        <Paso numero={2} titulo="Copia esto en los ajustes de la app">
          <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s }}>
            <span className="t-small">Otra vez en Garmin Connect, esta vez a los ajustes de nuestra app:</span>
            <RutaDeToques pasos={PASOS_AJUSTES} />
            <span className="t-small">Ahí pega tu email y el código. Dale a Guardar.</span>

            {emitido && (
              <>
                <CampoCopiable
                  label="Tu email"
                  valor={GARMIN_PAIR.email}
                  copiado={copiado === GARMIN_PAIR.email}
                  onCopiar={() => copiar(GARMIN_PAIR.email, 'email')}
                />
                <CampoCopiable
                  label="Código"
                  valor={GARMIN_PAIR.code}
                  mono
                  copiado={copiado === GARMIN_PAIR.code}
                  onCopiar={() => copiar(GARMIN_PAIR.code, 'código')}
                />
                <span className="t-small" style={{ color: 'var(--twin-muted)' }}>
                  El código caduca en 10 minutos. Si se te pasa, pide otro.
                </span>
              </>
            )}

            <button
              type="button"
              disabled={pidiendo}
              onClick={() => {
                setPidiendo(true);
                setCopiado(null);
                onLog(emitido ? 'Pidiendo un código nuevo…' : 'Pidiendo email y código…');
              }}
              style={{
                all: 'unset',
                cursor: pidiendo ? 'default' : 'pointer',
                alignSelf: 'flex-start',
                display: 'inline-flex',
                alignItems: 'center',
                gap: SP.s,
                padding: `10px ${SP.l}px`,
                borderRadius: 9999,
                background: 'var(--twin-accent)',
                color: 'var(--twin-accent-on)',
                font: 'italic 800 14px/1 var(--twin-font-sans)',
              }}
            >
              {pidiendo && <Spinner size={13} color="var(--twin-accent-on)" />}
              {emitido ? 'Pedir un código nuevo' : 'Ver mi email y mi código'}
            </button>
          </div>
        </Paso>

        <Nota
          titulo="¿Cómo sé que ha funcionado?"
          texto="Abre FAHYBRID en el reloj. Si ya no te pide el email, estás dentro: verás el entreno de hoy. Los ajustes tardan unos segundos en llegarle al reloj, así que si aún te lo pide, espera un poco y vuelve a entrar."
        />
        <Nota
          titulo="Al empezar, el reloj te preguntará dos veces"
          texto="Primero si quieres salir de FAHYBRID, y después con qué perfil correr. Elige Correr: a partir de ahí te guía Garmin. Es cosa suya, no un fallo."
        />

        {/* Honestidad de estado: la app del reloj está construida y probada, pero
            aún no publicada. Sin decirlo, el atleta la busca, no la encuentra, y
            piensa que el fallo es suyo. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: SP.xs }}>
          <LabelText text="Todavía no está en la tienda" />
          <span className="t-small" style={{ color: 'var(--twin-muted)' }}>
            La app del reloj está lista y la estamos probando. Te avisamos en cuanto se pueda instalar.
          </span>
        </div>
      </div>
    </div>
  );
}

/** Un paso numerado: el número en su columna para que el contenido crezca recto. */
function Paso({ numero, titulo, children }: { numero: number; titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: SP.m }}>
      <span
        style={{
          width: 22,
          height: 22,
          flex: 'none',
          borderRadius: 9999,
          background: 'var(--twin-accent)',
          color: 'var(--twin-accent-on)',
          font: '800 12px/1 var(--twin-font-sans)',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {numero}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: SP.xs, flex: 1, minWidth: 0 }}>
        <span className="t-body-emph">{titulo}</span>
        {children}
      </div>
    </div>
  );
}

/**
 * Una ruta de toques dentro de OTRA app: cada línea es una pantalla, en orden,
 * con el nombre literal del botón. Un «Connect IQ › Ajustes» no se puede seguir
 * si no sabes por dónde se empieza.
 */
function RutaDeToques({ pasos }: { pasos: string[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, paddingLeft: 2 }}>
      {pasos.map((paso, i) => (
        <div key={paso + String(i)} style={{ display: 'flex', alignItems: 'flex-start', gap: SP.s }}>
          <span style={{ paddingTop: 3 }}>
            <Glyph name="chevron.right" size={9} color="var(--twin-accent-text)" weight={3} />
          </span>
          <span className="t-small">{paso}</span>
        </div>
      ))}
    </div>
  );
}

/** Un valor que se copia de un toque. Toda la fila es el objetivo, no un icono. */
function CampoCopiable({
  label,
  valor,
  mono = false,
  copiado,
  onCopiar,
}: {
  label: string;
  valor: string;
  mono?: boolean;
  copiado: boolean;
  onCopiar: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onCopiar}
      aria-label={`${label}: ${valor}. Tocar para copiar.`}
      style={{
        all: 'unset',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: SP.s,
        padding: SP.m,
        background: 'var(--twin-surface-sunken)',
        borderRadius: R.m,
      }}
    >
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
        <LabelText text={label} />
        <span
          style={{
            font: mono
              ? '700 20px/1.2 var(--twin-font-mono)'
              : '600 14px/1.3 var(--twin-font-sans)',
            color: 'var(--twin-fg)',
            overflowWrap: 'anywhere',
          }}
        >
          {valor}
        </span>
      </span>
      <Glyph
        name={copiado ? 'checkmark' : 'doc.on.doc'}
        size={13}
        color={copiado ? 'var(--twin-ok)' : 'var(--twin-accent-text)'}
        weight={2.2}
      />
    </button>
  );
}

function Nota({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: SP.xs }}>
        <span className="t-body-emph">{titulo}</span>
        <span className="t-small" style={{ color: 'var(--twin-muted)' }}>
          {texto}
        </span>
      </div>
    </Card>
  );
}
