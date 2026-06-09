import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import type { MethodologyGroup } from '@fahybrid/shared/schema/methodology-groups';

// The 10 pedagogical training groups (A8 / D3). Static closed set seeded by
// migration 0027 — listed for the coach catalog filter + template editor.

export async function listMethodologyGroups(client: Sql = defaultSql): Promise<MethodologyGroup[]> {
  const rows = await client<
    Array<{
      id: number;
      slug: string;
      name_es: string;
      name_en: string;
      description_es: string | null;
      sort_order: number;
    }>
  >`
    select id, slug, name_es, name_en, description_es, sort_order
    from methodology_groups
    order by sort_order asc
  `;
  return rows;
}
