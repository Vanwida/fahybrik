'use client';

// ActivityTodayClient — thin client wrapper so the server /hoy page can mount the
// presentational <ActivityToday> with a working react affordance. The reaction
// PERSISTENCE is a FLAGGED GAP (no reactions table yet — see activity-today.ts):
// today the handler only acknowledges the tap optimistically in local UI so the
// gesture is real + keyboard-accessible, but nothing is written server-side. When
// a `session_reactions` table + endpoint land, swap the TODO for the POST and
// reconcile `reacted` from the server.

import { useState } from 'react';
import { ActivityToday, type ActivityTodayProps } from './ActivityToday';
import type { ActivitySession, ActivityToday as ActivityTodayData } from '@/lib/dashboard/coach/activity-today';

type Props = Omit<ActivityTodayProps, 'data' | 'onReact'> & { data: ActivityTodayData };

export function ActivityTodayClient({ data, ...rest }: Props) {
  // Local optimistic "reacted" overlay keyed by session id. The server data is
  // the source of truth for everything else; only `reacted` is shadowed here
  // until persistence exists.
  const [reactedIds, setReactedIds] = useState<ReadonlySet<string>>(new Set());

  const view: ActivityTodayData = {
    ...data,
    sessions: data.sessions.map((s) =>
      reactedIds.has(s.id) ? { ...s, reacted: true } : s,
    ),
  };

  const handleReact = (session: ActivitySession /*, reactionKey: string */) => {
    // TODO(reactions): POST the reaction once a reactions table/endpoint exists.
    // For now: optimistic local acknowledgement only (flagged gap).
    setReactedIds((prev) => (prev.has(session.id) ? prev : new Set([...prev, session.id])));
  };

  return <ActivityToday {...rest} data={view} onReact={handleReact} />;
}
