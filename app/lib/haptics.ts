/**
 * Haptic feedback powered by web-haptics (lochie/web-haptics).
 * Uses the iOS Safari 18+ checkbox-switch trick for Taptic Engine,
 * falls back to navigator.vibrate() on Android.
 */

import { WebHaptics, type HapticInput } from "web-haptics";

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
    instance = new WebHaptics();
  }
  return instance;
}

export function haptic(preset: HapticPreset = "light") {
  try {
    getInstance().trigger(preset as HapticInput);
  } catch {
    /* silent — unsupported platform */
  }
}
