// DocFlow — the horizontal flow strip ("Tú montas → tu atleta entrena → …"). Steps
// flagged `app` are tinted orange (they happen on the athlete's phone), the rest
// are neutral (they happen on the coach panel). Server-safe.

import { Fragment } from 'react';

export interface FlowStep {
  label: string;
  /** True = happens in the athlete app (orange tint). */
  app?: boolean;
}

export function DocFlow({ steps }: { steps: FlowStep[] }) {
  return (
    <div className="flow">
      {steps.map((step, i) => (
        <Fragment key={i}>
          {i > 0 ? <span className="arr">→</span> : null}
          <span className={step.app ? 'step app' : 'step'}>{step.label}</span>
        </Fragment>
      ))}
    </div>
  );
}
