/**
 * Haptic feedback via web-haptics library.
 *
 * Uses the proven checkbox-switch trick for iOS Safari 18+,
 * Vibration API for Android, and debug audio clicks for testing.
 *
 * Reference: https://haptics.lochie.me
 */

import { WebHaptics } from "web-haptics";

export type HapticPreset =
  | "selection"
  | "light"
  | "medium"
  | "heavy"
  | "success"
  | "nudge";

let instance: WebHaptics | null = null;

function getInstance(): WebHaptics {
  if (!instance) {
    instance = new WebHaptics({ debug: true });
  }
  return instance;
}

export function haptic(preset: HapticPreset = "light"): void {
  try {
    getInstance().trigger(preset);
  } catch {
    // Silently fail on unsupported platforms
  }
}
