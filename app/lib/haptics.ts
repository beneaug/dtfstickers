/**
 * Minimal iOS haptics via the Safari checkbox-switch trick.
 * Falls back to navigator.vibrate on Android.
 * No dependencies — replaces the web-haptics library.
 */

let label: HTMLLabelElement | null = null;

function ensureDOM() {
  if (label || typeof document === "undefined") return;
  label = document.createElement("label");
  label.style.position = "fixed";
  label.style.top = "-100px";
  label.style.left = "-100px";
  label.style.opacity = "0.01";
  label.style.pointerEvents = "none";
  label.style.userSelect = "none";
  label.setAttribute("aria-hidden", "true");

  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  input.style.position = "absolute";
  input.style.opacity = "0";
  input.style.pointerEvents = "none";

  label.appendChild(input);
  document.body.appendChild(label);
}

function tapticClick() {
  ensureDOM();
  label?.click();
}

const hasVibrate =
  typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

export type HapticPreset =
  | "selection"
  | "light"
  | "medium"
  | "heavy"
  | "success"
  | "nudge";

export function haptic(preset: HapticPreset = "light") {
  if (hasVibrate) {
    // Android: use Vibration API
    switch (preset) {
      case "selection":
        navigator.vibrate(5);
        break;
      case "light":
        navigator.vibrate(10);
        break;
      case "medium":
        navigator.vibrate(20);
        break;
      case "heavy":
        navigator.vibrate(30);
        break;
      case "success":
        navigator.vibrate([15, 50, 25]);
        break;
      case "nudge":
        navigator.vibrate([40, 40, 20]);
        break;
    }
    return;
  }

  // iOS: checkbox switch trick triggers Taptic Engine
  switch (preset) {
    case "selection":
    case "light":
      tapticClick();
      break;
    case "medium":
    case "heavy":
      tapticClick();
      setTimeout(tapticClick, 40);
      break;
    case "success":
      tapticClick();
      setTimeout(tapticClick, 60);
      setTimeout(tapticClick, 140);
      break;
    case "nudge":
      tapticClick();
      setTimeout(tapticClick, 80);
      break;
  }
}
