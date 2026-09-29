// LOS CASOS DE «PERFIL» — veinte atletas de ejemplo que recorren todos los
// estados. NINGUNO sale de la base de producción (CONTRATO-UI §7; memoria «no
// hay atletas reales»): son personas inventadas para probar el modelo, y lo que
// las hace útiles es qué estado de cada pieza ejercitan.
//
// El orden es el de un día real, del caso lleno al mínimo (§6.3: «el caso mínimo
// es el caso de diseño»): el recién dado de alta (② con coach) y el vacío total
// sin coach (⑱) van a la vista, no escondidos al final.
//
// Cada pieza de la pestaña tiene sus cuatro estados cubiertos por al menos un
// caso — matriz al pie de este fichero. Si añades una pieza, añade su estado.

import type { CasoPerfil } from './contrato';
import {
  ALTA,
  CARGANDO,
  FUENTES_LLENAS,
  FUENTES_VACIAS,
  IDENTIDAD_VACIA,
  LIBRE,
  SIN_RESPUESTA,
  caso,
  contesto,
  fuentes,
  identidad,
} from './casos-base';

export const CASOS_PERFIL: CasoPerfil[] = [
  caso(
    'veterano',
    '① Nora · un año dentro, todo con dato',
    'El caso LLENO: foto, subtítulo con sus métricas (sin «nivel» inventado), las cinco cifras de Rendimiento con su origen, reloj conectado y movimiento permitido. Mira qué manda (la identidad), que las cifras se leen de un golpe y que los ajustes quedan abajo: las puertas que dicen algo a la vista y las mudas (Cuenta, Ayuda y legal) plegadas.',
    {},
  ),
  caso(
    'alta',
    '② Marc · recién dado de alta (con coach)',
    'El CASO MÍNIMO: sin foto, sin métricas, sin reloj, nada medido. No puede parecer roto: el sujeto se vuelve invitación (la acción es completar el perfil, la foto se pone tocando el avatar), los contadores se pintan en cero (0 de 4, 0 de 12), y lo que el atleta puede medir declara su salida en vez de un guion.',
    ALTA,
  ),
  caso(
    'libre',
    '③ Iris · sin coach (tier libre)',
    'Tres cifras en vez de cinco: sin tests ni zonas (las calibra un coach), sin suscripción en «Identidad», sin metodología en «Cuenta», sin chip de coach. La pieza impar (fuerza) ocupa el ancho. Ninguna pieza de coach se pinta, ni siquiera vacía.',
    {
      ...LIBRE,
      identidad: identidad({
        nombre: 'Iris Costa',
        foto: true,
        edad: 29,
        anosEntrenando: 3,
        alturaCm: 168,
        pesoKg: 58,
        objetivo: 'improve_running',
      }),
      rendimiento: fuentes(LIBRE.rendimiento!, {
        marcas: contesto({ conRecord: 2, catalogo: 12 }),
        vo2: contesto({ valor: 44.1, fuente: 'reloj' }),
        fuerza: contesto([{ etiqueta: 'Sentadilla', kg: 90 }]),
      }),
      dispositivos: ['salud'],
      movimientoReloj: 'sin-preguntar',
    },
  ),
  caso(
    'pareja',
    '④ Dídac · con su pareja de Dobles',
    'Entrena en Dobles con Biel: la pareja es parte de quién eres, así que sale como marca en el sujeto («Dobles · con Biel») y como estado de la puerta Identidad. No hay nada que hacer, así que no reclama.',
    {
      identidad: identidad({
        nombre: 'Dídac Font',
        foto: true,
        division: 'Open',
        edad: 31,
        anosEntrenando: 4,
        alturaCm: 181,
        pesoKg: 78,
        fcMax: 190,
        objetivo: 'first_hyrox',
      }),
      dobles: { tipo: 'con-pareja', nombre: 'Biel' },
      rendimiento: fuentes(FUENTES_LLENAS, {
        bateria: contesto({ total: 4, completados: 3, aMedias: 0 }),
        marcas: contesto({ conRecord: 5, catalogo: 12 }),
        vo2: contesto({ valor: 48.2, fuente: 'reloj' }),
        fuerza: contesto([
          { etiqueta: 'Sentadilla', kg: 150 },
          { etiqueta: 'Peso muerto', kg: 190 },
        ]),
      }),
    },
  ),
  caso(
    'sin-ancla',
    '⑤ Pol · zonas sin ancla',
    'Tiene VO₂ y 1RM pero ninguna ancla de pulso: NO hay zonas y no se inventa ninguna. La tesela de zonas declara el hueco con los DOS actos que lo llenan (fecha de nacimiento o test de umbral) y nadie le ve una cifra por defecto.',
    {
      identidad: identidad({ nombre: 'Pol Vidal', foto: true, alturaCm: 181, pesoKg: 79, }),
      rendimiento: fuentes(FUENTES_LLENAS, {
        bateria: contesto({ total: 4, completados: 0, aMedias: 0 }),
        marcas: contesto({ conRecord: 2, catalogo: 12 }),
        vo2: contesto({ valor: 42.4, fuente: 'reloj' }),
        zonas: contesto(null),
        fuerza: contesto([
          { etiqueta: 'Sentadilla', kg: 120 },
          { etiqueta: 'Peso muerto', kg: 245 },
        ]),
      }),
      dispositivos: ['salud', 'watch'],
    },
  ),
  caso(
    'tests-a-medias',
    '⑥ Aina · tests a medias, zonas estimadas',
    'Batería 2 de 4 con un test hecho pero sin su número («1 sin resultado»): es la única tesela que pide un acto y lo dice en tinte y regleta, no en la cifra. Sus zonas salen de su edad y la tesela lo escribe («Estimado por tu edad»): un umbral inferido nunca se lee como medido.',
    {
      identidad: identidad({
        nombre: 'Aina Serra',
        foto: true,
        division: 'Open',
        edad: 27,
        anosEntrenando: 2,
        alturaCm: 165,
        pesoKg: 56,
        objetivo: 'first_hyrox',
      }),
      rendimiento: fuentes(FUENTES_LLENAS, {
        bateria: contesto({ total: 4, completados: 2, aMedias: 1 }),
        marcas: contesto({ conRecord: 3, catalogo: 12 }),
        vo2: contesto({ valor: 46.5, fuente: 'cooper' }),
        zonas: contesto({ umbralPpm: 171, origen: 'Estimado por tu edad' }),
        fuerza: contesto([{ etiqueta: 'Peso muerto', kg: 105 }]),
      }),
    },
  ),
  caso(
    'reloj-retirado',
    '⑦ Jan · reloj conectado, movimiento retirado',
    'Tiene Apple Salud y Apple Watch, y dijo «Ahora no» al movimiento del reloj. Es una decisión suya, no un fallo: la puerta Privacidad dice «Movimiento del reloj: retirado» en tono neutro (ni verde ni rojo) y se ve a la primera: una decisión sobre tus datos no se esconde tras un pliegue, aunque no pida nada.',
    {
      identidad: identidad({
        nombre: 'Jan Roca',
        foto: true,
        division: 'Pro',
        edad: 36,
        anosEntrenando: 9,
        alturaCm: 178,
        pesoKg: 74,
        fcMax: 184,
        objetivo: 'improve_hyrox_mark',
      }),
      dispositivos: ['salud', 'watch'],
      movimientoReloj: 'retirado',
    },
  ),
  caso(
    'coros',
    '⑧ Núria · COROS pregunta «¿esto es el entreno?»',
    'Hay una actividad nueva de COROS y un entreno previsto hoy. Hoy es un diálogo del sistema que salta al abrir Perfil; aquí es la primera fila de «Pendiente», con sus tres respuestas a la vista (Sí, No, Ahora no). Pruébalas: la fila se va y avisa de qué pasa con la actividad.',
    {
      identidad: identidad({
        nombre: 'Núria Pla',
        foto: true,
        edad: 33,
        anosEntrenando: 5,
        alturaCm: 170,
        pesoKg: 61,
        fcMax: 186,
        objetivo: 'improve_running',
      }),
      dispositivos: ['coros', 'salud'],
      corosPendiente: { inicio: '7:12' },
    },
  ),
  caso(
    'sin-nombre',
    '⑨ Perfil sin nombre aún',
    'La cuenta existe y el nombre no llegó: silueta en vez de iniciales vacías, y el título es una pregunta, no un hueco («¿Cómo te llamas?»). Sigue habiendo altura y peso, así que se ve el subtítulo. La acción es poner el nombre.',
    {
      identidad: identidad({ nombre: '', alturaCm: 175, pesoKg: 70 }),
      rendimiento: fuentes(FUENTES_VACIAS),
      dispositivos: [],
      movimientoReloj: 'sin-preguntar',
    },
  ),
  caso(
    'cargando',
    '⑩ Arranque en frío (todavía sin datos)',
    'Primera carga sin caché. El sujeto y las cifras son esqueletos con la MISMA forma que tendrán: ni un vacío ni una invitación (aún no sabemos cuál de las dos toca). Las puertas dicen lo que hay dentro, porque su estado aún no se sabe, y «Pendiente» no se pinta hasta saber si hay algo.',
    {
      cargando: true,
      identidad: IDENTIDAD_VACIA,
      rendimiento: { bateria: CARGANDO, marcas: CARGANDO, vo2: CARGANDO, zonas: CARGANDO, fuerza: CARGANDO },
      suscripcion: null,
      dispositivos: [],
      movimientoReloj: 'sin-preguntar',
      version: 'Versión 1.8.0 (312)',
    },
  ),
  caso(
    'error',
    '⑪ Primer arranque sin red',
    'La identidad no cargó y no hay caché: el sujeto no puede quedarse girando para siempre. Error con su salida («Reintentar») y las cifras, una sola frase que dice por qué y dónde está la salida (no cinco teselas de error). Lo que no depende de la red sigue vivo: cuenta, privacidad, ayuda y cerrar sesión.',
    {
      errorCarga: true,
      identidad: IDENTIDAD_VACIA,
      rendimiento: {
        bateria: SIN_RESPUESTA,
        marcas: SIN_RESPUESTA,
        vo2: SIN_RESPUESTA,
        zonas: SIN_RESPUESTA,
        fuerza: SIN_RESPUESTA,
      },
      suscripcion: null,
      dispositivos: [],
      movimientoReloj: 'sin-preguntar',
    },
  ),
  caso(
    'denso',
    '⑫ Carla · todo con aviso a la vez',
    'El peor caso de densidad: pago pendiente, invitación de Dobles caducada, pregunta de COROS, tests a medias, zonas estimadas, sin VO₂, movimiento retirado y sin foto. «Pendiente» las reparte en el orden en que caducan, la puerta Identidad se tiñe de aviso y Privacidad dice su decisión sin abrir nada; el sujeto y las cifras no se pierden.',
    {
      identidad: identidad({
        nombre: 'Carla Pons',
        foto: false,
        division: 'Open',
        edad: 38,
        anosEntrenando: 7,
        alturaCm: 166,
        pesoKg: 60,
        objetivo: 'improve_hyrox_mark',
      }),
      suscripcion: { tipo: 'pago-pendiente' },
      dobles: { tipo: 'invitacion', estado: 'caducada', email: 'aleix@ejemplo.es', caduca: null },
      corosPendiente: { inicio: '19:05' },
      rendimiento: fuentes(FUENTES_LLENAS, {
        bateria: contesto({ total: 4, completados: 2, aMedias: 1 }),
        marcas: contesto({ conRecord: 1, catalogo: 12 }),
        vo2: contesto(null),
        zonas: contesto({ umbralPpm: 168, origen: 'Estimado por tu edad' }),
        fuerza: contesto([{ etiqueta: 'Press banca', kg: 47.5 }]),
      }),
      dispositivos: ['salud'],
      movimientoReloj: 'retirado',
    },
  ),
  caso(
    'termina',
    '⑬ Lluís · la suscripción termina el 12 oct',
    'Cancelada al final del periodo: sigue con acceso hasta esa fecha. No es un acto (nada que resolver hoy), es un estado: sale en la puerta Identidad con marca de aviso y esa puerta no se pliega, pero «Pendiente» no aparece.',
    {
      identidad: identidad({
        nombre: 'Lluís Bosch',
        foto: true,
        edad: 42,
        anosEntrenando: 10,
        alturaCm: 183,
        pesoKg: 84,
        fcMax: 179,
        objetivo: 'complete_fun',
      }),
      suscripcion: { tipo: 'termina', el: '12 oct' },
      rendimiento: fuentes(FUENTES_LLENAS, {
        bateria: contesto({ total: 4, completados: 4, aMedias: 0 }),
        marcas: contesto({ conRecord: 6, catalogo: 12 }),
        vo2: contesto({ valor: 41.0, fuente: 'cooper' }),
        zonas: contesto({ umbralPpm: 154, origen: 'Con el umbral que declaraste' }),
      }),
    },
  ),
  caso(
    'fuente-caida',
    '⑭ Vera · el VO₂ no contestó',
    'Una sola fuente falló y las otras cuatro llegaron. La tesela afectada dice «No pudimos cargarlo» con su «Reintentar» (no se queda en esqueleto para siempre, que es lo que hace Swift hoy) y el recuento «N de 5 con dato» se calla: con una pieza desconocida sería un número que miente.',
    {
      identidad: identidad({
        nombre: 'Vera Molina',
        foto: true,
        division: 'Open',
        edad: 30,
        anosEntrenando: 3,
        alturaCm: 169,
        pesoKg: 62,
        fcMax: 190,
        objetivo: 'first_hyrox',
      }),
      rendimiento: fuentes(FUENTES_LLENAS, {
        bateria: contesto({ total: 4, completados: 1, aMedias: 0 }),
        marcas: contesto({ conRecord: 4, catalogo: 12 }),
        vo2: SIN_RESPUESTA,
        zonas: contesto({ umbralPpm: 167, origen: 'Medido en tu test de umbral' }),
      }),
    },
  ),
  caso(
    'largos',
    '⑮ Nombre y datos largos',
    'Límite de maquetación: un nombre de 35 letras, un subtítulo con todo, una pareja con nombre largo y un estado de puerta que da tres líneas. El nombre baja de tamaño en vez de ganar una tercera línea; nada desborda, nada se corta.',
    {
      identidad: identidad({
        nombre: 'Alejandro Sánchez-Villanueva Ortega',
        foto: true,
        division: 'Elite',
        edad: 41,
        anosEntrenando: 12,
        alturaCm: 188,
        pesoKg: 92.5,
        fcMax: 181,
        objetivo: 'improve_hyrox_mark',
      }),
      coach: 'Marina',
      dobles: { tipo: 'con-pareja', nombre: 'María del Carmen' },
      suscripcion: { tipo: 'activa' },
    },
  ),
  caso(
    'sin-pareja',
    '⑯ Bruno · Dobles sin compañero/a',
    'Su plan es de Dobles y aún no ha invitado a nadie: es un ACTO (invitar por email), así que entra en «Pendiente» con su salida y la puerta Identidad lo marca con la marca de «puedes hacer algo». Además su coach no le ha programado tests: la tesela lo dice y no pinta «0 de 0», porque no hay ningún acto que él pueda hacer.',
    {
      identidad: identidad({
        nombre: 'Bruno Camps',
        foto: false,
        division: 'Open',
        edad: 35,
        anosEntrenando: 5,
        alturaCm: 179,
        pesoKg: 80,
      }),
      dobles: { tipo: 'sin-pareja' },
      rendimiento: fuentes(FUENTES_LLENAS, {
        // Su coach aún no le ha programado la batería: sin contador, y sin acto que él pueda hacer.
        bateria: contesto({ total: 0, completados: 0, aMedias: 0 }),
        marcas: contesto({ conRecord: 1, catalogo: 12 }),
        vo2: contesto(null),
        zonas: contesto(null),
        fuerza: contesto([]),
      }),
      dispositivos: [],
      movimientoReloj: 'sin-preguntar',
    },
  ),
  caso(
    'invitacion',
    '⑰ Emma · invitación de Dobles enviada',
    'Invitó a su compañero y espera: no hay nada que hacer, así que NO entra en «Pendiente» (esperar no es un acto). Solo lo cuenta la puerta Identidad, con cuándo caduca. Y su coach aún no ha definido marcas: la tesela dice que no hay nada que probar (sin salida, porque no es cosa suya).',
    {
      identidad: identidad({
        nombre: 'Emma Ribas',
        foto: true,
        division: 'Open',
        edad: 28,
        anosEntrenando: 3,
        alturaCm: 164,
        pesoKg: 55,
        fcMax: 192,
      }),
      dobles: { tipo: 'invitacion', estado: 'pendiente', email: 'oriol@ejemplo.es', caduca: 'en 12 días' },
      rendimiento: fuentes(FUENTES_LLENAS, {
        bateria: contesto({ total: 4, completados: 1, aMedias: 0 }),
        // Su coach aún no ha definido el catálogo de marcas: no hay nada que probar, y se dice.
        marcas: contesto({ conRecord: 0, catalogo: 0 }),
        vo2: contesto({ valor: 43.7, fuente: 'reloj' }),
        fuerza: contesto([
          { etiqueta: 'Sentadilla', kg: 85 },
          { etiqueta: 'Peso muerto', kg: 110 },
        ]),
      }),
    },
  ),
  caso(
    'libre-alta',
    '⑱ Leo · sin coach y recién dado de alta',
    'El vacío TOTAL del tier libre: tres teselas y las tres con su invitación, sin ninguna pieza de coach y sin nombre de coach en ninguna parte. Es el perfil más corto que existe y no puede parecer una pantalla a medias.',
    {
      ...LIBRE,
      identidad: identidad({ nombre: 'Leo Marín' }),
      rendimiento: fuentes(FUENTES_VACIAS, { bateria: contesto(null), zonas: contesto(null) }),
      dispositivos: [],
      movimientoReloj: 'sin-preguntar',
    },
  ),
  caso(
    'coros-importados',
    '⑲ Núria · COROS acaba de importar entrenos',
    'La sincronización de COROS al abrir Perfil trajo dos entrenos. Hoy es una alerta que hay que descartar; aquí es un aviso pasajero sobre las pestañas (sin botón: es una buena noticia y se va sola). Lo que no cambia: el texto es el de la app.',
    {
      identidad: identidad({
        nombre: 'Núria Pla',
        foto: true,
        edad: 33,
        anosEntrenando: 5,
        alturaCm: 170,
        pesoKg: 61,
        fcMax: 186,
        objetivo: 'improve_running',
      }),
      dispositivos: ['coros', 'salud'],
      corosAviso: { tono: 'ok', texto: 'Importados 2 entrenos de COROS.' },
    },
  ),
  caso(
    'coros-fallo',
    '⑳ Núria · COROS no pudo sincronizar',
    'La sincronización falló (sin red). Un fallo no se va solo: el aviso se queda hasta que se descarta con «Entendido», como la alerta de hoy, y nada más de la pantalla se ve afectado.',
    {
      identidad: identidad({
        nombre: 'Núria Pla',
        foto: true,
        edad: 33,
        anosEntrenando: 5,
        alturaCm: 170,
        pesoKg: 61,
        fcMax: 186,
        objetivo: 'improve_running',
      }),
      dispositivos: ['coros', 'salud'],
      corosAviso: { tono: 'fallo', texto: 'Sin conexión. Vuelve a intentarlo cuando tengas red.' },
    },
  ),
];

export function casoPerfil(id: string): CasoPerfil {
  const c = CASOS_PERFIL.find((x) => x.id === id);
  if (!c) throw new Error(`Caso de Perfil desconocido: ${id}`);
  return c;
}

// ── MATRIZ: cada pieza, sus cuatro estados ───────────────────────────────────
//  Sujeto (identidad)   datos ①③④⑤…   · invitación ②⑨⑯(sin métricas) · cargando ⑩ · error ⑪
//  Pendiente            ninguno ①      · uno ⑧⑯ · varios ⑫            · en frío: no se pinta (⑩) · error: no se pinta (⑪)
//  Rendimiento · filas  valor ①        · vacío ②⑤⑱                    · cargando ⑩ · sin respuesta ⑭ (una) ⑪ (todas)
//  Aviso de COROS        ninguno ①      · importados ⑲ · fallo ⑳       · (la pregunta ⑧ es su alternativa: nunca las dos)
//  Rendimiento · tests  contador ①⑥    · sin batería ③⑱ (no aplica)   · a medias ⑥⑫
//  Puertas · estado     con estado ①⑦⑬ · sin estado (Cuenta, Ayuda)   · en frío: descripción real ⑩ · error: ⑪
//  Puertas · pliegue    4 + 2 ①⑦       · 3 + 3 ②(Privacidad muda)      · una sube por decir algo ⑦⑫⑬ · todas visibles no existe (Cuenta y Ayuda no dicen nada)
//  Pie                  siempre (cerrar sesión, versión con siete toques)
