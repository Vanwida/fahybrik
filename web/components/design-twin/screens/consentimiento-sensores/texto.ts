// El texto del consentimiento — UNA sola fuente para la hoja y para Perfil.
//
// Es texto de consentimiento, así que cada frase tiene que ser verdad sobre lo
// que el código hace hoy, no sobre lo que haría bien decir:
//
//  · QUÉ se graba: el movimiento de la muñeca — aceleración y giro (CoreMotion:
//    `userAcceleration`, `rotationRate` y la gravedad), decimado a 50 Hz, ~1 MB
//    por hora (ios/FAHYBRIKWatch/Sensor/SensorCapture.swift,
//    docs/reconocer-el-movimiento.html). Ni pulso ni ubicación: no viajan en ese
//    fichero.
//  · CUÁNDO se graba: siempre, durante el entreno del reloj. Lo que pide permiso
//    es SUBIRLO (`/api/sync/sensor-capture` exige `sensor_capture_consent_version`
//    y contesta 403 sin él). Por eso la hoja dice «ha grabado», en pasado.
//  · PARA QUÉ: que la app aprenda a contar repeticiones y a reconocer ejercicios,
//    cada vez mejor (las correcciones del atleta son la etiqueta que entrena la
//    versión siguiente). NO se dice «lo usamos para contar tus repeticiones» a
//    secas: el procesado en vivo corre digas lo que digas
//    (WatchWorkoutCoordinator: «Live processing always runs; archive transfer is
//    consent-gated»), y la frase haría creer que decir que no apaga el contador.
//    Eso sería empujar el sí con una pérdida que no existe.
//  · POR QUÉ se pregunta: el movimiento de muñeca identifica a una persona, como
//    la forma de andar. Es dato personal y se dice sin asustar.

/** La versión que se guarda al decir que sí — `SensorCaptureConsent.currentVersion`. */
export const VERSION_CONSENTIMIENTO = '2026-08-06.v1';

export const HOJA = {
  titulo: 'El movimiento de tu muñeca',
  /** Qué es y para qué. */
  queYParaQue:
    'Mientras entrenabas, el reloj ha grabado cómo se movía tu muñeca. Si nos dejas subirlo, lo usamos para que la app aprenda a contar tus repeticiones y a reconocer los ejercicios sola, cada vez mejor.',
  /** Qué NO es, y por qué aun así se pregunta. */
  queNoEs: 'Es solo movimiento: ni tu pulso ni dónde estabas. Aun así es tuyo y puede identificarte, así que te lo preguntamos.',
  /** Que decir que no no cuesta nada, y dónde se cambia. */
  sinCoste: 'Tu entreno se guarda igual digas lo que digas. Puedes cambiarlo en Perfil › Privacidad.',
  subir: 'SUBIRLO',
  ahoraNo: 'Ahora no',
} as const;

export const PERFIL = {
  titulo: 'Privacidad',
  grupo: 'El movimiento de tu muñeca',
  grupoPie: 'El reloj lo graba mientras entrenas. Subirlo es cosa tuya.',
  fila: 'Subir el movimiento del reloj',
  /** La línea bajo la fila cambia con el interruptor: dice qué pasa AHORA. */
  filaSi: 'Para que la app aprenda a contar repeticiones y a reconocer ejercicios.',
  filaNo: 'No se sube. Tus entrenos se guardan igual.',
  /** La letra pequeña de debajo del grupo — lo mismo que la hoja, en seco. */
  notaAlPie:
    'Solo el movimiento del reloj —aceleración y giro— mientras dura el entreno: ni tu pulso ni dónde estabas. Aun así puede identificarte; por eso decides tú.',
} as const;
