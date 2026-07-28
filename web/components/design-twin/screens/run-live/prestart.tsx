'use client';

// RunPreStartFlow — la secuencia a pantalla completa antes de correr:
//   PASO 1 «¿Dónde corres hoy?» → dos tarjetas grandes + Continuar.
//   PASO 2 «Conecta tu cinta»   → la guía compartida (la MISMA que reaparece en
//           el HUD si la cinta se cae): cómo conectarla, la nota de
//           compatibilidad, «Buscar mi cinta» y «Correr sin conectar».
// Espejo de ios/FAHYBRIK/Workout/RunPreStartFlow.swift

import type { Entorno } from './data';
import { CINTA_NOMBRE } from './data';
import { BotonPrimario, BotonRedondo, BotonSecundario, Icono, Tarjeta } from './atoms';

/** Envoltura común de los pasos: barra superior + columna centrada en horizontal. */
function Paso({
  horizontal,
  titulo,
  atras,
  onAtras,
  children,
}: {
  horizontal: boolean;
  titulo: string;
  atras: boolean;
  onAtras: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="twin-screen-safe"
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', overflow: 'hidden' }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          width: '100%',
          maxWidth: horizontal ? 520 : undefined,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          padding: '12px 24px 16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <BotonRedondo
            icono={atras ? 'chevron-left' : 'xmark'}
            onClick={onAtras}
            etiqueta={atras ? 'Atrás' : 'Cancelar'}
            color="var(--twin-fg)"
          />
          <span
            style={{
              font: '500 12px/1.3 var(--twin-font-sans)',
              color: 'var(--twin-muted)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {titulo}
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PASO 1 — ¿Dónde corres hoy?
// ---------------------------------------------------------------------------

export function PasoDonde({
  horizontal,
  sesion,
  eleccion,
  onElegir,
  onContinuar,
  onCancelar,
}: {
  horizontal: boolean;
  sesion: string;
  eleccion: Entorno | null;
  onElegir: (e: Entorno) => void;
  onContinuar: () => void;
  onCancelar: () => void;
}) {
  return (
    <Paso horizontal={horizontal} titulo={sesion} atras={false} onAtras={onCancelar}>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <span style={{ font: 'italic 800 28px/1.1 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
          ¿Dónde corres hoy?
        </span>
        <TarjetaGrande
          seleccionada={eleccion === 'cinta'}
          icono="runner"
          titulo="En cinta"
          subtitulo="Conéctala y contrólala"
          onClick={() => onElegir('cinta')}
        />
        <TarjetaGrande
          seleccionada={eleccion === 'calle'}
          icono="location-fill"
          titulo="En la calle"
          subtitulo="GPS, mapa y ritmo en vivo"
          onClick={() => onElegir('calle')}
        />
        <div style={{ flex: 1 }} />
        <BotonPrimario titulo="Continuar" height={56} enabled={eleccion !== null} onClick={onContinuar} />
      </div>
    </Paso>
  );
}

function TarjetaGrande({
  seleccionada,
  icono,
  titulo,
  subtitulo,
  onClick,
}: {
  seleccionada: boolean;
  icono: 'runner' | 'location-fill';
  titulo: string;
  subtitulo: string;
  onClick: () => void;
}) {
  const tinta = seleccionada ? 'var(--twin-accent-on)' : 'var(--twin-fg)';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={seleccionada}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 8,
        minHeight: 120,
        width: '100%',
        padding: 18,
        borderRadius: 14,
        textAlign: 'left',
        background: seleccionada ? 'var(--twin-accent)' : 'var(--twin-surface)',
        border: `1px solid ${seleccionada ? 'transparent' : 'var(--twin-hairline-strong)'}`,
        cursor: 'pointer',
        color: tinta,
      }}
    >
      <span style={{ color: seleccionada ? 'var(--twin-accent-on)' : 'var(--twin-accent-text)' }}>
        <Icono nombre={icono} size={26} />
      </span>
      <span style={{ font: 'italic 800 22px/1.1 var(--twin-font-sans)', color: tinta }}>{titulo}</span>
      <span
        style={{
          font: '500 14px/1.3 var(--twin-font-sans)',
          color: seleccionada ? 'color-mix(in srgb, var(--twin-accent-on) 85%, transparent)' : 'var(--twin-muted)',
        }}
      >
        {subtitulo}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// PASO 2 — Conecta tu cinta (la MISMA guía que usa el HUD)
// ---------------------------------------------------------------------------

export type EnlaceCinta = 'suelta' | 'buscando' | 'conectada';

export function GuiaCinta({
  horizontal,
  sesion,
  enlace,
  onBuscar,
  onSinConectar,
  onEmpezar,
  onAtras,
  conBarraSuperior = true,
}: {
  horizontal: boolean;
  sesion: string;
  enlace: EnlaceCinta;
  onBuscar: () => void;
  onSinConectar: () => void;
  /** Sólo en la pre-salida: «▶ Empezar» cuando la cinta ya está viva. */
  onEmpezar?: () => void;
  onAtras: () => void;
  conBarraSuperior?: boolean;
}) {
  const cuerpo = <CuerpoGuia enlace={enlace} onBuscar={onBuscar} onSinConectar={onSinConectar} onEmpezar={onEmpezar} />;
  if (!conBarraSuperior) return cuerpo;
  return (
    <Paso horizontal={horizontal} titulo={sesion} atras onAtras={onAtras}>
      {cuerpo}
    </Paso>
  );
}

function CuerpoGuia({
  enlace,
  onBuscar,
  onSinConectar,
  onEmpezar,
}: {
  enlace: EnlaceCinta;
  onBuscar: () => void;
  onSinConectar: () => void;
  onEmpezar?: () => void;
}) {
  const viva = enlace === 'conectada';
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <span style={{ font: 'italic 800 28px/1.1 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>Conecta tu cinta</span>

      {viva ? (
        <Tarjeta padding={12}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ color: 'var(--twin-ok)', flex: '0 0 auto' }}>
              <Icono nombre="check-circle" size={22} />
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span
                style={{
                  font: '600 16px/1.3 var(--twin-font-sans)',
                  color: 'var(--twin-fg)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                Conectada · {CINTA_NOMBRE}
              </span>
              <span style={{ font: '500 12px/1.3 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
                Ritmo y distancia en vivo desde la cinta
              </span>
            </span>
          </div>
        </Tarjeta>
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              padding: 12,
              borderRadius: 14,
              background: 'var(--twin-surface)',
            }}
          >
            <FilaGuia n={1} texto="Enciende la cinta y ponla en su pantalla principal." />
            <FilaGuia n={2} texto="Si tiene ajuste de Bluetooth, actívalo." />
            <FilaGuia n={3} texto="Acércate; aparecerá con su nombre." />
          </div>
          {enlace === 'buscando' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Girador />
              <span style={{ font: '500 13px/1.3 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
                Buscando tu cinta…
              </span>
            </div>
          )}
        </>
      )}

      <span style={{ font: '500 12px/1.35 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
        Por ahora, cintas Titanium y compatibles Bluetooth FTMS. Si la tuya no aparece, corre igual: registra la distancia a
        mano.
      </span>

      <div style={{ flex: 1 }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {viva && onEmpezar ? (
          <BotonPrimario titulo="▶ Empezar" height={56} onClick={onEmpezar} />
        ) : (
          !viva && <BotonPrimario titulo="Buscar mi cinta" height={56} onClick={onBuscar} />
        )}
        <BotonSecundario titulo="Correr sin conectar" onClick={onSinConectar} />
      </div>
    </div>
  );
}

function FilaGuia({ n, texto }: { n: number; texto: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <span
        style={{
          width: 24,
          height: 24,
          flex: '0 0 auto',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 9999,
          background: 'var(--twin-surface-sunken)',
          font: '800 13px/1 var(--twin-font-mono)',
          color: 'var(--twin-accent-text)',
        }}
      >
        {n}
      </span>
      <span style={{ font: '500 14px/1.35 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{texto}</span>
    </div>
  );
}

/** ProgressView(.tint(accent)) — animado en el propio SVG para no inyectar CSS. */
export function Girador({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden style={{ display: 'block', flex: '0 0 auto' }}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="var(--twin-hairline-strong)" strokeWidth="3" />
      <path d="M12 3a9 9 0 0 1 9 9" fill="none" stroke="var(--twin-accent)" strokeWidth="3" strokeLinecap="round">
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 12 12"
          to="360 12 12"
          dur="0.9s"
          repeatCount="indefinite"
        />
      </path>
    </svg>
  );
}
