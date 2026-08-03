'use client';

// El hub: la sección «Dispositivos» de Perfil (ProfileView.devicesCard).
//
// Los dispositivos se agrupan POR LO QUE HACEN, no por marca — el título del
// grupo ES la explicación, así el atleta sabe qué va a pasar ANTES de tocar. Por
// eso Garmin y Polar no comparten grupo: al Garmin se le puede mandar el
// entreno; el Polar solo lee lo que ya hiciste.

import { Glyph } from './glyphs';
import { DeviceGroup, DeviceRow, Hairline, IOSSwitch, PillAndChevron, SectionHeader, Spinner, StatusPill } from './atoms';
import { SP } from './tokens';

export interface HubProps {
  watchEnabled: boolean;
  /** Carreras ya colocadas en la app Entrenamiento; null mientras sincroniza. */
  watchScheduledCount: number | null;
  watchWorking: boolean;
  healthConnected: boolean;
  healthRequesting: boolean;
  /** Tras desconectar: iOS no deja revocar la lectura desde aquí. */
  healthShowRevokeHint: boolean;
  polarConnected: boolean;
  polarConnecting: boolean;
  pm5Remembered: string | null;
  onWatchToggle: (next: boolean) => void;
  onHealthToggle: (next: boolean) => void;
  onOpenHealthApp: () => void;
  onGarmin: () => void;
  onPolar: () => void;
  onPM5: () => void;
}

export function Hub(props: HubProps) {
  return (
    <div
      className="twin-scroll"
      style={{
        flex: 1,
        padding: `${SP.l}px ${SP.xl}px ${SP.xxl}px`,
        display: 'flex',
        flexDirection: 'column',
        gap: SP.l,
      }}
    >
      <SectionHeader title="Dispositivos" />

      <div style={{ display: 'flex', flexDirection: 'column', gap: SP.l }}>
        <DeviceGroup
          title="Reciben tu entreno"
          caption="El plan te aparece en el reloj. No necesitas el móvil para entrenar."
        >
          <AppleWatchRow {...props} />
          <Hairline />
          <DeviceRow
            icon="watch.analog"
            title="Garmin"
            subtitle="Cómo poner tu entreno en el reloj"
            trailing={<PillAndChevron text="ver cómo" color="var(--twin-accent-text)" />}
            onTap={props.onGarmin}
            ariaLabel="Garmin, cómo poner tu entreno en el reloj, ver cómo"
          />
        </DeviceGroup>

        <DeviceGroup
          title="Solo leen lo que haces"
          caption="Tus entrenos llegan a tu entrenador, pero el plan no baja al reloj."
        >
          <AppleHealthRow {...props} />
          <Hairline />
          <PolarRow {...props} />
          <Hairline />
          {/* Amazfit entra por Apple Salud, no por una conexión nuestra: el
              interruptor está en Zepp. Informativo a propósito. */}
          <DeviceRow
            icon="figure.run.circle"
            title="Amazfit"
            subtitle="Activa «Apple Salud» en la app Zepp › Más ajustes"
            trailing={<PillAndChevron text="vía Salud" color="var(--twin-muted)" />}
          />
        </DeviceGroup>

        <DeviceGroup
          title="En el gimnasio"
          caption="Se conectan por Bluetooth en el momento. La banda de pulso y la cinta se buscan al empezar el entreno."
        >
          <DeviceRow
            icon="antenna.radiowaves.left.and.right"
            title="Concept2 PM5"
            subtitle={props.pm5Remembered ?? 'Sin emparejar'}
            trailing={
              // Sin remo emparejado no hay estado que enseñar: la píldora
              // desaparece y solo queda el chevron (ProfileView.swift:~767).
              props.pm5Remembered == null ? (
                <Glyph name="chevron.right" size={11} color="var(--twin-faint)" weight={2.6} />
              ) : (
                <PillAndChevron text="pareado" color="var(--twin-ok)" />
              )
            }
            onTap={props.onPM5}
            ariaLabel={`Concept2 PM5, ${props.pm5Remembered ?? 'Sin emparejar'}`}
          />
        </DeviceGroup>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filas con estado propio
// ---------------------------------------------------------------------------

/**
 * El copy dice «carreras», no «entrenos», A PROPÓSITO: solo el rodaje viaja al
 * reloj — su formato de entreno no tiene series, cargas ni rondas.
 */
function AppleWatchRow({ watchEnabled, watchScheduledCount, watchWorking, onWatchToggle }: HubProps) {
  const subtitle = (() => {
    if (!watchEnabled) return 'Envía tus carreras a la app Entrenamiento del reloj y empieza sin sacar el móvil';
    if (watchScheduledCount == null) return 'Activado. Sincronizando tus próximas carreras…';
    if (watchScheduledCount === 0) {
      return 'Activado. No hay carreras en los próximos días — el resto de sesiones se hacen en la app.';
    }
    return watchScheduledCount === 1
      ? '1 carrera lista en la app Entrenamiento del reloj'
      : `${watchScheduledCount} carreras listas en la app Entrenamiento del reloj`;
  })();

  return (
    <DeviceRow
      icon="figure.run.circle"
      title="Apple Watch"
      subtitle={subtitle}
      subtitleColor={watchEnabled ? 'var(--twin-ok)' : 'var(--twin-muted)'}
      trailing={
        watchWorking ? (
          <Spinner />
        ) : (
          <IOSSwitch on={watchEnabled} onChange={onWatchToggle} label="Carreras en el Apple Watch" />
        )
      }
    />
  );
}

function AppleHealthRow({
  healthConnected,
  healthRequesting,
  healthShowRevokeHint,
  onHealthToggle,
  onOpenHealthApp,
}: HubProps) {
  const subtitle = (() => {
    if (healthConnected) return 'Sincroniza en segundo plano';
    if (healthRequesting) return 'Pidiendo permiso…';
    if (healthShowRevokeHint) return 'Desconectado. Para revocar el acceso por completo, ábrelo en la app Salud.';
    return 'Conecta para sincronizar HR, HRV, sueño y peso';
  })();

  // iOS solo enseña los permisos por categoría DENTRO de la app Salud y no hay
  // enlace directo a nuestra ficha, así que se deletrean los toques.
  const showLink = healthConnected || healthShowRevokeHint;

  return (
    <DeviceRow
      icon="heart.text.square"
      title="Apple Health"
      subtitleColor={healthConnected ? 'var(--twin-ok)' : 'var(--twin-muted)'}
      subtitle={
        <>
          {subtitle}
          {showLink && (
            <>
              <button
                type="button"
                onClick={onOpenHealthApp}
                aria-label="Abrir la app Salud"
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  marginTop: 2,
                  color: 'var(--twin-accent-text)',
                  font: '600 11px/1.3 var(--twin-font-sans)',
                }}
              >
                Abrir Salud
                <Glyph name="arrow.up.right" size={9} weight={2.6} />
              </button>
              <div style={{ font: '400 10px/1.35 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
                En Salud: tu foto → Apps → FAHYBRID → Activar todo
              </div>
            </>
          )}
        </>
      }
      trailing={
        healthRequesting ? <Spinner /> : <IOSSwitch on={healthConnected} onChange={onHealthToggle} label="Apple Health" />
      }
    />
  );
}

/** Sin vincular → fila tocable que abre el OAuth; vinculada → estado estático. */
function PolarRow({ polarConnected, polarConnecting, onPolar }: HubProps) {
  return (
    <DeviceRow
      icon="heart.circle"
      title="Polar"
      subtitle={
        polarConnected ? 'Sincroniza tus entrenos automáticamente' : 'Conecta tu cuenta para sincronizar tus entrenos'
      }
      onTap={polarConnected || polarConnecting ? undefined : onPolar}
      ariaLabel={`Polar, ${polarConnected ? 'conectada' : 'conectar'}`}
      trailing={
        polarConnecting ? (
          <Spinner />
        ) : polarConnected ? (
          <StatusPill text="conectada" color="var(--twin-ok)" />
        ) : (
          <PillAndChevron text="conectar" color="var(--twin-accent-text)" />
        )
      }
    />
  );
}
