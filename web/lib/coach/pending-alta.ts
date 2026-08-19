// Tipo de fila de alta con evidencia de vida. Sin I/O: lo usan cola y Hoy.

import type { AltaLifeEvidence } from '@fahybrid/shared/domain/coach/alta-stance';
import type { PendingIntakeAthlete } from '@/lib/coach/intake';

export type PendingAlta = PendingIntakeAthlete & { life: AltaLifeEvidence };
