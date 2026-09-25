'use client';

// El movimiento de tu muñeca — el consentimiento para subir lo que graba el reloj.
//
// PROPUESTA. Decidido por Alex el 25-09 (docs/DECISIONS.md): el permiso para
// SUBIR las grabaciones de movimiento del reloj se pide en una hoja al acabar el
// primer entreno grabado en la muñeca — SUBIRLO / Ahora no — y luego se cambia
// en Perfil › Privacidad.
//
// EL MODELO, porque de él sale cada frase: el reloj graba el movimiento de la
// muñeca en TODOS los entrenos (aceleración y giro, 50 Hz, ~1 MB/h) y lo usa en
// vivo pase lo que pase. Lo único que depende del sí es que el fichero SALGA del
// teléfono hacia nosotros, donde sirve para que la app aprenda a contar
// repeticiones y reconocer ejercicios cada vez mejor. No lleva pulso ni
// ubicación, pero la forma de moverse identifica a una persona: es dato
// personal, y por eso se pregunta en vez de darse por hecho. Decir que no no le
// cuesta nada al atleta — y la hoja no puede insinuar lo contrario.
//
// El texto vive en `texto.ts`, UNO para la hoja y para Perfil: si las dos
// superficies lo redactaran por su cuenta, acabarían prometiendo cosas distintas.

import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { Hoja } from './hoja';
import { Privacidad } from './perfil';

export const meta: TwinMeta = {
  id: 'consentimiento-sensores',
  titulo: 'El movimiento de tu muñeca',
  zona: 'Perfil y ajustes',
  estado: 'propuesta',
  actualizado: '2026-09-25',
  descripcion:
    'El permiso para subir lo que graba el reloj se pide una vez, en una hoja al acabar el primer entreno de muñeca: qué es, para qué, que no es ni pulso ni ubicación y que decir que no no cuesta nada. Luego se cambia en Perfil › Privacidad.',
  fuentes: [
    'ios/FAHYBRIK/Watch/SensorFileReceiver.swift',
    'ios/FAHYBRIKWatch/Sensor/SensorCapture.swift',
    'docs/reconocer-el-movimiento.html',
  ],
  enApp:
    'El consentimiento existe como bandera local (`SensorCaptureConsent`, v 2026-08-06.v1) sin pantalla; falta la hoja y la fila de Perfil en Swift tras la firma.',
  dispositivo: 'iphone',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'hoja',
    titulo: 'La hoja · primer entreno del reloj',
    descripcion:
      'Back Squat 4×5, guardado. Sube la hoja sobre el resumen velado: SUBIRLO y «Ahora no» igual de a mano. Cerrarla sin elegir cuenta como «Ahora no».',
  },
  {
    id: 'perfil',
    titulo: 'Perfil › Privacidad · encendido',
    descripcion: 'Tras decir que sí: la fila con su interruptor y una línea que dice qué pasa ahora. Apagarlo es un toque, sin «¿seguro?».',
  },
  {
    id: 'perfil-apagado',
    titulo: 'Perfil › Privacidad · apagado',
    descripcion: 'Tras «Ahora no»: el mismo sitio, apagado. La línea cambia a lo que pasa sin el sí — nada se sube, lo subido se borra y el entreno no pierde nada. «Ahora no» no vuelve a preguntar (Alex, 25-09).',
  },
];

export function Screen({ escenario, onLog }: TwinScreenProps) {
  if (escenario === 'hoja') return <Hoja onLog={onLog} />;
  return (
    <div className="twin-screen-safe">
      <Privacidad inicial={escenario === 'perfil'} onLog={onLog} />
    </div>
  );
}
