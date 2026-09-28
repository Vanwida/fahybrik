'use client';

// IPHONE · EL ERGO — propuesta del vivo del iPhone para el remo, el ski y la
// bici (28-09). Modelo: docs/vivo-iphone/modelo.md (I4 «¿voy al /500 o a la
// zona?», §3 horizontal, §4 la rejilla de la máquina). Kit: `kit-iphone-vivo/`
// sobre el dominio de `kit-reloj/`: esta pantalla no repinta nada, solo
// declara sus casos (`casos.ts`) y su cuerpo (`sim.ts`).
//
// Lo que enseña: el /500 actual contra su banda (y en la bici el /1000), las
// calorías que cuenta la máquina como lo que falta, el continuo a zona con el
// pulso mandando y tiñendo, el test con su marca, la recuperación parada como
// fase común, y la honestidad del dato cuando la máquina se pierde o no está.
// Un libre y uno del coach: la misma pantalla.

import { useState } from 'react';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { VivoIphoneDePlan } from '../../kit-iphone-vivo';
import { casoDe } from './casos';

export const meta: TwinMeta = {
  id: 'iphone-vivo-ergo',
  titulo: 'iPhone · el ergo',
  zona: 'Entreno en vivo',
  estado: 'construida',
  actualizado: '2026-09-28',
  descripcion:
    'Remo, ski y bici sobre la anatomía del vivo rehecho: el /500 actual contra su banda (/1000 en la bici), la rejilla de la máquina (cadencia, pulso, calorías, potencia), las calorías como lo que falta, el continuo a zona con el pulso tiñendo, el test marcado, la recuperación parada, la máquina perdida o sin conectar, el horizontal y un libre idéntico.',
  fuentes: [
    'ios/FAHYBRIK/Workout/VivoIphone/VivoIphoneView.swift',
    'ios/FAHYBRIK/Workout/VivoIphone/VivoIphoneCuadro.swift',
    'ios/FAHYBRIKCore/Vivo/Vivo+Entrada.swift',
    'ios/FAHYBRIKCore/Vivo/Vivo+PlanDeSesion.swift',
    'ios/FAHYBRIKTests/Vivo/VivoIphoneCapturasTests+Ergo.swift',
  ],
  enApp:
    'Construida en Swift el 28-09 (rama claude/vivo-swift-ergo, detrás de VivoIphoneBandera: encendida en Debug, apagada en Release hasta las cinco familias). Los diez escenarios se capturan con el motor real en VivoIphoneCapturasTests+Ergo. Antes, el ergo del iPhone era ErgHUDContent + ErgLiveStrip + ErgPreStartFlow: el remo, el ski y la bici salen iguales (/500, s/min y «sin remar» en la bici), las calorías solo con objetivo en cal, la cadencia no se ve, sin máquina hay una guía a pantalla completa sin reloj ni pulso, y el título es «Row Erg · Intervals». Esto lo sustituye entero, y también a la propuesta `vivo-erg` del 29-jul, que sigue en el índice como historia.',
  dispositivo: 'iphone',
  soportaHorizontal: true,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'remo-series',
    titulo: 'Remo · 5 × 500 m a 1:52–1:56 /500, serie 3/5',
    descripcion:
      'La serie de remo a /500 (ilustrativa: ninguna asignada la trae). Cabecera «Remo · Serie 3/5 · 500 m · Series» con el crono y los chips (Remo, Banda). Manda el /500 ACTUAL contra la banda del coach: entra «dentro», a los 8 s se cae a 2:00 («▼ lento», aprieta) y vuelve. «quedan 357 m» debajo; la rejilla es LA DEL REMO: paladas por minuto, pulso con su zona, calorías (siempre) y potencia. «Luego · Recupera 2′ parado · después 500 m a 1:52–1:56 /500». El remo cierra la serie solo a los 500 m.',
  },
  {
    id: 'remo-recupera',
    titulo: 'Recuperación parada · 2′ entre series',
    descripcion:
      'La fase común (I7) tras la serie 3: la cuenta atrás como héroe, «Viene: Remo · 500 m a 1:52–1:56 /500» con «+30 s», el pulso bajando en la rejilla y «Empezar ya» de primaria. Monocromo: aquí no se juzga nada. A los 10 s el preaviso, después 3-2-1 y GO a la serie 4.',
  },
  {
    id: 'ski-calorias',
    titulo: 'SkiErg · 5 × 25 cal, serie 2/5',
    descripcion:
      'Las calorías las cuenta el ski y son la medida del paso: sin objetivo, el héroe es lo que falta («quedan 10 cal») y la serie se cierra sola a las 25. La rejilla no repite las calorías (un dato, un sitio): el /500 actual, las paladas, el pulso y la potencia. Hoy las calorías solo salían con objetivo en cal.',
  },
  {
    id: 'bici-continuo',
    titulo: 'BikeErg · 20′ a 2:05–2:10 /1000, con rpm',
    descripcion:
      'Un continuo en la bici (ilustrativo): la cabecera dice «BikeErg · 20′ · Continuo», nunca «Ergo». La bici se lee por 1000 m, como su monitor y como la prescribe el coach: héroe «2:07 /1000», banda «2:05–2:10 /1000»; a los 6 s se le va a 2:16 («▼ lento») y vuelve. La rejilla: rpm en vez de paladas, pulso, calorías, potencia. Hoy salía como remo (/500, s/min, «sin remar»).',
  },
  {
    id: 'remo-zona',
    titulo: 'Remo · 30′ a Z2, el pulso manda',
    descripcion:
      'Un continuo a zona en el remo (ilustrativo): el objetivo manda (P3), así que el héroe es el pulso con su zona y el lienzo se tiñe de ella (I8: solo cuando el paso va a zona). La banda es el espectro del coach con Z2 marcada; a los 8 s sube a Z3 («▲ alto», afloja) y vuelve. «quedan 19:48»; la rejilla: el /500, las paladas, calorías, potencia. El pulso no se repite.',
  },
  {
    id: 'test',
    titulo: 'Test · remo 2000 m',
    descripcion:
      'Un test no se confunde con un WOD: la cabecera lleva la marca «Test» y el formato «Test». El héroe es lo que falta (700 m), nunca el nombre de la máquina; la rejilla es la del remo: /500 actual, paladas, pulso, calorías. Se cierra solo a los 2000 m. Es el mismo caso de la gramática, pintado aquí porque es remo.',
  },
  {
    id: 'maquina-perdida',
    titulo: 'Máquina perdida · el remo deja de llegar a mitad',
    descripcion:
      'La serie 3 con el remo enlazado; a los 3 s deja de llegar: el chip pasa a «Remo · sin señal», el héroe cae a lo que se sabe (el tiempo, «llevas»), la banda se queda sin marca («sin lectura») y las celdas del monitor se pintan «—», nunca un número congelado. La nota bajo el sujeto: «sin señal del remo · toca para reconectar». Nada se reconecta solo.',
  },
  {
    id: 'sin-maquina',
    titulo: 'Sin máquina · lo dices tú, con crono y pulso',
    descripcion:
      'La misma serie sin el remo emparejado: el chip dice «Conectar el remo» (apagado), el héroe es el crono con «lo dices tú», el objetivo queda como banda sin marca («1:52–1:56 /500 · sin lectura»), el pulso sigue y la serie la cierras tú con «Serie hecha». Hoy era una guía de conexión a pantalla completa sin reloj ni pulso.',
  },
  {
    id: 'horizontal',
    titulo: 'Horizontal · el remo en su soporte (§3)',
    descripcion:
      'Pulsa «Horizontal» en Vista: el /500 y la banda a la izquierda; la rejilla, «Luego», la tira y la acción a la derecha. Ergo y cinta lo admiten; el resto, vertical.',
  },
  {
    id: 'libre',
    titulo: 'Libre · el mismo remo 5 × 500, sin coach',
    descripcion:
      'El atleta se monta el mismo 5 × 500 m a 1:52–1:56 /500 · r 2′ como entreno libre. Es el MISMO objeto (pasos del kit) y la MISMA pantalla: nada en el vivo sabe de dónde vino. Serie 2/5, a 1:53, dentro.',
  },
];

export function Screen({ escenario, onLog }: TwinScreenProps) {
  // El caso se construye UNA vez por montaje (cada escenario remonta).
  const [caso] = useState(() => casoDe(escenario));
  return (
    <VivoIphoneDePlan
      plan={caso.plan}
      sim={caso.sim}
      inicio={caso.inicio}
      dispositivos={caso.dispositivos}
      guion={caso.guion}
      onLog={onLog}
    />
  );
}
