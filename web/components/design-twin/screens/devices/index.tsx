'use client';

// Dispositivos y relojes — el doble del hub del atleta.
//
// Espeja la sección «Dispositivos» de Perfil y sus dos destinos: la subpágina
// del remo (PM5SettingsView + la hoja de emparejamiento) y las instrucciones de
// Garmin. Vincular Polar sale de la app a un navegador interno, así que aquí
// también: la fila NO cambia mientras el navegador está abierto — solo al
// volver, que es cuando la app relee el estado.
//
// LA REGLA que gobierna todo esto: nada se conecta ni se reconecta solo. Cada
// enlace lo abre un toque del atleta.

import { useEffect, useRef, useState } from 'react';
import { useTimeline } from '../../sim';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { ActionSheet, KEYFRAMES, Sheet, Toast } from './atoms';
import { GarminSetup } from './garmin';
import { Hub } from './hub';
import { PM5Scanner, PM5Settings, type ErgDescubierto, type PM5Estado } from './pm5';
import { PolarSafari, type PasoNavegador } from './polar';
import { CARRERAS_EN_RELOJ, PM5_CERCANOS, PM5_RECORDADO, SP } from './tokens';

export const meta: TwinMeta = {
  id: 'devices',
  titulo: 'Dispositivos y relojes',
  zona: 'Conexiones y relojes',
  estado: 'espejo',
  actualizado: '2026-08-13',
  descripcion: 'El equipo del atleta agrupado por lo que hace: quién recibe el entreno, quién solo lee y qué se conecta en el gimnasio.',
  fuentes: [
    'ios/FAHYBRIK/Profile/ProfileView.swift',
    'ios/FAHYBRIK/Profile/WearablesService.swift',
    'ios/FAHYBRIK/Wearables/GarminSetupView.swift',
    'ios/FAHYBRIK/Devices/PM5/PM5LiveStreamView.swift',
    'ios/FAHYBRIK/Devices/PM5/PM5ConnectGuide.swift',
    'ios/FAHYBRIK/Devices/PM5/PM5ConnectionStore.swift',
    'ios/FAHYBRIK/Shared/SafariView.swift',
    'web/app/api/polar/callback/route.ts',
  ],
  dispositivo: 'iphone',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'estado-hoy',
    titulo: 'El equipo del atleta',
    descripcion: 'El hub con el reloj enviando carreras, Polar leyendo, el remo recordado y Garmin sin vincular.',
  },
  {
    id: 'vincular-polar',
    titulo: 'Vincular Polar',
    descripcion: 'Tocar «conectar» abre el navegador dentro de la app; la fila solo cambia al volver.',
  },
  {
    id: 'emparejar-pm5',
    titulo: 'Emparejar el remo',
    descripcion: 'Buscar y emparejar: la guía del monitor, el erg aparece en la lista y lo tocas tú.',
  },
  {
    id: 'remo-desconectado',
    titulo: 'Se cae el remo solo',
    descripcion: 'El PM5 se desconecta sin que el atleta lo pida: el aviso y la lista para volver a elegirlo — nada se reconecta solo.',
  },
];

type Ruta = 'hub' | 'pm5' | 'garmin';
type Hoja = 'ninguna' | 'pm5-scanner' | 'polar-safari';

interface EstadoInicial {
  ruta: Ruta;
  polarConectado: boolean;
  pm5Recordado: string | null;
  apertura: string;
  /** Solo lo usa el escenario que arranca con la hoja del remo ya abierta. */
  hoja?: Hoja;
  pm5Estado?: PM5Estado;
}

const INICIAL: Record<string, EstadoInicial> = {
  'estado-hoy': {
    ruta: 'hub',
    polarConectado: true,
    pm5Recordado: PM5_RECORDADO,
    apertura: 'Hub · Apple Watch con 3 carreras · Polar vinculada · remo recordado',
  },
  'vincular-polar': {
    ruta: 'hub',
    polarConectado: false,
    pm5Recordado: PM5_RECORDADO,
    apertura: 'Hub · Polar sin vincular — toca «conectar» en la fila de Polar',
  },
  'emparejar-pm5': {
    ruta: 'pm5',
    polarConectado: true,
    pm5Recordado: null,
    apertura: 'Remo sin emparejar — toca «Buscar y emparejar»',
  },
  'remo-desconectado': {
    ruta: 'pm5',
    polarConectado: true,
    pm5Recordado: PM5_RECORDADO,
    apertura: 'El remo se cortó a mitad de pieza — el aviso y la lista para volver a elegirlo',
    hoja: 'pm5-scanner',
    pm5Estado: 'lost',
  },
};

/** Cuánto aguanta el aviso flotante (ProfileView.showToast). */
const TOAST_MS = 2400;

export function Screen({ escenario, onLog }: TwinScreenProps) {
  const cfg = INICIAL[escenario] ?? INICIAL['estado-hoy'];

  const [ruta, setRuta] = useState<Ruta>(cfg.ruta);
  const [hoja, setHoja] = useState<Hoja>(cfg.hoja ?? 'ninguna');
  const [toast, setToast] = useState<string | null>(null);

  // Reloj: el permiso de WorkoutKit es la única puerta; apagarlo pregunta antes.
  const [watchEnabled, setWatchEnabled] = useState(true);
  const [watchCount, setWatchCount] = useState<number | null>(CARRERAS_EN_RELOJ);
  const [watchWorking, setWatchWorking] = useState(false);
  const [confirmarWatch, setConfirmarWatch] = useState(false);

  const [healthConnected, setHealthConnected] = useState(true);
  const [healthRequesting, setHealthRequesting] = useState(false);
  const [healthRevoke, setHealthRevoke] = useState(false);
  const [confirmarHealth, setConfirmarHealth] = useState(false);

  const [polarConnected, setPolarConnected] = useState(cfg.polarConectado);
  const [polarConnecting, setPolarConnecting] = useState(false);
  const [polarPaso, setPolarPaso] = useState<PasoNavegador>('autorizando');
  // El callback aterriza en una web, no en la app: el enlace ya existe en el
  // servidor antes de que la fila se entere.
  const vinculadaEnServidor = useRef(false);

  const [pm5Recordado, setPm5Recordado] = useState<string | null>(cfg.pm5Recordado);
  const [pm5Estado, setPm5Estado] = useState<PM5Estado>(cfg.pm5Estado ?? 'idle');
  const [descubiertos, setDescubiertos] = useState<ErgDescubierto[]>([]);
  const [pm5Conectado, setPm5Conectado] = useState<string | null>(null);
  const elegido = useRef<ErgDescubierto | null>(null);

  const avisar = (texto: string) => {
    setToast(texto);
    onLog(texto);
  };

  useEffect(() => {
    if (toast == null) return;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  // --- Guiones deterministas -------------------------------------------------

  useTimeline([{ at: 0, run: () => onLog(cfg.apertura) }]);

  // Activar el reloj: pide permiso y coloca las carreras de la semana.
  useTimeline(
    [
      {
        at: 900,
        run: () => {
          setWatchWorking(false);
          setWatchEnabled(true);
          setWatchCount(CARRERAS_EN_RELOJ);
          avisar('Carreras activadas en el reloj');
        },
      },
    ],
    watchWorking,
  );

  useTimeline(
    [
      {
        at: 900,
        run: () => {
          setHealthRequesting(false);
          setHealthConnected(true);
          setHealthRevoke(false);
          avisar('Apple Health conectado');
        },
      },
    ],
    healthRequesting,
  );

  // Polar: la petición de la URL, el navegador, y el callback aterrizando en
  // nuestra web. Nada de esto toca la fila todavía.
  useTimeline(
    [
      {
        at: 700,
        run: () => {
          setPolarConnecting(false);
          setPolarPaso('autorizando');
          setHoja('polar-safari');
          onLog('Se abre auth.polar.com dentro de la app');
        },
      },
      {
        at: 2700,
        run: () => {
          vinculadaEnServidor.current = true;
          setPolarPaso('callback');
          onLog('Permiso concedido · el callback confirma la cuenta');
        },
      },
    ],
    polarConnecting,
  );

  // El escaneo del remo arranca al ABRIR la hoja y sigue por debajo aunque ya
  // haya un erg conectado, para que «Cambiar de erg» vea el resto de la sala.
  useTimeline(
    [
      {
        at: 1300,
        run: () => {
          setDescubiertos([PM5_CERCANOS[0]]);
          onLog(`Encontrado: ${PM5_CERCANOS[0].nombre}`);
        },
      },
      {
        at: 2400,
        run: () => {
          setDescubiertos([...PM5_CERCANOS]);
          onLog(`Encontrado: ${PM5_CERCANOS[1].nombre}`);
        },
      },
    ],
    hoja === 'pm5-scanner',
  );

  useTimeline(
    [
      { at: 600, run: () => setPm5Estado('discovering') },
      {
        at: 1200,
        run: () => {
          const erg = elegido.current;
          if (!erg) return;
          setPm5Estado('streaming');
          setPm5Conectado(erg.nombre);
          // Emparejado = recordado: la app guarda el nombre en cuanto el enlace
          // se abre, y eso es SOLO una etiqueta para la próxima lista.
          setPm5Recordado(erg.nombre);
          onLog(`Conectado a ${erg.nombre} · queda recordado`);
        },
      },
    ],
    pm5Estado === 'connecting',
  );

  // --- Intenciones del atleta ------------------------------------------------

  const abrirPolar = () => {
    setPolarConnecting(true);
    onLog('Pidiendo la URL de autorización de Polar…');
  };

  const cerrarNavegador = () => {
    setHoja('ninguna');
    // El cierre es lo que dispara la relectura del estado (onDismiss → loadPolar).
    if (vinculadaEnServidor.current) {
      setPolarConnected(true);
      onLog('De vuelta en la app · Polar consta como conectada');
    } else {
      onLog('Navegador cerrado sin vincular');
    }
  };

  const elegirErg = (erg: ErgDescubierto) => {
    elegido.current = erg;
    setPm5Estado('connecting');
    onLog(`Tocado ${erg.nombre} · conectando`);
  };

  const hojaAbierta = hoja !== 'ninguna';

  return (
    <>
      <style>{KEYFRAMES}</style>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'var(--twin-bg)',
          overflow: 'hidden',
          borderRadius: hojaAbierta ? 20 : 0,
          transform: hojaAbierta ? 'translateY(10px) scale(0.93)' : 'none',
          transformOrigin: '50% 0%',
          transition: 'transform 320ms cubic-bezier(0.32, 0.72, 0, 1), border-radius 320ms ease',
        }}
      >
        <div className="twin-screen-safe" style={{ display: 'flex', flexDirection: 'column' }}>
          {ruta === 'hub' && (
            <Hub
              watchEnabled={watchEnabled}
              watchScheduledCount={watchCount}
              watchWorking={watchWorking}
              healthConnected={healthConnected}
              healthRequesting={healthRequesting}
              healthShowRevokeHint={healthRevoke}
              polarConnected={polarConnected}
              polarConnecting={polarConnecting}
              pm5Remembered={pm5Recordado}
              onWatchToggle={(next) => {
                if (next) {
                  setWatchWorking(true);
                  onLog('Pidiendo permiso a la app Entrenamiento…');
                } else {
                  setConfirmarWatch(true);
                }
              }}
              onHealthToggle={(next) => {
                if (next) {
                  setHealthRequesting(true);
                  onLog('Pidiendo permiso a Salud…');
                } else {
                  setConfirmarHealth(true);
                }
              }}
              onGarmin={() => {
                setRuta('garmin');
                onLog('Garmin · cómo poner el entreno en el reloj');
              }}
              onPolar={abrirPolar}
              onPM5={() => {
                setRuta('pm5');
                onLog('Concept2 PM5 · ajustes del remo');
              }}
            />
          )}

          {ruta === 'pm5' && (
            <PM5Settings
              recordado={pm5Recordado}
              conectado={pm5Estado === 'streaming'}
              onBack={() => setRuta('hub')}
              onOlvidar={() => {
                setPm5Recordado(null);
                setPm5Conectado(null);
                setPm5Estado('idle');
                onLog('Remo olvidado');
              }}
              onBuscar={() => {
                setDescubiertos([]);
                setPm5Estado('scanning');
                setHoja('pm5-scanner');
                onLog('Buscando ergs cercanos…');
              }}
            />
          )}

          {ruta === 'garmin' && <GarminSetup onBack={() => setRuta('hub')} onLog={onLog} />}
        </div>
      </div>

      {toast && <Toast text={toast} />}

      {hoja === 'pm5-scanner' && (
        <Sheet>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', paddingBottom: 'var(--twin-safe-bottom)' }}>
            <PM5Scanner
              estado={pm5Estado}
              descubiertos={descubiertos}
              recordadoId={PM5_CERCANOS.find((e) => e.nombre === pm5Recordado)?.id ?? null}
              recordadoNombre={pm5Recordado}
              conectadoNombre={pm5Conectado}
              onCerrar={() => {
                setHoja('ninguna');
                onLog('Hoja cerrada · se para la búsqueda');
              }}
              onElegir={elegirErg}
              onUsar={() => {
                setHoja('ninguna');
                onLog('Usando este PM5 · el enlace sigue abierto');
              }}
              onDesconectar={() => {
                setPm5Estado('idle');
                setPm5Conectado(null);
                setHoja('ninguna');
                onLog('Remo desconectado');
              }}
              onOlvidar={() => {
                setPm5Recordado(null);
                onLog('Remo olvidado');
              }}
            />
          </div>
        </Sheet>
      )}

      {hoja === 'polar-safari' && (
        <Sheet topInset={SP.xl}>
          <PolarSafari paso={polarPaso} onCerrar={cerrarNavegador} />
        </Sheet>
      )}

      {confirmarHealth && (
        <ActionSheet
          title="¿Desconectar Apple Salud?"
          message="Dejaremos de leer y sincronizar tus datos de salud. Podrás volver a conectarlos cuando quieras."
          confirmTitle="Desconectar"
          onConfirm={() => {
            setConfirmarHealth(false);
            setHealthConnected(false);
            setHealthRevoke(true);
            avisar('Apple Health desconectado');
          }}
          onCancel={() => {
            setConfirmarHealth(false);
            onLog('Cancelado · Apple Salud sigue conectada');
          }}
        />
      )}

      {confirmarWatch && (
        <ActionSheet
          title="¿Quitar tus carreras del reloj?"
          message="Las quitaremos de la app Entrenamiento del reloj. Seguirás teniéndolas aquí, en FAHYBRID."
          confirmTitle="Quitar"
          onConfirm={() => {
            setConfirmarWatch(false);
            setWatchEnabled(false);
            setWatchCount(null);
            avisar('Carreras quitadas del reloj');
          }}
          onCancel={() => {
            setConfirmarWatch(false);
            onLog('Cancelado · las carreras siguen en el reloj');
          }}
        />
      )}
    </>
  );
}
