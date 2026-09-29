'use client';

// GARMIN · ANTES DE LA SESIÓN — propuesta del reloj Garmin (29-09).
// Modelo: docs/garmin-reloj/modelo.md (G01–G07, G26, §5 fila «Brief», §8 login por
// código de dispositivo, G9, G10). Kit: `kit-garmin/`.
//
// Lo que pasa fuera de la grabación: el Glance «Hoy» del bucle de Garmin, el brief
// del día con su estructura real, varias sesiones el mismo día, el día que no toca,
// el plan viejo o ausente, vincular el reloj con un código, la sesión que la app dejó
// a medias, el entreno libre y los avisos de sistema antes de empezar (sin pulso,
// batería para la duración, sin móvil). Las cinco teclas son las de la fila «Brief» de
// §5; el táctil solo ayuda fuera del vivo y siempre tiene su tecla. Al empezar,
// entra el vivo de «Garmin · correr».
//
// Ficheros: estado (el dominio, puro) · filas · estructura · brief · faces · previo ·
// vinculo (las caras, puras) · pantallas (la máquina y sus teclas) · casos (los
// escenarios) · contenido (el pintor) · flujo (las teclas y los tiempos).

import { useState } from 'react';
import { ComparaTamanos, PantallaGarmin, entornoDe, useEncaje } from '../../kit-garmin';
import { ESTUDIO, tinteDeFondo } from '../../kit-garmin/tokens';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { escenaDe } from './casos';
import { Contenido, type Contexto } from './contenido';
import { CaraDe } from './contenido';
import { disponerGlance, glanceDe } from './faces';
import { Flujo } from './flujo';
import type { Escena } from './pantallas';

export const meta: TwinMeta = {
  id: 'garmin-antes',
  titulo: 'Garmin · antes de la sesión',
  zona: 'Entreno en vivo',
  estado: 'propuesta',
  actualizado: '2026-09-29',
  descripcion:
    'Lo que pasa en el reloj Garmin antes de grabar y fuera de la sesión: el glance de hoy, el brief con la estructura real del coach y el GPS, varias sesiones el mismo día, el día que no toca, el plan viejo o sin plan, vincular el reloj con un código, la sesión que la app dejó a medias, el entreno libre y los avisos de antes de salir (pulso, batería, móvil). Cinco botones; al empezar entra el vivo.',
  fuentes: [],
  enApp:
    'Hoy `garmin-ciq/` es la app «mensajera» (baja el entreno como FIT y lanza el reproductor nativo; nunca se ha probado en un reloj), así que nada de esto existe en un Garmin. Frente a «Muñeca · antes y después» no se portan la esfera con su complicación ni el Smart Stack (son de watchOS): su equivalente es el Glance «Hoy» (G01), la tarjeta que sale en el bucle de glances de Garmin. Tampoco el «¿Dónde corres?» al empezar: aquí el entorno se elige en el brief con UP/DOWN cuando el plan no lo fija, y Ajustes guarda el de por defecto. «Correr libre» y «Entreno libre» del día libre son aquí un solo «Entreno libre» con el tipo elegido con UP/DOWN. No existen el doble toque, la corona ni el botón Acción. Lo nuevo de Garmin: vincular con un código de dispositivo (sin teclear email ni contraseña), la sesión interrumpida (Garmin no puede reanudar un FIT: «Seguir» abre otra grabación de la misma sesión) y los avisos de antes de salir.',
  dispositivo: 'garmin',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  // ── G01 · el glance ─────────────────────────────────────────────────────────
  {
    id: 'glance',
    titulo: 'Glance «Hoy» · la tarjeta del bucle de glances',
    descripcion:
      'La tarjeta de una línea que sale en el bucle de glances de Garmin: «Hoy · 55′» y, debajo, «6 × 1000 m» (duración y título; un glance corre con 32–64 KB, así que lee una línea ya precalculada, no el plan). Va enfocada con el marco naranja: a los 2,4 s START la abre (el brief). UP y DOWN pasan al glance vecino y los lleva el sistema, no la app. Es lo que en la muñeca de Apple era la complicación de la esfera y el Smart Stack.',
  },
  {
    id: 'glance-estados',
    titulo: 'Glance · sus seis estados',
    descripcion:
      'La misma tarjeta con lo que puede haber hoy: una sesión, dos sesiones (con una ya hecha), un día que no toca (con lo de mañana), plan viejo («Plan de hace 3 días»), sesión sin detalle («Falta la sesión») y sin plan. En un solo reloj de 260 px (MIP): lo que dice cada una tiene que leerse sin abrir nada.',
  },
  // ── G02 · el brief ──────────────────────────────────────────────────────────
  {
    id: 'brief-6x1000',
    titulo: 'Brief · 6 × 1000 m con GPS buscando → listo',
    descripcion:
      'El caso del modelo, en la calle (la prescripción lo dice: no hay flechas de entorno). Arriba «Hoy · 55′»; en medio la estructura real: «6 × 1000 m a 3:45–3:55» con «r 90″ trote» debajo, entre el calentamiento y la vuelta a la calma en gris; abajo «Calle · Buscando GPS», la acción («START · Empezar», en naranja) y el pulso al pie («♥ —» hasta que fija). A los 1,6 s se fija el pulso; a los 4,2 s fija el GPS: 1 larga + SUCCESS («GPS listo») y la línea pasa a «GPS listo». El aro es la forma de la sesión: naranja, el trabajo.',
  },
  {
    id: 'brief-479',
    titulo: 'Brief · 479 con su estructura real',
    descripcion:
      'Calentamiento 5′ · Z2 / 6 × 800 m Z5 con «r 2′30″ trote» / Wall Ball · 5 × 12 · 9 kg · r 1′ / Vuelta a la calma 3′ · Z1. El plan no dice dónde: «↑↓ Calle» avisa de que UP/DOWN cambian el entorno (por defecto, el de Ajustes). En un círculo de 218 px no cabe todo con dos líneas cada bloque: la estructura se aprieta hasta que cabe, midiéndolo en cada reloj, y lo que no entre se dice («+ n más»), nunca se pierde en silencio.',
  },
  {
    id: 'brief-491',
    titulo: 'Brief · 491 rodaje + movilidad',
    descripcion: 'Rodaje 50′ a Z2, y la Movilidad de 15′ en gris (no es la parte principal). Sin entorno en la prescripción: UP/DOWN lo cambian. «Hoy · 65′»: el rodaje y la movilidad juntos.',
  },
  {
    id: 'brief-494',
    titulo: 'Brief · 494 con el cue del coach',
    descripcion: 'Tirada 80′ a Z2, en la calle (la prescripción lo fija: ninguna flecha), con el cue del coach donde lo puso: «Coach · mirar el pulso». Un solo bloque: el título grande, sin nada que apretar.',
  },
  {
    id: 'brief-529',
    titulo: 'Brief · 529 fuerza, sin GPS',
    descripcion:
      'Cinco bloques de fuerza (A1 Back Squat, A2 Box Jump, B1 Deadlift, B2 Bulgarian Split Squat, Sled Push): más de los que caben con su dosis en un círculo, así que se cuentan sin perder el título ni la dosis del que manda y se dice cuántos quedan («+ n más»; se ven enteros en la página Estructura del vivo). No hay fila de GPS ni de entorno: lo único que se espera es el pulso («Fijando pulso» → «Listo»).',
  },
  {
    id: 'brief-cinta',
    titulo: 'Brief · 535 en cinta',
    descripcion: 'La prescripción dice cinta al 1 %: «Cinta · sin GPS», sin flechas y sin nada que esperar ni que preguntar; el pulso es lo único que se fija. Un solo bloque largo: «2 × (4 × 2′ a Z4)» con la inclinación, la recuperación y el descanso entre tandas debajo, en dos líneas.',
  },
  {
    id: 'brief-493',
    titulo: 'Brief · circuito 493, la estructura más larga',
    descripcion: 'Un circuito de cinco rondas (carrera + estación): siete bloques, el peor caso para el brief. Se aprieta a una línea cada uno o a una ventana con «+ n más», según lo que dé cada reloj; el calentamiento y la vuelta a la calma, que el atleta ya sabe, son lo primero que se va.',
  },
  // ── Empezar ─────────────────────────────────────────────────────────────────
  {
    id: 'empezar',
    titulo: 'Empezar · espera del GPS, GPS listo y 3-2-1',
    descripcion:
      'El brief del 6 × 1000 m con el GPS aún buscando. A los 1,5 s START = Empezar: se espera al GPS en su propia pantalla («Buscando GPS · Sale solo al fijar», con el pulso ya fijado y «START · Empezar sin GPS»). A los 5,2 s fija: 1 larga + SUCCESS («GPS listo»), y a los 0,9 s la cuenta atrás: 3-2-1 (1 corta por segundo + KEY ×3), GO (2 largas + START) y entra el vivo. START o BACK durante la cuenta la cancelan.',
  },
  {
    id: 'sin-gps',
    titulo: 'Empezar sin GPS · el ritmo será «—»',
    descripcion:
      'Lo mismo, pero a los 3,2 s el atleta no espera: START = Empezar sin GPS. La sesión arranca y el GPS sigue buscando dentro del vivo: el ritmo NO se pinta a cero, el héroe cae a lo que se sabe y la nota dice «GPS · buscando»; cuando fija, 1 corta + KEY y la tarjeta «GPS listo» (la de «Garmin · correr»).',
  },
  {
    id: 'entorno',
    titulo: 'Entorno · calle, cinta o pista con UP/DOWN',
    descripcion:
      '479 no dice dónde se corre: el brief pone el de Ajustes (calle) y UP/DOWN lo cambian, con su efecto a la vista. A 1,5 s DOWN → Cinta (sin GPS: la fila de GPS desaparece y no hay nada que esperar), a 2,7 s DOWN → Pista, a 3,9 s UP → Cinta. Si la prescripción lo fija (494, 535), UP/DOWN no hacen nada. Es lo que en la muñeca de Apple era «¿Dónde corres?» al empezar.',
  },
  // ── G03 · varias sesiones ───────────────────────────────────────────────────
  {
    id: 'varias',
    titulo: 'Varias sesiones · mañana y tarde',
    descripcion:
      'Hoy hay dos sesiones: correr por la mañana y fuerza por la tarde. La lista enfoca la primera (marco naranja); a 1,6 s DOWN → la de la tarde; a 3 s START → su brief (de fuerza: sin GPS). BACK vuelve a la lista. Es la fila «Brief» de §5 a nivel del día: UP sesión anterior, DOWN sesión siguiente.',
  },
  {
    id: 'varias-tarde',
    titulo: 'Varias sesiones · la de la mañana ya hecha',
    descripcion: 'Por la tarde: la lista abre con foco en la primera SIN hacer (la de fuerza), y la de la mañana lleva el punto de «hecha». A 1,8 s START abre su brief con «Tarde · …» arriba.',
  },
  // ── G04 · hoy no toca · G05 ─────────────────────────────────────────────────
  {
    id: 'no-toca',
    titulo: 'Hoy no toca · descanso y entreno libre',
    descripcion:
      '«Descanso», lo de mañana («Mañana · 6 × 1000 m · 55′») y «START · Entreno libre». A los 2,2 s START abre el selector de tipo (Correr, Fuerza, Circuito, Ergo). Hoy no se puede empezar nada de la sesión: lo de hoy no existe.',
  },
  {
    id: 'plan-viejo',
    titulo: 'Plan viejo · «Plan de hace 3 días»',
    descripcion:
      'El reloj tiene la sesión (494) pero su plan es de hace 3 días y no hay móvil a tiro: el brief lo dice («Plan de hace 3 días · acerca el móvil») y sigue habiendo Empezar, porque el detalle sí está. Una sesión termina con la versión del plan con la que empezó y el resultado dice cuál fue (G9).',
  },
  {
    id: 'sin-detalle',
    titulo: 'Sin detalle · no hay Empezar',
    descripcion:
      'El reloj sabe que hoy hay una tirada (el glance trae su título y su duración) pero no tiene sus pasos: «Falta la sesión en el reloj · acerca el móvil», y NO hay Empezar, ni contra la asignación ni con un sustituto (DECISIONS 28-09). A los 2,4 s START no hace nada (se dice en el registro); el reloj pide el detalle al móvil solo.',
  },
  {
    id: 'sin-plan',
    titulo: 'Sin plan · acerca el móvil',
    descripcion: 'El reloj no ha traído nada: «Sin plan · Acerca el móvil para traer tu plan», y «START · Entreno libre», porque un entreno libre no necesita plan (se guarda fuera de plan).',
  },
  // ── G06 · vincular ──────────────────────────────────────────────────────────
  {
    id: 'vincular',
    titulo: 'Vincular el reloj · código de dispositivo',
    descripcion:
      'El reloj no pide nunca una contraseña. Muestra un código de 6 caracteres, grande y en dos grupos de tres para leerlo de una vez, y «Escríbelo en la app del móvil», donde el atleta ya tiene su sesión; debajo, lo que le queda («caduca en 9:42», que baja). A los 6 s el móvil lo acepta: «Reloj vinculado ✓ · Trayendo tu plan» y, a los 2,6 s, el glance. Sustituye a teclear el email y un código en los ajustes de Garmin Connect. El código de este escenario es de mentira: lo da el servidor.',
  },
  {
    id: 'vincular-caducado',
    titulo: 'Vincular · el código caduca y se pide otro',
    descripcion: 'Al código le quedan 4 s: caduca y sale «Código caducado · START · Otro código». A los 7,5 s START pide otro al servidor y vuelve a esperar, con su cuenta atrás nueva.',
  },
  // ── G07 · sesión interrumpida ───────────────────────────────────────────────
  {
    id: 'interrumpida',
    titulo: 'Sesión interrumpida · Seguir o Guardar lo hecho',
    descripcion:
      'La app murió grabando la serie 4 de 6. Al abrirla: «grabado 31:58 · hasta Serie 4/6» (el último punto de control, de hace 30 s) y la verdad de la plataforma, en pantalla: «Garmin no puede reanudarla. Seguir graba otra, misma sesión.» Dos salidas: Seguir (enfocada) o Guardar lo hecho. START = Seguir: cuenta atrás y el vivo, en la serie 4 desde el principio (el paso en curso se repite: el reloj no sabe dónde estabas). BACK sale sin decidir y el punto de control sigue ahí.',
  },
  {
    id: 'interrumpida-guardar',
    titulo: 'Sesión interrumpida · Guardar lo hecho',
    descripcion: 'A 1,8 s DOWN enfoca «Guardar lo hecho»; a 3,2 s START la guarda como parcial: «Sesión terminada · Parcial · 3 de 6 series · Terminaste en la serie 4 de 6» (lo decide lo hecho, como en toda sesión).',
  },
  // ── Entreno libre · Ajustes ─────────────────────────────────────────────────
  {
    id: 'libre',
    titulo: 'Entreno libre · elegir el tipo y empezar',
    descripcion:
      'Sin plan: Correr, Fuerza, Circuito o Ergo, con UP/DOWN y START (se guarda fuera de plan). A 1,8 s START en «Correr»: sale con el entorno de Ajustes (calle), espera al GPS (fija a los 6 s: 1 larga + SUCCESS), cuenta atrás y el vivo sin objetivo, con vuelta por km. Los otros tres abren su propio reloj sin plan (otras familias de pantallas).',
  },
  {
    id: 'ajustes',
    titulo: 'Ajustes · el entorno por defecto y desvincular',
    descripcion:
      'UP mantenido en el brief (a 1,2 s en el escenario): «Entorno · Calle» y «Desvincular reloj», y nada más: el método es del coach, no se toca en la muñeca. START abre el entorno (a 2,4 s); DOWN + START (3,6 y 4,8 s) lo pone en Cinta y vuelve a Ajustes con el valor nuevo. BACK cierra. «Desvincular» pide confirmar y lleva a un código nuevo (G06).',
  },
  // ── G26 · avisos de sistema antes de empezar ────────────────────────────────
  {
    id: 'aviso-sin-pulso',
    titulo: 'Aviso · sin pulso en una sesión que va a zona',
    descripcion:
      'El 479 va a zona (Z5) y el reloj no lee pulso (banda sin emparejar, o el reloj flojo). A 1,8 s START: antes de la cuenta, «Sin pulso · — · Puedes empezar igual · Lo que va a zona: —»; START = Empezar igual, BACK = volver. El pulso no se pinta a cero: es «—» (G7). No suena nada: §6 no tiene fila para un aviso previo.',
  },
  {
    id: 'aviso-bateria',
    titulo: 'Aviso · batería justa para una sesión larga',
    descripcion:
      'La tirada de 80′ con el reloj al 14 %: a 1,8 s START dice los dos hechos, «Batería baja · 14 % · para 80′ de sesión · Puede no llegar al final» (cuánto gasta el reloj grabando con GPS y pulso está sin medir, prueba T12: por eso no promete «no llegarás»). START = Empezar igual, BACK = volver.',
  },
  {
    id: 'aviso-sin-movil',
    titulo: 'Aviso · sin móvil, se graba igual',
    descripcion: 'Sin móvil a tiro no se pierde nada: el brief lo dice en una línea («Se graba sin móvil») y no bloquea. La sesión se guarda en el reloj y sube al tener el móvil (G8, G31). No hay tarjeta ni confirmación: una carrera sin móvil es lo normal.',
  },
  // ── Los cuatro tamaños ──────────────────────────────────────────────────────
  {
    id: 'tamanos-brief',
    titulo: 'Los cuatro tamaños · brief del 479',
    descripcion: 'El brief a 454, 390, 260 y 218, cada uno a sus píxeles. En los MIP todo color pasa por los 64 colores que pueden pintar. Nada se corta por las esquinas y ningún texto baja del 6,2 % del diámetro: la estructura se aprieta según lo que dé cada reloj.',
  },
  {
    id: 'tamanos-largo',
    titulo: 'Los cuatro tamaños · brief de fuerza (529)',
    descripcion: 'Cinco bloques de fuerza en los cuatro relojes: cuántos caben con su dosis cambia de un reloj a otro; lo que no cabe se dice («+ n más»).',
  },
  {
    id: 'tamanos-circuito',
    titulo: 'Los cuatro tamaños · brief del circuito (493)',
    descripcion: 'Siete bloques en los cuatro relojes: la estructura más larga que puede traer un plan.',
  },
  {
    id: 'tamanos-vincular',
    titulo: 'Los cuatro tamaños · el código de vínculo',
    descripcion: 'El código en dos grupos de tres, en los cuatro relojes: tiene que leerse de un vistazo desde la muñeca, sin equivocar un carácter al teclearlo en el móvil.',
  },
  {
    id: 'tamanos-aviso',
    titulo: 'Los cuatro tamaños · aviso de batería',
    descripcion: 'La tarjeta de «Batería baja · 14 % · para 80′ de sesión» a 454, 390, 260 y 218.',
  },
];

// ---------------------------------------------------------------------------
// Las comparaciones
// ---------------------------------------------------------------------------

function ContextoDe(escena: Escena): Contexto {
  return { hoy: escena.hoy, sistema: escena.sistema, ajustes: escena.ajustes, elegido: null, rescate: escena.rescate };
}

/** La pantalla de arranque, quieta, en los cuatro relojes. */
function Comparacion({ escena }: { escena: Escena }) {
  const ctx = ContextoDe(escena);
  return <ComparaTamanos>{() => <Contenido p={escena.arranque} ctx={ctx} />}</ComparaTamanos>;
}

/** Los seis estados del glance, cada uno en su reloj de 260 px (MIP). */
const D_ESTADOS = 260 as const;
const ROTULOS_ESTADOS = ['Una sesión', 'Dos sesiones · una hecha', 'Hoy no toca', 'Plan de hace 3 días', 'Sin detalle', 'Sin plan'];

function ComparaEstados({ escena }: { escena: Escena }) {
  const estados = escena.estadosDeGlance ?? [];
  const columnas = 3;
  const filas = Math.ceil(estados.length / columnas);
  const hueco = ESTUDIO.comparacion;
  const rotulo = ESTUDIO.lector.cuerpo * 2;
  const ancho = columnas * D_ESTADOS + (columnas - 1) * hueco;
  const alto = filas * (D_ESTADOS + rotulo) + (filas - 1) * hueco;
  const { ref, escala } = useEncaje(ancho, alto);
  return (
    <div ref={ref} style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
      <div style={{ transform: `scale(${escala})`, display: 'grid', gridTemplateColumns: `repeat(${columnas}, auto)`, gap: hueco, alignItems: 'center', justifyItems: 'center' }}>
        {estados.map((h, k) => (
          <figure key={k} style={{ margin: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: ESTUDIO.hueco / 2 }}>
            <PantallaGarmin entorno={entornoDe(D_ESTADOS)} fondo={tinteDeFondo(null, 'mip')}>
              <CaraDe hacer={(D) => disponerGlance(glanceDe(h), D)} />
            </PantallaGarmin>
            <figcaption style={{ fontSize: ESTUDIO.lector.cuerpo, color: ESTUDIO.lector.color, fontFamily: 'var(--twin-font-sans)' }}>{ROTULOS_ESTADOS[k]}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

export function Screen({ escenario, onLog }: TwinScreenProps) {
  // La escena se construye UNA vez por montaje (cada escenario remonta): el guion y los
  // temporizadores tienen que partir siempre del mismo sitio.
  const [escena] = useState(() => escenaDe(escenario));
  if (escena.comparar) return <Comparacion escena={escena} />;
  if (escena.estadosDeGlance) return <ComparaEstados escena={escena} />;
  return <Flujo escena={escena} onLog={onLog} />;
}
