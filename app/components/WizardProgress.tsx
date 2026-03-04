"use client";

import { WIZARD_STEPS, STEP_META, stepIndex, type WizardStep } from "../lib/wizard";

interface WizardProgressProps {
  current: WizardStep;
  onGoTo: (step: WizardStep) => void;
}

export function WizardProgress({ current, onGoTo }: WizardProgressProps) {
  const currentIdx = stepIndex(current);

  return (
    <nav className="wizard-progress" aria-label="Wizard steps">
      {WIZARD_STEPS.map((s, i) => {
        const isCompleted = i < currentIdx;
        const isCurrent = s === current;

        return (
          <button
            key={s}
            type="button"
            disabled={!isCompleted}
            onClick={() => isCompleted && onGoTo(s)}
            className={[
              "wizard-dot-btn",
              isCurrent ? "is-current" : "",
              isCompleted ? "is-completed" : "",
              !isCurrent && !isCompleted ? "is-future" : "",
            ].join(" ")}
            aria-current={isCurrent ? "step" : undefined}
            aria-label={STEP_META[s].label}
          >
            <span className="wizard-dot" />
          </button>
        );
      })}
    </nav>
  );
}
