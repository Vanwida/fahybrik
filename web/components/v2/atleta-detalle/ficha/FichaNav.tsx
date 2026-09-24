// K/J entre atletas (S4): el anterior y el siguiente DENTRO de la lista de la que
// vino el coach (`?desde=` = la consulta de Atletas: mismo filtro, mismo orden).
// Sin `desde`, el roster entero en su orden (peor primero). Componente de
// servidor que llega en streaming: el roster no bloquea la ficha.

import 'server-only';
import { loadRoster } from '@/lib/dashboard/athletes/roster';
import { neighbours, parseRosterQuery, sameView } from '@/components/v2/atletas/roster-query';
import { listSavedViews } from '@/lib/coach/saved-views';
import { BUILTIN_SAVED_VIEWS } from '@fahybrid/shared/schema/saved-views';
import { AthleteNav } from './AthleteNav';

/** Sin lista de origen: todo el roster. */
const ALL = 'estado=todos';

export async function FichaNav({
  coach_id,
  athlete_id,
  desde,
}: {
  coach_id: bigint | number;
  athlete_id: string;
  desde: string | null;
}) {
  const [rows, saved] = await Promise.all([
    loadRoster({ coach_id }).catch(() => null),
    desde ? listSavedViews(coach_id).catch(() => []) : Promise.resolve([]),
  ]);
  if (!rows) return <AthleteNav prev={null} next={null} position={null} total={0} desde={desde} view={null} />;
  // El nombre de la lista de la que viene («Necesitan algo · 5 de 14»).
  const filter = desde ? parseRosterQuery(desde) : null;
  const view = filter
    ? ([...BUILTIN_SAVED_VIEWS, ...saved].find((v) => sameView(filter, v.query))?.name ?? 'Tu filtro')
    : null;
  const n = neighbours(rows, desde ?? ALL, athlete_id);
  const name = (id: string | null) => (id ? (rows.find((r) => r.athlete_id === id)?.name ?? null) : null);
  return (
    <AthleteNav
      prev={n.prev ? { id: n.prev, name: name(n.prev) ?? '' } : null}
      next={n.next ? { id: n.next, name: name(n.next) ?? '' } : null}
      position={n.position}
      total={n.total}
      desde={desde}
      view={view}
    />
  );
}
