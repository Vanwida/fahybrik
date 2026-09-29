'use client';

// GARMIN · CORRER — propuesta del corredor en el reloj Garmin (29-09).
// Modelo: docs/garmin-reloj/modelo.md (G2 el objetivo manda, G4 la vuelta no
// falla, G5 avisos redundantes, G7 lo que nadie mide no se pinta). Kit: `kit-garmin/`.
//
// El paso de correr con el OBJETIVO mandando (como en la muñeca, P3): el
// número grande es lo que el coach pide controlar —el ritmo contra su banda o
// el pulso contra su zona—; lo que falta, debajo; el pulso siempre en la fila
// de abajo; el aro es la sesión. La cara y sus reglas son las del kit
// (`laminaDelPaso` decide el héroe); aquí se montan los casos de correr con
// los planes y el cuerpo de «Muñeca · correr», y se suma lo propio del
// corredor en Garmin: la vuelta de pista y el GPS o el pulso que se caen.

import { useState } from 'react';
import { AroGarmin, CaraDelVivo, CaraKm, ComparaTamanos, VivoGarminDePlan, useVivoGarmin } from '../../kit-garmin';
import { avanzar, estadoInicial, lecturasDe, pasoVivo, tinteDelPaso } from '../../kit-reloj';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { casoGarminCorrer, type CasoGarminCorrer } from './casos';
import { bannerDeVuelta, esVueltaDePista } from './pista';
import { capaDePista, paginasDePista } from './vistaPista';
import { CapaSistema } from './vistaSistema';

export const meta: TwinMeta = {
  id: 'garmin-correr',
  titulo: 'Garmin · correr',
  zona: 'Entreno en vivo',
  estado: 'propuesta',
  actualizado: '2026-09-29',
  descripcion:
    'El corredor en el reloj Garmin: el objetivo manda (ritmo contra su banda, o pulso contra su zona), lo que falta debajo y el pulso siempre al pie. Series, rodajes, tiradas con vuelta por km, tempos, strides a RPE, cinta, pista con vuelta de 400 m, y el GPS o el pulso que se caen sin que nada se pinte a cero. Cinco botones, vibración y tono sin voz.',
  fuentes: [],
  enApp:
    'Hoy `garmin-ciq/` es la app «mensajera» (baja el entreno como FIT y lanza el reproductor nativo; nunca se ha probado en un reloj), así que nada de esto existe todavía en un Garmin. Aquí es el motor propio del modelo del 29-09. Frente a «Muñeca · correr» no se porta el Always-On («muñeca abajo»): un watch-app que graba no controla el apagado de su pantalla, y lo que hace el reloj con ella es la prueba T2, sin hacer. Tampoco existen aquí el doble toque, la corona, el botón Acción, el bloqueo por agua ni la voz: los sustituyen los cinco botones y los avisos de vibración y tono. Lo nuevo: el «aprieta» junto al «afloja», la pista, el GPS que se pierde a mitad de carrera y el pulso que se cae.',
  dispositivo: 'garmin',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'serie-dentro',
    titulo: 'Serie · 6 × 1000 m @3:45–3:55',
    descripcion:
      'Serie 3 de 6 a 380 m. Manda el ritmo actual contra su banda (marca dentro, «dentro»); debajo, lo que falta, y al pie el pulso con su zona; el aro es la sesión. ↑ y ↓ pasan Datos, Vueltas (series 1 y 2 contra su objetivo) y Estructura, en círculo. A 1000 m la serie se cierra sola: 1 larga + STOP y «Recupera · trote» con «Luego · 1000 m a 3:45–3:55». BACK/LAP la cierra antes (acuse de 1 muy corta + KEY y luego la larga de la recuperación) con 5 s para deshacer con UP. Cambia el tamaño arriba: el mismo instante a 454, 390, 260 y 218.',
  },
  {
    id: 'serie-z5',
    titulo: 'Serie a zona · 800 m @Z5 (479)',
    descripcion:
      'Sesión 479, serie 2 de 6: el coach pide zona, así que manda el PULSO y la banda se dibuja sobre las cinco zonas del coach con la Z5 encendida («Z5 · dentro»). En 454 y 390 (AMOLED) el fondo lleva el tinte de la zona, solo porque el paso va a zona; en 260 y 218 (MIP) el fondo no se tiñe y la zona se lee en la banda, con la Z5 encendida y su rótulo. Lo que falta pasa a segundo y el ritmo baja al pie.',
  },
  {
    id: 'serie-rapida',
    titulo: 'La misma serie, rápido y luego lento',
    descripcion:
      'Serie 3 de 6. A los 4 s del escenario se va a 3:38: la marca pasa a ▲ y sale «▲ rápido», sin cambiar de color. Tras 4 s fuera, UN aviso «afloja» (hacia los 11 s): 2 cortas + dos notas que bajan, y el aro destella. Vuelve a la banda y a los 44 s se queda en 4:06: «▼ lento» y UN aviso «aprieta» (hacia los 51 s): 3 cortas + dos notas que suben. Con el sonido apagado los distingue el número de pulsos; en un Forerunner, que no cambia de intensidad, también. La cadencia del coach (20 s) impide repetirlos. Mira el lector de abajo.',
  },
  {
    id: 'recupera-go',
    titulo: 'Recuperación 90″ trote → serie 4',
    descripcion:
      'Quedan 14 s de trote. Monocromo: cuenta atrás, «Luego · 1000 m a 3:45–3:55» y el pulso bajando. A 10 s el preaviso (1 corta + INTERVAL_ALERT), a 3 s el 3-2-1 a pantalla entera (1 corta por segundo + KEY ×3) y el GO (2 largas + START). BACK/LAP = empezar ya, con 5 s para deshacer.',
  },
  {
    id: 'rodaje-z2',
    titulo: 'Rodaje 50′ @Z2 (491)',
    descripcion:
      'Sesión 491: manda el pulso con su techo («Z2 · a 6 de Z3»), quedan 37:26 y el ritmo va al pie. El techo solo avisa por encima: por debajo no vibra nada (el rodaje es suave por definición). Hay vuelta automática por km. BACK/LAP es «siguiente paso» (la movilidad de 15′), con 5 s para deshacer; no hay vuelta a mano en esta versión, cada km lo cierra el reloj.',
  },
  {
    id: 'tirada-z2',
    titulo: 'Tirada 80′ @Z2 · vuelta por km (494)',
    descripcion:
      'Sesión 494 con el cue del coach «mirar el pulso» bajo el contexto. A los 10 s cruza el km 5: vuelta automática (2 cortas + tono LAP) y la tarjeta del km unos segundos. Es el único paso de la sesión: BACK/LAP la cerraría entera (con 5 s para deshacer), y cerrada a un tercio el resumen dice «Parcial · 24′ de 80′»: un paso continuo cortado a mano se juzga igual que una serie cortada.',
  },
  {
    id: 'tempo-z4',
    titulo: 'Tempo 3950 m @Z4 (573)',
    descripcion:
      'Sesión 573: a zona manda el pulso («Z4 · a 6 de Z5»); lo que falta, en km (2,18 km), y el ritmo actual al pie. Como la tirada, es un único paso.',
  },
  {
    id: 'strides',
    titulo: 'Strides 6 × 20″ @RPE 7 (551)',
    descripcion:
      'Stride 3 de 6: el RPE no es un número que se mida, así que manda lo que falta con la instrucción «RPE 7 · fuerte» (la palabra es del coach) y el pulso al pie. Sin preaviso: el paso dura menos de 30 s. Al acabar, la recuperación «caminando» con su 3-2-1 al final.',
  },
  {
    id: 'progresivo',
    titulo: 'Progresivo · tramo 3/8 (538)',
    descripcion:
      'Sesión 538: «Progresivo» arriba y «tramo 3/8» debajo (en una línea se perdería el tramo), ritmo contra 4:27–4:46. Al acabar el minuto pasa al tramo 4 SIN 3-2-1 a pantalla entera (es seguido, sin cortar): solo el GO, 2 largas + START.',
  },
  {
    id: 'tanda-serie',
    titulo: 'Series anidadas · tanda 2/3 · serie 4/6 (509)',
    descripcion:
      'Sesión 509 en cinta, 3 × (6 × 1′ / 1′) r 5′, sin objetivo: manda lo que falta y el contexto dice la posición entera sin aplanar: «Tanda 2/3» arriba y «Serie 4/6 · 1′» debajo, en dos líneas en los cuatro relojes (en una no cabe en ninguno, y quitar el final se llevaría la serie). A los 8 s entra la recuperación de 1′: «Recupera · caminando» (el modo, en dos líneas si hace falta) y, al final, el 3-2-1 con «Tanda 2/3 · Serie 5/6».',
  },
  {
    id: 'tanda-descanso',
    titulo: 'Descanso entre tandas (509)',
    descripcion:
      'Última serie de la tanda 2: a los 6 s entra el DESCANSO ENTRE TANDAS de 5′, la cara común de descanso (cuenta atrás, «Viene: Tanda 3/3 · 6 × 1′»), distinta de la recuperación de 1′ entre series. +30 s está en Controles (mantén UP); BACK/LAP = empezar ya.',
  },
  {
    id: 'cinta',
    titulo: 'Cinta al 1 % · 2′ @Z4 (535)',
    descripcion:
      'Sesión 535, serie 2 de 4 de la tanda 1: la nota dice «Cinta · 1 %» y la posición va en dos líneas («Tanda 1/2» / «Serie 2/4 · 2′»). Manda el pulso contra Z4; la inclinación es el segundo objetivo (la pone el atleta en la cinta: el reloj no la lee). Sin GPS, la distancia y el ritmo no vienen de satélites: aquí el cuerpo simulado los da, y en un reloj real hay que validar qué estima el propio reloj (lo que no dé se pinta «—», nunca un cero).',
  },
  {
    id: 'gps-buscando',
    titulo: 'GPS honesto · buscando → listo (538)',
    descripcion:
      'Sesión 538, tramo 1/8 (10′ a 5:20), empezada con «Empezar sin GPS». Sin GPS el ritmo NO se pinta a cero: el héroe cae a lo que se sabe (lo que queda de tiempo), la banda se queda sin marca y la nota dice «GPS · buscando». A los 7 s fija: 1 corta + KEY y la tarjeta «GPS listo».',
  },
  {
    id: 'gps-perdido',
    titulo: 'GPS perdido a mitad de carrera',
    descripcion:
      'Tramo 1 de la 538, en el minuto 5. A los 3 s el GPS se cae: 3 largas + FAILURE y la tarjeta «GPS perdido · El crono sigue · Ritmo y distancia: —» durante 4 s; después, la nota «GPS · buscando» y el héroe cae a lo que queda de tiempo, sin ritmo inventado. A los 31 s vuelve: 1 corta + KEY y «GPS recuperado». El crono no se detiene en ningún momento.',
  },
  {
    id: 'pulso-perdido',
    titulo: 'Pulso perdido en una serie a zona',
    descripcion:
      'Serie 2 de 6 a Z5 (479), sin correa: el pulso es el del propio reloj. A los 4 s se pierde: 3 largas + FAILURE y la tarjeta «Pulso perdido». El héroe, que es el pulso, pasa a «—» (nunca el último valor ni un cero); la banda se queda sin marca y abajo siguen lo que falta y el ritmo, que es lo que se puede mirar. A los 24 s vuelve: 1 corta + KEY y «Pulso recuperado».',
  },
  {
    id: 'pista',
    titulo: 'Pista · tempo 4000 m @4:05–4:15, vuelta de 400 m',
    descripcion:
      'Tempo ilustrativo en pista (no es de ningún atleta): manda el ritmo actual contra su banda y la nota dice «Pista». Cada 400 m el reloj cierra la vuelta (2 cortas + LAP) y enseña su tarjeta: «Vuelta 7 · 1:40 · 4:10 /km · dentro» (▲ rápido o ▼ lento si se sale). Arranca a 3 m de cruzar la vuelta 7; la siguiente, 100 s después. En Vueltas están las seis anteriores como v 1 … v 6 con su veredicto (la 5.ª fue rápida). Los 400 m son un dato del plan, no del reloj.',
  },
  {
    id: 'tamanos-fuera',
    titulo: 'Los cuatro tamaños · fuera de la banda',
    descripcion:
      'La serie yendo a 3:38 en 454, 390, 260 y 218: la marca ▲ y la palabra «▲ rápido» a la derecha del rótulo de la banda. En MIP la marca y la banda pasan por los 64 colores que pueden pintar.',
  },
  {
    id: 'tamanos-tanda',
    titulo: 'Los cuatro tamaños · tanda anidada (509)',
    descripcion:
      'La posición anidada («Tanda 2/3 · Serie 4/6 · 1′») en dos líneas en 454, 390, 260 y 218, con la nota «Cinta» y «quedan» apiladas antes del héroe: el héroe sigue dentro de 0,20–0,26 D en los cuatro.',
  },
  {
    id: 'tamanos-rpe',
    titulo: 'Los cuatro tamaños · RPE (strides)',
    descripcion:
      'Un paso sin número vivo: lo que falta como héroe y «RPE 7 · fuerte» como instrucción en la fila de la banda, a 454, 390, 260 y 218.',
  },
  {
    id: 'tamanos-pista',
    titulo: 'Los cuatro tamaños · la vuelta de pista',
    descripcion:
      'La tarjeta de la vuelta 7 («1:40 · 4:10 /km · dentro») en 454, 390, 260 y 218: el tiempo de la vuelta como héroe y su ritmo por km con el veredicto debajo.',
  },
];

/** La tarjeta de la vuelta que el motor cierra en su primer segundo, en los cuatro relojes. */
function ComparacionDeVuelta({ c }: { c: CasoGarminCorrer }) {
  const { plan } = c.caso.datos;
  const estado = avanzar(estadoInicial(plan, c.caso.sim, c.caso.inicio), plan, c.caso.sim).estado;
  const paso = pasoVivo(plan, estado);
  const banner = bannerDeVuelta(estado, paso, plan);
  return (
    <ComparaTamanos>
      {() => (
        <>
          {banner ? <CaraKm banner={banner} /> : null}
          <AroGarmin pasos={plan.pasos} i={estado.i} paso={paso} lecturas={lecturasDe(paso, estado)} />
        </>
      )}
    </ComparaTamanos>
  );
}

function Comparacion({ c, onLog }: { c: CasoGarminCorrer; onLog: (linea: string) => void }) {
  const { plan } = c.caso.datos;
  const { seq } = useVivoGarmin(plan, c.caso.sim, c.caso.inicio, { onLog, corriendo: false });
  if (c.tarjeta === 'vuelta') return <ComparacionDeVuelta c={c} />;
  return <ComparaTamanos tinte={tinteDelPaso(seq.paso, seq.lecturas, plan.zonas)}>{() => <CaraDelVivo seq={seq} />}</ComparaTamanos>;
}

export function Screen({ escenario, onLog }: TwinScreenProps) {
  // El caso se construye UNA vez por montaje (cada escenario remonta): el plan
  // y el cuerpo tienen que ser los mismos objetos segundo a segundo.
  const [c] = useState(() => casoGarminCorrer(escenario));
  if (c.comparar) return <Comparacion c={c} onLog={onLog} />;
  const { plan, estructura } = c.caso.datos;
  const deLaPista = plan.pasos.some(esVueltaDePista);
  return (
    <VivoGarminDePlan
      plan={plan}
      sim={c.caso.sim}
      inicio={c.caso.inicio}
      estructura={estructura}
      inicial={c.inicial}
      paginas={deLaPista ? paginasDePista(estructura) : undefined}
      capa={(seq, kit) => (
        <>
          <CapaSistema seq={seq} />
          {deLaPista ? capaDePista(seq, kit) : kit}
        </>
      )}
      onLog={onLog}
    />
  );
}
