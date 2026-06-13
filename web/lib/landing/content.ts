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
  // headline rendered as kinetic lines (array = lines):
  headlineLines: ['DEJA DE IMPROVISAR', 'TU HYROX.'],
  sub: 'Construimos tu plan y lo ajustamos cada semana a tu nivel, tu material y tu próxima carrera. Tú no decides qué toca hoy: solo entrenas.',
  primaryCta: 'Empieza tu plan',
  secondaryCta: 'Cómo funciona',
  trust: 'Desde 70€/mes · 30 días de garantía · Disponible en iOS',
} as const;

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
  heading: 'Tu entrenador, contigo. En cuatro pasos.',
  steps: [
    {
      n: '01',
      title: 'Cuéntanos quién eres',
      body: 'Tu nivel, tus lesiones, tu material y la carrera que tienes en mente. Ese es tu punto de partida.',
    },
    {
      n: '02',
      title: 'Construimos tu plan',
      body: 'Te montamos tu entrenamiento a medida, listo en 48–72h. Para ti, no de plantilla.',
    },
    {
      n: '03',
      title: 'Entrenas con tu plan',
      body: 'Cada semana, tus entrenos al detalle en la app: qué hacer, cómo hacerlo y para qué.',
    },
    {
      n: '04',
      title: 'Lo ajustamos a cómo vas',
      body: 'Nos dices cómo fue y ajustamos lo que viene. Tu plan evoluciona contigo, carrera tras carrera.',
    },
  ],
} as const;

export const METHODOLOGY = {
  label: 'TU ENTRENAMIENTO',
  heading: 'Preparado para cada parte de la carrera.',
  sub: 'Carrera, fuerza, ergómetros, las estaciones, simulaciones... Tu plan combina todo lo que necesitas para llegar a meta — dosificado para ti y para tu próxima prueba.',
  pillars: [
    { id: 1, name: 'Fuerza', colorVar: '--grp-fuerza-base', body: 'Más fuerte en sled, farmers y wall balls. La base sobre la que se construye todo.' },
    { id: 2, name: 'Potencia', colorVar: '--grp-fuerza-explosiva-pliometrica', body: 'Explosividad y reactividad para moverte rápido, también cuando llega la fatiga.' },
    { id: 3, name: 'Ergómetros', colorVar: '--grp-series-ergometros', body: 'Ski, Row y Bike. Vatios que se notan en cada estación de la carrera.' },
    { id: 4, name: 'Carrera', colorVar: '--grp-series-running', body: 'Ritmo, series y resistencia para aguantar fuerte los 8 km de HYROX.' },
    { id: 5, name: 'Fondo aeróbico', colorVar: '--grp-zona2-recuperacion', body: 'El motor que sostiene toda la prueba de principio a fin.' },
    { id: 6, name: 'Intensidad', colorVar: '--grp-wods-metcons', body: 'Aguantar el ritmo bajo presión, igual que el día de la carrera.' },
    { id: 7, name: 'Simulaciones', colorVar: '--grp-simulaciones-carrera', body: 'Ensaya la carrera entera: estaciones, transiciones y cabeza.' },
    { id: 8, name: 'Las estaciones', colorVar: '--grp-circuitos-funcionales', body: 'Técnica y aguante en cada uno de los movimientos de HYROX.' },
    { id: 9, name: 'Movilidad y prevención', colorVar: '--grp-core-movilidad-preventivos', body: 'Llegas entero y sin lesiones a la línea de salida.' },
    { id: 10, name: 'Puesta a punto', colorVar: '--grp-tapering-activacion', body: 'Afinamos en las semanas clave para que llegues fino a tu carrera.' },
  ],
  closingLabel: 'De la salida a la meta',
} as const;

export const ANALYTICS = {
  label: 'TUS CARRERAS',
  heading: 'Cada split te dice dónde mejorar.',
  sub: 'Registra tu carrera estación por estación. Vemos tus 2–3 puntos débiles y se convierten en el foco de las próximas semanas. Ver cómo bajan tus tiempos, carrera tras carrera, engancha.',
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
  platformNote: 'En iOS. Android, en camino.',
} as const;

export const COACH = {
  label: 'TU ENTRENADOR',
  heading: 'Tu entrenador es Pablo. Una persona, no una plantilla.',
  body: 'Lleva Fabrik, los dos boxes con más comunidad HYROX de Barcelona. Ve cómo entrenas, conoce tu objetivo y ajusta tu plan cada semana — contigo, no en automático. No te bajas un plan: tienes a alguien que te lleva hasta la línea de salida.',
  // Portrait-plate label.
  plate: {
    title: 'Pablo', // TODO: ¿"Pablo Amigo"? confirmar con Alex
    place: 'Fabrik Training Club · Barcelona', // boxes: Mallorca 337 + Pg. Sant Joan 157
  },
  stats: [
    { value: '2', unit: 'boxes en Barcelona' },
    { value: '+250', unit: 'atletas entrenados' }, // TODO: número real
    { value: '#1', unit: 'comunidad HYROX de la ciudad' }, // TODO: verificar
  ],
} as const;

export const PRICING = {
  label: 'PRECIOS',
  heading: 'Un precio. Todo incluido. Cancela cuando quieras.',
  plans: [
    {
      key: 'individual',
      name: 'Individual',
      price: '70€',
      period: '/mes',
      highlight: false,
      badge: null,
      tagline: 'Para el atleta que va en serio.',
      features: [
        'Plan 100% personalizado',
        'Ajustes cada semana',
        'Análisis de tus carreras',
        'Habla con tu entrenador',
        'Vídeos de ejecución',
      ],
      cta: 'Empieza',
    },
    {
      key: 'dobles',
      name: 'Dobles',
      price: '115€',
      period: '/mes',
      highlight: true,
      badge: 'EL MÁS ELEGIDO',
      tagline: '57,50€ por persona. Entrenáis juntos sin perder personalización.',
      features: [
        'Dos planes 100% personalizados',
        'Ahorro del 18% frente a dos individuales',
        'Pensado para entrenar en pareja',
        'Ajustes semanales para ambos',
        'Todo lo del plan Individual',
      ],
      cta: 'Empezad juntos',
    },
    {
      key: 'pro_elite',
      name: 'Pro',
      price: '95€',
      period: '/mes',
      highlight: false,
      badge: null,
      tagline: 'Para competir en categoría Pro.',
      features: [
        'Mayor volumen de entrenamiento',
        'Análisis de splits avanzado',
        'Planificación de toda la temporada',
        'Prioridad en los ajustes de tu plan',
        'Todo lo del plan Individual',
      ],
      cta: 'Empieza',
    },
  ],
  guarantee: '30 días de garantía: si no mejoras, te devolvemos el dinero.',
  boxNote: {
    text: '¿Entrenas en uno de nuestros boxes? Tienes precio especial.',
    cta: 'Habla con nosotros',
  },
  microcopy: 'Mínimo 1 mes. Sin permanencia. Cancela cuando quieras.',
} as const;

export const FAQ = {
  label: 'PREGUNTAS',
  heading: 'Lo que necesitas saber.',
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
      a: 'Sí. La modalidad Dobles está pensada para dos, con un solo pago y sin perder personalización.',
    },
    {
      q: '¿Puedo cancelar?',
      a: 'Cuando quieras. Mantienes el acceso hasta el final del periodo que ya has pagado.',
    },
  ],
} as const;

export const FINAL = {
  headlineLines: ['TU PRÓXIMA CARRERA', 'YA TIENE ENTRENADOR.'],
  sub: 'Plan a medida, ajustado cada semana. Da el primer paso hoy.',
  cta: 'Empieza tu plan',
  trust: 'Desde 70€/mes · 30 días de garantía · Disponible en iOS',
} as const;

export const NAV = {
  links: [
    { label: 'Cómo funciona', href: `#${SECTION_IDS.comoFunciona}` },
    { label: 'Tu entrenador', href: `#${SECTION_IDS.pablo}` },
    { label: 'Entrenamiento', href: `#${SECTION_IDS.metodologia}` },
    { label: 'Precios', href: `#${SECTION_IDS.precios}` },
  ],
  cta: 'Empieza tu plan',
} as const;
