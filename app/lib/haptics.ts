/**
 * Haptic feedback for iOS Safari 18+ and Android.
 *
 * iOS: Creates a hidden <input type="checkbox" switch> in <head>,
 * clicks it to trigger the Taptic Engine, then removes it.
 * This is the proven "ios-haptics" pattern (create → click → remove).
 *
 * Android: Uses navigator.vibrate() (Vibration API).
 *
 * Based on: https://github.com/tijnjh/ios-haptics
 * Reference: https://haptics.lochie.me
 */

export type HapticPreset =
  | "selection"
  | "light"
  | "medium"
  | "heavy"
  | "success"
  | "nudge";

const hasVibrate =
  typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

/**
 * Single Taptic Engine tick via the checkbox-switch trick.
 * Creates a fresh element each time — this is the pattern that
 * reliably triggers haptics on iOS Safari 18+.
 */
function tapticTick(): void {
  if (typeof document === "undefined") return;
  try {
    const label = document.createElement("label");
    label.style.display = "none";
    label.ariaHidden = "true";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");

    label.appendChild(input);
    document.head.appendChild(label);
    label.click();
    document.head.removeChild(label);
  } catch {
    // Silently fail on unsupported platforms
  }
}

export function haptic(preset: HapticPreset = "light"): void {
  if (hasVibrate) {
    // Android — Vibration API
    switch (preset) {
      case "selection":
        navigator.vibrate(8);
        break;
      case "light":
        navigator.vibrate(15);
        break;
      case "medium":
        navigator.vibrate(25);
        break;
      case "heavy":
        navigator.vibrate(35);
        break;
      case "success":
        navigator.vibrate([20, 60, 30]);
        break;
      case "nudge":
        navigator.vibrate([50, 60, 25]);
        break;
    }
    return;
  }

  // iOS Safari 18+ — Taptic Engine via checkbox switch trick
  switch (preset) {
    case "selection":
    case "light":
      tapticTick();
      break;
    case "medium":
      tapticTick();
      setTimeout(tapticTick, 50);
      break;
    case "heavy":
      tapticTick();
      setTimeout(tapticTick, 35);
      setTimeout(tapticTick, 70);
      break;
    case "success":
      tapticTick();
      setTimeout(tapticTick, 80);
      setTimeout(tapticTick, 180);
      break;
    case "nudge":
      tapticTick();
      setTimeout(tapticTick, 100);
      break;
  }
}
