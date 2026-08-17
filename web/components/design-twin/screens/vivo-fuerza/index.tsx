'use client';

// EL HIERRO EN VIVO — la serie que tienes delante.
//
// La diferencia con correr o con un ergómetro no es estética: es de mando. Ahí
// el aparato mide y la app cuenta; aquí la app no puede medir NADA. Ni una
// repetición, ni un kilo, ni el RIR. Gobierna el atleta, y el reloj solo entra
// cuando sueltas la barra.
//
// De eso salen las cuatro reglas de esta familia:
//   1. El sujeto es LA SERIE (`reps × carga`), no el ejercicio ni el cronómetro.
//   2. Un solo botón, del tamaño del pulgar: «serie hecha». Lo dice el atleta.
//   3. Nada pasa de prescrito a hecho sin que él lo diga, y decirlo cuesta un
//      toque (§7). Lo que sintió se pregunta; no se copia del plan.
//   4. El descanso es dosis, así que cuando corre es él quien manda la banda.
//
// QUÉ HAY AQUÍ, Y POR QUÉ SON DOS ÉPOCAS. Los cuatro primeros escenarios son la
// máquina del 29-jul —serie, registro, descanso y el hueco honesto del circuito
// sin repeticiones—, que es la que estuvo en la app hasta el 11-ago. Los cinco de
// abajo son el hierro re-expresado en el lenguaje de `vivo-rondas`, que ese día
// dejó de ser una pantalla para ser el idioma de todo el vivo (directiva de Alex:
// «tener diseños perdidos por la app es horrible») — y esa misma tarde se portó a
// Swift, así que ya NO son una propuesta: son lo que hace la app.
//
// Los cuatro de antes se quedan, y no por nostalgia: las dos cosas que cambiaron
// —qué ocupa la franja que no desaparece nunca, y qué hace el riel cuando hay doce
// series— solo se juzgan comparando, y el «antes» es lo primero que desaparece del
// registro cuando alguien limpia. La vista «hoy» del doble es ese antes.

import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { Hoy } from './diagnostico';
import { MaquinaCircuito, MaquinaFuerza } from './maquina';
import { Propuesta, type Entrada } from './propuesta';
import {
  CABEN_CON_DOSIS,
  CASOS,
  UMBRAL_VENTANA,
  VELOCIDAD_DUDOSA,
  VELOCIDAD_SQUAT,
  cerradasHasta,
} from './modelo';

export const meta: TwinMeta = {
  id: 'vivo-fuerza',
  titulo: 'El hierro en vivo — la serie que tienes delante',
  zona: 'Entreno en vivo',
  // CONSTRUIDA y no ESPEJO, y la diferencia no es prudencia: el porte a Swift dejó
  // cinco divergencias declaradas (ver `enApp`), así que esta pantalla afirma «se
  // construyó», no «soy fiel». Sellarla de espejo con la barra de discos dibujada
  // aquí y ausente en la app sería exactamente el espejo podrido que
  // `pnpm run twin:desfase` vino a cazar.
  estado: 'construida',
  actualizado: '2026-08-11',
  descripcion:
    'En fuerza gobierna el atleta: de lo que levanta, la app solo puede medir la VELOCIDAD de la barra. El 11-ago el hierro pasó al lenguaje del vivo y se portó a Swift — el crono subió a la franja que no desaparece nunca y se fue la línea del plan, que era estática y encima mentía cuando las series no son iguales; el riel se convierte en ventana desde la quinta serie (la mitad del corpus real); y los m/s entran en la fila como lo medido, con su semáforo y su pérdida leída en una frase.',
  fuentes: [
    'ios/FAHYBRIK/Workout/Vivo/FuerzaVivoView.swift',
    'ios/FAHYBRIK/Workout/Vivo/EditorDeSerie.swift',
    'ios/FAHYBRIK/Theme/LenguajeVivoCascada.swift',
    'ios/FAHYBRIKCore/Theme/Formato.swift',
  ],
  enApp:
    'PORTADO el 11-ago sobre el host real (`MarcoVivo`, que ya existía en Theme/LenguajeVivoUI.swift y no «sin llamadas» como se creyó — todas usaban trailing closure): el strip de formato con el reloj y el descanso drenando, el sujeto en la dosis de la serie con las cuatro escrituras de carga (kilos, banda de %RM sin convertir, peso corporal y uno por mano), el riel como ventana de tres desde la quinta serie con su umbral derivado del ancho medido, la velocidad en la primera celda de la fila con el tono del semáforo y la palabra en el pie, la frase de la pérdida al descansar, y el descanso en tinta normal con la acción en contorno. '
    + 'LO QUE SEPARA ESTA PANTALLA DE UN ESPEJO, y hay que reconciliarlo antes de sellarla: (1) la barra con los discos que se dibuja aquí NO existe en Swift — es un átomo por construir, no un porte pendiente; (2) aquí la celda del pulso se llama «Pulso» y la app dice «FC» (`Vocab.fc`) en las diez vistas, así que la que hay que cambiar es esta; (3) la app enseña además los m/s de la repetición que se acaba de cerrar DENTRO de la serie en vuelo, que el doble no simula porque no tiene sensor; (4) y la procedencia «sensor · 7» bajo el numeral, por lo mismo; (5) la dosis de un peldaño del riel se escribe en la voz de instrumento de la casa encogiéndose hasta 11 pt, no fija a 11 px — el umbral coincide, la letra no.',
  dispositivo: 'iphone',
  soportaHorizontal: false,
  composicion: {
    arquetipo: 'en-vivo',
    estrategia: 'gobierna',
    sujeto:
      'La DOSIS de esta serie («10 × 82,5 kg»), siempre. La cuenta vive en la etiqueta de encima y en el riel: en fuerza las series no son iguales —la forma dominante del corpus es la pirámide— así que lo que se te cae de la cabeza sudando es la dosis, no el número de serie. Y el trabajo de una serie ES un numeral, al contrario que los cuatro movimientos de un metcon.',
    diagnostico: `Hasta el 11-ago la franja que no desaparece jamás la ocupaba la línea del plan, que no cambiaba en todo el ejercicio y que en una pirámide mentía: el 6-6-4-4-3 real del bloque 392 se escribía «5×6» (el formateador que lo hacía se borró el 11-ago; las tarjetas del plan nunca mintieron, van por otro camino). Mientras, el crono del bloque vivía en la tercera celda de la fila de apoyos. Y el riel pintaba un peldaño por serie: con ${CABEN_CON_DOSIS} caben, con 12 cada peldaño se queda en 26 pt y la dosis deja de leerse — y 37 de las 75 prescripciones de fuerza de la base tienen ${UMBRAL_VENTANA} series o más.`,
    resuelve: `El crono sube a la franja de contexto y el descanso drena ahí mismo, en el sitio donde drena el tope de un metcon. La línea del plan desaparece: la dosis de ESTA serie ya es el sujeto, las series están en el riel y el descanso prescrito es una celda. El riel pasa a ventana de tres desde la ${UMBRAL_VENTANA}ª —la cerrada de antes, la de ahora, la que viene—, que es la respuesta que el 10-ago dejó decidida para las listas heterogéneas. Y la velocidad de la barra entra en la fila de apoyos con el tono de su semáforo: no en la banda, porque no es lo que se te cae de la cabeza —nunca lo has sabido— sino lo que la app te añade para decidir con cuánto va la siguiente; su pérdida dentro de la serie se lee en una frase, y solo con la serie cerrada.`,
  },
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'serie',
    titulo: 'Antes del 11-ago · Back Squat, serie 2 de 4',
    descripcion:
      'La máquina del 29-jul (4×5 @ 100 kg): el sujeto es la serie, con los discos que hay que poner y lo que hiciste la semana pasada.',
  },
  {
    id: 'registro',
    titulo: 'Antes del 11-ago · acabas la serie',
    descripcion:
      'Lo prescrito se confirma de un toque; ajustar reps o kilos es la excepción. El RIR que sentiste se pregunta y se puede no contestar.',
  },
  {
    id: 'descanso',
    titulo: 'Antes del 11-ago · descanso de 1:30',
    descripcion:
      'La única parte que gobierna la app. Cuenta atrás, el pulso bajando con su zona, y el naranja aparece solo cuando te toca.',
  },
  {
    id: 'hueco-honesto',
    titulo: 'Antes del 11-ago · circuito de pierna sin repeticiones',
    descripcion:
      'El caso real del plan del coach: cuatro series a 30 kg y ninguna repetición escrita. La pantalla no se la inventa y el registro pregunta.',
  },
  {
    id: 'squat-4x10',
    titulo: 'En la app · 4×10 a 82,5 kg, serie 2',
    descripcion:
      'El caso de la captura, verbatim de la plantilla 503: cuatro series de 10 a 82,5 kg con 1:30 de descanso. El crono está arriba en la franja, la dosis manda en la banda, los discos siguen abajo y la velocidad de tu última repetición abre la fila. Cambia a «hoy» y mira qué ocupa la franja.',
  },
  {
    id: 'squat-descanso',
    titulo: 'En la app · descansando entre la 2 y la 3',
    descripcion:
      'La misma pantalla con el sujeto cambiado, que es lo que hace el motor. El descanso drena en la franja del contexto, los apoyos NO se reordenan y saltar va de contorno: el reloj también cierra el descanso. Y aquí la velocidad dice lo suyo: la serie 2 salió LENTA y perdió un 31 % — mira la serie 3 del escenario siguiente para ver qué hizo el atleta con esa información.',
  },
  {
    id: 'squat-ultima',
    titulo: 'En la app · la última serie, con una ajustada',
    descripcion:
      'Serie 4 de 4, y en la 3 el atleta bajó a 77,5 kg porque la 2 le salió lenta. El riel enseña lo que se REGISTRÓ y no lo que se pidió, con su marca ámbar — es justo lo que quieres ver antes de decidir la última.',
  },
  {
    id: 'squat-piramide',
    titulo: 'En la app · pirámide 6-6-4-4-3 al 75-85 %',
    descripcion:
      'El bloque 392 real: cinco series que no son iguales y una carga que no está en kilos. Aquí se ve por qué el sujeto es la dosis (la siguiente serie cambia) y por qué el porcentaje no se convierte a kilos que nadie ha pesado. SIN sensor, que es el estado normal hoy: no hay celda de velocidad, y la fila no promete lo que no va a llegar.',
  },
  {
    id: 'doce-series',
    titulo: 'En la app · doce series (10-10-8-8-6-4-12…)',
    descripcion:
      'El ejercicio más largo de la base, el fondo lastrado del bloque 501. Doce peldaños no caben: el riel es ventana de tres y dice cuántas llevas. En «hoy» la dosis de cada peldaño ya no se lee. Y el sensor está puesto pero no se fía de su medida: la celda lo dice en vez de pintar un número.',
  },
];

/**
 * Por dónde entra cada escenario de la propuesta. Es el MISMO ejercicio mirado en
 * un instante distinto, no una maqueta por estado: desde cualquiera de ellos la
 * máquina lleva al siguiente, así que lo que se juzga son las transiciones.
 */
const ENTRADAS: Record<string, { caso: string; entrada: Entrada }> = {
  'squat-4x10': {
    caso: 'squat-4x10',
    // La serie 1 cerrada hace dos minutos: su descanso de 1:30 ya se agotó y el
    // atleta está delante de la barra. Es el instante de la captura.
    entrada: {
      cerradas: cerradasHasta(CASOS['squat-4x10'], 1, {}, VELOCIDAD_SQUAT),
      haceS: 120,
      aperturaS: 214,
      sensor: true,
    },
  },
  'squat-descanso': {
    caso: 'squat-4x10',
    entrada: {
      cerradas: cerradasHasta(CASOS['squat-4x10'], 2, {}, VELOCIDAD_SQUAT),
      haceS: 46,
      aperturaS: 385,
      sensor: true,
    },
  },
  'squat-ultima': {
    caso: 'squat-4x10',
    entrada: {
      // La 3 la bajó a 77,5 kg, y la velocidad de la 2 dice por qué: salió lenta.
      cerradas: cerradasHasta(
        CASOS['squat-4x10'],
        3,
        { 2: { reps: 10, carga: { tipo: 'kg', kg: 77.5 }, estado: 'ajustada' } },
        VELOCIDAD_SQUAT
      ),
      haceS: 104,
      aperturaS: 702,
      sensor: true,
    },
  },
  'squat-piramide': {
    caso: 'squat-piramide',
    // SIN sensor: es el estado normal hoy —ninguna de las 88 ejecuciones de la
    // base trae velocidad— y la pantalla no promete una celda que no va a llenar.
    entrada: {
      cerradas: cerradasHasta(CASOS['squat-piramide'], 2),
      haceS: 162,
      aperturaS: 648,
      sensor: false,
    },
  },
  'doce-series': {
    caso: 'doce-series',
    // Sensor puesto y medida que NO se sostiene: la celda existe y lo dice.
    entrada: {
      cerradas: cerradasHasta(CASOS['doce-series'], 6, { 5: { velocidad: VELOCIDAD_DUDOSA } }),
      haceS: 71,
      aperturaS: 916,
      sensor: true,
    },
  },
};

export function Screen({ escenario, vista, appearance, onLog }: TwinScreenProps) {
  const propuesta = ENTRADAS[escenario];

  // `twin-screen-safe` ya va en absoluto, así que es el bloque contenedor del
  // tinte de zona (§10.1): el `Ambiente` de cada vista baña el lienzo entero,
  // incluida la zona del notch, y el marco vive dentro de los safe areas.
  return (
    <div className="twin-screen-safe">
      {propuesta ? (
        vista === 'hoy' ? (
          <Hoy
            ejercicio={CASOS[propuesta.caso]}
            entrada={propuesta.entrada}
            appearance={appearance}
            onLog={onLog}
          />
        ) : (
          <Propuesta
            ejercicio={CASOS[propuesta.caso]}
            entrada={propuesta.entrada}
            appearance={appearance}
            onLog={onLog}
          />
        )
      ) : escenario === 'hueco-honesto' ? (
        <MaquinaCircuito appearance={appearance} onLog={onLog} />
      ) : (
        <MaquinaFuerza
          entrada={escenario === 'registro' ? 'registro' : escenario === 'descanso' ? 'descanso' : 'serie'}
          appearance={appearance}
          onLog={onLog}
        />
      )}
    </div>
  );
}
