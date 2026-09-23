// La lista de puesta en marcha encima de Ajustes, solo mientras falte algo
// obligatorio. Se calcula de los datos reales (lib/coach/setup-checklist) y la
// pinta el componente compartido. Si no se puede leer, Ajustes sigue igual.

import { getCoachSession } from '@/lib/auth/coach-session';
import { loadSetupChecklist } from '@/lib/coach/setup-checklist';
import { SetupChecklist } from '@/components/v2/shared/SetupChecklist';

export async function AjustesSetup() {
  const session = await getCoachSession();
  if (!session) return null;
  const checklist = await loadSetupChecklist(session.coach_id).catch(() => null);
  if (!checklist || checklist.complete) return null;
  return <SetupChecklist checklist={checklist} title="Pon en marcha tu club" />;
}
