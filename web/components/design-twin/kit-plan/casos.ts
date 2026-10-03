// LOS CASOS DE «PLAN» — dieciocho atletas de ejemplo con coach (y el tier libre en
// `casos-libre.ts`) que recorren todos los estados. NINGUNO sale de la base de
// producción (CONTRATO-UI §7; memoria «no hay atletas reales»): son personas
// inventadas para probar el modelo, y lo que las hace útiles es qué estado de
// cada pieza ejercitan.
//
// El orden es el de un día real, del caso lleno al mínimo (§6.3: «el caso
// mínimo es el caso de diseño»): el atleta recién dado de alta (⑩) y el vacío
// con inicio futuro (⑨) van a la vista, no escondidos al final.
//
// Cada pieza de la pantalla tiene sus cuatro estados cubiertos por al menos un
// caso: matriz al pie de este fichero. Si añades una pieza, añade su estado.
//
// «Hoy» es jueves 1 de octubre en casi todos: la semana del 28 sep al 4 oct deja
// tres días detrás (para los sellos del pasado) y tres por delante.

import type { CasoPlan, LecturaPlan, SemanaDelPlan, SemanaSiguiente } from './contrato';
import { d, desglosesDe, semana } from './sesiones';

const HOY = '2026-10-01';
const LUNES = '2026-09-28';
const LUNES_QUE_VIENE = '2026-10-05';

/** El atleta de partida: con coach, semana cargada y nada raro. Cada caso pisa lo que ejercita. */
function lectura(actual: SemanaDelPlan | null, siguiente: SemanaSiguiente, pisa: Partial<LecturaPlan> = {}): LecturaPlan {
  return {
    coach: 'Mar',
    companero: null,
    hoyIso: HOY,
    cargando: false,
    errorCarga: false,
    pausa: null,
    actual,
    siguiente,
    muro: null,
    desgloses: desglosesDe([actual, siguiente]),
    guardado: null,
    ...pisa,
  };
}

const caso = (
  id: string,
  titulo: string,
  mira: string,
  l: LecturaPlan,
  extra: Partial<Pick<CasoPlan, 'abre' | 'fallaAcciones'>> = {},
): CasoPlan => ({ tipo: 'coach', id, titulo, mira, lectura: l, ...extra });

/** La semana que viene, llena, para los casos donde se puede hojear. */
const SEMANA_QUE_VIENE = () =>
  semana(
    LUNES_QUE_VIENE,
    HOY,
    [[d('series-400')], [d('fuerza-inferior')], [d('remo-5x1000')], [], [d('fuerza-superior')], [d('tirada-larga')], []],
    {
      nombreBloque: 'Bloque 2 · fuerza y ritmo',
      posicion: { semana: 4, total: 6 },
      intencion: 'Semana de asimilación: bajamos un punto para llegar fresco a la simulación.',
    },
  );

const BLOQUE = 'Bloque 2 · fuerza y ritmo';

export const CASOS_PLAN: CasoPlan[] = [
  (() => {
    const s = semana(
      LUNES,
      HOY,
      [
        [d('remo-5x1000', 'hecha')],
        [d('fuerza-inferior', 'hecha')],
        [d('rodaje-8k')],
        [d('series-800')],
        [d('fuerza-superior')],
        [d('hyrox-sim')],
        [],
      ],
      {
        nombreBloque: BLOQUE,
        posicion: { semana: 3, total: 6 },
        intencion: 'Semana fuerte: acumulamos volumen y cerramos con la simulación entera.',
        hayMasAdelante: true,
      },
    );
    return caso(
      'lleno',
      '① Nora · jueves, semana 3 de 6',
      'El caso LLENO: hoy toca «Series 6×800» (naranja sólido: es lo que hay que hacer ahora), con sus tres partes (el calentamiento y la vuelta a la calma atenuados, sin lista), la duración como suelo escrito y la nota del coach. Mira el carril: dos días hechos, el miércoles sin hacer (nunca en rojo) y la muesca que ata hoy con la card. Toca otro día: cambia la card, no abre otra pantalla. Mantén pulsado un día: salen sus acciones. Desliza el carril o toca «›» para ver la semana que viene.',
      lectura(s, SEMANA_QUE_VIENE()),
    );
  })(),

  (() => {
    const s = semana(
      LUNES,
      HOY,
      [
        [d('series-400', 'hecha')],
        [d('fuerza-inferior', 'hecha')],
        [],
        [d('remo-5x1000', 'hecha', { franja: 'AM' }), d('fuerza-superior', 'pendiente', { franja: 'PM' })],
        [d('rodaje-8k')],
        [d('tirada-larga')],
        [],
      ],
      {
        nombreBloque: 'Bloque 1 · base aeróbica',
        posicion: { semana: 2, total: 4 },
        intencion: 'Jueves de dos sesiones: remo por la mañana, empuje y tirón por la tarde.',
        hayMasAdelante: true,
      },
    );
    return caso(
      'doble',
      '② Marina · dos sesiones, la de la mañana hecha',
      'AM hecha y PM pendiente: el sujeto es LA QUE TOCA (la de la tarde, naranja sólido, «HOY PM»), no la primera del día; la de la mañana baja a una fila compacta con su sello. Es la misma sesión que Hoy nombra al llevar aquí. «Empezar» apunta a la de la tarde.',
      lectura(s, SEMANA_QUE_VIENE()),
    );
  })(),

  (() => {
    const s = semana(
      LUNES,
      HOY,
      [
        [d('fuerza-inferior', 'hecha')],
        [d('remo-5x1000', 'hecha')],
        [],
        [d('rodaje-8k', 'hecha')],
        [d('series-400')],
        [d('tirada-larga')],
        [],
      ],
      { nombreBloque: BLOQUE, posicion: { semana: 3, total: 6 }, intencion: 'Semana de calidad en el rodaje y fuerza al principio.', hayMasAdelante: true },
    );
    return caso(
      'hecho-manana',
      '③ Dídac · hoy hecho, mañana toca',
      'La sesión de hoy está HECHA: tinte verde suave, sello y los minutos MEDIDOS (nunca los previstos). El bucle se cierra y debajo aparece lo que viene: mañana, con su duración escrita. La acción es «Ver lo que hiciste», no «Empezar».',
      lectura(s, SEMANA_QUE_VIENE()),
    );
  })(),

  (() => {
    const s = semana(
      LUNES,
      HOY,
      [
        [d('series-800', 'hecha')],
        [],
        [d('remo-5x1000', 'hecha')],
        [d('fuerza-inferior', 'parcial')],
        [d('rodaje-8k')],
        [d('emom-20')],
        [],
      ],
      { nombreBloque: BLOQUE, posicion: { semana: 3, total: 6 }, intencion: 'Semana fuerte: acumulamos volumen.', hayMasAdelante: true },
    );
    return caso(
      'a-medias',
      '④ Iván · hoy a medias',
      'Terminó la fuerza antes de tiempo: tinte ámbar suave, media luna en el sello y los minutos que sí midió. NO es un ✓ (afirmaría un trabajo completo que no ocurrió) ni un fallo. En el menú: «Completar ahora» y «Deshacer hecho».',
      lectura(s, SEMANA_QUE_VIENE()),
    );
  })(),

  (() => {
    const s = semana(
      LUNES,
      HOY,
      [
        [d('fuerza-inferior', 'hecha')],
        [d('series-400')],
        [d('remo-5x1000', 'hecha')],
        [d('rodaje-45', 'saltada')],
        [d('fuerza-superior')],
        [d('tirada-larga')],
        [],
      ],
      { nombreBloque: BLOQUE, posicion: { semana: 3, total: 6 }, intencion: 'Semana de rodajes y fuerza. Lo importante es la tirada del sábado.', hayMasAdelante: true },
    );
    return caso(
      'sin-hacer',
      '⑤ Carla · hoy sin hacer, y el martes también',
      'El coach marcó hoy como no hecho y el martes ya pasó sin registro: los dos son «sin hacer», en gris y sin rojo (es un hecho, no un juicio). La card dice lo mismo que el carril. Se puede hacer igualmente: «Empezar» sigue ahí. Toca el martes: mismo sello, mismo lenguaje.',
      lectura(s, SEMANA_QUE_VIENE()),
    );
  })(),

  (() => {
    const s = semana(
      LUNES,
      HOY,
      [
        [d('remo-5x1000', 'hecha')],
        [d('fuerza-inferior', 'hecha')],
        [],
        [d('series-800')],
        [d('fuerza-superior')],
        [d('tirada-larga')],
        [],
      ],
      { nombreBloque: BLOQUE, posicion: { semana: 3, total: 6 }, intencion: 'Semana fuerte: acumulamos volumen.', hayMasAdelante: true },
    );
    return caso(
      'otro-dia',
      '⑥ Ona · mirando el sábado, no es hoy',
      'Un día HOJEADO: la card NO dice «Hoy» (el prefijo es un hecho), el naranja es el suave (es lo que viene, no lo de ahora) y hoy queda marcado en el carril con su aro. La acción sigue al día que ves. Toca hoy para volver; toca un día pasado para ver «Ayer», con sus minutos medidos.',
      lectura(s, SEMANA_QUE_VIENE()),
      { abre: { iso: '2026-10-03' } },
    );
  })(),

  (() => {
    const s = semana(
      LUNES,
      HOY,
      [
        [d('series-800', 'hecha')],
        [d('fuerza-inferior', 'hecha')],
        [d('remo-5x1000', 'hecha')],
        [],
        [d('series-400')],
        [d('tirada-larga')],
        [],
      ],
      { nombreBloque: BLOQUE, posicion: { semana: 3, total: 6 }, intencion: 'Semana fuerte: acumulamos volumen.', hayMasAdelante: true },
    );
    return caso(
      'descanso',
      '⑦ Biel · hoy descansa',
      'El plan cargó y hoy no hay nada: no se fabrica una sesión. Tinte verde azulado suave, sin número. Sitúa con lo que hiciste AYER (con sus minutos medidos) y lo que toca MAÑANA (con su duración escrita). La acción lleva a mañana. Es la misma card que un día con entreno, con otro contenido.',
      lectura(s, SEMANA_QUE_VIENE()),
    );
  })(),

  (() => {
    const s = semana(
      LUNES,
      HOY,
      [
        [d('remo-5x1000', 'hecha')],
        [],
        [d('fuerza-inferior', 'hecha')],
        [d('chipper')],
        [d('muerte-burpees')],
        [d('circuito-pierna')],
        [],
      ],
      { nombreBloque: BLOQUE, posicion: { semana: 3, total: 6 }, intencion: 'Semana de trabajo funcional: sin reloj, con la cabeza.', hayMasAdelante: true },
    );
    return caso(
      'sin-reloj',
      '⑧ Pol · hoy no hay reloj que escribir',
      'La duración es el reloj que ESCRIBE el plan o la razón por la que no lo hay, jamás un número a ojo. Hoy «For Time» dice «Dura lo que tardes». Recorre la semana: la fuerza dice «Según tu ritmo y tus descansos», la muerte por burpees «Hasta donde aguantes» y el circuito sin dosis «Sin detallar». Las cuatro razones, ninguna con cifra.',
      lectura(s, SEMANA_QUE_VIENE()),
    );
  })(),

  (() => {
    const vacia = semana(LUNES, HOY, [[], [], [], [], [], [], []], { planStartsOn: LUNES_QUE_VIENE, hayMasAdelante: true });
    const que_viene = semana(
      LUNES_QUE_VIENE,
      HOY,
      [[d('series-400')], [d('fuerza-inferior')], [], [d('remo-5x1000')], [d('rodaje-8k')], [d('tirada-larga')], []],
      { nombreBloque: 'Bloque 1 · base aeróbica', posicion: { semana: 1, total: 4 }, intencion: 'Primera semana: sin prisa, aprendiendo a que el ritmo sea tuyo.' },
    );
    return caso(
      'empieza-despues',
      '⑨ Nuria · su plan empieza el lunes',
      'Esta semana no tiene sesiones pero el plan YA está programado: se dice la fecha exacta («empieza el lunes 5 de octubre»), no «tu coach no ha publicado» (falso, y se leía como negligencia). La salida lleva a la semana que viene: tócala y llegas a ella con su carril; el «‹» te trae de vuelta.',
      lectura(vacia, que_viene),
    );
  })(),

  caso(
    'alta',
    '⑩ Lía · recién dada de alta, nada publicado',
    'EL CASO MÍNIMO (§6.3): sin ninguna sesión y sin fecha de inicio. Se dice lo que pasa («se está preparando») sin afirmar qué hará el coach ni cuándo, y la salida es escribirle. El cromo sigue entero: el historial y el chat no desaparecen porque no haya plan. Sin «compartir»: no hay semana que enseñar.',
    lectura(semana(LUNES, HOY, [[], [], [], [], [], [], []]), null),
  ),

  caso(
    'pausa',
    '⑪ Aina · plan en pausa',
    'El coach ha pausado el plan: ni sesiones caducadas ni carril. Una pausa tranquila que dice desde cuándo y que el progreso está guardado, con la salida de escribir al coach. El texto no supone el motivo (podían ser vacaciones): el código del motivo no sale al atleta.',
    lectura(
      semana(LUNES, HOY, [[d('fuerza-inferior', 'hecha')], [], [d('series-800')], [], [], [], []], { nombreBloque: BLOQUE }),
      null,
      { pausa: { desde: '2026-09-14' } },
    ),
  ),

  (() => {
    const s = semana(
      LUNES,
      HOY,
      [[d('remo-5x1000', 'hecha')], [d('fuerza-inferior', 'hecha')], [], [d('hyrox-sim')], [], [d('rodaje-45')], []],
      {
        nombreBloque: 'Bloque 3 · puesta a punto',
        posicion: { semana: 5, total: 6 },
        intencion: 'Hoy, la simulación entera. Es la última antes de la carrera.',
        hayMasAdelante: true,
      },
    );
    return caso(
      'hyrox',
      '⑫ Jan · hoy es la simulación HYROX',
      'La sesión más larga: 16 estaciones y tres partes. Calentamiento y vuelta a la calma van atenuados y sin lista; la simulación enseña tres ejercicios y «+ 13 más». Es «For Time», así que la duración dice «Dura lo que tardes». Baja para ver todo: la acción sigue anclada abajo.',
      lectura(s, SEMANA_QUE_VIENE()),
    );
  })(),

  (() => {
    const s = semana(
      LUNES,
      HOY,
      [[d('series-800', 'hecha')], [d('fuerza-inferior', 'hecha')], [], [d('rodaje-8k')], [d('fuerza-superior')], [d('tirada-larga')], []],
      { nombreBloque: BLOQUE, posicion: { semana: 3, total: 6 }, intencion: 'Semana fuerte: acumulamos volumen.', hayMasAdelante: false, bloqueadaPorHorizonte: true },
    );
    const hoy = s.dias[3]!.sesiones[0]!.id;
    // El servidor no sirvió el desglose de hoy: sin entrada, se lee `sin-detalle`.
    const conDetalle = Object.fromEntries(Object.entries(desglosesDe([s])).filter(([id]) => id !== hoy));
    return caso(
      'horizonte',
      '⑬ Sara · la semana que viene, bloqueada por su club',
      'Hay semana publicada más adelante pero el club no deja verla todavía. El «›» lleva un candado y al tocarlo dice por qué con el mensaje del club (o el de por defecto): no es un botón muerto. Sin «‹» porque estás en esta semana. Además, hoy el servidor NO sirvió el desglose de la sesión: la card enseña lo que sí sabe (su estructura de una línea) y calla el resto, sin partes inventadas.',
      lectura(s, null, { muro: 'Tu club publica el plan con una semana de antelación. Se abre el lunes.', desgloses: conDetalle }),
    );
  })(),

  (() => {
    const s = semana(
      LUNES,
      HOY,
      [[d('series-800', 'hecha')], [d('fuerza-inferior', 'hecha')], [], [d('rodaje-8k')], [d('fuerza-superior')], [d('tirada-larga')], []],
      { nombreBloque: BLOQUE, posicion: { semana: 3, total: 6 }, intencion: 'Semana fuerte: acumulamos volumen.', hayMasAdelante: true },
    );
    return caso(
      'sin-red',
      '⑭ Óscar · la semana que viene no carga',
      'Toca «›»: la semana que viene se pide (esqueleto del carril y de la card, con la forma final) y falla. Se dice «no pudimos cargarla», con «Reintentar» y sin afirmar nada del coach. (El Swift de hoy dice aquí «tu coach aún no ha llenado la semana», que es falso.)',
      lectura(s, 'falla'),
    );
  })(),

  (() => {
    const s = semana(
      LUNES,
      HOY,
      [[d('remo-5x1000', 'hecha')], [], [d('rodaje-45', 'hecha')], [d('emom-20')], [d('movilidad-core')], [], []],
      { posicion: { semana: 5, total: null } },
    );
    return caso(
      'plan-directo',
      '⑮ Neus · plan directo, sin nombre de bloque ni línea del coach',
      'Plan sin bloque: «Semana 5» a secas (el total no es un hecho: crece a medida que el coach publica) y sin línea de la semana. Nada se inventa: la etiqueta dice «Tu plan» y la cabecera no deja un hueco donde iría la voz del coach. EMOM de un solo bloque: sin título de parte repetido.',
      lectura(s, null),
    );
  })(),

  (() => {
    const s = semana(
      LUNES,
      HOY,
      [
        [d('fuerza-inferior', 'hecha')],
        [d('libre-rodaje', 'hecha')],
        [],
        [
          d('test-1k', 'pendiente', { franja: 'AM' }),
          d('importada', 'pendiente', { franja: 'PM' }),
          d('libre-rodaje', 'pendiente', { franja: 'AM', libre: true }),
        ],
        [d('fuerza-superior')],
        [d('tirada-larga')],
        [],
      ],
      {
        nombreBloque: 'Bloque 2 · fuerza, ritmo y un test en medio del bloque',
        posicion: { semana: 3, total: 6 },
        intencion:
          'Esta semana quiero que te fíes del ritmo y no del reloj. El lunes y el martes son para asimilar la carga del bloque anterior; el jueves toca test y volumen; el sábado cerramos con una tirada progresiva. Si algo duele, me escribes antes de entrenar.',
        hayMasAdelante: true,
      },
    );
    return caso(
      'denso',
      '⑯ Berta · todo reclamando a la vez',
      'El peor caso: pareja de dobles, un entreno guardado, tres sesiones un mismo día (un test, una importada con título kilométrico y cinco partes, y un libre), línea del coach de cuatro líneas y nombre de bloque larguísimo. Ninguna sesión queda huérfana: las demás bajan en filas compactas. Prueba «Empezar» (te pregunta antes de pisar lo guardado) y «Marcar como hecha» (falla la primera vez y se revierte).',
      lectura(s, SEMANA_QUE_VIENE(), { companero: 'Biel', guardado: { titulo: 'Series 6×800' } }),
      { fallaAcciones: true },
    );
  })(),

  caso(
    'cargando',
    '⑰ Arranque en frío (todavía sin semana)',
    'Primera carga sin caché. El cromo es real (el historial y el chat no esperan); la cabecera, el carril, la card y la acción anclada son esqueletos con la MISMA forma que tendrán: ni un vacío ni una invitación (aún no sabemos cuál toca) y nada salta al llegar los datos.',
    lectura(null, null, { cargando: true, desgloses: {} }),
  ),

  caso(
    'error',
    '⑱ Primer arranque sin red',
    'Sin semana y sin caché: no puede quedarse girando para siempre. Error con su salida («Reintentar») y el cromo entero, porque el historial y el chat no dependen del plan.',
    lectura(null, null, { errorCarga: true, desgloses: {} }),
  ),
];

export function casoPlan(id: string): CasoPlan {
  const c = CASOS_PLAN.find((x) => x.id === id);
  if (!c) throw new Error(`Caso de Plan desconocido: ${id}`);
  return c;
}

// ── MATRIZ: cada pieza, sus cuatro estados ───────────────────────────────────
//  Cromo         con datos ①(compartir, ciclo, historial, chat) · dobles ⑯ · sin semana ⑩ (sin compartir) · cargando ⑰ · error ⑱
//  Cabecera      con voz del coach ① · sin nombre ni línea ⑮ · cargando ⑰ · (sin cabecera: pausa ⑪, vacíos ⑨⑩, error ⑱)
//  Carril        con sellos ①②③④⑤ · otro día ⑥ · cargando ⑰ · semana que viene ①(›) · sin red ⑭ · bloqueada ⑬
//  Card sesión   pendiente hoy ① · hecha ③ · a medias ④ · sin hacer ⑤ · otro día ⑥ · sin reloj ⑧ · larga ⑫ · cargando ⑰
//  Card descanso hoy ⑦ · otro día (interactivo) · vacía con salida ⑨⑩ · pausa ⑪ · error ⑱
//  Partes        varias ①⑫ · una sola ⑮ · muchas (+ N más) ⑯ · cargando (al cambiar de día, interactivo) · sin detalle ⑬
//  Fila 2ª       una ② · varias ⑯
//  Acción        empezar ① · ver hecho ③ · ver siguiente ⑦ · reintentar ⑭⑱ · escribir al coach ⑩⑪ · ver semana que viene ⑨
//  Menú          pendiente ① · hecha ③ · a medias ④ · libre ⑯ · fallo ⑯
