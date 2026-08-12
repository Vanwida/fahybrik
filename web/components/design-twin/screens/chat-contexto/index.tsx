'use client';

// CHAT CONTEXTUAL — preguntar SOBRE algo sin añadir un solo control a la app.
//
// ---------------------------------------------------------------------------
// EL PROBLEMA, QUE NO ERA EL CÓDIGO
// ---------------------------------------------------------------------------
//
// Hoy el atleta y su coach conversan a secas: un solo hilo, texto y adjuntos, y
// CERO noción de sobre qué se habla (`ChatMessageDTO`, ChatService.swift:33 —
// ni `about`, ni `reply_to`, ni `subject`). El coach recibe «no me llega con 90
// s» sin saber de qué bloque, y pregunta. Esa ida y vuelta es el coste real.
//
// La solución obvia —un iconito de «preguntar» en cada cosa señalable— se
// descartó explícitamente: ensucia todas las pantallas para una acción que se
// usa de vez en cuando. Así que la regla de diseño de esta propuesta es dura:
// **cero controles nuevos**. El contexto entra por sitios que YA existen.
//
//   · Puerta descubrible: el «+» del compositor, que ya es la única entrada a
//     «qué le añado a este mensaje» (voz, foto, vídeo, archivo). Gana una fila.
//   · Atajo rápido: los menús de pulsación larga que YA existen en la sesión
//     del día (PlanView.swift:315), el carril de días y la tarjeta de carrera.
//     Ganan una fila. Cero pixeles.
//   · Y en las filas de ejercicio de la ficha previa, que hoy no tienen menú,
//     nace uno: un `contextMenu` no ocupa alto. Es atajo, no la vía principal,
//     precisamente porque una pulsación larga sola no se descubre.
//
// ---------------------------------------------------------------------------
// LO QUE NO SE PUDO SALVAR SIN GASTAR PANTALLA (declarado, no escondido)
// ---------------------------------------------------------------------------
//
// El resumen post-entreno, el detalle de una carrera, el detalle de ejercicio y
// un comunicado NO tienen menú ni puerta al chat. Con cero controles nuevos,
// desde ahí son tres toques (salir → «+» → elegir) en vez de uno. Se acepta a
// cambio de no tocar la UI; si algún día se ve que ahí duele, el arreglo es
// añadir la puerta del chat al cromo de esas pantallas, no un icono por cosa.
//
// ---------------------------------------------------------------------------
// EL DATO (lo que hace que esto no sea decoración)
// ---------------------------------------------------------------------------
//
// La referencia es TIPADA, no texto dentro del mensaje: `kind` ('session' |
// 'exercise' | 'race') + `ref` (el ancla navegable) + `sub` (el ejercicio
// dentro de la sesión) + `label`. Y la etiqueta la escribe el SERVIDOR, que es
// quien ya carga la entidad para validar que es del atleta: un solo rotulador
// para la burbuja de iOS, la del dashboard y el push. Si fuese texto libre, el
// coach no podría abrir la cosa, la IA no sabría de qué se habla y las
// analíticas no podrían contar qué entrenos generan preguntas.

import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { PantallaContexto, type Guion } from './pantalla';

export const meta: TwinMeta = {
  id: 'chat-contexto',
  titulo: 'Chat contextual — sin un icono nuevo',
  zona: 'Perfil y ajustes',
  estado: 'propuesta',
  actualizado: '2026-08-12',
  descripcion:
    'Preguntar sobre un entreno, un ejercicio o una carrera en un toque, sin añadir ni un control a la app: la fila entra en menús que ya existen y en el «+» del compositor.',
  fuentes: [],
  enApp:
    'El chat, el «+» y sus adjuntos ya existen en Swift (ChatView.swift). Lo nuevo es que un mensaje sepa SOBRE QUÉ es: hoy ni el mensaje ni la base de datos tienen ese campo, y ninguna pantalla de detalle sabe abrir el chat.',
  dispositivo: 'iphone',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'menu-plan',
    titulo: 'El atajo · la sesión de hoy',
    descripcion:
      'El menú de pulsación larga de la sesión, con sus filas reales de Swift y una más. En naranja, la nueva: en la app es idéntica a sus vecinas. El fondo va atenuado porque el sujeto es el menú.',
  },
  {
    id: 'mas',
    titulo: 'La puerta · el «+» de siempre',
    descripcion:
      'Las cinco filas que ya existen y la sexta, al final para no mover la memoria muscular. El título pasa de «Adjuntar» a «Añadir al mensaje», que es lo que ahora cubre.',
  },
  {
    id: 'cual',
    titulo: 'Elegir · ¿sobre qué entreno?',
    descripcion:
      'La única superficie nueva de la propuesta. Cada fila lleva su pie porque en la lista hay dos «Fuerza A», y los pendientes de esta semana también se ofrecen: preguntar antes de entrenar es la mitad de los casos.',
  },
  {
    id: 'chip',
    titulo: 'Puesto · antes de enviar',
    descripcion:
      'El contexto espera en el compositor, visible y descartable con la ✕. Chip y fila de escritura comparten banda: son una pieza, no dos.',
  },
  {
    id: 'enviado',
    titulo: 'Enviado · la tarjeta en la burbuja',
    descripcion:
      'La referencia viaja DENTRO de la burbuja, no como mensaje aparte: así la pregunta y su sujeto no se emparejan a ojo. Se toca y abre el entreno. Y la respuesta del coach ya no gasta un turno en preguntar de qué va.',
  },
  {
    id: 'menu-ejercicio',
    titulo: 'El caso fino · un ejercicio',
    descripcion:
      'Las filas de la ficha previa hoy no tienen menú; con uno, la pregunta sale del sitio donde está el ejercicio. Sin alto extra, pero es atajo: la pulsación larga a secas no se descubre.',
  },
  {
    id: 'ejercicio-enviado',
    titulo: 'Enviado · el ejercicio, no el entreno',
    descripcion:
      'La misma referencia con `sub`: señala el back squat DE ese entreno, no el back squat en abstracto ni la sesión entera. La etiqueta la compone el servidor.',
  },
];

export function Screen({ escenario, onLog }: TwinScreenProps) {
  return (
    <div className="twin-screen-safe">
      <PantallaContexto guion={escenario as Guion} onLog={onLog} />
    </div>
  );
}
