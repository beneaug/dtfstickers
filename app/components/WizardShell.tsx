"use client";

import type { ReactNode } from "react";
import type { WizardStep } from "../lib/wizard";

interface WizardShellProps {
  step: WizardStep;
  direction: 1 | -1;
  children: ReactNode;
}

export function WizardShell({ step, direction, children }: WizardShellProps) {
  const animClass =
    direction === 1 ? "wizard-step-enter-forward" : "wizard-step-enter-backward";

  return (
    <div key={step} className={`wizard-step ${animClass}`}>
      {children}
    </div>
  );
}
