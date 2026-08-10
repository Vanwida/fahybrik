// DEL COACH · EL BORRADOR — lo que hay escrito en el compositor y cómo sale por
// el cable.
//
// Vive aparte de `del-coach.ts` porque son dos oficios distintos: aquel lee la
// FICHA (qué le mandaste y qué hizo con ello) y éste sostiene lo que el coach
// está ESCRIBIENDO. Separarlos no es sólo presupuesto de líneas: el borrador es
// lo único de los dos que puede estar a medias, y por eso es el único que
// necesita saber qué falta, qué viaja y qué no.
//
// Client-safe a propósito (cero `server-only`, cero DB). La FUENTE del dominio
// sigue siendo `@fahybrid/shared/domain/coach-communications`: aquí no se decide
// nada del modelo, sólo cómo se sostiene a medio escribir.

import {
  CAMINO_ANCHORS,
  GRAFICA_ANCHORS,
  createCommunicationSchema,
  type CoachCommunicationDTO,
  type CommunicationAnchor,
  type CommunicationDisplay,
  type CommunicationKind,
  type CreateCommunicationInput,
} from '@fahybrid/shared/domain/coach-communications';
import type { RangeTone, ZoneChartDTO } from '@fahybrid/shared/domain/zone-chart';
import type { SegmentModality } from '@fahybrid/shared/domain/segment-modality';
import { DEFAULT_ZONE_WINDOW, addWeeks, mondayOf, zoneWindowWeeks } from '@/lib/zones/chart';

// ---------------------------------------------------------------------------
// La forma del borrador
// ---------------------------------------------------------------------------

/** Un trozo de un reparto mientras se escribe. `value` es texto porque sale de
 *  un `input`: se convierte a número una sola vez, al salir por el cable. */
export interface SegmentoBorrador {
  key: string;
  value: string;
  label: string;
}

/** Una marca del coach sobre la gráfica, mientras se escribe. Las fechas ya son
 *  lunes (las pone el clic sobre una barra) y sólo la etiqueta se teclea. */
export interface RangoBorrador {
  key: string;
  week_start: string;
  week_end: string;
  label: string;
  tone: RangeTone;
}

/** La config de una sección con forma de gráfica: de qué periodo habla, por qué
 *  se filtra y qué marcó el coach encima. Las BARRAS no están aquí — se
 *  resuelven al servir con los datos del atleta. */
export interface GraficaBorrador {
  week_start: string;
  weeks: number;
  modality: SegmentModality | null;
  ranges: RangoBorrador[];
}

/** Una fila de la lista ordenada: paso de protocolo o sección de nota. */
export interface FilaBorrador {
  /** Clave estable de React mientras la fila no existe en la base de datos.
   *  También es lo que sigue la previa para colocarse en lo que estás editando. */
  key: string;
  label: string;
  content: string;
  /** Sólo en un paso de protocolo: si lleva casilla o es una línea que se lee.
   *  Una sección de nota lo arrastra sin usarlo (las dos son la misma fila). */
  checkable: boolean;
  /** Sólo en una sección de nota: cómo se pinta. Un paso de protocolo lo
   *  arrastra en `texto` y nadie lo mira, igual que la sección hace con
   *  `checkable`. */
  display: CommunicationDisplay;
  /** Sólo en una sección con forma de reparto. */
  segments: SegmentoBorrador[];
  /** Sólo en una sección con forma de gráfica. */
  grafica: GraficaBorrador;
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
  /** Nota y tarea: a qué otro comunicado apunta. Vacío = a ninguno. */
  linked_communication_id: string;
  /** La nota de voz ya subida, en cualquiera de los cinco tipos. Null = ninguna.
   *  Se sube en cuanto se corta la grabación, no al publicar: así el fallo se ve
   *  cuando todavía se puede volver a grabar. */
  audio: { url: string; seconds: number } | null;
  /** Además de publicarlo, dejarlo como plantilla reutilizable. */
  save_to_library: boolean;
}

let contador = 0;
/** Clave local de fila. No es un id: sólo vive mientras la fila se escribe. */
export function nuevaClave(): string {
  contador += 1;
  return `f${contador}`;
}

export function segmentoVacio(): SegmentoBorrador {
  return { key: nuevaClave(), value: '', label: '' };
}

/**
 * Una fila nace CON casilla y en forma de TEXTO: es lo que el coach espera de un
 * protocolo y de una sección, y cambiarlo es un toque. Al revés obligaría a
 * encender la casilla o elegir forma en cada una.
 *
 * Los dos segmentos nacen con ella aunque la forma sea texto: el día que la pase
 * a reparto ya tiene dónde escribir, en vez de descubrir antes el botón de
 * añadir. Es la misma decisión que los dos pasos con los que nace un protocolo.
 */
export function filaVacia(): FilaBorrador {
  return {
    key: nuevaClave(),
    label: '',
    content: '',
    checkable: true,
    display: 'texto',
    segments: [segmentoVacio(), segmentoVacio()],
    grafica: ventanaPorDefecto(),
  };
}

/**
 * La ventana con la que nace una gráfica: la misma que la pantalla enseña de
 * entrada, terminando en la semana en curso. Es lo que el coach acaba de estar
 * mirando en la ficha, así que cambiar de forma no le mueve el periodo bajo los
 * pies.
 */
export function ventanaPorDefecto(weeks = zoneWindowWeeks(DEFAULT_ZONE_WINDOW)): GraficaBorrador {
  return { ...ventanaQueAcabaHoy(weeks), modality: null, ranges: [] };
}

/** El periodo de `weeks` semanas que TERMINA en la semana de hoy. Al cambiar el
 *  tamaño de la ventana se mueve el principio y no el final: el coach está
 *  mirando lo reciente y estirar la ventana es pedir más pasado, no otro tramo. */
export function ventanaQueAcabaHoy(weeks: number): { week_start: string; weeks: number } {
  const hoy = new Date();
  const mm = String(hoy.getMonth() + 1).padStart(2, '0');
  const dd = String(hoy.getDate()).padStart(2, '0');
  const ultimoLunes = mondayOf(`${hoy.getFullYear()}-${mm}-${dd}`);
  return { week_start: addWeeks(ultimoLunes, -(weeks - 1)), weeks };
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
    linked_communication_id: '',
    audio: null,
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
  const filas: FilaBorrador[] = dto.items.map((i) => ({
    key: nuevaClave(),
    label: i.label ?? '',
    content: i.content,
    checkable: i.checkable,
    display: i.display,
    // Los segmentos guardados vuelven a ser filas locales. Si venía sin ellos
    // (todo lo que no es un reparto) se le ponen los dos de partida, para que
    // cambiarle la forma no le deje el formulario en blanco.
    segments:
      i.segments.length > 0
        ? i.segments.map((s) => ({ key: nuevaClave(), value: String(s.value_num), label: s.label }))
        : [segmentoVacio(), segmentoVacio()],
    // La config de la gráfica viaja SIEMPRE en el DTO aunque no se haya podido
    // resolver (la biblioteca no tiene atleta al que dibujársela): es contenido
    // que el coach escribió, y sin ella retomar un borrador con gráfica dentro
    // le devolvería la ventana por defecto en vez de la suya.
    grafica: graficaDeDto(i.grafica),
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
    linked_communication_id: dto.linked?.id ?? '',
    audio:
      dto.audio_url != null && dto.audio_seconds != null
        ? { url: dto.audio_url, seconds: dto.audio_seconds }
        : null,
    save_to_library: false,
  };
}

/** La config guardada vuelve a ser estado local. Sin ella (cualquier forma que
 *  no sea gráfica) se cae al periodo por defecto, para que cambiarle la forma a
 *  una sección no deje el formulario en blanco. */
function graficaDeDto(g: ZoneChartDTO | null): GraficaBorrador {
  if (g == null) return ventanaPorDefecto();
  return {
    week_start: g.week_start,
    weeks: g.weeks,
    modality: (g.modality as SegmentModality | null) ?? null,
    ranges: g.ranges.map((r) => ({ key: nuevaClave(), ...r })),
  };
}

// ---------------------------------------------------------------------------
// Lo que sale por el cable
// ---------------------------------------------------------------------------

/** Vacío = ausente. Un campo opcional en blanco se manda como null, nunca como
 *  cadena vacía: el esquema exige contenido cuando el campo existe. */
function oNulo(v: string): string | null {
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/**
 * ¿Hay algo escrito en esta fila? Una fila del todo en blanco no es un paso
 * vacío: es una fila que el coach no ha escrito, y desde que un protocolo puede
 * no llevar pasos no puede contar como uno. Una fila a medias (marca de tiempo
 * sin texto) sí cuenta: ahí hay algo sin terminar y el error tiene que verse.
 */
export function filaEscrita(f: FilaBorrador): boolean {
  return f.content.trim().length > 0 || f.label.trim().length > 0;
}

/**
 * En qué posición del payload viaja cada fila, por su clave. Los errores de zod
 * llegan indexados sobre lo ENVIADO (`items.2.content`), así que sin este mapa
 * una fila en blanco por delante desplazaría el error a la fila de al lado.
 */
export function indicesEnviados(steps: FilaBorrador[]): Map<string, number> {
  const mapa = new Map<string, number>();
  let n = 0;
  for (const s of steps) {
    if (filaEscrita(s)) mapa.set(s.key, n++);
  }
  return mapa;
}

/**
 * El borrador tal y como lo pide la API. `anchor_ref` y `expires_at` viajan
 * ausentes porque el compositor todavía no los pregunta (ver FOCUS.md).
 */
/**
 * Una sección, con la forma que le toca. Cada forma manda campos distintos —una
 * cifra no tiene segmentos y un camino no tiene contenido— porque el esquema es
 * una unión: mandarlo todo «por si acaso» dejaría pasar una cifra con reparto,
 * que no significa nada.
 *
 * En una CIFRA, `label` es el pie y puede faltar. En las otras tres es la
 * cabecera y el esquema la exige.
 */
function seccionAInput(s: FilaBorrador) {
  if (s.display === 'reparto') {
    return {
      display: 'reparto' as const,
      label: s.label.trim(),
      // Sin filtrar los vacíos a propósito: con un mínimo de dos, una fila en
      // blanco tiene que dar SU error en SU sitio, no desaparecer y convertirse
      // en un «faltan segmentos» que no dice cuál.
      segments: s.segments.map((seg) => ({ value_num: Number(seg.value), label: seg.label.trim() })),
    };
  }
  if (s.display === 'camino') {
    return { display: 'camino' as const, label: s.label.trim() };
  }
  if (s.display === 'grafica') {
    return {
      display: 'grafica' as const,
      label: s.label.trim(),
      week_start: s.grafica.week_start,
      weeks: s.grafica.weeks,
      modality: s.grafica.modality,
      // Sin filtrar las marcas sin etiquetar a propósito: una marca a medias
      // tiene que dar SU error en SU sitio, no desaparecer del payload y dejar
      // al coach preguntándose dónde fue el rango que acababa de dibujar.
      ranges: s.grafica.ranges.map((r) => ({
        week_start: r.week_start,
        week_end: r.week_end,
        label: r.label.trim(),
        tone: r.tone,
      })),
    };
  }
  if (s.display === 'cifra') {
    return { display: 'cifra' as const, label: oNulo(s.label), content: s.content.trim() };
  }
  return { display: 'texto' as const, label: s.label.trim(), content: s.content.trim() };
}

/** ¿Esta nota dibuja el camino? Decide si el ancla tiene que ser plan o semana. */
export function pintaCamino(b: Borrador): boolean {
  return b.kind === 'note' && b.sections.some((s) => s.display === 'camino');
}

/** ¿Esta nota lleva una gráfica? Decide si hay que pedirle los datos al atleta
 *  para la previa, y si el ancla elegida vale. */
export function pintaGrafica(b: Borrador): boolean {
  return b.kind === 'note' && b.sections.some((s) => s.display === 'grafica');
}

/** ¿El ancla elegida deja dibujar la gráfica? Admite una más que el camino: un
 *  periodo de entrenos sigue siendo cierto colgado de nada. */
export function anclaSirveParaGrafica(b: Borrador): boolean {
  return GRAFICA_ANCHORS.includes(b.anchor_kind);
}

/** ¿El ancla elegida deja dibujar el camino? Es la regla del esquema, dicha
 *  donde el formulario puede avisar antes de que el servidor diga que no. */
export function anclaSirveParaCamino(b: Borrador): boolean {
  return CAMINO_ANCHORS.includes(b.anchor_kind);
}

export function aInput(b: Borrador, is_template = false): CreateCommunicationInput {
  const comun = {
    title: b.title.trim(),
    anchor_kind: b.anchor_kind,
    is_template,
    audio_url: b.audio?.url ?? null,
    audio_seconds: b.audio?.seconds ?? null,
  };
  // El enlace sólo lo admiten los dos tipos que dicen «esto sale de aquello».
  const enlace = oNulo(b.linked_communication_id);

  if (b.kind === 'protocol') {
    return {
      ...comun,
      kind: 'protocol',
      body: oNulo(b.body),
      final_note: oNulo(b.final_note),
      // Sólo las filas escritas: las dos con las que nace el formulario no
      // pueden convertirse en dos errores sobre un protocolo que ya está
      // completo con su texto (ver `filaEscrita`).
      items: b.steps.filter(filaEscrita).map((s) => ({
        label: oNulo(s.label),
        content: s.content.trim(),
        checkable: s.checkable,
      })),
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
      linked_communication_id: enlace,
    } as CreateCommunicationInput;
  }
  if (b.kind === 'note') {
    return {
      ...comun,
      kind: 'note',
      body: oNulo(b.body),
      items: b.sections.map(seccionAInput),
      linked_communication_id: enlace,
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
// Qué va a pasar al publicar ESTE borrador
// ---------------------------------------------------------------------------

/** Qué pasa al publicar, dicho por tipo. Es la frase que evita el «¿y ahora qué?». */
const NOTA_AL_PUBLICAR: Record<CommunicationKind, string> = {
  protocol: 'Le llega el aviso y podrás ver por qué paso va, no sólo si lo ha abierto.',
  question: 'Le sale la primera de su bandeja. Verás su respuesta escrita aquí, sin abrir nada.',
  task: 'No le abre pantalla: la marca con un toque desde su bandeja. Si vence, sube en ámbar.',
  note: 'Una nota no pide acto, pide que la entienda. Sabrás si la ha abierto, y con eso basta.',
  focus: 'El foco no caduca y no le reclama nada. Se queda fijo hasta que tú lo retires.',
};

/** Un protocolo sin una sola casilla no tiene «por qué paso va»: se lee, y lo
 *  único que se sabe de él es si lo abrió. Decir lo otro sería prometer un
 *  seguimiento que la ficha no va a poder enseñar. */
const NOTA_PROTOCOLO_DE_LECTURA =
  'Le llega el aviso y lo lee. Sin casillas no hay pasos que seguir: sabrás si lo ha abierto.';

/** Lo que este borrador le va a pedir al atleta, no lo que le pide su tipo. */
export function notaAlPublicar(b: Borrador): string {
  if (b.kind === 'protocol' && !b.steps.some((s) => s.checkable && s.content.trim())) {
    return NOTA_PROTOCOLO_DE_LECTURA;
  }
  return NOTA_AL_PUBLICAR[b.kind];
}
