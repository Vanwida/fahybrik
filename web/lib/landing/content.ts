// FAHYBRID marketing landing — single typed source of truth for ALL copy + data.
//
// DRY: nothing is hardcoded in JSX. Section components import these typed consts.
//
// VOICE & AUDIENCE (read before editing copy):
//   - We speak to the END USER: an athlete who wants a real coach to take charge of
//     their HYROX/DEKA training. NOT coaches, NOT investors. One program: ours.
//   - Winning angle (grounded in market research): cognitive-relief ("deja de
//     improvisar") + the human-coach wedge ("un entrenador de verdad detrás, no una
//     plantilla"). HYROX-specific and concrete — never generic SaaS-speak.
//   - The coach is REAL and NAMED in his section (Pablo, Fabrik Training Club
//     Barcelona). Brand = FAHYBRID; Pablo is the head coach, not the brand.
//   - NEVER expose: "IA"/AI/algoritmo; "escalar"; internal jargon (bloques, sesiones
//     como inventario, "método", "biblioteca"). The wedge is a real person, said
//     without naming the AI category.
//   - Spanish, tú informal, athletic, direct, no filler, no emojis.
//
// Placeholders that need a real asset/number/claim are marked "// TODO: ...".

/** Anchor ids for every section (used by nav links + Section wrappers). */
export const SECTION_IDS = {
  hero: 'hero',
  porQue: 'por-que',
  comoFunciona: 'como-funciona',
  metodologia: 'metodologia',
  analitica: 'analitica',
  dobles: 'dobles',
  app: 'app',
  pablo: 'pablo',
  precios: 'precios',
  faq: 'faq',
  empieza: 'empieza',
} as const;

export type SectionId = (typeof SECTION_IDS)[keyof typeof SECTION_IDS];

/** Brand social — placeholder until the real FAHYBRID handle exists. */
export const SOCIAL = {
  instagram: '@fahybrid', // TODO: handle real de FAHYBRID
  instagramUrl: 'https://instagram.com/fahybrid', // TODO
} as const;

export const HERO = {
  eyebrow: 'ENTRENAMIENTO PERSONAL · HYROX & DEKA',
  // headline rendered as kinetic lines (array = lines). Three short lines so the
  // display type reads at brand scale over the hero photo; the Hero renders the
  // last line in accent (see accentLineIndex on <KineticHeadline>).
  headlineLines: ['DEJA DE', 'IMPROVISAR', 'TU HYROX.'],
  sub: 'Tu plan semanal, ajustado a tu nivel, tu material y tu próxima carrera. Tú solo entrenas. Nosotros pensamos por ti.',
  // Funnel vocabulary: plazas limitadas → solicitud → llamada. UN solo CTA en toda la
  // página (mismo literal en hero, nav, final y sticky). Coincide con la entrada de iOS.
  primaryCta: 'Solicita tu plaza',
  secondaryCta: 'Cómo funciona',
  trust: 'Plan 1:1 con tu entrenador · Primera llamada sin compromiso',
} as const;

// Hero → resto transition: a marquee band of the real HYROX stations. Pure content,
// zero claims. Kept SEPARATE from ANALYTICS.stations on purpose: this is the canonical
// list of the 8 competition movements + RoxZone with their official names ("Sandbag
// Lunges" plural, and RoxZone included), whereas ANALYTICS.stations are compact chart
// labels for a splits demo ("Sandbag Lunge", no RoxZone). Deriving one from the other
// would need a fragile singular/plural + append mapping for no real DRY win.
export const STATIONS_STRIP = [
  'SkiErg',
  'Sled Push',
  'Sled Pull',
  'Burpee Broad Jump',
  'Row',
  'Farmers Carry',
  'Sandbag Lunges',
  'Wall Balls',
  'RoxZone',
] as const;

export const PROMISE = {
  label: 'POR QUÉ FAHYBRID',
  heading: 'Programas de HYROX hay mil. Lo que falta es alguien que te lleve.',
  items: [
    {
      pain: 'Planes genéricos que no te conocen',
      promise: 'Un plan que parte de ti',
      body: 'Tu nivel, tu material, tus lesiones, tu próxima carrera. Construido para ti, no descargado.',
    },
    {
      pain: 'Entrenar solo, sin rumbo',
      promise: 'Un entrenador que te lleva',
      body: 'Vemos cómo respondes y ajustamos tu plan cada semana. El problema nunca fue el plan: era hacerlo solo.',
    },
    {
      pain: 'Llegar a la carrera a medias',
      promise: 'Preparado para TU carrera',
      body: 'Cada semana apunta a tu fecha y a tu tiempo. Llegas al sled del minuto 50 con algo en el depósito.',
    },
  ],
} as const;

export const HOW = {
  label: 'CÓMO FUNCIONA',
  heading: 'De cero a tu carrera. En cuatro pasos.',
  steps: [
    {
      n: '01',
      title: 'Cuéntanos quién eres',
      body: 'Tu nivel, tus lesiones, tu material y la carrera que tienes en mente. Ese es tu punto de partida.',
    },
    {
      n: '02',
      title: 'Construimos tu plan',
      body: 'En menos de 72h tienes tu plan 1:1 en la app. Diseñado desde cero para ti.',
    },
    {
      n: '03',
      title: 'Entrenas con tu plan',
      body: 'Cada semana, tus entrenos al detalle en la app: qué hacer, cómo hacerlo y para qué.',
    },
    {
      n: '04',
      title: 'El plan evoluciona. Igual que tú.',
      body: 'Pablo revisa cómo respondiste y adapta la semana siguiente. El plan nunca se queda estático.',
    },
  ],
} as const;

export const METHODOLOGY = {
  label: 'TU ENTRENAMIENTO',
  heading: 'Preparado para cada parte de la carrera.',
  sub: 'Running, fuerza, ergómetros, estaciones específicas y simulacros completos. Todo en un plan diseñado para lo que te espera en carrera.',
  // Each pillar carries a photo (web/public/landing/*.webp, dark brand grade,
  // watermark-free) shown as a low-opacity background in its card. The mapping is by
  // discipline. Most are real Fabrik-in-HYROX moments; the taper pillar uses a calm
  // pre-race shot (a runner lacing up on a dark road at night) as its quiet, low-effort
  // counterpoint — the cool-down note that closes the strip.
  pillars: [
    { id: 1, name: 'Fuerza', colorVar: '--grp-fuerza-base', image: '/landing/sled-push.webp', body: 'Más fuerte en sled, farmers y wall balls. La base sobre la que se construye todo.' },
    { id: 2, name: 'Potencia', colorVar: '--grp-fuerza-explosiva-pliometrica', image: '/landing/wall-balls.webp', body: 'Explosividad y reactividad para moverte rápido, también cuando llega la fatiga.' },
    { id: 3, name: 'Ergómetros', colorVar: '--grp-series-ergometros', image: '/landing/skierg.webp', body: 'Ski, Row y Bike. Vatios que se notan en cada estación de la carrera.' },
    { id: 4, name: 'Carrera', colorVar: '--grp-series-running', image: '/landing/run.webp', body: 'Ritmo, series y resistencia para aguantar fuerte los 8 km de HYROX.' },
    { id: 5, name: 'Fondo aeróbico', colorVar: '--grp-zona2-recuperacion', image: '/landing/row.webp', body: 'El motor que sostiene toda la prueba de principio a fin.' },
    { id: 6, name: 'Intensidad', colorVar: '--grp-wods-metcons', image: '/landing/intensidad.webp', body: 'Aguantar el ritmo bajo presión, igual que el día de la carrera.' },
    { id: 7, name: 'Simulaciones', colorVar: '--grp-simulaciones-carrera', image: '/landing/simulacion.webp', body: 'Ensaya la carrera entera: estaciones, transiciones y cabeza.' },
    { id: 8, name: 'Las estaciones', colorVar: '--grp-circuitos-funcionales', image: '/landing/sled-pull.webp', body: 'Técnica y aguante en cada uno de los movimientos de HYROX.' },
    { id: 9, name: 'Movilidad y prevención', colorVar: '--grp-core-movilidad-preventivos', image: '/landing/movilidad.webp', body: 'Llegas entero y sin lesiones a la línea de salida.' },
    { id: 10, name: 'Puesta a punto', colorVar: '--grp-tapering-activacion', image: '/landing/puesta-a-punto.webp', body: 'Afinamos en las semanas clave para que llegues fino a tu carrera.' },
  ],
  closingLabel: 'De la salida a la meta',
} as const;

export const ANALYTICS = {
  label: 'TUS CARRERAS',
  heading: 'Cada split te dice dónde mejorar.',
  sub: 'Analizamos tu carrera estación por estación. Los puntos débiles se convierten en el plan de las semanas siguientes. Y ver cómo bajan esos tiempos, carrera tras carrera, es lo que te hace seguir.',
  // TODO: real athlete data when available.
  stations: [
    { key: 'ski', name: 'SkiErg', seconds: 232, weak: false },
    { key: 'sled-push', name: 'Sled Push', seconds: 268, weak: true },
    { key: 'sled-pull', name: 'Sled Pull', seconds: 251, weak: false },
    { key: 'burpee', name: 'Burpee Broad Jump', seconds: 295, weak: true },
    { key: 'row', name: 'Row', seconds: 238, weak: false },
    { key: 'farmers', name: 'Farmers Carry', seconds: 184, weak: false },
    { key: 'lunge', name: 'Sandbag Lunge', seconds: 277, weak: true },
    { key: 'wallballs', name: 'Wall Balls', seconds: 312, weak: false },
  ],
  roxzoneLabel: 'RoxZone',
} as const;

export const APP = {
  label: 'LA APP',
  heading: 'Todo tu entrenamiento, en una pantalla.',
  features: [
    {
      title: 'Tu semana al detalle',
      body: 'Cada sesión con sus series, cargas, ritmos y vídeo de ejecución.',
    },
    {
      title: 'Habla con tu entrenador',
      body: 'Pregunta, ajusta y resuelve dudas cuando lo necesites. Una persona de verdad al otro lado.',
    },
    {
      title: 'Conecta tu reloj',
      body: 'Garmin, Polar y Strava. Tus entrenos se importan solos.',
    },
    {
      title: 'Tu progreso, a la vista',
      body: 'Historial, cargas y splits. Ves de dónde vienes y a dónde vas.',
    },
  ],
  // Mono caption under the phone mock.
  screenCaption: 'TU SEMANA EN LA APP',
  platformNote: 'En iOS. Android, en camino.',
} as const;

export const COACH = {
  label: 'TU ENTRENADOR',
  heading: 'Detrás de tu plan hay una persona.',
  body: 'Se llama Pablo. Lleva Fabrik, la mayor comunidad HYROX de Barcelona, y ahora lleva también tu programación 1:1: te conoce, sigue tu progreso y ajusta tu plan cada semana hasta que cruces la meta.',
  // Real portrait — warm b&w, tinted to brand duotono by the Coach component.
  photo: {
    src: '/landing/pablo.webp',
    alt: 'Pablo, entrenador de Fabrik Training Club en Barcelona',
  },
  // Portrait-plate label.
  plate: {
    title: 'Pablo Amigo', // ground truth: coaches.full_name
    place: 'Fabrik Training Club · Barcelona', // boxes: Mallorca 337 + Pg. Sant Joan 157
  },
  // countUp: solo el número puro cuenta 0→valor al entrar en viewport (los otros dos
  // no son enteros contables: '2' se deja quieto por decisión, '#1' es un ranking).
  stats: [
    { value: '2', unit: 'boxes en Barcelona' },
    { value: '+250', unit: 'atletas entrenados', countUp: true }, // TODO: número real
    { value: '#1', unit: 'comunidad HYROX de la ciudad' }, // TODO: verificar
  ],
} as const;

export const FAQ = {
  label: 'PREGUNTAS',
  heading: 'Lo que querrás saber.',
  // Below the accordion: a direct line to a real inbox.
  contact: { lead: '¿Otra duda? Escríbenos:', email: 'hello@fahybrid.com' },
  items: [
    {
      q: '¿Quién hace mi plan?',
      a: 'Lo hace Pablo, tu entrenador: diseña tu plan, sigue tu progreso y lo ajusta cada semana. Hablas con él, no con un bot.',
    },
    {
      q: '¿Necesito material específico?',
      a: 'No. Tu plan se adapta a lo que tienes: box completo, gimnasio convencional o entreno en casa.',
    },
    {
      q: '¿Y si soy principiante?',
      a: 'Todos los niveles, desde tu primera carrera hasta categoría Pro. El plan parte de donde estás.',
    },
    {
      q: '¿Y si me salto un día?',
      a: 'El plan es flexible. Reorganizas tu semana sin romper la progresión.',
    },
    {
      q: '¿Puedo entrenar con mi pareja o un amigo?',
      a: 'Sí. La modalidad Dobles está pensada para dos, sin perder personalización.',
    },
    {
      q: '¿Puedo cancelar?',
      a: 'Cuando quieras, sin permanencia. Los detalles los ves en tu llamada con Pablo.',
    },
  ],
} as const;

// HYROX Dobles — the social hook. A real product mode: one coordinated plan for two,
// stations split by each athlete's strengths, and a partner invite. Mirror of COACH in
// the UI (split flipped to the other side). CTA reuses the single primary label.
export const DOBLES = {
  label: 'HYROX DOBLES',
  // Explicit line break (array) so the display heading always breaks after the question,
  // never mid-clause — SectionHeading accepts string[] as explicit lines.
  heading: ['¿Vais a dobles?', 'Entrenad a dobles.'],
  body: 'En dobles corréis los 8 km juntos y os repartís las estaciones. Vuestro plan va igual: un programa coordinado para los dos, con las estaciones repartidas según los puntos fuertes de cada uno.',
  items: [
    { n: '01', title: 'Un plan para los dos', body: 'Coordinado semana a semana: mismo entrenador, mismo objetivo, misma carrera.' },
    { n: '02', title: 'Estaciones repartidas', body: 'El reparto sigue lo que se le da bien a cada uno. Como el día de la carrera.' },
    { n: '03', title: 'Invita a tu compañero', body: 'Uno solicita la plaza y el otro recibe la invitación. Y a entrenar.' },
  ],
  cta: 'Solicita tu plaza',
  note: 'Individual o dobles: lo decidís en la primera llamada.',
  photo: {
    src: '/landing/dobles.webp',
    alt: 'Pareja de dobles de Fabrik en HYROX: uno rema y su compañero espera su relevo',
  },
  // Generic athlete plate over the photo (project rule: no named athletes in captions).
  plateCaption: 'ATLETAS DE FABRIK · HYROX',
} as const;

export const FINAL = {
  headlineLines: ['TU PRÓXIMA CARRERA', 'YA TIENE ENTRENADOR.'],
  sub: 'Plan a medida, ajustado cada semana. Da el primer paso hoy.',
  cta: 'Solicita tu plaza',
  trust: 'Plazas limitadas · Primera llamada sin compromiso',
  // Full-bleed closing photo — already graded to the brand duotono.
  photo: {
    src: '/landing/meta-paris.webp',
    alt: 'Atleta de Fabrik tras cruzar la meta en HYROX París, con el logo de FAHYBRID Program en el pecho',
  },
} as const;

export const NAV = {
  links: [
    { label: 'Cómo funciona', href: `#${SECTION_IDS.comoFunciona}` },
    { label: 'Tu entrenador', href: `#${SECTION_IDS.pablo}` },
    { label: 'Entrenamiento', href: `#${SECTION_IDS.metodologia}` },
    { label: 'Dobles', href: `#${SECTION_IDS.dobles}` },
  ],
  cta: 'Solicita tu plaza',
} as const;

// Mobile-only sticky CTA bar (shown after the hero, hidden over the final CTA).
export const STICKY_CTA = { note: 'Plan 1:1 con Pablo', cta: 'Solicita tu plaza' } as const;
