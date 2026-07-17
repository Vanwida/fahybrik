import { blockIsConfirmable, type ComposableBlock } from './blocks-catalog';
import {
  GROUP_KIND,
  buildDay,
  emptyWorkoutDay,
  focusHintForDay,
  restDay,
  withLevelModifier,
  type BlockPick,
  type ComposeResult,
  type MatchedBlock,
  type ProgramLevel,
  type SessionPick,
  type SuggestedWeekDay,
} from './compose-week-parts';

/**
 * Composer DETERMINISTA (sin LLM). Es la red de seguridad: si el modelo no está
 * configurado o se cae, la semana se sigue componiendo desde la biblioteca del
 * coach, 100% con su contenido y sin inventar nada.
 *
 * Lo que cambió y por qué: antes esta función NI SIQUIERA RECIBÍA el foco. Daba
 * igual lo que el coach escribiera — salía siempre la misma rotación de sus
 * grupos por orden de id. Ese es, literalmente, el fallo que Alex vio en
 * producción: pidió doble sesión de running/híbrido enfocado en HYROX y le salió
 * LUN Fuerza · MAR Fuerza · MIÉ Z2… Ahora las restricciones del foco (grupos,
 * sesiones/día) entran aquí, así que hasta el fallback lo respeta.
 */

export interface HeuristicArgs {
  /** Bloques USABLES (tipados). El filtrado y el aviso son del servicio. */
  blocks: ComposableBlock[];
  training_days: number[];
  level?: ProgramLevel | undefined;
  /** 1 = normal (default), 2 = doble sesión (am+pm). */
  sessions_per_day?: number | undefined;
  /** Grupos pedidos en el foco, por prioridad. Vacío = sin preferencia. */
  preferred_group_ids?: readonly number[];
}

/**
 * Reparte los bloques del coach por los días de entreno recorriendo los grupos,
 * sin repetir bloque y alternando carga con recuperación cuando puede.
 */
export function composeWeekHeuristic(args: HeuristicArgs): ComposeResult {
  const trainingSet = new Set(args.training_days);
  const sessionsPerDay = Math.max(1, args.sessions_per_day ?? 1);

  // Agrupa bloques por methodology_group. Dentro de cada grupo, PRIMERO los que
  // el coach puede confirmar (ver `blockIsConfirmable`); a igualdad, por id.
  const byGroup = new Map<number, ComposableBlock[]>();
  for (const b of args.blocks) {
    const arr = byGroup.get(b.methodology_group_id);
    if (arr) arr.push(b);
    else byGroup.set(b.methodology_group_id, [b]);
  }
  for (const arr of byGroup.values()) {
    arr.sort((a, b) => {
      const ca = blockIsConfirmable(a) ? 0 : 1;
      const cb = blockIsConfirmable(b) ? 0 : 1;
      return ca !== cb ? ca - cb : a.id - b.id;
    });
  }

  // EL FOCO MANDA: si pidió grupos y tenemos bloques usables de ellos, la
  // rotación es SOLO sobre esos, en el orden en que los pidió. Si no pidió nada
  // (o de lo que pidió no queda nada usable), se recorre su biblioteca entera por
  // id — el comportamiento de siempre.
  const requested = (args.preferred_group_ids ?? []).filter((g) => (byGroup.get(g)?.length ?? 0) > 0);
  const groupOrder = requested.length > 0 ? [...requested] : [...byGroup.keys()].sort((a, b) => a - b);

  // Cursor por grupo para ir consumiendo bloques distintos sin repetir.
  const cursorByGroup = new Map<number, number>();
  const usedBlockIds = new Set<number>();

  const pickFromGroup = (gid: number): ComposableBlock | null => {
    const arr = byGroup.get(gid);
    if (!arr || arr.length === 0) return null;
    const cursor = cursorByGroup.get(gid) ?? 0;
    for (let i = 0; i < arr.length; i += 1) {
      const candidate = arr[(cursor + i) % arr.length]!;
      if (!usedBlockIds.has(candidate.id)) {
        cursorByGroup.set(gid, (cursor + i + 1) % arr.length);
        usedBlockIds.add(candidate.id);
        return candidate;
      }
    }
    // Todos usados — permite repetir (biblioteca pequeña) avanzando el cursor.
    const fallback = arr[cursor % arr.length]!;
    cursorByGroup.set(gid, (cursor + 1) % arr.length);
    return fallback;
  };

  const days: SuggestedWeekDay[] = [];
  const matched: MatchedBlock[] = [];
  const rest_days: number[] = [];
  const missingGroups = new Set<number>();

  let groupCursor = 0;
  let consecutiveLoad = 0;

  /** Elige el grupo de la siguiente sesión, metiendo recuperación tras 2 cargas. */
  const nextGroupId = (): number => {
    const recoveryGid = groupOrder.find((g) => GROUP_KIND[g] === 'recovery');
    if (consecutiveLoad >= 2 && recoveryGid != null) return recoveryGid;
    const gid = groupOrder[groupCursor % groupOrder.length]!;
    groupCursor += 1;
    return gid;
  };

  for (let dow = 1; dow <= 7; dow += 1) {
    if (!trainingSet.has(dow)) {
      rest_days.push(dow);
      days.push(restDay(dow));
      continue;
    }

    if (groupOrder.length === 0) {
      days.push(emptyWorkoutDay(dow, 'Sin bloques disponibles'));
      continue;
    }

    // Una pasada por sesión: doble sesión = dos bloques distintos, cada uno con
    // su grupo, no el mismo partido en dos.
    const sessions: SessionPick[] = [];
    for (let s = 0; s < sessionsPerDay; s += 1) {
      const gid = nextGroupId();
      const block = pickFromGroup(gid);
      if (!block) {
        missingGroups.add(gid);
        continue;
      }
      consecutiveLoad =
        GROUP_KIND[block.methodology_group_id] === 'recovery' ? 0 : consecutiveLoad + 1;
      const pick: BlockPick = {
        block,
        modifiers: withLevelModifier(block.default_modifiers, args.level),
      };
      sessions.push({ picked: [pick], focus: focusHintForDay(block.methodology_group_id) });
    }

    if (sessions.length === 0) {
      days.push(emptyWorkoutDay(dow, 'Sin bloques disponibles'));
      continue;
    }

    const built = buildDay(dow, sessions);
    days.push(built.day);
    matched.push(...built.matched);
  }

  const notes = missingGroups.size > 0 ? 'Sin bloques para algún grupo metodológico.' : undefined;

  return { days, matched, rest_days, notices: [], notes };
}
