/**
 * Whether animations run.
 *
 * One rule: animations are disabled when the person turned them off in the app
 * OR the device's Reduce Motion setting is on. The device setting never
 * touches the saved choice, so turning Reduce Motion off again returns the app
 * to whatever the person had picked.
 *
 * The saved choice is stored in this browser and applied as
 * `data-motion="reduce"` on <html>, where globals.css switches every CSS
 * animation and transition off. JavaScript animations (the mascot) read
 * `animationsDisabled()` and subscribe to changes so they can stop mid-flight.
 * Client-side only.
 */

export const MOTION_STORAGE_KEY = "memorizer-motion";

const MEDIA_QUERY = "(prefers-reduced-motion: reduce)";

/** The device-level "Reduce motion" setting. */
export function systemReducesMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia(MEDIA_QUERY).matches;
  } catch {
    return false;
  }
}

/** True when the person chose to turn animations off in the app. */
export function userDisabledAnimations(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.getAttribute("data-motion") === "reduce";
}

/** True when animations should not run, for either reason. */
export function animationsDisabled(): boolean {
  return userDisabledAnimations() || systemReducesMotion();
}

function applyMotion(disabled: boolean) {
  const root = document.documentElement;
  if (disabled) root.setAttribute("data-motion", "reduce");
  else root.removeAttribute("data-motion");
}

function readStoredChoice(): boolean {
  try {
    return localStorage.getItem(MOTION_STORAGE_KEY) === "reduce";
  } catch {
    return false;
  }
}

/** Save the person's choice, apply it, and tell everything listening. */
export function setAnimationsDisabled(disabled: boolean) {
  try {
    if (disabled) localStorage.setItem(MOTION_STORAGE_KEY, "reduce");
    else localStorage.removeItem(MOTION_STORAGE_KEY);
  } catch {
    // Storage unavailable: the choice still applies for this visit.
  }
  applyMotion(disabled);
  notify();
}

const listeners = new Set<() => void>();
let installed = false;

function notify() {
  for (const listener of listeners) listener();
}

/** Watches the device setting and other tabs, once, for every subscriber. */
function install() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("storage", (event) => {
    // `key` is null when storage was cleared entirely.
    if (event.key !== null && event.key !== MOTION_STORAGE_KEY) return;
    applyMotion(readStoredChoice());
    notify();
  });

  try {
    window.matchMedia(MEDIA_QUERY).addEventListener("change", notify);
  } catch {
    // Very old browsers: the device setting is then read on the next change by the person.
  }
}

/** For `useSyncExternalStore` and for animations that must stop when this changes. */
export function subscribeMotion(onChange: () => void): () => void {
  install();
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}
