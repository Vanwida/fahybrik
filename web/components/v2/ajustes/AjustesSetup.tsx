// La lista de puesta en marcha encima de Ajustes: mientras falte lo obligatorio
// («Empieza con un atleta») y, después, mientras quede algo del camino opcional
// «Monta tu método» — Ajustes es justo donde se monta. Se calcula de los datos
// reales (lib/coach/setup-checklist) y la pinta el componente compartido. Si no
// se puede leer, Ajustes sigue igual.

import { getCoachSession } from '@/lib/auth/coach-session';
import { loadSetupChecklist } from '@/lib/coach/setup-checklist';
import { SetupChecklist } from '@/components/v2/shared/SetupChecklist';

export async function AjustesSetup() {
  const session = await getCoachSession();
  if (!session) return null;
  const checklist = await loadSetupChecklist(session.coach_id).catch(() => null);
  if (!checklist) return null;
  const methodPending = checklist.method.done < checklist.method.total;
  if (checklist.complete && !methodPending) return null;
  return <SetupChecklist checklist={checklist} title={checklist.complete ? 'Monta tu método' : 'Pon en marcha tu club'} />;
}
