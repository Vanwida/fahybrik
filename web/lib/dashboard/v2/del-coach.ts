// DEL COACH · la ficha del atleta — vocabulario de cara al coach y el borrador
// que se escribe en el compositor.
//
// Client-safe a propósito (cero `server-only`, cero DB): lo importan la pestaña,
// el compositor y la previa. La FUENTE del dominio sigue siendo
// `@fahybrid/shared/domain/coach-communications` — aquí no se decide nada del
// modelo, sólo cómo se DICE de cara al coach y cómo se sostiene a medio escribir.
//
// Por qué hay un mapa de anclas propio: el compartido habla en la voz del atleta
// («Tu plan») y esta pantalla habla en la del coach («Su plan»). Es la misma
// ancla dicha por el otro lado, no una segunda lista de anclas.

import {
  ANCHOR_LABEL,
  COMMUNICATION_ANCHORS,
  compareInboxCommunications,
  createCommunicationSchema,
  type CoachAthleteCommunicationDTO,
  type CoachCommunicationDTO,
  type CommunicationAnchor,
  type CommunicationKind,
  type CreateCommunicationInput,
} from '@fahybrid/shared/domain/coach-communications';

// ---------------------------------------------------------------------------
// Cómo se dice de cara al coach
// ---------------------------------------------------------------------------

/** El nombre del tipo en una frase («Nuevo protocolo»). El chip en versales sale
 *  de `KIND_LABEL` del compartido: una sola grafía para la etiqueta gritada. */
export const KIND_COACH_LABEL: Record<CommunicationKind, string> = {
  protocol: 'Protocolo',
  question: 'Pregunta',
  task: 'Tarea',
  note: 'Nota',
  focus: 'Foco',
};

/** Qué le pide al atleta. Es lo que decide por cuál empieza el coach. */
export const KIND_COACH_ASKS: Record<CommunicationKind, string> = {
  protocol: 'marcar pasos',
  question: 'decidir',
  task: 'cerrar algo con fecha',
  note: 'entender',
  focus: 'no olvidarse',
};

/** El ancla dicha por el coach. `general` sí se nombra aquí (a diferencia de la
 *  app del atleta): el coach está ELIGIENDO dónde cae, y «en ningún sitio» no
 *  sería una opción que se pueda pulsar. */
export const ANCHOR_COACH_LABEL: Record<CommunicationAnchor, string> = {
  plan: 'Su plan',
  week: 'Esta semana',
  session: 'La sesión',
  test: 'Sus tests',
  race: 'Día de carrera',
  checkin: 'Su check-in',
  general: 'En su bandeja',
};

/** El orden en que se ofrecen: de lo más grande (el plan) a lo más suelto. */
export const ANCHOR_CHOICES: readonly CommunicationAnchor[] = COMMUNICATION_ANCHORS;

/** La etiqueta que verá el atleta, para el pie de ayuda del selector. */
export function anchorAthleteLabel(anchor: CommunicationAnchor): string | null {
  return ANCHOR_LABEL[anchor];
}

// ---------------------------------------------------------------------------
// El borrador que se escribe en el compositor
// ---------------------------------------------------------------------------

/** Una fila de la lista ordenada: paso de protocolo o sección de nota. */
export interface FilaBorrador {
  /** Clave estable de React mientras la fila no existe en la base de datos. */
  key: string;
  label: string;
  content: string;
}

/** Una opción de pregunta con su consecuencia. */
export interface OpcionBorrador {
  key: string;
  content: string;
  consequence: string;
}

/**
 * Lo que hay escrito en el compositor. Es UNO y no cinco a propósito: al cambiar
 * de chip el coach no puede perder el título que acaba de escribir, así que el
 * estado guarda los campos de los cinco tipos y `aInput` se queda con los que le
 * tocan al tipo elegido.
 */
export interface Borrador {
  kind: CommunicationKind;
  title: string;
  /** Contexto (pregunta) · porqué (tarea, foco) · línea de entrada (protocolo, nota). */
  body: string;
  anchor_kind: CommunicationAnchor;
  /** Protocolo. */
  steps: FilaBorrador[];
  final_note: string;
  /** Pregunta. */
  options: OpcionBorrador[];
  blocks: boolean;
  /** Tarea (ISO YYYY-MM-DD). */
  due_date: string;
  /** Nota. */
  sections: FilaBorrador[];
  /** Además de publicarlo, dejarlo como plantilla reutilizable. */
  save_to_library: boolean;
}

let contador = 0;
/** Clave local de fila. No es un id: sólo vive mientras la fila se escribe. */
export function nuevaClave(): string {
  contador += 1;
  return `f${contador}`;
}

export function filaVacia(): FilaBorrador {
  return { key: nuevaClave(), label: '', content: '' };
}

export function opcionVacia(): OpcionBorrador {
  return { key: nuevaClave(), content: '', consequence: '' };
}

/** El ancla con la que nace cada tipo: la superficie donde ese tipo tiene sentido. */
const ANCLA_POR_DEFECTO: Record<CommunicationKind, CommunicationAnchor> = {
  protocol: 'session',
  question: 'plan',
  task: 'general',
  note: 'plan',
  focus: 'checkin',
};

/** Un protocolo nace con dos pasos y una pregunta con dos opciones: uno solo no
 *  es ni un protocolo ni una pregunta, y arrancar en blanco obliga a descubrir
 *  el botón de añadir antes de poder escribir nada. */
export function borradorVacio(kind: CommunicationKind = 'protocol'): Borrador {
  return {
    kind,
    title: '',
    body: '',
    anchor_kind: ANCLA_POR_DEFECTO[kind],
    steps: [filaVacia(), filaVacia()],
    final_note: '',
    options: [opcionVacia(), opcionVacia()],
    blocks: false,
    due_date: '',
    sections: [filaVacia(), filaVacia()],
    save_to_library: false,
  };
}

/** Cambiar de tipo conserva lo escrito y sólo mueve el ancla si el coach no la
 *  había tocado — cambiar de chip no puede deshacer una elección suya. */
export function conTipo(b: Borrador, kind: CommunicationKind): Borrador {
  const anclaIntacta = b.anchor_kind === ANCLA_POR_DEFECTO[b.kind];
  return { ...b, kind, anchor_kind: anclaIntacta ? ANCLA_POR_DEFECTO[kind] : b.anchor_kind };
}

/**
 * Retomar un comunicado que ya existe (una plantilla de la biblioteca o un
 * borrador a medias) para personalizarlo antes de publicarlo. Los items vuelven
 * a ser filas locales: al publicar se reescriben enteros.
 */
export function desdeComunicado(dto: CoachCommunicationDTO): Borrador {
  const base = borradorVacio(dto.kind);
  const filas = dto.items.map((i) => ({
    key: nuevaClave(),
    label: i.label ?? '',
    content: i.content,
  }));
  return {
    ...base,
    kind: dto.kind,
    title: dto.title,
    body: dto.body ?? '',
    anchor_kind: dto.anchor_kind,
    steps: dto.kind === 'protocol' && filas.length > 0 ? filas : base.steps,
    sections: dto.kind === 'note' && filas.length > 0 ? filas : base.sections,
    options:
      dto.kind === 'question' && dto.items.length > 0
        ? dto.items.map((i) => ({
            key: nuevaClave(),
            content: i.content,
            consequence: i.consequence ?? '',
          }))
        : base.options,
    final_note: dto.final_note ?? '',
    blocks: dto.blocks,
    due_date: dto.due_date ?? '',
    save_to_library: false,
  };
}

/** Vacío = ausente. Un campo opcional en blanco se manda como null, nunca como
 *  cadena vacía: el esquema exige contenido cuando el campo existe. */
function oNulo(v: string): string | null {
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/**
 * El borrador tal y como lo pide la API. `anchor_ref` y `expires_at` viajan
 * ausentes porque el compositor todavía no los pregunta (ver FOCUS.md).
 */
export function aInput(b: Borrador, is_template = false): CreateCommunicationInput {
  const comun = {
    title: b.title.trim(),
    anchor_kind: b.anchor_kind,
    is_template,
  };

  if (b.kind === 'protocol') {
    return {
      ...comun,
      kind: 'protocol',
      body: oNulo(b.body),
      final_note: oNulo(b.final_note),
      items: b.steps.map((s) => ({ label: oNulo(s.label), content: s.content.trim() })),
    } as CreateCommunicationInput;
  }
  if (b.kind === 'question') {
    return {
      ...comun,
      kind: 'question',
      body: b.body.trim(),
      blocks: b.blocks,
      items: b.options.map((o) => ({
        content: o.content.trim(),
        consequence: oNulo(o.consequence),
      })),
    } as CreateCommunicationInput;
  }
  if (b.kind === 'task') {
    return {
      ...comun,
      kind: 'task',
      body: oNulo(b.body),
      due_date: b.due_date,
    } as CreateCommunicationInput;
  }
  if (b.kind === 'note') {
    return {
      ...comun,
      kind: 'note',
      body: oNulo(b.body),
      items: b.sections.map((s) => ({ label: s.label.trim(), content: s.content.trim() })),
    } as CreateCommunicationInput;
  }
  return { ...comun, kind: 'focus', body: b.body.trim() } as CreateCommunicationInput;
}

/**
 * Los mismos zod del servidor, en el cliente y ANTES de enviar: el coach ve el
 * fallo en el campo en vez de recibir un 422 sin sitio donde caerse. La clave es
 * la ruta del esquema («title», «items.0.content»), que es como la nombran los
 * campos del formulario.
 */
export function erroresDe(b: Borrador): Record<string, string> {
  const parsed = createCommunicationSchema.safeParse(aInput(b));
  if (parsed.success) return {};
  const errores: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const clave = issue.path.join('.');
    if (!errores[clave]) errores[clave] = mensajeDe(issue.code, issue.message);
  }
  return errores;
}

/** Los mensajes de zod están en inglés y hablan de esquemas. Aquí se dicen como
 *  los diría un entrenador; los que ya vienen escritos en el dominio se respetan. */
function mensajeDe(code: string, original: string): string {
  if (/^[A-Z]/.test(original) && !original.startsWith('Invalid') && !original.startsWith('String')) {
    return original;
  }
  if (code === 'too_small') return 'Falta rellenarlo.';
  if (code === 'too_big') return 'Te has pasado de largo.';
  return 'Revisa este campo.';
}

// ---------------------------------------------------------------------------
// La lista de la ficha: qué reclama, qué se dice de cada uno y en qué orden
// ---------------------------------------------------------------------------

export type TonoSeguimiento = 'accent' | 'muted' | 'ok' | 'warn' | 'info';

export interface Seguimiento {
  tono: TonoSeguimiento;
  /** La línea que se lee de un vistazo. */
  titular: string;
  /** El matiz que evita abrirlo. Null cuando el titular ya lo dice todo. */
  nota: string | null;
}

/** Hoy en el huso del coach, en ISO. Se compara con `due_date`, que es una fecha
 *  civil sin hora: convertirla a instante la movería un día en cuanto cambie el
 *  huso del servidor. */
export function hoyISO(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const dia = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dia}`;
}

const MS_POR_DIA = 86_400_000;

/**
 * El plazo de una tarea, dicho por el coach: «Vence mañana», «Venció hace 3 días».
 *
 * No hay canónico para esto (`formatRelative` mide instantes PASADOS y
 * `formatDaysUntil` habla en la voz de una carrera), así que nace aquí, que es
 * donde vive el concepto — el vencimiento sólo existe en una tarea. Las dos
 * fechas se anclan a mediodía UTC para que el día civil no baile con el huso.
 */
export function venceEn(due_date: string, hoy = hoyISO()): string {
  const dias = Math.round(
    (Date.parse(`${due_date}T12:00:00Z`) - Date.parse(`${hoy}T12:00:00Z`)) / MS_POR_DIA,
  );
  if (!Number.isFinite(dias)) return '';
  if (dias === 0) return 'Vence hoy';
  if (dias === 1) return 'Vence mañana';
  if (dias === -1) return 'Venció ayer';
  if (dias > 1) return `Vence en ${dias} días`;
  return `Venció hace ${Math.abs(dias)} días`;
}

/** Una tarea vencida es la única que se pinta en ámbar: es la que se pierde. */
export function estaVencida(c: CoachAthleteCommunicationDTO, hoy = hoyISO()): boolean {
  return (
    c.kind === 'task' &&
    c.status !== 'archived' &&
    !!c.due_date &&
    c.due_date < hoy &&
    c.athlete_state.state !== 'done'
  );
}

/** El texto de la opción que eligió, para leer la respuesta sin abrir nada. */
export function opcionElegida(c: CoachAthleteCommunicationDTO) {
  const id = c.athlete_state.answered_item_id;
  if (!id) return null;
  return c.items.find((i) => i.id === id) ?? null;
}

/**
 * El seguimiento de ESE atleta, dicho en una línea. Es la columna por la que
 * existe la pestaña: hoy el coach manda un mensaje y lo único que sabe es que se
 * ha enviado.
 */
export function seguimiento(c: CoachAthleteCommunicationDTO, hoy = hoyISO()): Seguimiento {
  const { state, marked_item_ids } = c.athlete_state;

  if (c.status === 'archived') {
    return { tono: 'muted', titular: 'Retirado', nota: 'Ya no le aparece en su bandeja.' };
  }

  if (c.kind === 'task') {
    const plazo = c.due_date ? venceEn(c.due_date, hoy) : null;
    if (state === 'done') return { tono: 'ok', titular: 'Hecho', nota: null };
    if (estaVencida(c, hoy)) {
      return {
        tono: 'warn',
        titular: `${plazo}, y sigue sin hacer`,
        nota: state === 'published' ? 'No lo ha abierto.' : 'Lo ha abierto y no lo ha marcado.',
      };
    }
    if (state === 'published') return { tono: 'accent', titular: 'Sin abrir', nota: plazo };
    return { tono: 'muted', titular: 'Visto, sin hacer', nota: plazo };
  }

  if (c.kind === 'question') {
    if (state === 'answered') {
      const elegida = opcionElegida(c);
      return {
        tono: 'ok',
        titular: elegida ? `Respondió «${elegida.content}»` : 'Respondido',
        nota: elegida?.consequence ?? null,
      };
    }
    if (state === 'published') {
      return {
        tono: c.blocks ? 'warn' : 'accent',
        titular: 'Sin abrir',
        nota: c.blocks ? 'Su plan no se cierra hasta que conteste.' : null,
      };
    }
    return {
      tono: c.blocks ? 'warn' : 'muted',
      titular: 'Vista, sin responder',
      nota: c.blocks ? 'Su plan no se cierra hasta que conteste.' : null,
    };
  }

  if (c.kind === 'protocol') {
    const total = c.items.length;
    if (state === 'done') {
      return { tono: 'ok', titular: `Hecho, ${total} de ${total} pasos`, nota: null };
    }
    if (state === 'published') return { tono: 'accent', titular: 'Sin abrir', nota: null };
    return { tono: 'muted', titular: `Visto, ${marked_item_ids.length} de ${total} pasos`, nota: null };
  }

  if (c.kind === 'note') {
    if (state === 'published') return { tono: 'accent', titular: 'Sin abrir', nota: null };
    return { tono: 'muted', titular: 'Vista', nota: 'Una nota no pide más que eso.' };
  }

  if (state === 'published') return { tono: 'accent', titular: 'Sin abrir', nota: null };
  return { tono: 'info', titular: 'Activo', nota: 'No caduca. Se retira cuando tú lo retires.' };
}

export interface CarrilesDelCoach {
  /** Lo que todavía te reclama a ti. */
  reclama: CoachAthleteCommunicationDTO[];
  /** Publicado y cerrado: no hay nada que hacer con ello. */
  alDia: CoachAthleteCommunicationDTO[];
  /** Retirado. Es historial, y por eso va plegado al fondo. */
  historial: CoachAthleteCommunicationDTO[];
}

/**
 * Los tres carriles. Dentro de cada uno manda el orden del dominio
 * (`compareInboxCommunications`): lo que bloquea, lo que vence, lo que no ha
 * abierto. Ordenar por fecha es lo que hace el chat, y es por lo que las cosas
 * se pierden.
 */
export function carriles(lista: CoachAthleteCommunicationDTO[]): CarrilesDelCoach {
  const ordenar = (xs: CoachAthleteCommunicationDTO[]) =>
    [...xs].sort((a, b) =>
      compareInboxCommunications(
        {
          kind: a.kind,
          state: a.athlete_state.state,
          blocks: a.blocks,
          due_date: a.due_date,
          published_at: a.published_at ?? a.created_at,
          id: a.id,
        },
        {
          kind: b.kind,
          state: b.athlete_state.state,
          blocks: b.blocks,
          due_date: b.due_date,
          published_at: b.published_at ?? b.created_at,
          id: b.id,
        },
      ),
    );

  const vivos = lista.filter((c) => c.status !== 'archived');
  return {
    reclama: ordenar(vivos.filter((c) => c.athlete_state.claims_attention)),
    alDia: ordenar(vivos.filter((c) => !c.athlete_state.claims_attention)),
    historial: ordenar(lista.filter((c) => c.status === 'archived')),
  };
}

/** Cuántos comunicados vivos le reclaman algo al coach — la insignia de la pestaña. */
export function cuantosReclaman(lista: CoachAthleteCommunicationDTO[]): number {
  return lista.filter((c) => c.status !== 'archived' && c.athlete_state.claims_attention).length;
}
