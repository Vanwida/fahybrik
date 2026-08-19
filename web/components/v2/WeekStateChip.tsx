// Chip de entrega de la semana calendario — lista, ficha y lienzo leen el mismo.

import { Pill, type PillTone } from '@/components/v2/Pill';
import type { AthleteWeekChip } from '@fahybrid/shared/domain/coach/athlete-week-chip';

const TONE: Record<AthleteWeekChip['kind'], PillTone> = {
  visible: 'ok',
  no_lo_ve: 'warn',
  semana_vacia: 'warn',
  bloque_terminado: 'warn',
  sin_plan: 'warn',
};

const TITLE: Record<AthleteWeekChip['kind'], string> = {
  visible: 'El atleta ve esta semana',
  no_lo_ve: 'No lo ve (borrador)',
  semana_vacia: 'Hay plan, esta semana no tiene sesiones',
  bloque_terminado: 'El último bloque ya acabó',
  sin_plan: 'Sin plan asignado',
};

export function WeekStateChip({ chip }: { chip: AthleteWeekChip }) {
  return (
    <Pill tone={TONE[chip.kind]} variant="soft" title={TITLE[chip.kind]}>
      {chip.label}
    </Pill>
  );
}
