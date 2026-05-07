import type { AthleteDeepDive as DeepDive } from '@/lib/coach/deep-dive-types';
import { AthleteHeader } from './AthleteHeader';
import { MacrocycleRibbon } from './MacrocycleRibbon';
import { KpiTriad } from './KpiTriad';
import { ModalityDistribution } from './ModalityDistribution';
import { TrendSparklines } from './TrendSparklines';
import { PerformanceTable } from './PerformanceTable';
import { RecentWorkouts } from './RecentWorkouts';
import { CoachNotes } from './CoachNotes';
import { DeepDiveActionBar } from './DeepDiveActionBar';
import { DeepDiveBanner } from './DeepDiveBanner';

interface AthleteDeepDiveProps {
  deep_dive: DeepDive;
}

export function AthleteDeepDive({ deep_dive }: AthleteDeepDiveProps) {
  return (
    <div className="flex flex-col gap-4">
      <AthleteHeader header={deep_dive.header} a_event={deep_dive.a_event} />

      {deep_dive.macrocycle ? <MacrocycleRibbon ribbon={deep_dive.macrocycle} /> : null}

      {deep_dive.banner ? <DeepDiveBanner banner={deep_dive.banner} /> : null}

      <KpiTriad
        carga={deep_dive.carga}
        compliance={deep_dive.compliance}
        readiness={deep_dive.readiness}
      />

      <ModalityDistribution modality={deep_dive.modality} />

      <TrendSparklines trends={deep_dive.trends} />

      <PerformanceTable performance={deep_dive.performance} />

      <RecentWorkouts days={deep_dive.recent_days} />

      <CoachNotes
        athlete_id={deep_dive.header.athlete_id}
        initial_notes={deep_dive.notes}
        is_demo={deep_dive.is_demo}
      />

      <DeepDiveActionBar
        athlete_id={deep_dive.header.athlete_id}
        athlete_name={deep_dive.header.full_name}
      />
    </div>
  );
}
