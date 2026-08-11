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
// sin repeticiones—, que es la que se portó a Swift. Los cinco de abajo son la
// PROPUESTA del 11-ago: el hierro re-expresado en el lenguaje de `vivo-rondas`,
// que ese día dejó de ser una pantalla para ser el idioma de todo el vivo
// (directiva de Alex: «tener diseños perdidos por la app es horrible»). Se
// enseñan con su «cómo está hoy» al lado, porque las dos cosas que cambian —qué
// ocupa la franja que no desaparece nunca, y qué hace el riel cuando hay doce
// series— solo se juzgan comparando.

import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { Hoy } from './diagnostico';
import { MaquinaCircuito, MaquinaFuerza } from './maquina';
import { Propuesta, type Entrada } from './propuesta';
import { CABEN_CON_DOSIS, CASOS, UMBRAL_VENTANA, cerradasHasta } from './modelo';

export const meta: TwinMeta = {
  id: 'vivo-fuerza',
  titulo: 'El hierro en vivo — la serie que tienes delante',
  zona: 'Entreno en vivo',
  estado: 'propuesta',
  actualizado: '2026-08-11',
  descripcion:
    'En fuerza gobierna el atleta: la app no mide ni una repetición. La propuesta del 11-ago pasa el hierro al lenguaje del vivo — el crono sube a la franja que no desaparece nunca y suelta la línea del plan, que era estática y encima miente cuando las series no son iguales; y el riel, que hoy pinta un peldaño por serie, se convierte en ventana desde la quinta, que es la mitad del corpus real.',
  fuentes: ['ios/FAHYBRIK/Workout/Vivo/FuerzaVivoView.swift'],
  enApp:
    'Shipeado (commit 478f8e3f): el marco del §10, el sujeto en la serie, el riel de series con su editor en hoja y el descanso como otra cara de la misma pantalla. Sigue siendo futuro: el crono en la franja de contexto, la ventana del riel cuando hay más de cuatro series, la carga en %RM sin convertir a kilos, y el descanso en tinta normal en vez de azul.',
  dispositivo: 'iphone',
  soportaHorizontal: false,
  composicion: {
    arquetipo: 'en-vivo',
    estrategia: 'gobierna',
    sujeto:
      'La DOSIS de esta serie («10 × 82,5 kg»), siempre. La cuenta vive en la etiqueta de encima y en el riel: en fuerza las series no son iguales —la forma dominante del corpus es la pirámide— así que lo que se te cae de la cabeza sudando es la dosis, no el número de serie. Y el trabajo de una serie ES un numeral, al contrario que los cuatro movimientos de un metcon.',
    diagnostico: `La franja que no desaparece jamás la ocupa hoy la línea del plan, que no cambia en todo el ejercicio y que en una pirámide miente: el 6-6-4-4-3 real del bloque 392 se escribe «5×6». Mientras, el crono del bloque vive en la tercera celda de la fila de apoyos. Y el riel pinta un peldaño por serie: con ${CABEN_CON_DOSIS} caben, con 12 cada peldaño se queda en 26 pt y la dosis deja de leerse — y 37 de las 75 prescripciones de fuerza de la base tienen ${UMBRAL_VENTANA} series o más.`,
    resuelve: `El crono sube a la franja de contexto y el descanso drena ahí mismo, en el sitio donde drena el tope de un metcon. La línea del plan desaparece: la dosis de ESTA serie ya es el sujeto, las series están en el riel y el descanso prescrito es una celda. Y el riel pasa a ventana de tres desde la ${UMBRAL_VENTANA}ª —la cerrada de antes, la de ahora, la que viene—, que es la respuesta que el 10-ago dejó decidida para las listas heterogéneas.`,
  },
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'serie',
    titulo: 'Hoy · Back Squat, serie 2 de 4',
    descripcion:
      'La máquina del 29-jul (4×5 @ 100 kg): el sujeto es la serie, con los discos que hay que poner y lo que hiciste la semana pasada.',
  },
  {
    id: 'registro',
    titulo: 'Hoy · acabas la serie',
    descripcion:
      'Lo prescrito se confirma de un toque; ajustar reps o kilos es la excepción. El RIR que sentiste se pregunta y se puede no contestar.',
  },
  {
    id: 'descanso',
    titulo: 'Hoy · descanso de 1:30',
    descripcion:
      'La única parte que gobierna la app. Cuenta atrás, el pulso bajando con su zona, y el naranja aparece solo cuando te toca.',
  },
  {
    id: 'hueco-honesto',
    titulo: 'Hoy · circuito de pierna sin repeticiones',
    descripcion:
      'El caso real del plan del coach: cuatro series a 30 kg y ninguna repetición escrita. La pantalla no se la inventa y el registro pregunta.',
  },
  {
    id: 'squat-4x10',
    titulo: 'Propuesta · 4×10 a 82,5 kg, serie 2',
    descripcion:
      'El caso de la captura, verbatim de la plantilla 503: cuatro series de 10 a 82,5 kg con 1:30 de descanso. El crono está arriba en la franja, la dosis manda en la banda y los discos siguen abajo. Cambia a «hoy» y mira qué ocupa la franja.',
  },
  {
    id: 'squat-descanso',
    titulo: 'Propuesta · descansando entre la 2 y la 3',
    descripcion:
      'La misma pantalla con el sujeto cambiado, que es lo que hace el motor. El descanso drena en la franja del contexto, los apoyos NO se reordenan y saltar va de contorno: el reloj también cierra el descanso.',
  },
  {
    id: 'squat-ultima',
    titulo: 'Propuesta · la última serie, con una ajustada',
    descripcion:
      'Serie 4 de 4, y en la 3 el atleta bajó a 77,5 kg. El riel enseña lo que se REGISTRÓ y no lo que se pidió, con su marca ámbar — es justo lo que quieres ver antes de decidir la última.',
  },
  {
    id: 'squat-piramide',
    titulo: 'Propuesta · pirámide 6-6-4-4-3 al 75-85 %',
    descripcion:
      'El bloque 392 real: cinco series que no son iguales y una carga que no está en kilos. Aquí se ve por qué el sujeto es la dosis (la siguiente serie cambia) y por qué el porcentaje no se convierte a kilos que nadie ha pesado.',
  },
  {
    id: 'doce-series',
    titulo: 'Propuesta · doce series (10-10-8-8-6-4-12…)',
    descripcion:
      'El ejercicio más largo de la base, el fondo lastrado del bloque 501. Doce peldaños no caben: el riel es ventana de tres y dice cuántas llevas. En «hoy» la dosis de cada peldaño ya no se lee.',
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
    entrada: { cerradas: cerradasHasta(CASOS['squat-4x10'], 1), haceS: 120, aperturaS: 214 },
  },
  'squat-descanso': {
    caso: 'squat-4x10',
    entrada: { cerradas: cerradasHasta(CASOS['squat-4x10'], 2), haceS: 46, aperturaS: 385 },
  },
  'squat-ultima': {
    caso: 'squat-4x10',
    entrada: {
      cerradas: cerradasHasta(CASOS['squat-4x10'], 3, {
        2: { reps: 10, carga: { tipo: 'kg', kg: 77.5 }, estado: 'ajustada' },
      }),
      haceS: 104,
      aperturaS: 702,
    },
  },
  'squat-piramide': {
    caso: 'squat-piramide',
    entrada: { cerradas: cerradasHasta(CASOS['squat-piramide'], 2), haceS: 162, aperturaS: 648 },
  },
  'doce-series': {
    caso: 'doce-series',
    entrada: { cerradas: cerradasHasta(CASOS['doce-series'], 6), haceS: 71, aperturaS: 916 },
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
