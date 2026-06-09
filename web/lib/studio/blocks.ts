import type { TemplateFormat } from '@/lib/templates/schema';
import type { BuilderSegment, ExerciseCategoryToken } from '@/components/templates/template-types';
import {
  defaultConfigForFormat,
  type HyroxSectionType,
  type SectionBlockConfig,
} from './section-types';

export type StudioBlockKind = 'hyrox' | 'run' | 'strength' | 'skill' | 'rest' | 'custom';

export interface StudioBlockSnapshot {
  uid: string;
  kind: StudioBlockKind;
  title: string;
  segment_uids: string[];
  section_format?: TemplateFormat;
  config?: SectionBlockConfig;
}

export interface StudioBlock {
  uid: string;
  kind: StudioBlockKind;
  title: string;
  segmentUids: string[];
  section_format: TemplateFormat;
  config: SectionBlockConfig;
}

export const BLOCK_KIND_META: Record<
  StudioBlockKind,
  { label: string; short: string; accent: string; border: string }
> = {
  hyrox: {
    label: 'HYROX',
    short: 'HYROX',
    accent: 'var(--accent)',
    border: 'color-mix(in oklab, var(--accent) 35%, transparent)',
  },
  run: {
    label: 'Running',
    short: 'Run',
    accent: 'var(--z3)',
    border: 'color-mix(in oklab, var(--z3) 40%, transparent)',
  },
  strength: {
    label: 'Fuerza',
    short: 'Fuerza',
    accent: 'var(--fg)',
    border: 'var(--hairline)',
  },
  skill: {
    label: 'Skill',
    short: 'Skill',
    accent: 'var(--z4)',
    border: 'color-mix(in oklab, var(--z4) 35%, transparent)',
  },
  rest: {
    label: 'Recuperación',
    short: 'Rest',
    accent: 'var(--muted)',
    border: 'var(--hairline)',
  },
  custom: {
    label: 'Bloque',
    short: 'Mix',
    accent: 'var(--muted)',
    border: 'var(--hairline)',
  },
};

export function kindFromCategory(cat: ExerciseCategoryToken): StudioBlockKind {
  if (cat === 'hyrox_station') return 'hyrox';
  if (cat === 'cardio') return 'run';
  if (cat === 'strength') return 'strength';
  if (cat === 'skill' || cat === 'plyometric') return 'skill';
  if (cat === 'mobility') return 'rest';
  return 'custom';
}

export function defaultBlockTitle(kind: StudioBlockKind): string {
  return BLOCK_KIND_META[kind].label;
}

export function createBlock(
  kind: StudioBlockKind,
  uid: string,
  opts?: { title?: string; section_format?: TemplateFormat; config?: SectionBlockConfig },
): StudioBlock {
  const section_format =
    opts?.section_format ??
    (kind === 'hyrox' ? 'hyrox_sim' : kind === 'strength' ? 'strength_block' : kind === 'run' ? 'tempo' : 'circuit');
  return {
    uid,
    kind,
    title: opts?.title ?? defaultBlockTitle(kind),
    segmentUids: [],
    section_format,
    config: opts?.config ?? defaultConfigForFormat(section_format),
  };
}

export function createBlockFromSection(section: HyroxSectionType, uid: string): StudioBlock {
  return createBlock(section.kind, uid, {
    title: section.title,
    section_format: section.section_format,
    config: defaultConfigForFormat(section.section_format),
  });
}

/** Rebuild block layout from persisted meta or heuristic grouping. */
export function hydrateBlocks(
  segments: BuilderSegment[],
  snapshots: StudioBlockSnapshot[] | null | undefined,
): StudioBlock[] {
  if (snapshots?.length) {
    const byUid = new Map(segments.map((s) => [s.uid, s]));
    const used = new Set<string>();
    const blocks: StudioBlock[] = [];
    let positional = 0;

    for (const snap of snapshots) {
      let uids = snap.segment_uids.filter((id) => byUid.has(id));
      if (uids.length === 0 && snap.segment_uids.length > 0) {
        const take = snap.segment_uids.length;
        uids = segments.slice(positional, positional + take).map((s) => s.uid);
        positional += take;
      }
      uids.forEach((id) => used.add(id));
      blocks.push({
        uid: snap.uid,
        kind: snap.kind,
        title: snap.title,
        segmentUids: uids,
        section_format: snap.section_format ?? (snap.kind === 'hyrox' ? 'hyrox_sim' : 'circuit'),
        config: snap.config ?? {},
      });
    }
    const orphan = segments.filter((s) => !used.has(s.uid));
    if (orphan.length) {
      const orphanBlock = createBlock('custom', `block-orphan-${Date.now()}`, {
        title: 'Extra',
        section_format: 'circuit',
      });
      orphanBlock.segmentUids = orphan.map((s) => s.uid);
      blocks.push(orphanBlock);
    }
    if (blocks.length) return blocks;
  }

  if (segments.length === 0) {
    return [createBlock('hyrox', `block-${Date.now()}`)];
  }

  const blocks: StudioBlock[] = [];
  let current: StudioBlock | null = null;

  for (const seg of segments) {
    const kind = kindFromCategory(seg.exercise_category);
    if (!current || current.kind !== kind) {
      current = createBlock(kind, `block-${seg.uid}`);
      blocks.push(current);
    }
    current.segmentUids.push(seg.uid);
  }
  return blocks;
}

export function flattenBlocks(
  blocks: StudioBlock[],
  segmentsByUid: Map<string, BuilderSegment>,
): BuilderSegment[] {
  const out: BuilderSegment[] = [];
  for (const block of blocks) {
    for (const uid of block.segmentUids) {
      const seg = segmentsByUid.get(uid);
      if (seg) out.push(seg);
    }
  }
  return out;
}

export function blockSnapshots(blocks: StudioBlock[]): StudioBlockSnapshot[] {
  return blocks.map((b) => ({
    uid: b.uid,
    kind: b.kind,
    title: b.title,
    segment_uids: b.segmentUids,
    section_format: b.section_format,
    config: b.config,
  }));
}

/** Clone a block and all its segments (new uids). */
export function duplicateBlockWithSegments(
  block: StudioBlock,
  segments: BuilderSegment[],
  newBlockUid: string,
  newSegmentUid: () => string,
): { block: StudioBlock; newSegments: BuilderSegment[] } {
  const byUid = new Map(segments.map((s) => [s.uid, s]));
  const newSegments: BuilderSegment[] = [];
  const newUids: string[] = [];
  for (const uid of block.segmentUids) {
    const src = byUid.get(uid);
    if (!src) continue;
    const nextUid = newSegmentUid();
    newUids.push(nextUid);
    newSegments.push({
      ...src,
      uid: nextUid,
      serverId: null,
    });
  }
  return {
    block: {
      ...block,
      uid: newBlockUid,
      title: `${block.title} (copia)`,
      segmentUids: newUids,
    },
    newSegments,
  };
}

export function moveSegmentBetweenBlocks(
  blocks: StudioBlock[],
  segmentUid: string,
  toBlockUid: string,
  toIndex: number,
): StudioBlock[] {
  const stripped = blocks.map((b) => ({
    ...b,
    segmentUids: b.segmentUids.filter((id) => id !== segmentUid),
  }));
  return stripped.map((b) => {
    if (b.uid !== toBlockUid) return b;
    const next = [...b.segmentUids];
    next.splice(toIndex, 0, segmentUid);
    return { ...b, segmentUids: next };
  });
}

export function reorderInBlock(block: StudioBlock, from: number, to: number): StudioBlock {
  const uids = [...block.segmentUids];
  const [item] = uids.splice(from, 1);
  if (!item) return block;
  uids.splice(to, 0, item);
  return { ...block, segmentUids: uids };
}
