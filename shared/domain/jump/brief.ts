// Briefing del test de salto — lo que el atleta tiene que saber ANTES.
//
// El test solo existe si el coach lo programa. El atleta lo ve en el plan
// con tiempo: qué traer, cómo se coloca el teléfono, cómo se salta, y en
// qué orden va a ir. No es un párrafo suelto ni una cámara de golpe.

import { formatJumpHeightCm, type JumpMethod } from './method';
import { resolveLoadKg, type JumpLoad } from './session';

export type JumpNeedId = 'tripod' | 'space' | 'load' | 'body_mass';

export interface JumpNeed {
  id: JumpNeedId;
  title: string;
  detail: string;
}

export interface JumpBriefStep {
  n: number;
  title: string;
  detail: string;
}

export interface JumpBrief {
  title: string;
  what: string;
  duration_label: string;
  needs: JumpNeed[];
  sequence: JumpBriefStep[];
  jump_cues: string[];
  phone: string[];
  /** Una línea para la tarjeta del día, antes de abrir el test. */
  day_card: string;
}

export function loadLabel(load: JumpLoad, bodyMassKg: number | null): string | null {
  if (load.kind === 'none') return null;
  if (load.kind === 'kg') return `${load.kg} kg`;
  const kg = resolveLoadKg(load, bodyMassKg);
  if (kg == null) return `${load.pct} % de tu peso`;
  return `${Math.round(kg)} kg (${load.pct} % de tu peso)`;
}

export function buildJumpBrief(input: {
  method: JumpMethod;
  load: JumpLoad;
  includeLoaded: boolean;
  bodyMassKg: number | null;
}): JumpBrief {
  const { method, load, includeLoaded, bodyMassKg } = input;
  const loadTxt = includeLoaded ? loadLabel(load, bodyMassKg) : null;
  const attempts = method.attempts;
  const rest = method.rest_s;
  const arms = method.arms === 'hips' ? 'Manos en la cadera' : 'Brazos libres';

  const needs: JumpNeed[] = [
    {
      id: 'tripod',
      title: 'Trípode o un apoyo estable',
      detail:
        'El teléfono no se sujeta con la mano. Fíjalo a un trípode, una silla o una botella llena, a la altura del pecho, y no lo toques durante el salto.',
    },
    {
      id: 'space',
      title: 'Espacio para saltar',
      detail:
        'Techo libre, suelo firme, y sitio para que quepas entero en el cuadro — de la cabeza a los pies, también en el aire.',
    },
  ];

  if (includeLoaded && loadTxt) {
    needs.push({
      id: 'load',
      title: `Carga de ${loadTxt}`,
      detail:
        'Barra, hex bar, chaleco o mancuernas que sumen exactamente esa carga. La dejas a un lado para los primeros saltos y la coges después.',
    });
  }

  if (includeLoaded && (bodyMassKg == null || !(bodyMassKg > 0))) {
    needs.push({
      id: 'body_mass',
      title: 'Tu peso de hoy',
      detail:
        'Sin el peso no podemos leer cómo respondes a la carga. Lo pediremos al empezar, o actualízalo en tu ficha antes.',
    });
  }

  const sequence: JumpBriefStep[] = [
    {
      n: 1,
      title: `${attempts} saltos sin carga`,
      detail: `${arms}. Máxima intención hacia arriba. ${rest} s entre intentos. Nos quedamos el mejor.`,
    },
  ];

  if (includeLoaded && loadTxt) {
    sequence.push({
      n: 2,
      title: `${attempts} saltos con ${loadTxt}`,
      detail:
        'La misma postura. Misma intención, aunque la carga se note. Si no tienes la carga hoy, este bloque se puede saltar — el CMJ libre sí cuenta.',
    });
  }

  sequence.push({
    n: sequence.length + 1,
    title: 'Revisas dos fotogramas',
    detail:
      'Despegue (último frame con un pie en el suelo) y aterrizaje (el primero que vuelve a tocar). Si el automático duda, corres un frame. Luego se guarda.',
  });

  const dayLoad = includeLoaded && loadTxt ? ` y ${loadTxt}` : '';
  const day_card = includeLoaded && loadTxt
    ? `Prepara trípode${dayLoad}. ${attempts} saltos libres + ${attempts} con carga.`
    : `Prepara un trípode. ${attempts} saltos, manos en la cadera.`;

  return {
    title: includeLoaded ? 'Perfil de salto' : 'CMJ',
    what: includeLoaded
      ? 'Vamos a medir lo alto que saltas, y luego lo mismo con una carga. No es un entreno: es una medición. Máxima intención en la subida, las dos veces.'
      : 'Vamos a medir lo alto que saltas. No es un entreno: es una medición. Máxima intención en la subida.',
    duration_label: includeLoaded ? 'unos 10 minutos' : 'unos 6 minutos',
    needs,
    sequence,
    jump_cues: [
      `${arms} en todo el vuelo.`,
      'Misma postura al salir y al aterrizar — no aterrices más flexionado.',
      'Los dos pies a la vez. Si un pie se adelanta, ese intento no cuenta.',
      'Máxima intención en la subida, también con carga.',
    ],
    phone: [
      'Cuerpo entero en el cuadro, de frente o de lado.',
      'Teléfono fijo. Si se mueve, el intento no vale.',
      'Luz de frente. Evita contraluz fuerte.',
    ],
    day_card,
  };
}

export function briefNeedTitles(brief: JumpBrief): string {
  return brief.needs.map((n) => n.title).join(' · ');
}

/** Para no enseñar 47,33 en la tarjeta del resultado. */
export { formatJumpHeightCm };
