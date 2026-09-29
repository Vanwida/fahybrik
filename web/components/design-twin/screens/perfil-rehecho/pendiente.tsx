'use client';

// «PENDIENTE» — lo que espera una respuesta suya, en UNA superficie.
//
// Es el equivalente de «Contigo» en Hoy, y la misma regla: se pinta lo que hay y
// nada más (sin nada pendiente no hay sección, ni un envoltorio vacío), en el
// orden en que CADUCA (`pendientesDe`), y solo entran ACTOS. Una suscripción que
// termina o una invitación enviada no reclaman nada: viven como estado en su
// puerta.
//
// La pregunta de COROS deja de ser un diálogo del sistema que salta al abrir
// Perfil: es la primera fila y se contesta ahí mismo, con sus tres respuestas a
// la vista. «Ahora no» no la borra del todo (Swift tampoco: se vuelve a
// preguntar la próxima vez que se abre Perfil), y lo dice.

import type { CSSProperties, ReactNode } from 'react';
import { IcoChevron } from '../../kit-dia/iconos';
import { Pastilla, TituloSeccion } from '../../kit-dia/piezas';
import { fuente, RADIO, TAM, TOQUE, tinte, velo } from '../../kit-dia/tokens';
import { type Pendiente } from '../../kit-perfil/decision';
import { IcoActividad, IcoInvitar, IcoTarjeta } from '../../kit-perfil/iconos';
import { Ficha } from './ficha';

export type RespuestaCoros = 'si' | 'no' | 'ahora-no';

interface Props {
  items: Pendiente[];
  onLog: (linea: string) => void;
  onCoros: (r: RespuestaCoros) => void;
}

const fila: CSSProperties = {
  width: '100%',
  minHeight: 72,
  padding: '12px 16px',
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  textAlign: 'left',
};

function Texto({ titulo, detalle }: { titulo: string; detalle: ReactNode }) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
      <span style={{ ...fuente(700, TAM.cuerpo, 1.25), color: 'var(--twin-fg)', textWrap: 'balance', overflowWrap: 'anywhere' }}>{titulo}</span>
      <span style={{ ...fuente(500, TAM.suelo, 1.3), color: 'var(--twin-muted)', textWrap: 'pretty' }}>{detalle}</span>
    </span>
  );
}

const flecha = (
  <span aria-hidden style={{ color: 'var(--twin-muted)', display: 'inline-flex' }}>
    <IcoChevron tam={18} />
  </span>
);

function BotonRespuesta({ onClick, children, variante }: { onClick: () => void; children: string; variante: 'tinta' | 'borde' | 'texto' }) {
  const base: CSSProperties = { ...fuente(800, TAM.cuerpo, 1, true), minHeight: TOQUE, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' };
  const estilo: CSSProperties =
    variante === 'tinta'
      ? { ...base, padding: '0 26px', borderRadius: RADIO.pastilla, background: 'var(--twin-fg)', color: 'var(--twin-bg)' }
      : variante === 'borde'
        ? { ...base, padding: '0 24px', borderRadius: RADIO.pastilla, border: '1.5px solid var(--twin-fg)', color: 'var(--twin-fg)' }
        : { ...base, padding: '0 8px', color: 'var(--twin-fg)', textDecoration: 'underline', textUnderlineOffset: 4, fontStyle: 'normal', fontWeight: 700 };
  return (
    <button type="button" className="hd-toque" onClick={onClick} style={{ ...estilo, width: 'auto' }}>
      {children}
    </button>
  );
}

/** La pregunta de COROS, con sus tres respuestas dentro de la propia fila. */
function FilaCoros({ inicio, onCoros }: { inicio: string | null; onCoros: Props['onCoros'] }) {
  return (
    <div
      role="group"
      aria-label="¿Esto es el entreno?"
      style={{
        ...fila,
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: 14,
        padding: '16px 16px 12px',
        background: tinte('var(--twin-accent)', 10, 'var(--twin-surface)'),
      }}
    >
      <span style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <Ficha tono="realce">
          <IcoActividad tam={24} />
        </Ficha>
        <Texto
          titulo="¿Esto es el entreno?"
          detalle={`Hay un entreno previsto hoy y una actividad nueva en COROS${inicio ? `, de las ${inicio}` : ''}. Si dices que no, la actividad queda en el historial y el plan no se toca.`}
        />
      </span>
      <span style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <BotonRespuesta variante="tinta" onClick={() => onCoros('si')}>
          Sí
        </BotonRespuesta>
        <BotonRespuesta variante="borde" onClick={() => onCoros('no')}>
          No
        </BotonRespuesta>
        <BotonRespuesta variante="texto" onClick={() => onCoros('ahora-no')}>
          Ahora no
        </BotonRespuesta>
      </span>
    </div>
  );
}

function FilaBoton({
  icono,
  titulo,
  detalle,
  etiqueta,
  onClick,
}: {
  icono: ReactNode;
  titulo: string;
  detalle: string;
  etiqueta: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="hd-toque" onClick={onClick} aria-label={etiqueta} style={fila}>
      {icono}
      <Texto titulo={titulo} detalle={detalle} />
      {flecha}
    </button>
  );
}

function FilaPendiente({ p, onLog, onCoros }: { p: Pendiente; onLog: Props['onLog']; onCoros: Props['onCoros'] }) {
  switch (p.clave) {
    case 'coros':
      return <FilaCoros inicio={p.inicio} onCoros={onCoros} />;
    case 'suscripcion': {
      const titulo = p.estado === 'pago-pendiente' ? 'Tu pago está pendiente' : 'Tu suscripción está cancelada';
      return (
        <FilaBoton
          icono={
            <Ficha tono="peligro">
              <IcoTarjeta tam={24} />
            </Ficha>
          }
          titulo={titulo}
          detalle="Míralo en tu suscripción"
          etiqueta={`${titulo}. Míralo en tu suscripción`}
          onClick={() => onLog('Pendiente → Identidad › Suscripción')}
        />
      );
    }
    case 'pareja': {
      const [titulo, detalle] =
        p.estado === 'sin-pareja'
          ? ['Aún no has añadido a tu compañero/a', 'Invítale por email para entrenar juntos en Dobles']
          : p.estado === 'caducada'
            ? [`La invitación a ${p.email} caducó`, 'Puedes volver a invitarle']
            : [`${p.email} rechazó la invitación`, 'Puedes invitar a otra persona'];
      return (
        <FilaBoton
          icono={
            <Ficha>
              <IcoInvitar tam={24} />
            </Ficha>
          }
          titulo={titulo}
          detalle={detalle}
          etiqueta={`${titulo}. ${detalle}`}
          onClick={() => onLog('Pendiente → Identidad · invitar a tu pareja de Dobles')}
        />
      );
    }
  }
}

export function PendienteSeccion({ items, onLog, onCoros }: Props) {
  if (items.length === 0) return null;
  return (
    <section aria-label="Pendiente" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <TituloSeccion
        aparte={
          <Pastilla fondo={velo('var(--twin-fg)', 8)} tinta="var(--twin-fg)">
            {items.length === 1 ? '1 cosa' : `${items.length} cosas`}
          </Pastilla>
        }
      >
        Pendiente
      </TituloSeccion>
      <div
        style={{
          borderRadius: RADIO.tarjeta,
          background: 'var(--twin-surface)',
          border: '1px solid var(--twin-hairline)',
          overflow: 'hidden',
        }}
      >
        {items.map((p, i) => (
          <div key={p.clave} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--twin-hairline)' }}>
            <FilaPendiente p={p} onLog={onLog} onCoros={onCoros} />
          </div>
        ))}
      </div>
    </section>
  );
}
