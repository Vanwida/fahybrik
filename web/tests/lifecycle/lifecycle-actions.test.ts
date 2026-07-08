import { describe, expect, it } from 'vitest';
import {
  lifecycleActionsFor,
  LIFECYCLE_ACTION_META,
  type LifecycleActionKind,
} from '@/lib/dashboard/v2/lifecycle-actions';
import type { AthleteLifecycleStatus } from '@fahybrid/shared/domain/coach/athlete-lifecycle';

const ALL_STATUSES: AthleteLifecycleStatus[] = ['activo', 'pausado', 'baja'];
const ALL_KINDS: LifecycleActionKind[] = ['pause', 'resume', 'baja', 're_alta'];

describe('lifecycleActionsFor', () => {
  it('activo → pausar + dar de baja (recovering action first)', () => {
    expect(lifecycleActionsFor('activo')).toEqual(['pause', 'baja']);
  });

  it('pausado → reactivar + dar de baja', () => {
    expect(lifecycleActionsFor('pausado')).toEqual(['resume', 'baja']);
  });

  it('baja → solo re-alta', () => {
    expect(lifecycleActionsFor('baja')).toEqual(['re_alta']);
  });

  it('mirrors the state machine — pause only from activo, resume only from pausado, re_alta only from baja', () => {
    // pause is offered exactly where activo → pausado is legal.
    expect(ALL_STATUSES.filter((s) => lifecycleActionsFor(s).includes('pause'))).toEqual(['activo']);
    // resume is offered exactly where pausado → activo is legal.
    expect(ALL_STATUSES.filter((s) => lifecycleActionsFor(s).includes('resume'))).toEqual([
      'pausado',
    ]);
    // re_alta is offered exactly where baja → activo is legal.
    expect(ALL_STATUSES.filter((s) => lifecycleActionsFor(s).includes('re_alta'))).toEqual(['baja']);
    // baja (leaving the roster) is offered from both live states, never from baja.
    expect(ALL_STATUSES.filter((s) => lifecycleActionsFor(s).includes('baja'))).toEqual([
      'activo',
      'pausado',
    ]);
  });

  it('every status offers at least one action and every action has button metadata', () => {
    for (const s of ALL_STATUSES) {
      const actions = lifecycleActionsFor(s);
      expect(actions.length).toBeGreaterThan(0);
      for (const a of actions) {
        expect(LIFECYCLE_ACTION_META[a]).toBeTruthy();
        expect(LIFECYCLE_ACTION_META[a].label.length).toBeGreaterThan(0);
        expect(LIFECYCLE_ACTION_META[a].icon.length).toBeGreaterThan(0);
      }
    }
  });

  it('only baja is destructive, and only resume fires without a dialog', () => {
    expect(ALL_KINDS.filter((k) => LIFECYCLE_ACTION_META[k].tone === 'danger')).toEqual(['baja']);
    expect(ALL_KINDS.filter((k) => !LIFECYCLE_ACTION_META[k].needsDialog)).toEqual(['resume']);
  });
});
