export const WIZARD_STEPS = ["upload", "preview", "checkout"] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export interface StepMeta {
  label: string;
  shortLabel: string;
}

export const STEP_META: Record<WizardStep, StepMeta> = {
  upload: { label: "Upload", shortLabel: "Upload" },
  preview: { label: "Preview & Order", shortLabel: "Order" },
  checkout: { label: "Checkout", shortLabel: "Pay" },
};

export function stepIndex(step: WizardStep): number {
  return WIZARD_STEPS.indexOf(step);
}
