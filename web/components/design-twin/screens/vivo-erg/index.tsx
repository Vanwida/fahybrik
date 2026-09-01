'use client';

// El ergo por series — remo, esquí y bici con el monitor conectado.
//
// La tesis: en el ergo NO gobierna el reloj, gobierna el HITO. Los metros y las
// calorías los sabe la máquina, y cruzarlos es lo que cierra el tramo; el crono
// ni siquiera arranca hasta que la máquina se mueve. Por eso esta familia no
// puede ser el HUD genérico con otro icono: cambia quién manda.
//
// Y es un SUPERCONJUNTO de la superficie shipeada (`ErgHUDContent.swift`,
// `RestSurface.swift`, `ErgPreStartFlow.swift`): la cuenta atrás, el estado sin
// monitor, la media en vivo, lo cubierto sobre lo pedido, el total de la pieza,
// el azul del descanso, el «luego», la caída del pulso desde el pico y la puerta
// de conexión con su programación estaban en la app y faltaban aquí. Lo que esta
// familia AÑADE encima: la zona de pulso tiñendo el ambiente, el fogonazo del
// cruce, la tabla de series con lo que costó cada una, la proyección de acabado
// y la cara de monitor pensada para el móvil apoyado en el ergo.
//
// Seis reglas del dominio, y las seis se VEN corriendo el guion:
//
//   1. El crono espera a la máquina            → esquí (y la serie 3 del remo).
//   2. Pero solo si HAY monitor                → escenario sin monitor.
//   3. El cruce cierra el tramo                → remo.
//   4. Un corte de lecturas no cierra nada     → remo, a los 92 s.
//   5. Si el cruce no se ve, cierra el toque   → bici.
//   6. Primero se conecta, luego se empieza    → puerta de conexión.

import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { PuertaConexion } from './conexion';
import { InvitacionAGirar } from './girar';
import { CaraMonitor } from './monitor';
import { GUION, type Guion } from './motor';
import { CaraVertical } from './vertical';

export const meta: TwinMeta = {
  id: 'vivo-erg',
  titulo: 'El ergo por series — el hito manda',
  zona: 'Entreno en vivo',
  estado: 'propuesta',
  actualizado: '2026-07-29',
  descripcion:
    'Remo, esquí y bici con el monitor: de la puerta de conexión al descanso, con el ritmo contra tu objetivo, lo que queda drenando y lo que la app NO puede medir dicho en su sitio. Gira el marco para la cara de monitor.',
  fuentes: [],
  enApp:
    'El núcleo está shipeado (ErgHUDContent + ErgPreStartFlow); esta propuesta es un superconjunto de esa superficie.',
  dispositivo: 'iphone',
  soportaHorizontal: true,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'series-remo',
    titulo: 'Remo 5×500 · serie 2',
    descripcion:
      'Entras con la serie lanzada: ritmo contra objetivo, media en vivo, lo cubierto y el total de la pieza. A los 92 s se cortan las lecturas y el tramo NO se cierra; al cruzar los 500, descanso azul con el pulso cayendo.',
  },
  {
    id: 'ski-continuo',
    titulo: 'Esquí 400 m · el crono espera',
    descripcion:
      'Cuenta atrás, y luego tres segundos quieto: el crono no arranca hasta el primer golpe. Los cuatro parciales de 100 se apilan solos. Sin pulso, porque el reloj no dio lectura (ejecución 173).',
  },
  {
    id: 'bici-calorias',
    titulo: 'Bici 3×20 cal · se pierde el cruce',
    descripcion:
      'Aquí la medida es la caloría y el ritmo son vatios. El corte se traga el cruce de las 20: la serie no se da por hecha y la cierras tú. Después, descanso sin prescribir.',
  },
  {
    id: 'sin-monitor',
    titulo: 'Se cae el monitor a mitad',
    descripcion:
      'A los 20 s el enlace se muere del todo. La prescripción pasa a ser el sujeto, los metros que ya hiciste se quedan, y el crono deja de esperar a nadie.',
  },
  {
    id: 'conectar-remo',
    titulo: 'Conecta el remo (la puerta)',
    descripcion:
      'Primero se conecta y se acepta TU máquina; luego empieza. El remo traía 100 m de otra pieza: se pone a cero y la app le manda la tuya con el ritmo de marcapasos.',
  },
  {
    id: 'horizontal-monitor',
    titulo: 'La cara de monitor',
    descripcion:
      'El móvil apoyado en el ergo: lecturas grandes, la serie y lo que queda en la franja, y la acción en su columna a la derecha. Cambia la orientación a horizontal en el panel.',
  },
];

function guionDe(escenario: string): Guion {
  return GUION[escenario] ?? GUION['series-remo'];
}

export function Screen({ orientation, appearance, escenario, onLog }: TwinScreenProps) {
  const guion = guionDe(escenario);
  const landscape = orientation === 'landscape';

  // La puerta de conexión es una pantalla de retrato en la app: girada se
  // centra en una columna usable en vez de fingir un layout que no existe.
  if (escenario === 'conectar-remo') {
    const puerta = <PuertaConexion onLog={onLog} />;
    return (
      <div className="twin-screen-safe">
        {landscape ? (
          <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
            <div style={{ width: 520, maxWidth: '100%', height: '100%' }}>{puerta}</div>
          </div>
        ) : (
          puerta
        )}
      </div>
    );
  }

  // Girar el móvil ES la decisión de postura: en horizontal manda la cara de
  // monitor, la corra el escenario que la corra. Y el escenario que existe para
  // enseñarla, en vertical, previsualiza en vez de dejar un callejón.
  const cuerpo = landscape ? (
    <CaraMonitor guion={guion} appearance={appearance} onLog={onLog} />
  ) : escenario === 'horizontal-monitor' ? (
    <InvitacionAGirar guion={guion} appearance={appearance} />
  ) : (
    <CaraVertical guion={guion} appearance={appearance} onLog={onLog} />
  );

  return <div className="twin-screen-safe">{cuerpo}</div>;
}
