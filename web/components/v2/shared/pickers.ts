// Fuentes de datos de los selectores: búsqueda de atletas (⌘K, §4.9) y la lista
// de grupos del coach (§4.5). Sin React: se pueden llamar desde cualquier sitio.

import type { GroupSummary } from '@fahybrid/shared/schema/groups';
import { apiJson } from './api';
import type { PickerItem } from './EntityPicker';

interface SearchAthlete {
  id: string;
  name: string;
  avatar_url: string | null;
  level: string | null;
  lifecycle: string;
}

/** Atletas del coach que casan con `q` (máx. 5, sin acentos, cualquier orden de palabras). */
export async function searchAthletes(q: string, signal?: AbortSignal): Promise<PickerItem[]> {
  const res = await apiJson<{ athletes: SearchAthlete[] }>(`/api/coach/search?q=${encodeURIComponent(q)}`, { signal });
  return res.athletes.map((a) => ({
    kind: 'athlete' as const,
    id: a.id,
    label: a.name,
    hint: [a.level, a.lifecycle !== 'activo' ? a.lifecycle : null].filter(Boolean).join(' · ') || null,
    avatar_url: a.avatar_url,
  }));
}

export function groupItem(g: Pick<GroupSummary, 'id' | 'display_name' | 'member_count'>): PickerItem {
  return {
    kind: 'group',
    id: g.id,
    label: g.display_name,
    hint: `${g.member_count} ${g.member_count === 1 ? 'atleta' : 'atletas'}`,
  };
}

export async function loadGroups(signal?: AbortSignal): Promise<GroupSummary[]> {
  const res = await apiJson<{ groups: GroupSummary[] }>('/api/coach/groups', { signal });
  return res.groups;
}
