// Qué pasa cuando un atleta llega al final del plan de su grupo: los tres finales
// (`program_sequences.end_policy`) con las palabras del coach. Una sola fuente para
// la cabecera del grupo y para el selector.

import type { GroupDetail } from '@fahybrid/shared/schema/groups';

export type GroupEndPolicy = GroupDetail['end_policy'];

export const END_POLICY_VIEW: Record<GroupEndPolicy, { label: string; help: string; subtitle: string }> = {
  repeat: {
    label: 'Repetir',
    help: 'Vuelve a empezar por el primer programa. La vuelta siguiente se prepara sola unos días antes de que acabe.',
    subtitle: 'se repite',
  },
  level_up: {
    label: 'Subir de nivel',
    help: 'Pasa al grupo del nivel siguiente y empieza su primer programa. Si no hay grupo en ese nivel, termina.',
    subtitle: 'sube de nivel al acabar',
  },
  stop: {
    label: 'Parar',
    help: 'Termina el plan y no se le añade nada más.',
    subtitle: 'termina al acabar',
  },
};

export const END_POLICY_ORDER: GroupEndPolicy[] = ['repeat', 'level_up', 'stop'];
